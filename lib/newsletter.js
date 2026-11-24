const { createHmac, randomInt, randomUUID } = require('node:crypto');
const { parsePhoneNumberFromString } = require('libphonenumber-js/max');
const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
const messages = { expired: 'Codice scaduto. Richiedi un nuovo codice.', invalid: 'Dati modificati. Richiedi un nuovo codice.', wrong: 'Codice non corretto.', attempts: 'Troppi tentativi. Richiedi un nuovo codice.', busy: 'Operazione in corso o da verificare. Riprova più tardi.', cooldown: 'Attendi 60 secondi prima di richiedere un altro codice.', limit: 'Troppi invii. Riprova tra un’ora.' };
function normalize(data) {
  if (!data || typeof data !== 'object' || data.consent !== true) throw Error('Compila tutti i campi e accetta la newsletter.');
  const out = {};
  for (const key of ['email', 'nome', 'cognome', 'compleanno', 'citta', 'phone']) {
    if (typeof data[key] !== 'string' || !data[key].trim() || data[key].length > 254) throw Error('Compila tutti i campi correttamente.');
    out[key] = data[key].trim();
  }
  out.email = out.email.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw Error('Indirizzo email non valido.');
  const date = new Date(out.compleanno);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out.compleanno) || !Number.isFinite(+date) || date.toISOString().slice(0, 10) !== out.compleanno || date > new Date()) throw Error('Data di nascita non valida.');
  const phone = out.phone.startsWith('+') && parsePhoneNumberFromString(out.phone);
  if (!phone || !phone.isValid()) throw Error('Inserisci un numero valido con prefisso internazionale.');
  out.phone = phone.number;
  out.consent = true;
  return out;
}
function createHandlers({ env = process.env, fetcher = fetch, now = Date.now, code = () => String(randomInt(0, 1000000)).padStart(6, '0'), uuid = randomUUID, logger = entry => console.warn(JSON.stringify(entry)) } = {}) {
  const hash = value => createHmac('sha256', env.OTP_HMAC_SECRET).update(value).digest('hex');
  // WHATSAPP_ENABLED=false makes SMS the only channel; otherwise WhatsApp is primary with SMS fallback.
  const whatsappEnabled = () => env.WHATSAPP_ENABLED !== 'false';
  const channels = () => whatsappEnabled() ? ['whatsapp','sms'] : ['sms'];
  function configured() {
    const required = ['OTP_HMAC_SECRET','SUPABASE_URL','SUPABASE_SECRET_KEY','BREVO_API_KEY','TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_MESSAGING_SERVICE_SID'];
    if (whatsappEnabled()) required.push('META_ACCESS_TOKEN','META_PHONE_NUMBER_ID','META_GRAPH_VERSION','META_OTP_TEMPLATE');
    return required.every(key => env[key]) && env.OTP_HMAC_SECRET.length >= 32;
  }
  async function request(url, options) { return fetcher(url, { ...options, signal: AbortSignal.timeout(8000) }); }
  async function transition(op, id, data, event, digest = '', fallback = '', channel = '') {
    const phoneHash = hash(data.phone);
    const ip = event.headers?.['x-nf-client-connection-ip'];
    if (!ip) throw Error('Missing trusted client IP');
    const res = await request(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/newsletter_otp_transition`, {
      method:'POST',
      headers:{ apikey:env.SUPABASE_SECRET_KEY, 'Content-Type':'application/json' },
      body:JSON.stringify({p_op:op, p_now:now(), p_id:id, p_phone:phoneHash, p_ip:hash(ip),
        p_binding:hash(JSON.stringify(data)), p_digest:digest, p_fallback:fallback === '1', p_channel:channel})
    });
    const body = await res.json();
    if (!res.ok || typeof body !== 'string') throw Error('Storage unavailable');
    return body;
  }
  function endpoint(action) {
    return async event => {
      if (event.httpMethod !== 'POST') return json(405, { error:'Metodo non consentito.' });
      if (!configured()) return json(503, { error:'Verifica temporaneamente non disponibile.' });
      let input, data;
      try { if ((event.body || '').length > 8192) throw Error('Richiesta troppo grande.'); input = JSON.parse(event.body); data = normalize(input); }
      catch (err) { return json(400, { error:err instanceof SyntaxError ? 'Richiesta non valida.' : err.message }); }
      try { return await action(input, data, event); }
      catch (_) { return json(503, { error:'Servizio temporaneamente non disponibile. Riprova più tardi.' }); }
    };
  }
  const validId = id => typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id);
  const challenge = endpoint(async (input, data, event) => {
    const available = channels();
    const channel = input.channel || available[0];
    // SMS needs an existing challenge only when it is the fallback for WhatsApp.
    const smsFallback = channel === 'sms' && available[0] !== 'sms';
    if (!available.includes(channel) || (input.challengeId && !validId(input.challengeId)) || (smsFallback && !validId(input.challengeId))) return json(400, {error:'Richiesta non valida.'});
    const id = input.challengeId || uuid();
    const otp = code();
    const digest = hash(`${id}:${otp}`);
    const started = now();
    const result = await transition('reserve', id, data, event, digest, '', channel);
    if (result !== 'ok') return json(429, { error:messages[result] });
    let sent = false;
    try {
      let res;
      if (channel === 'whatsapp') {
        res = await request(`https://graph.facebook.com/${env.META_GRAPH_VERSION}/${env.META_PHONE_NUMBER_ID}/messages`, { method:'POST', headers:{ Authorization:`Bearer ${env.META_ACCESS_TOKEN}`, 'Content-Type':'application/json' }, body:JSON.stringify({ messaging_product:'whatsapp', to:data.phone.slice(1), type:'template', template:{ name:env.META_OTP_TEMPLATE, language:{code:'it'}, components:[{type:'body',parameters:[{type:'text',text:otp}]},{type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:otp}]}] } }) });
      } else {
        res = await request(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, { method:'POST', headers:{Authorization:`Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')}`, 'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({To:data.phone, MessagingServiceSid:env.TWILIO_MESSAGING_SERVICE_SID, Body:`H2 Collection: il tuo codice è ${otp}. Scade tra 5 minuti.`}).toString() });
      }
      sent = res.ok;
      if (!sent) {
        let body;
        try { body = await res.json(); } catch (_) { body = {}; }
        // Provider messages can echo credentials or recipient data. Log only numeric codes.
        const numericCode = value => /^\d{1,9}$/.test(String(value)) ? Number(value) : null;
        logger({event:'otp_delivery_failed', channel, httpStatus:res.status,
          providerCode:numericCode(channel === 'whatsapp' ? body?.error?.code : body?.code),
          providerSubcode:numericCode(body?.error?.error_subcode)});
      }
    } catch (_) {
      logger({event:'otp_delivery_failed', channel, reason:'network_or_timeout'});
    }
    await transition(sent ? 'sent' : 'sendFailed', id, data, event, digest, !sent && channel === 'whatsapp' ? '1' : '0');
    return json(200, { challengeId:id, sent, channel, channels:available, expiresIn:Math.max(0, Math.floor((started + 300000 - now()) / 1000)), resendAfter:Math.max(0, Math.ceil((started + 60000 - now()) / 1000)), smsAfter:!sent && channel === 'whatsapp' ? 0 : Math.max(0, Math.ceil((started + 60000 - now()) / 1000)) });
  });
  const subscribe = endpoint(async (input, data, event) => {
    if (!validId(input.challengeId) || !/^\d{6}$/.test(input.otp || '')) return json(400, {error:'Verifica il numero con il codice ricevuto.'});
    const id = input.challengeId;
    const state = await transition('verify', id, data, event, hash(`${id}:${input.otp}`));
    if (state === 'done') return json(200, {success:true});
    if (state !== 'ok') return json(400, {error:messages[state]});
    let res;
    try {
      res = await request('https://api.brevo.com/v3/contacts', {method:'POST', headers:{'Content-Type':'application/json','api-key':env.BREVO_API_KEY}, body:JSON.stringify({email:data.email, attributes:{NOME:data.nome, COGNOME:data.cognome, COMPLEANNO:data.compleanno, CITTA:data.citta, VERIFIED_PHONE:data.phone}, listIds:[46,83], updateEnabled:true})});
    } catch (_) {
      await transition('uncertain', id, data, event);
      return json(503, {error:'Esito iscrizione da verificare. Controlla la tua email prima di riprovare.'});
    }
    const ok = res.status === 201 || res.status === 204;
    // 5xx may have committed upstream: do not repeat an ambiguous write.
    await transition(ok ? 'done' : res.status >= 500 ? 'uncertain' : 'retry', id, data, event);
    return ok ? json(200,{success:true}) : json(503,{error:'Iscrizione non riuscita. Riprova più tardi.'});
  });
  return { challenge, subscribe };
}
module.exports = { createHandlers, normalize };
