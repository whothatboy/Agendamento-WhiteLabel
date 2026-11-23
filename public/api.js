const config = window.configAgenda;
async function request(path, {method='GET', body, token, prefer}={}) {
  const headers = {apikey:config.chave, 'Content-Type':'application/json'};
  if (token) headers.Authorization = 'Bearer '+token;
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(config.url.replace(/\/$/,'')+path, {method, headers, body:JSON.stringify(body),cache:'no-store'});
  const data = await response.text();
  if (!response.ok) throw Error('Falha na solicitação');
  return data ? JSON.parse(data) : null;
}
