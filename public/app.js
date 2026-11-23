const $ = id => document.getElementById(id);
const demo = !config.url && !config.chave;
const slug = new URLSearchParams(location.search).get('empresa') || 'casa-pata';
const esc = encodeURIComponent;
const rpc = (name, body) => request('/rest/v1/rpc/'+name,{method:'POST',body});
const sample = {slug:'casa-pata',nome:'Casa Pata',segmento:'pet',fuso:'America/Sao_Paulo',cor:'#176354'};
const catalog = ['Banho','Tosa higiênica','Banho e tosa'].map((nome,i)=>({id:i+1,nome,minutos:[60,30,90][i],preco:[55,40,95][i]}));
let shop, service, selected, sequence=0, saving=false;
const simulated=[];
const dateAt = time => new Intl.DateTimeFormat('sv-SE',{timeZone:shop.fuso,year:'numeric',month:'2-digit',day:'2-digit'}).format(time);
const clock = time => new Intl.DateTimeFormat('pt-BR',{timeZone:shop.fuso,hour:'2-digit',minute:'2-digit'}).format(new Date(time));
function button(parent,label,action) {
  const b=document.createElement('button');
  b.type='button'; b.textContent=label; b.setAttribute('aria-pressed','false');
  b.onclick=()=>{for(const other of parent.children) other.setAttribute('aria-pressed',String(other===b));action()};
  parent.append(b);return b;
}
function demoSlots(day){
  const start=new Date(day+'T09:00:00-03:00').getTime();
  if(new Date(day+'T12:00:00Z').getUTCDay()===0)return [];
  const rows=[];
  for(let i=start;i+service.minutos*60000<=start+9*3600000;i+=1800000){
    if(i>Date.now() && !simulated.some(r=>i<r.end && i+service.minutos*60000>r.start)) rows.push({inicio:new Date(i).toISOString()});
  }
  return rows;
}
async function refresh(){
  const turn=++sequence;
  selected=null;$('submit').disabled=true;
  const parent=$('slots'), day=$('date').value;
  if(!day || !$('date').validity.valid){parent.textContent='Escolha uma data válida.';return}
  parent.textContent='Buscando horários…';
  try{
    const rows=demo?demoSlots(day):await rpc('horarios',{loja:slug,item:service.id,dia:day});
    if(turn!==sequence)return;
    parent.textContent=rows.length?'':'Sem horários disponíveis neste dia.';
    for(const r of rows)button(parent,clock(r.inicio),()=>{selected=r.inicio;$('submit').disabled=false});
  }catch{if(turn===sequence)parent.textContent='Falha ao carregar horários. Selecione a data novamente.'}
}
async function init(){
  if(demo && slug!==sample.slug)throw Error();
  shop=demo?sample:(await request('/rest/v1/empresas?select=*&slug=eq.'+esc(slug)))[0];
  if(!shop)throw Error();
  const services=demo?catalog:await request('/rest/v1/servicos?select=*&order=id&empresa=eq.'+esc(slug));
  document.documentElement.style.setProperty('--brand',shop.cor);
  $('brand').textContent=shop.nome;document.title=shop.nome+' · Agendamento';
  $('mode').textContent=demo?'Demonstração':'Agenda online';
  $('zone').textContent=shop.fuso;$('category').textContent=({pet:'Banho e tosa',barbearia:'Barbearia',nail:'Nail designer'})[shop.segmento]||'Atendimento';
  if(shop.logo_url && /^https:\/\//.test(shop.logo_url)){$('logo').src=shop.logo_url;$('logo').hidden=false}
  $('petField').hidden=shop.segmento!=='pet';$('pet').required=!$('petField').hidden;
  if(demo)$('intro').textContent='Experimente com dados fictícios. A simulação dura até você fechar ou atualizar a página.';
  $('emailOption').hidden=!(demo || shop.lembrete_email);
  $('waOption').hidden=!(demo || shop.lembrete_whatsapp);
  $('reminders').hidden=$('emailOption').hidden && $('waOption').hidden;
  $('byEmail').onchange=()=>{
    const enabled=$('byEmail').checked;
    $('addressField').hidden=!enabled;
    $('address').disabled=!enabled;
    $('address').required=enabled;
  };
  const today=dateAt(new Date());$('date').min=today;
  const last=new Date(today+'T12:00:00Z');last.setUTCDate(last.getUTCDate()+60);
  $('date').max=last.toISOString().slice(0,10);$('date').value=today;
  $('date').onchange=refresh;
  for(const s of services){
    const b=button($('services'),s.nome,()=>{service=s;refresh()});
    const meta=document.createElement('small');
    meta.textContent=s.minutos+' min · '+Number(s.preco).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});b.append(meta);
  }
  if(services.length)$('services').firstChild.click();else $('status').textContent='Nenhum serviço disponível.';
}
$('form').onsubmit=async event=>{
  event.preventDefault();if(saving || !selected)return;
  const digits=$('phone').value.replace(/\D/g,'');
  if(!/^\d{10,11}$/.test(digits)){$('status').textContent='Informe um telefone com DDD e 10 ou 11 dígitos.';return}
  saving=true;$('form').inert=true;$('submit').disabled=true;
  const time=selected, day=$('date').value;
  try{
    if(demo)simulated.push({start:Date.parse(time),end:Date.parse(time)+service.minutos*60000});
    else {
      const args={loja:slug,item:service.id,hora:time,nome:$('customer').value,fone:digits,animal:$('pet').value};
      if($('byEmail').checked || $('byWhats').checked){
        await rpc('agendar_com_lembrete',{...args,email:$('byEmail').checked?$('address').value.trim():null,whatsapp:$('byWhats').checked});
      }else await rpc('agendar',args);
    }
    $('status').textContent=(demo?'Simulação concluída':'Reserva confirmada')+' · '+service.nome+' · '+day.split('-').reverse().join('/')+' às '+clock(time)+'.';
    $('byEmail').checked=false; $('byWhats').checked=false; $('byEmail').onchange();
    for(const id of ['customer','phone','pet','address'])$(id).value='';
  }catch{$('status').textContent='Não conseguimos confirmar aqui. Consulte a empresa antes de tentar novamente.'}
  finally{await refresh();saving=false;$('form').inert=false}
};
init().catch(()=>{$('form').hidden=true;$('status').textContent='Agenda indisponível. Confira o link da empresa e a configuração.'});
