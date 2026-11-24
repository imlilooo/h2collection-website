const { test } = require('node:test');
const assert = require('node:assert/strict');
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');
const { createHandlers } = require('../lib/newsletter');
function redisMock() {
  const L = lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  function run(source) {
    if (lauxlib.luaL_dostring(L, to_luastring(source))) throw Error(to_jsstring(lua.lua_tostring(L,-1)));
    const value = lua.lua_gettop(L) ? to_jsstring(lua.lua_tostring(L,-1)) : null;
    lua.lua_settop(L,0); return value;
  }
  run(`db={} ttl={} clock=0
    redis={call=function(cmd,key,...)
      local args={...}
      if ttl[key] and ttl[key]<=clock then db[key]=nil ttl[key]=nil end
      if cmd=='GET' then return db[key] end
      if cmd=='HGET' then return db[key] and db[key][args[1]] end
      if cmd=='DEL' then db[key]=nil ttl[key]=nil return 1 end
      if cmd=='SET' then db[key]=args[1] if args[2]=='EX' then ttl[key]=clock+tonumber(args[3])*1000 end return 'OK' end
      if cmd=='EXPIRE' then ttl[key]=clock+tonumber(args[1])*1000 return 1 end
      if cmd=='INCR' then db[key]=tostring(tonumber(db[key] or 0)+1) return tonumber(db[key]) end
      if cmd=='HSET' then db[key]=db[key] or {} for i=1,#args,2 do db[key][args[i]]=tostring(args[i+1]) end return 1 end
      if cmd=='HINCRBY' then db[key][args[1]]=tostring(tonumber(db[key][args[1]])+tonumber(args[2])) return tonumber(db[key][args[1]]) end
      error(cmd)
    end}`);
  const quote = value => JSON.stringify(String(value));
  return args => {
    const [,script,n,...rest] = args;
    const keys = rest.slice(0,n), values = rest.slice(n);
    return run(`clock=${values[1]} KEYS={${keys.map(quote)}} ARGV={${values.map(quote)}}\n${script}`);
  };
}
const data = {email:'test@example.com',nome:'Ada',cognome:'Rossi',compleanno:'1990-01-01',citta:'Palermo',phone:'+393331234567',consent:true};
function setup() {
  const redis = redisMock();
  const env = Object.fromEntries(['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','BREVO_API_KEY','META_ACCESS_TOKEN','META_PHONE_NUMBER_ID','META_GRAPH_VERSION','META_OTP_TEMPLATE','TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_MESSAGING_SERVICE_SID'].map(k=>[k,k]));
  env.OTP_HMAC_SECRET = 'test-secret'.repeat(4);
  const state = {time:1000000,code:'123456',brevo:[],send:[],providerStatus:200,brevoStatus:201};
  const handlers = createHandlers({env,now:()=>state.time,code:()=>state.code,fetcher:async (url, options) => {
    if (url === env.UPSTASH_REDIS_REST_URL) return {ok:true,json:async()=>({result:redis(JSON.parse(options.body))})};
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
  const {call,state}=setup();
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
  const {call}=setup(), c=await call('challenge');
  for(let i=0;i<5;i++) assert.equal((await call('subscribe',{challengeId:c.challengeId,otp:'000000'})).status,400);
  assert.match((await call('subscribe',{challengeId:c.challengeId,otp:'123456'})).error,/Troppi tentativi/);
});
test('expiry, resend replacement and server-enforced SMS delay',async()=>{
  const {call,state}=setup(), c=await call('challenge');
  assert.equal((await call('challenge',{channel:'sms',challengeId:c.challengeId})).status,429);
  assert.equal((await call('challenge')).status,429);
  state.time+=60000; state.code='654321';
  assert.equal((await call('challenge',{channel:'sms',challengeId:c.challengeId})).sent,true);
  assert.equal((await call('subscribe',{challengeId:c.challengeId,otp:'123456'})).status,400);
  state.time+=300001;
  assert.match((await call('subscribe',{challengeId:c.challengeId,otp:'654321'})).error,/scaduto/);
});
test('failed WhatsApp enables immediate SMS; failed send cannot verify',async()=>{
  const {call,state}=setup(); state.providerStatus=500;
  const c=await call('challenge'); assert.equal(c.smsAfter,0);
  assert.equal((await call('subscribe',{challengeId:c.challengeId,otp:'123456'})).status,400);
  state.providerStatus=200;
  assert.equal((await call('challenge',{challengeId:c.challengeId,channel:'sms'})).sent,true);
  assert.match(state.send[1].body,/MessagingServiceSid/);
});
test('phone and IP delivery limits are atomic across channels',async()=>{
  const {call,state}=setup();
  for(let i=0;i<5;i++){ assert.equal((await call('challenge')).status,200); state.time+=60000; }
  assert.equal((await call('challenge')).status,429);
  const phones=['+442079460018','+12025550123','+33142345678','+4915123456789'];
  for(let i=0;i<15;i++){ assert.equal((await call('challenge',{phone:phones[Math.floor(i/5)]})).status,200); state.time+=60000; }
  assert.equal((await call('challenge',{phone:phones[3]})).status,429);
});
test('concurrent completions make one Brevo call; explicit rejection can retry',async()=>{
  const {call,state}=setup(), c=await call('challenge');
  let release; state.wait=new Promise(r=>release=r);
  const first=call('subscribe',{challengeId:c.challengeId,otp:'123456'});
  await new Promise(r=>setImmediate(r));
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
  const {call,state}=setup(), c=await call('challenge'); state.networkFailure=true;
  assert.equal((await call('subscribe',{challengeId:c.challengeId,otp:'123456'})).status,503);
  assert.equal((await call('subscribe',{challengeId:c.challengeId,otp:'123456'})).status,400);
  assert.equal(state.brevo.length,1);
  assert.equal((await createHandlers({env:{}}).challenge({httpMethod:'POST'})).statusCode,503);
  const other=setup(); assert.equal((await other.call('challenge',{}, {headers:{}})).status,503);
});
test('a new challenge invalidates the old ID and a Brevo 5xx cannot repeat',async()=>{
  const {call,state}=setup(), old=await call('challenge');state.time+=60000;
  const current=await call('challenge');assert.notEqual(current.challengeId,old.challengeId);
  assert.equal((await call('subscribe',{challengeId:old.challengeId,otp:'123456'})).status,400);
  state.brevoStatus=500;
  assert.equal((await call('subscribe',{challengeId:current.challengeId,otp:'123456'})).status,503);
  assert.equal((await call('subscribe',{challengeId:current.challengeId,otp:'123456'})).status,400);
  assert.equal(state.brevo.length,1);
});
