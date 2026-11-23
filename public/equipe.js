const el=id=>document.getElementById(id);
let token;
async function load(){
  el('rows').replaceChildren();
  try{
    const rows=await request('/rest/v1/reservas?select=id,inicio,cliente,telefone,pet,servicos(nome,empresas(nome,fuso))&cancelada=eq.false&fim=gte.'+new Date().toISOString()+'&order=inicio',{token});
    el('message').textContent=rows.length?'':'Nenhum atendimento agendado.';
    for(const r of rows){
      const box=document.createElement('article'),title=document.createElement('h3'),info=document.createElement('p'),cancel=document.createElement('button');
      const shop=r.servicos?.empresas;
      title.textContent=new Date(r.inicio).toLocaleString('pt-BR',{timeZone:shop?.fuso||'America/Sao_Paulo'})+' · '+(r.servicos?.nome||'Serviço');
      info.textContent=[shop?.nome,r.cliente,r.pet,r.telefone].filter(Boolean).join(' · ');
      cancel.textContent='Cancelar atendimento';
      cancel.onclick=async()=>{if(!confirm('Cancelar este atendimento e liberar o horário?'))return;cancel.disabled=true;
        try{await request('/rest/v1/reservas?id=eq.'+r.id,{token,method:'PATCH',body:{cancelada:true}});await load()}
        catch{el('message').textContent='Falha ao cancelar. Atualize a agenda.';cancel.disabled=false}};
      box.append(title,info,cancel);el('rows').append(box);
    }
  }catch{el('message').textContent='Falha ao carregar. Entre novamente se a sessão expirou.'}
}
el('login').onsubmit=async e=>{e.preventDefault();
 if(!config.url || !config.chave){el('message').textContent='Configure o Supabase para acessar a agenda da equipe.';return}
 try{const session=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:el('email').value,password:el('password').value}});
 token=session.access_token;el('password').value='';el('login').hidden=true;el('panel').hidden=false;await load()}
 catch{el('message').textContent='Falha ao entrar. Confira o e-mail e a senha.'}};
el('reload').onclick=load;el('logout').onclick=()=>location.reload();
