begin;
create extension if not exists btree_gist;
create table public.empresas (
 slug text primary key check (slug ~ '^[a-z0-9-]+$'),
 nome text not null, segmento text not null, cor text not null default '#176354' check (cor ~ '^#[a-fA-F0-9]{6}$'),
 logo_url text, fuso text not null default 'America/Sao_Paulo',
 abertura time not null default '09:00', fechamento time not null default '18:00',
 dias integer[] not null default '{1,2,3,4,5,6}', check (fechamento > abertura)
);
create table public.servicos (
 id bigint generated always as identity primary key, empresa text not null references public.empresas,
 nome text not null, minutos integer not null check (minutos between 5 and 480),
 preco numeric(9,2) not null check(preco >= 0), ativo boolean not null default true,
 unique (empresa,id)
);
create table public.reservas (
 id uuid primary key default gen_random_uuid(), empresa text not null, servico bigint not null,
 inicio timestamptz not null, fim timestamptz not null check (fim > inicio),
 cliente text not null, telefone text not null, pet text, cancelada boolean not null default false,
 foreign key (empresa,servico) references public.servicos(empresa,id),
 exclude using gist (empresa with =, tstzrange(inicio,fim,'[)') with &&) where (not cancelada)
);
create table public.gestores (
 usuario uuid not null references auth.users on delete cascade,
 empresa text not null references public.empresas, primary key(usuario,empresa)
);
alter table public.empresas enable row level security;
alter table public.servicos enable row level security;
alter table public.reservas enable row level security;
alter table public.gestores enable row level security;
revoke all on public.empresas, public.servicos, public.reservas, public.gestores from public,anon,authenticated;
grant select on public.empresas,public.servicos to anon,authenticated;
create policy vitrine on public.empresas for select using(true);
create policy catalogo on public.servicos for select using(ativo);
grant select on public.gestores,public.reservas to authenticated;
grant update(cancelada) on public.reservas to authenticated;
create policy meus_vinculos on public.gestores for select to authenticated using(usuario=auth.uid());
create policy minha_agenda on public.reservas for select to authenticated using
(empresa in (select g.empresa from public.gestores g where g.usuario=auth.uid()));
create policy cancelar on public.reservas for update to authenticated using
(empresa in (select g.empresa from public.gestores g where g.usuario=auth.uid())) with check(cancelada);
create function public.horarios(loja text, item bigint, dia date) returns table(inicio timestamptz)
language sql stable security definer set search_path = '' as $$
 select slot from public.empresas e join public.servicos s on s.empresa=e.slug
 cross join lateral generate_series((dia+e.abertura) at time zone e.fuso,
 ((dia+e.fechamento) at time zone e.fuso)-make_interval(mins=>s.minutos),interval '30 minutes') slot
 where e.slug=loja and s.id=item and s.ativo and extract(dow from dia)::int=any(e.dias)
 and dia between (now() at time zone e.fuso)::date and (now() at time zone e.fuso)::date+60
 and slot>now() and not exists(select 1 from public.reservas r where r.empresa=e.slug and not r.cancelada
 and tstzrange(r.inicio,r.fim,'[)') && tstzrange(slot,slot+make_interval(mins=>s.minutos),'[)')) order by slot
$$;
create function public.agendar(loja text,item bigint,hora timestamptz,nome text,fone text,animal text)
returns uuid language plpgsql security definer set search_path='' as $$
declare e public.empresas; duracao integer; codigo uuid;
begin
 select * into strict e from public.empresas where slug=loja;
 if coalesce(length(trim(nome)),0) not between 2 and 100 or coalesce(fone,'') !~ '^[0-9]{10,11}$'
 or coalesce(length(trim(animal)),0)>80 or (e.segmento='pet' and coalesce(length(trim(animal)),0)=0)
 then raise exception 'Confira os dados do cliente.'; end if;
 if not exists(select 1 from public.horarios(loja,item,(hora at time zone e.fuso)::date) h where h.inicio=hora)
 then raise exception 'Horário indisponível.'; end if;
 select minutos into strict duracao from public.servicos where id=item and empresa=loja;
 insert into public.reservas(empresa,servico,inicio,fim,cliente,telefone,pet)
 values(loja,item,hora,hora+make_interval(mins=>duracao),trim(nome),fone,case when e.segmento='pet' then trim(animal) end)
 returning id into codigo;
 return codigo;
exception when exclusion_violation then raise exception 'Horário indisponível.';
end $$;
revoke all on function public.horarios(text,bigint,date),public.agendar(text,bigint,timestamptz,text,text,text) from public;
grant execute on function public.horarios(text,bigint,date),public.agendar(text,bigint,timestamptz,text,text,text) to anon,authenticated;
insert into public.empresas(slug,nome,segmento) values ('casa-pata','Casa Pata','pet');
insert into public.servicos(empresa,nome,minutos,preco) values ('casa-pata','Banho',60,55),('casa-pata','Tosa higiênica',30,40),('casa-pata','Banho e tosa',90,95);
commit;
