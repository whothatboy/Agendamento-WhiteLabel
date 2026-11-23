// Agendado pelo Supabase Cron. Credenciais são lidas somente no servidor.
const env = (key: string) => Deno.env.get(key) || "";
type Job = { id:string; canal:string; destino:string; empresa:string; servico:string; inicio:string; fuso:string; tentativas:number };

async function db(path:string, method:string, data:unknown) {
  const key=env("SUPABASE_SERVICE_ROLE_KEY");
  const result=await fetch(env("SUPABASE_URL")+"/rest/v1/"+path,{
    method, headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},
    body:JSON.stringify(data),signal:AbortSignal.timeout(8000)
  });
  if(!result.ok) throw Error("Falha no banco");
  return result;
}

async function deliver(job:Job) {
  const when=new Intl.DateTimeFormat("pt-BR",{timeZone:job.fuso,dateStyle:"short",timeStyle:"short"}).format(new Date(job.inicio));
  if(job.canal==="email") {
    return fetch("https://api.resend.com/emails",{method:"POST",headers:{
      Authorization:"Bearer "+env("RESEND_API_KEY"),"Content-Type":"application/json","Idempotency-Key":"lembrete/"+job.id
    },body:JSON.stringify({from:env("REMINDER_FROM"),to:[job.destino],subject:"Lembrete de atendimento · "+job.empresa,
      text:"Você tem um atendimento de "+job.servico+" em "+job.empresa+" em "+when+" (horário local da empresa)."}),
      signal:AbortSignal.timeout(8000)});
  }
  const sid=env("TWILIO_ACCOUNT_SID");
  return fetch("https://api.twilio.com/2010-04-01/Accounts/"+sid+"/Messages.json",{
    method:"POST",headers:{Authorization:"Basic "+btoa(sid+":"+env("TWILIO_AUTH_TOKEN"))},
    body:new URLSearchParams({From:env("TWILIO_WHATSAPP_FROM"),To:"whatsapp:"+job.destino,
      ContentSid:env("TWILIO_CONTENT_SID"),ContentVariables:JSON.stringify({"1":job.empresa,"2":job.servico,"3":when})}),
    signal:AbortSignal.timeout(8000)});
}

Deno.serve(async(req:Request)=>{
  const secret=env("REMINDER_CRON_SECRET");
  if(req.method!=="POST" || !secret || req.headers.get("Authorization")!=="Bearer "+secret)
    return new Response("Acesso negado",{status:403});
  const canais=[];
  if(env("RESEND_API_KEY") && env("REMINDER_FROM")) canais.push("email");
  if(["TWILIO_ACCOUNT_SID","TWILIO_AUTH_TOKEN","TWILIO_WHATSAPP_FROM","TWILIO_CONTENT_SID"].every(k=>env(k))) canais.push("whatsapp");
  if(!canais.length) return new Response("Configure um canal",{status:503});
  const started=Date.now();
  let processed=0;
  try{
    while(processed<25 && Date.now()-started<35000){
      const result=await db("rpc/proximo_lembrete","POST",{canais});
      const [job]: Job[]=await result.json();
      if(!job) break;
      let estado="incerto", retorno="Sem confirmação do provedor";
      try {
        const response=await deliver(job);
        retorno="HTTP "+response.status;
        if(response.ok){
          estado="aceito";
          const body=await response.json().catch(()=>({}));
          retorno=body.id || body.sid || retorno;
        }else if(response.status===429 && job.tentativas<3) estado="pendente";
        else if(response.status<500 && response.status!==408) estado="falhou";
      }catch{/* Uma resposta perdida pode corresponder a uma mensagem já aceita. */}
      const patch:Record<string,string>={estado,retorno,atualizado:new Date().toISOString()};
      if(estado==="pendente") patch.previsto=new Date(Date.now()+300000).toISOString();
      await db("lembretes?id=eq."+job.id+"&estado=eq.processando","PATCH",patch);
      processed++;
    }
    return Response.json({processados:processed});
  }catch{return new Response("Falha ao processar a fila",{status:503})}
});
