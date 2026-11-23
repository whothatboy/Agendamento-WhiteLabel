-- Requer as extensões pg_cron e pg_net e os dois segredos no Vault.
do $$
begin
 if (select count(*) from vault.decrypted_secrets where name in ('agenda_functions_url','agenda_cron_secret')) <> 2
 then raise exception 'Configure os dois segredos no Vault primeiro.'; end if;
end $$;
select cron.schedule('agenda-enviar-lembretes','*/5 * * * *',$job$
 select net.http_post(
   url := (select decrypted_secret from vault.decrypted_secrets where name='agenda_functions_url'),
   headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||
     (select decrypted_secret from vault.decrypted_secrets where name='agenda_cron_secret')),
   body := '{}'::jsonb, timeout_milliseconds := 60000
 );
$job$);
