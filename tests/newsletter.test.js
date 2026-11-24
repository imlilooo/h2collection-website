const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const { createHandlers } = require('../lib/newsletter');
const db = new PGlite();
const initialized = (async () => {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  const file = readdirSync('supabase/migrations').find(name => name.endsWith('_newsletter_otp_state.sql'));
  await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
})();
const data = {email:'test@example.com',nome:'Ada',cognome:'Rossi',compleanno:'1990-01-01',citta:'Palermo',phone:'+393331234567',consent:true};
async function setup() {
  await initialized;
  await db.exec('truncate newsletter_private.challenges, newsletter_private.sessions, newsletter_private.delivery_limits;');
  const env = Object.fromEntries(['SUPABASE_URL','SUPABASE_SECRET_KEY','BREVO_API_KEY','META_ACCESS_TOKEN','META_PHONE_NUMBER_ID','META_GRAPH_VERSION','META_OTP_TEMPLATE','TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_MESSAGING_SERVICE_SID'].map(k=>[k,k]));
  env.OTP_HMAC_SECRET = 'test-secret'.repeat(4);
  const state = {time:1000000,code:'123456',brevo:[],send:[],providerStatus:200,brevoStatus:201};
  const handlers = createHandlers({env,now:()=>state.time,code:()=>state.code,fetcher:async (url, options) => {
    if (url.endsWith('/rest/v1/rpc/newsletter_otp_transition')) {
      const p = JSON.parse(options.body);
      const result = await db.query('select public.newsletter_otp_transition($1,$2,$3,$4,$5,$6,$7,$8,$9) as result',
        [p.p_op,p.p_now,p.p_id,p.p_phone,p.p_ip,p.p_binding,p.p_digest,p.p_fallback,p.p_channel]);
      return {ok:true,json:async()=>result.rows[0].result};
    }
    if (url.includes('brevo')) { state.brevo.push(JSON.parse(options.body)); if(state.wait) await state.wait; if(state.networkFailure) throw Error(); return {status:state.brevoStatus}; }
    state.send.push({url,body:options.body}); return {ok:state.providerStatus===200};
  }});
  async function call(name, extra={}, overrides={}) {
    const res = await handlers[name]({httpMethod:'POST',headers:{'x-nf-client-connection-ip':'127.0.0.1'},body:JSON.stringify({...data,...extra}),...overrides});
    return {status:res.statusCode,...JSON.parse(res.body)};
  }
  return {state,call};
}
test('requires consent, valid data and OTP; does not subscribe on send', async()=>{
  const {call,state}=await setup();
  assert.equal((await call('subscribe')).status,400);
  assert.equal((await call('challenge',{consent:false})).status,400);
  assert.equal((await call('challenge',{phone:'123'})).status,400);
  assert.equal((await call('challenge',{compleanno:'1990-02-31'})).status,400);
  assert.equal((await call('challenge',{}, {body:'null'})).status,400);
  assert.equal((await call('challenge',{}, {httpMethod:'GET'})).status,405);
  const c=await call('challenge'); assert.equal(c.sent,true); assert.equal(c.otp,undefined); assert.equal(state.brevo.length,0);
  assert.equal((await call('subscribe',{challengeId:c.challengeId,otp:'123456',email:'other@example.com'})).status,400);
  assert.equal((await call('subscribe',{challengeId:c.challengeId,otp:'123456'})).success,true);
  assert.deepEqual(state.brevo[0].listIds,[46,83]); assert.equal(state.brevo[0].attributes.VERIFIED_PHONE,data.phone);
  assert.equal((await call('subscribe',{challengeId:c.challengeId,otp:'123456'})).success,true); assert.equal(state.brevo.length,1);
});
test('five incorrect attempts exhaust challenge',async()=>{
  const {call}=await setup(), c=await call('challenge');
  for(let i=0;i<5;i++) assert.equal((await call('subscribe',{challengeId:c.challengeId,otp:'000000'})).status,400);
  assert.match((await call('subscribe',{challengeId:c.challengeId,otp:'123456'})).error,/Troppi tentativi/);
});
test('expiry, resend replacement and server-enforced SMS delay',async()=>{
  const {call,state}=await setup(), c=await call('challenge');
  assert.equal((await call('challenge',{channel:'sms',challengeId:c.challengeId})).status,429);
  assert.equal((await call('challenge')).status,429);
  state.time+=60000; state.code='654321';
  assert.equal((await call('challenge',{channel:'sms',challengeId:c.challengeId})).sent,true);
  assert.equal((await call('subscribe',{challengeId:c.challengeId,otp:'123456'})).status,400);
  state.time+=300001;
  assert.match((await call('subscribe',{challengeId:c.challengeId,otp:'654321'})).error,/scaduto/);
});
test('failed WhatsApp enables immediate SMS; failed send cannot verify',async()=>{
  const {call,state}=await setup(); state.providerStatus=500;
  const c=await call('challenge'); assert.equal(c.smsAfter,0);
  assert.equal((await call('subscribe',{challengeId:c.challengeId,otp:'123456'})).status,400);
  state.providerStatus=200;
  assert.equal((await call('challenge',{challengeId:c.challengeId,channel:'sms'})).sent,true);
  assert.match(state.send[1].body,/MessagingServiceSid/);
});
test('phone and IP delivery limits are atomic across channels',async()=>{
  const {call,state}=await setup();
  for(let i=0;i<5;i++){ assert.equal((await call('challenge')).status,200); state.time+=60000; }
  assert.equal((await call('challenge')).status,429);
  const phones=['+442079460018','+12025550123','+33142345678','+4915123456789'];
  for(let i=0;i<15;i++){ assert.equal((await call('challenge',{phone:phones[Math.floor(i/5)]})).status,200); state.time+=60000; }
  assert.equal((await call('challenge',{phone:phones[3]})).status,429);
});
test('concurrent completions make one Brevo call; explicit rejection can retry',async()=>{
  const {call,state}=await setup(), c=await call('challenge');
  let release; state.wait=new Promise(r=>release=r);
  const first=call('subscribe',{challengeId:c.challengeId,otp:'123456'});
  while (!state.brevo.length) await new Promise(r=>setImmediate(r));
  assert.equal((await call('subscribe',{challengeId:c.challengeId,otp:'123456'})).status,400);
  assert.equal((await call('challenge')).status,429);
  release(); assert.equal((await first).success,true); assert.equal(state.brevo.length,1);
  state.time+=60000; state.wait=null; state.brevoStatus=429;
  const next=await call('challenge');
  assert.equal((await call('subscribe',{challengeId:next.challengeId,otp:'123456'})).status,503);
  state.brevoStatus=201;
  assert.equal((await call('subscribe',{challengeId:next.challengeId,otp:'123456'})).success,true);
});
test('ambiguous Brevo failure blocks repeats; configuration and storage fail closed',async()=>{
  const {call,state}=await setup(), c=await call('challenge'); state.networkFailure=true;
  assert.equal((await call('subscribe',{challengeId:c.challengeId,otp:'123456'})).status,503);
  assert.equal((await call('subscribe',{challengeId:c.challengeId,otp:'123456'})).status,400);
  assert.equal(state.brevo.length,1);
  assert.equal((await createHandlers({env:{}}).challenge({httpMethod:'POST'})).statusCode,503);
  const other=await setup(); assert.equal((await other.call('challenge',{}, {headers:{}})).status,503);
});
test('a new challenge invalidates the old ID and a Brevo 5xx cannot repeat',async()=>{
  const {call,state}=await setup(), old=await call('challenge');state.time+=60000;
  const current=await call('challenge');assert.notEqual(current.challengeId,old.challengeId);
  assert.equal((await call('subscribe',{challengeId:old.challengeId,otp:'123456'})).status,400);
  state.brevoStatus=500;
  assert.equal((await call('subscribe',{challengeId:current.challengeId,otp:'123456'})).status,503);
  assert.equal((await call('subscribe',{challengeId:current.challengeId,otp:'123456'})).status,400);
  assert.equal(state.brevo.length,1);
});

after(async () => { await db.close(); });
test('only service_role can execute transitions and access private state',async()=>{
  await initialized;
  const signature='public.newsletter_otp_transition(text,bigint,uuid,text,text,text,text,boolean,text)';
  for(const role of ['anon','authenticated']) {
    const permissions=await db.query('select has_function_privilege($1,$2,\'execute\') as rpc, has_schema_privilege($1,\'newsletter_private\',\'usage\') as schema',[role,signature]);
    assert.deepEqual(permissions.rows[0],{rpc:false,schema:false});
  }
  await db.exec('set role service_role');
  try {
    const result=await db.query("select public.newsletter_otp_transition('verify',1000000,'00000000-0000-0000-0000-000000000001','test-phone','test-ip','test-binding','test-code',false,'') as result");
    assert.equal(result.rows[0].result,'expired');
  } finally { await db.exec('reset role'); }
});
