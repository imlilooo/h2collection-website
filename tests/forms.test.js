const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');
for (const popup of [false,true]) {
  test(`${popup?'popup':'newsletter page'}: OTP required, errors preserve form, changes reset verification`,async()=>{
    const dom=new JSDOM(readFileSync(popup?'index.html':'newsletter.html','utf8'),{runScripts:'outside-only',url:`https://test.local/${popup?'index':'newsletter'}.html`});
    const w=dom.window, calls=[];
    w.setInterval=()=>0; w.clearInterval=()=>{};
    w.fetch=async (url,options)=>{
    if(options.method==='GET') return {ok:true,json:async()=>({turnstileSiteKey:null})};
      calls.push({url,body:JSON.parse(options.body)});
      return url.endsWith('challenge') ? {ok:true,json:async()=>({challengeId:'id',sent:true,expiresIn:300,resendAfter:60,smsAfter:60})} : {ok:false,json:async()=>({error:'Codice non corretto.'})};
    };
    w.eval(readFileSync('newsletter-otp.js','utf8'));
    w.eval(readFileSync('script.js','utf8'));
    if(!popup) w.NewsletterOtp.attach(w.document.querySelector('#sib-form'),()=>{});
    const form=w.document.querySelector(popup?'.nlp-form':'#sib-form');
    const set=(name,value)=>{const el=form.elements[name]||form.elements[name.toUpperCase()]; el.value=value;};
    set('nome','Ada');set('cognome','Rossi');set('email','test@example.com');set('compleanno','01-01-1990');set('citta','Palermo');set('phone','+393331234567');form.querySelector('[type=checkbox]').checked=true;
    const submit=async()=>{form.dispatchEvent(new w.Event('submit',{cancelable:true}));await new Promise(r=>setImmediate(r));};
    await submit(); assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('challenge'));
    assert.equal(form.elements.otp.required,true); assert.equal(form.querySelector('[data-channel=sms]').disabled,true);
    assert.equal(w.localStorage.getItem('h2_nl_iscritta'),null);
    form.elements.otp.value='123456';await submit();
    assert.equal(calls[1].body.otp,'123456');assert.match(form.querySelector('.otp-message').textContent,/non corretto/);
    assert.equal(form.elements.phone.value,'+393331234567');
    form.elements.phone.value='+442079460018';form.elements.phone.dispatchEvent(new w.Event('input',{bubbles:true}));
    assert.equal(form.querySelector('.otp-panel').hidden,true); assert.equal(form.elements.otp.required,false);
    await submit();assert.ok(calls[2].url.endsWith('challenge'));dom.window.close();
  });
}

test('SMS-only server: first send has no channel and WhatsApp button is hidden',async()=>{
  const dom=new JSDOM(readFileSync('newsletter.html','utf8'),{runScripts:'outside-only',url:'https://test.local/newsletter.html'});
  const w=dom.window, calls=[];
  w.setInterval=()=>0; w.clearInterval=()=>{};
  w.fetch=async (url,options)=>{
    if(options.method==='GET') return {ok:true,json:async()=>({turnstileSiteKey:null})};
    calls.push({url,body:JSON.parse(options.body)});
    return {ok:true,json:async()=>({challengeId:'id',sent:true,channel:'sms',channels:['sms'],expiresIn:300,resendAfter:60,smsAfter:60})};
  };
  w.eval(readFileSync('newsletter-otp.js','utf8'));
  w.eval(readFileSync('script.js','utf8'));
  w.NewsletterOtp.attach(w.document.querySelector('#sib-form'),()=>{});
  const form=w.document.querySelector('#sib-form');
  assert.equal(form.querySelector('[type=submit]').textContent,'Ricevi il codice');
  const set=(name,value)=>{(form.elements[name]||form.elements[name.toUpperCase()]).value=value;};
  set('nome','Ada');set('cognome','Rossi');set('email','test@example.com');set('compleanno','01-01-1990');set('citta','Palermo');set('phone','+393331234567');form.querySelector('[type=checkbox]').checked=true;
  form.dispatchEvent(new w.Event('submit',{cancelable:true}));await new Promise(r=>setImmediate(r));
  assert.equal(calls.length,1); assert.equal(calls[0].body.channel,undefined);
  assert.equal(form.querySelector('[data-channel=whatsapp]').hidden,true);
  assert.equal(form.querySelector('[data-channel=sms]').hidden,false);
  assert.match(form.querySelector('[data-channel=sms]').textContent,/Invia di nuovo via SMS/);
  assert.match(form.querySelector('.otp-message').textContent,/tramite SMS/);
  dom.window.close();
});

for (const popup of [false,true]) {
  test(`${popup?'popup':'newsletter page'}: already-subscribed response shows the message and keeps the details`,async()=>{
    const dom=new JSDOM(readFileSync(popup?'index.html':'newsletter.html','utf8'),{runScripts:'outside-only',url:`https://test.local/${popup?'index':'newsletter'}.html`});
    const w=dom.window;
    w.setInterval=()=>0; w.clearInterval=()=>{};
    w.fetch=async()=>({ok:false,json:async()=>({error:'Questa email o questo numero risulta già iscritto alla newsletter.',code:'already_subscribed'})});
    w.eval(readFileSync('newsletter-otp.js','utf8'));
    w.eval(readFileSync('script.js','utf8'));
    if(!popup) w.NewsletterOtp.attach(w.document.querySelector('#sib-form'),()=>{});
    const form=w.document.querySelector(popup?'.nlp-form':'#sib-form');
    const set=(name,value)=>{(form.elements[name]||form.elements[name.toUpperCase()]).value=value;};
    set('nome','Ada');set('cognome','Rossi');set('email','test@example.com');set('compleanno','01-01-1990');set('citta','Palermo');set('phone','+393331234567');form.querySelector('[type=checkbox]').checked=true;
    form.dispatchEvent(new w.Event('submit',{cancelable:true}));await new Promise(r=>setImmediate(r));
    assert.match(form.querySelector('.otp-message').textContent,/già iscritto alla newsletter/);
    assert.equal(form.querySelector('.otp-panel').hidden,true);
    assert.equal((form.elements.email||form.elements.EMAIL).value,'test@example.com');
    assert.equal(form.querySelector('[type=submit]').disabled,false);
    dom.window.close();
  });
}

test('Turnstile on: the form gets a fresh token for each code request',async()=>{
  const dom=new JSDOM(readFileSync('newsletter.html','utf8'),{runScripts:'outside-only',url:'https://test.local/newsletter.html'});
  const w=dom.window, calls=[], widget={};
  w.setInterval=()=>0; w.clearInterval=()=>{};
  let n=0;
  w.turnstile={render:(el,opts)=>{Object.assign(widget,opts,{el}); return 'w1';}, reset:()=>{widget.resets=(widget.resets||0)+1;}, execute:()=>setTimeout(()=>widget.callback(`token-${++n}`),0)};
  w.fetch=async (url,options)=>{
    if(options.method==='GET') return {ok:true,json:async()=>({turnstileSiteKey:'site-key'})};
    calls.push({url,body:JSON.parse(options.body)});
    return {ok:true,json:async()=>({challengeId:'id',sent:true,channel:'sms',channels:['sms'],expiresIn:300,resendAfter:0,smsAfter:0})};
  };
  w.eval(readFileSync('newsletter-otp.js','utf8'));
  w.eval(readFileSync('script.js','utf8'));
  w.NewsletterOtp.attach(w.document.querySelector('#sib-form'),()=>{});
  const form=w.document.querySelector('#sib-form');
  const set=(name,value)=>{(form.elements[name]||form.elements[name.toUpperCase()]).value=value;};
  set('nome','Ada');set('cognome','Rossi');set('email','test@example.com');set('compleanno','01-01-1990');set('citta','Palermo');set('phone','+393331234567');form.querySelector('[type=checkbox]').checked=true;
  const settle=()=>new Promise(r=>setTimeout(r,20));
  form.dispatchEvent(new w.Event('submit',{cancelable:true})); await settle();
  assert.equal(widget.sitekey,'site-key'); assert.equal(widget.el.className,'otp-turnstile');
  assert.equal(calls[0].body.turnstileToken,'token-1');
  form.querySelector('[data-channel=sms]').click(); await settle();
  assert.equal(widget.resets,1); assert.equal(calls[1].body.turnstileToken,'token-2');
  dom.window.close();
});

test('phone prefix list matches libphonenumber and Italy +39 is first and selected',()=>{
  const { getCountries, getCountryCallingCode } = require('libphonenumber-js/max');
  const dom=new JSDOM(readFileSync('newsletter.html','utf8'),{runScripts:'outside-only',url:'https://test.local/newsletter.html'});
  dom.window.eval(readFileSync('newsletter-otp.js','utf8'));
  assert.equal(dom.window.NewsletterOtp.PREFIXES, getCountries().map(c=>c+getCountryCallingCode(c)).join(','));
  dom.window.NewsletterOtp.attach(dom.window.document.querySelector('#sib-form'),()=>{});
  const select=dom.window.document.querySelector('#sib-form select[name=phone_prefix]');
  assert.equal(select.value,'39'); assert.equal(select.options[0].dataset.country,'IT'); assert.equal(select.selectedIndex,0);
  assert.ok(select.options.length>240);
  dom.window.close();
});
for (const popup of [false,true]) {
  test(`${popup?'popup':'newsletter page'}: prefix dropdown + number are sent as one international number`,async()=>{
    const dom=new JSDOM(readFileSync(popup?'index.html':'newsletter.html','utf8'),{runScripts:'outside-only',url:`https://test.local/${popup?'index':'newsletter'}.html`});
    const w=dom.window, calls=[];
    w.setInterval=()=>0; w.clearInterval=()=>{};
    w.fetch=async (url,options)=>{
      if(options.method==='GET') return {ok:true,json:async()=>({turnstileSiteKey:null})};
      calls.push(JSON.parse(options.body));
      return {ok:false,json:async()=>({error:'stop'})};
    };
    w.eval(readFileSync('newsletter-otp.js','utf8'));
    w.eval(readFileSync('script.js','utf8'));
    if(!popup) w.NewsletterOtp.attach(w.document.querySelector('#sib-form'),()=>{});
    const form=w.document.querySelector(popup?'.nlp-form':'#sib-form');
    const set=(name,value)=>{(form.elements[name]||form.elements[name.toUpperCase()]).value=value;};
    set('nome','Ada');set('cognome','Rossi');set('email','test@example.com');set('compleanno','01-01-1990');set('citta','Palermo');form.querySelector('[type=checkbox]').checked=true;
    const submit=async()=>{form.dispatchEvent(new w.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,10));};
    set('phone','333 123 4567'); await submit();
    assert.equal(calls.at(-1).phone,'+393331234567');
    form.elements.phone_prefix.value='44'; set('phone','20 7946 0018'); await submit();
    assert.equal(calls.at(-1).phone,'+442079460018');
    set('phone','0033 1 42 34 56 78'); await submit();
    assert.equal(calls.at(-1).phone,'+33142345678');
    form.reset();
    assert.equal(form.elements.phone_prefix.value,'39'); assert.equal(form.elements.phone.value,'');
    dom.window.close();
  });
}

test('closed prefix dropdown shows only flag and prefix; the open list keeps country names',()=>{
  const dom=new JSDOM(readFileSync('newsletter.html','utf8'),{runScripts:'outside-only',url:'https://test.local/newsletter.html'});
  const w=dom.window;
  w.eval(readFileSync('newsletter-otp.js','utf8'));
  w.NewsletterOtp.attach(w.document.querySelector('#sib-form'),()=>{});
  const s=w.document.querySelector('#sib-form select[name=phone_prefix]');
  const selectedText=()=>s.options[s.selectedIndex].text;
  assert.equal(selectedText(),'🇮🇹\u00a0+39');
  assert.match(s.options[2].text,/ · Afghanistan$/);
  s.dispatchEvent(new w.Event('focus'));
  assert.equal(selectedText(),'🇮🇹 +39 · Italia');
  const gb=[...s.options].findIndex(o=>o.dataset.country==='GB');
  s.selectedIndex=gb; s.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(selectedText(),'🇬🇧\u00a0+44');
  assert.equal(s.options[0].text,'🇮🇹 +39 · Italia');
  assert.equal(s.value,'44');
  dom.window.close();
});

test('likely-domain check: fixes typos, leaves real domains alone',()=>{
  const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only'});
  dom.window.eval(readFileSync('newsletter-otp.js','utf8'));
  const fix=dom.window.NewsletterOtp.likelyDomain;
  for (const [typo,want] of [['gmail.it','gmail.com'],['gmial.com','gmail.com'],['gmal.com','gmail.com'],['gmail.con','gmail.com'],['hotmial.it','hotmail.it'],['libero.com','libero.it'],['libbero.it','libero.it'],['yaho.it','yahoo.it'],['virgillio.it','virgilio.it']])
    assert.equal(fix(typo),want,typo);
  for (const ok of ['gmail.com','hotmail.com','hotmail.it','libero.it','h2collection.it','unipa.it','company.co.uk','gmail'])
    assert.equal(fix(ok),null,ok);
  dom.window.close();
});
for (const popup of [false,true]) {
  test(`${popup?'popup':'newsletter page'}: one email field with domain suggestions and a typo hint`,()=>{
    const dom=new JSDOM(readFileSync(popup?'index.html':'newsletter.html','utf8'),{runScripts:'outside-only',url:`https://test.local/${popup?'index':'newsletter'}.html`});
    const w=dom.window;
    w.setInterval=()=>0; w.clearInterval=()=>{};
    w.fetch=async()=>({ok:true,json:async()=>({})});
    w.eval(readFileSync('newsletter-otp.js','utf8'));
    w.eval(readFileSync('script.js','utf8'));
    if(!popup) w.NewsletterOtp.attach(w.document.querySelector('#sib-form'),()=>{});
    const form=w.document.querySelector(popup?'.nlp-form':'#sib-form');
    assert.equal(form.elements.email_confirm,undefined);
    assert.equal(form.querySelector('.otp-email-domains'),null);
    const email=form.elements.email||form.elements.EMAIL;
    assert.equal(email.type,'email'); assert.equal(email.getAttribute('autocomplete'),'email');
    const list=w.document.getElementById(email.getAttribute('list'));
    const hint=form.querySelector('.otp-email-hint');
    const type=v=>{email.value=v; email.dispatchEvent(new w.Event('input',{bubbles:true}));};
    const options=()=>[...list.options].map(o=>o.value);
    type('mario.rossi');
    assert.deepEqual(options(),['mario.rossi@gmail.com','mario.rossi@libero.it','mario.rossi@hotmail.it','mario.rossi@virgilio.it','mario.rossi@yahoo.it']);
    type('mario.rossi@li');
    assert.deepEqual(options(),['mario.rossi@libero.it','mario.rossi@live.it']);
    assert.equal(hint.hidden,true);
    type('mario.rossi@gmail.com'); assert.deepEqual(options(),[]); assert.equal(hint.hidden,true);
    type('mario.rossi@gmail.it');
    assert.equal(hint.hidden,false); assert.match(hint.textContent,/Forse intendevi mario.rossi@gmail.com\?/);
    hint.querySelector('button').click();
    assert.equal(email.value,'mario.rossi@gmail.com'); assert.equal(hint.hidden,true);
    type('mario <b>@gmial.com');
    assert.equal(list.options.length,0); assert.equal(hint.querySelector('b'),null);
    dom.window.close();
  });
}

for (const popup of [false,true]) {
  test(`${popup?'popup':'newsletter page'}: success message mentions the wait and the spam folder`,async()=>{
    const dom=new JSDOM(readFileSync(popup?'index.html':'newsletter.html','utf8'),{runScripts:'outside-only',url:`https://test.local/${popup?'index':'newsletter'}.html`});
    const w=dom.window;
    w.setInterval=()=>0; w.clearInterval=()=>{};
    w.fetch=async (url,options)=>{
      if(options.method==='GET') return {ok:true,json:async()=>({turnstileSiteKey:null})};
      return url.endsWith('challenge') ? {ok:true,json:async()=>({challengeId:'id',sent:true,channel:'sms',channels:['sms'],expiresIn:300,resendAfter:60,smsAfter:60})} : {ok:true,json:async()=>({success:true})};
    };
    w.eval(readFileSync('newsletter-otp.js','utf8'));
    w.eval(readFileSync('script.js','utf8'));
    if(!popup) w.NewsletterOtp.attach(w.document.querySelector('#sib-form'),()=>{});
    const form=w.document.querySelector(popup?'.nlp-form':'#sib-form');
    const set=(name,value)=>{(form.elements[name]||form.elements[name.toUpperCase()]).value=value;};
    set('nome','Ada');set('cognome','Rossi');set('email','test@example.com');set('compleanno','01-01-1990');set('citta','Palermo');set('phone','+393331234567');form.querySelector('[type=checkbox]').checked=true;
    const submit=async()=>{form.dispatchEvent(new w.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,10));};
    await submit(); form.elements.otp.value='123456'; await submit();
    const text=popup ? w.document.querySelector('.nlp').textContent : form.querySelector('.otp-message').textContent;
    assert.match(text,/entro qualche minuto/); assert.match(text,/spam \/ posta indesiderata/);
    dom.window.close();
  });
}
