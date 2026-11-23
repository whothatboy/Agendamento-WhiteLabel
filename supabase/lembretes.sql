begin;
alter table public.empresas add column if not exists lembrete_email boolean not null default false,
 add column if not exists lembrete_whatsapp boolean not null default false;
create table if not exists public.lembretes (
 id uuid primary key default gen_random_uuid(), reserva uuid not null references public.reservas on delete cascade,
 canal text not null check(canal in ('email','whatsapp')), destino text not null,
 autorizado_em timestamptz not null default now(), previsto timestamptz not null,
 estado text not null default 'pendente' check(estado in ('pendente','processando','aceito','falhou','incerto')),
 tentativas int not null default 0, atualizado timestamptz not null default now(), retorno text,
 unique(reserva,canal)
);
alter table public.lembretes enable row level security;
revoke all on public.lembretes from public, anon, authenticated;
grant select,update on public.lembretes to service_role;
create index if not exists lembretes_pendentes on public.lembretes(previsto) where estado='pendente';

create or replace function public.agendar_com_lembrete(loja text,item bigint,hora timestamptz,nome text,fone text,animal text,email text,whatsapp boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare codigo uuid; e public.empresas; previsto timestamptz := greatest(now(),hora-interval '24 hours');
begin
 select * into strict e from public.empresas where slug=loja;
 if email is not null and (not e.lembrete_email or length(email)>254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then
   raise exception 'Confira o e-mail e o canal disponível.'; end if;
 if whatsapp and not e.lembrete_whatsapp then raise exception 'WhatsApp indisponível.'; end if;
 codigo:=public.agendar(loja,item,hora,nome,fone,animal);
 if email is not null then insert into public.lembretes(reserva,canal,destino,previsto) values(codigo,'email',trim(email),previsto); end if;
 if whatsapp then insert into public.lembretes(reserva,canal,destino,previsto) values(codigo,'whatsapp','+55'||fone,previsto); end if;
 return codigo;
end $$;
revoke all on function public.agendar_com_lembrete(text,bigint,timestamptz,text,text,text,text,boolean) from public;
grant execute on function public.agendar_com_lembrete(text,bigint,timestamptz,text,text,text,text,boolean) to anon,authenticated;

create or replace function public.proximo_lembrete(canais text[]) returns table
(id uuid,canal text,destino text,empresa text,servico text,inicio timestamptz,fuso text,tentativas int)
language sql security definer set search_path='' as $$
 with candidato as (
 select l.id from public.lembretes l join public.reservas r on r.id=l.reserva
 join public.empresas e on e.slug=r.empresa
 where l.estado='pendente' and l.previsto<=now() and not r.cancelada and r.inicio>now()
 and l.canal=any(canais) and case l.canal when 'email' then e.lembrete_email else e.lembrete_whatsapp end
 order by l.previsto,l.id limit 1 for update of l skip locked
 ), tomado as (
 update public.lembretes l set estado='processando',atualizado=now(),tentativas=l.tentativas+1
 from candidato c where l.id=c.id returning l.*
 ) select l.id,l.canal,l.destino,e.nome,s.nome,r.inicio,e.fuso,l.tentativas
 from tomado l join public.reservas r on r.id=l.reserva join public.empresas e on e.slug=r.empresa
 join public.servicos s on s.id=r.servico
$$;
revoke all on function public.proximo_lembrete(text[]) from public, anon, authenticated;
grant execute on function public.proximo_lembrete(text[]) to service_role;
commit;
