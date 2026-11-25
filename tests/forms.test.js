const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');
// Types into the email picker (name @ domain) like a customer would; a full address is split automatically.
const typeEmail=(w,form,which,value)=>{const el=form.querySelector(which==='confirm'?'input[id^=email-confirm-]':'input.otp-email-local:not([id^=email-confirm-])'); el.value=value; el.dispatchEvent(new w.Event('input',{bubbles:true}));};
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
    set('nome','Ada');set('cognome','Rossi');typeEmail(w,form,'main','test@example.com');typeEmail(w,form,'confirm','test@example.com');set('compleanno','01-01-1990');set('citta','Palermo');set('phone','+393331234567');form.querySelector('[type=checkbox]').checked=true;
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
  set('nome','Ada');set('cognome','Rossi');typeEmail(w,form,'main','test@example.com');typeEmail(w,form,'confirm','test@example.com');set('compleanno','01-01-1990');set('citta','Palermo');set('phone','+393331234567');form.querySelector('[type=checkbox]').checked=true;
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
    set('nome','Ada');set('cognome','Rossi');typeEmail(w,form,'main','test@example.com');typeEmail(w,form,'confirm','test@example.com');set('compleanno','01-01-1990');set('citta','Palermo');set('phone','+393331234567');form.querySelector('[type=checkbox]').checked=true;
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
  set('nome','Ada');set('cognome','Rossi');typeEmail(w,form,'main','test@example.com');typeEmail(w,form,'confirm','test@example.com');set('compleanno','01-01-1990');set('citta','Palermo');set('phone','+393331234567');form.querySelector('[type=checkbox]').checked=true;
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
    set('nome','Ada');set('cognome','Rossi');typeEmail(w,form,'main','test@example.com');typeEmail(w,form,'confirm','test@example.com');set('compleanno','01-01-1990');set('citta','Palermo');form.querySelector('[type=checkbox]').checked=true;
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

const pickerForm=popup=>{
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
  set('nome','Ada');set('cognome','Rossi');set('compleanno','01-01-1990');set('citta','Palermo');set('phone','+393331234567');form.querySelector('[type=checkbox]').checked=true;
  const submit=async()=>{form.dispatchEvent(new w.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,10));};
  return {dom,w,form,calls,submit};
};
for (const popup of [false,true]) {
  test(`${popup?'popup':'newsletter page'}: email and Conferma email are name + @ + domain dropdown`,async()=>{
    const {dom,w,form,calls,submit}=pickerForm(popup);
    const rows=[...form.querySelectorAll('.otp-email-row')];
    assert.equal(rows.length,2);
    for (const row of rows) {
      assert.equal(row.querySelector('.otp-email-at').textContent,'@');
      const options=[...row.querySelector('select').options].map(o=>o.textContent);
      assert.deepEqual(options,['dominio','gmail.com','libero.it','hotmail.it','virgilio.it','yahoo.it','Altro…']);
      assert.equal(row.querySelector('select').value,'');
      assert.equal(row.querySelector('.otp-email-other').hidden,true);
    }
    const [main,confirm]=rows;
    const pick=(row,value)=>{const s=row.querySelector('select'); s.value=value; s.dispatchEvent(new w.Event('change',{bubbles:true}));};
    const type=(el,value)=>{el.value=value; el.dispatchEvent(new w.Event('input',{bubbles:true}));};
    // Nothing chosen yet: blocked, first missing part flagged.
    type(main.querySelector('.otp-email-local'),'mario.rossi'); await submit();
    assert.equal(calls.length,0); assert.match(main.querySelector('select').validationMessage,/dominio/);
    pick(main,'libero.it');
    type(confirm.querySelector('.otp-email-local'),'mario.rossi'); pick(confirm,'gmail.com'); await submit();
    assert.equal(calls.length,0); assert.equal(confirm.querySelector('.otp-email-local').validationMessage,'Le email non coincidono.');
    pick(confirm,'libero.it'); await submit();
    assert.equal(calls.length,1); assert.equal(calls[0].email,'mario.rossi@libero.it'); assert.equal(calls[0].email_confirm,undefined);
    // Altro: a domain field appears; a pasted full address is split into name and domain.
    pick(main,'other'); assert.equal(main.querySelector('.otp-email-other').hidden,false);
    type(main.querySelector('.otp-email-local'),'Anna.B@Alice.it');
    assert.equal(main.querySelector('.otp-email-local').value,'Anna.B'); assert.equal(main.querySelector('.otp-email-other').value,'alice.it');
    type(confirm.querySelector('.otp-email-local'),'anna.b@alice.it');
    assert.equal(confirm.querySelector('select').value,'other');
    await submit();
    assert.equal(calls.length,2); assert.equal(calls[1].email,'Anna.B@alice.it');
    type(confirm.querySelector('.otp-email-local'),'anna.b@gmail.com');
    assert.equal(confirm.querySelector('select').value,'gmail.com'); assert.equal(confirm.querySelector('.otp-email-other').hidden,true);
    form.reset(); await new Promise(r=>setTimeout(r,5));
    assert.equal(main.querySelector('select').value,''); assert.equal((form.elements.email||form.elements.EMAIL).value,'');
    dom.window.close();
  });
}
