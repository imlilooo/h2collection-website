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
