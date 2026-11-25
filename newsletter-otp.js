/* Shared newsletter verification controller for the page and popup. */
(() => {
  // Form settings from the server (the Turnstile site key, or null when the bot check is off).
  let configPromise;
  const loadConfig = () => configPromise || (configPromise = fetch('/.netlify/functions/challenge', {method:'GET', headers:{Accept:'application/json'}})
    .then(response => response.ok ? response.json() : {}).catch(() => ({})));
  // Cloudflare's script is loaded only when someone requests a code.
  let scriptPromise;
  const loadTurnstile = () => scriptPromise || (scriptPromise = new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(Error('Turnstile missing'));
    script.onerror = () => { scriptPromise = null; reject(Error('Turnstile failed to load')); };
    document.head.appendChild(script);
  }));
  // Country + calling code for every country libphonenumber knows (tests keep this in sync).
  const PREFIXES = 'AC247,AD376,AE971,AF93,AG1,AI1,AL355,AM374,AO244,AR54,AS1,AT43,AU61,AW297,AX358,AZ994,BA387,BB1,BD880,BE32,BF226,BG359,BH973,BI257,BJ229,BL590,BM1,BN673,BO591,BQ599,BR55,BS1,BT975,BW267,BY375,BZ501,CA1,CC61,CD243,CF236,CG242,CH41,CI225,CK682,CL56,CM237,CN86,CO57,CR506,CU53,CV238,CW599,CX61,CY357,CZ420,DE49,DJ253,DK45,DM1,DO1,DZ213,EC593,EE372,EG20,EH212,ER291,ES34,ET251,FI358,FJ679,FK500,FM691,FO298,FR33,GA241,GB44,GD1,GE995,GF594,GG44,GH233,GI350,GL299,GM220,GN224,GP590,GQ240,GR30,GT502,GU1,GW245,GY592,HK852,HN504,HR385,HT509,HU36,ID62,IE353,IL972,IM44,IN91,IO246,IQ964,IR98,IS354,IT39,JE44,JM1,JO962,JP81,KE254,KG996,KH855,KI686,KM269,KN1,KP850,KR82,KW965,KY1,KZ7,LA856,LB961,LC1,LI423,LK94,LR231,LS266,LT370,LU352,LV371,LY218,MA212,MC377,MD373,ME382,MF590,MG261,MH692,MK389,ML223,MM95,MN976,MO853,MP1,MQ596,MR222,MS1,MT356,MU230,MV960,MW265,MX52,MY60,MZ258,NA264,NC687,NE227,NF672,NG234,NI505,NL31,NO47,NP977,NR674,NU683,NZ64,OM968,PA507,PE51,PF689,PG675,PH63,PK92,PL48,PM508,PR1,PS970,PT351,PW680,PY595,QA974,RE262,RO40,RS381,RU7,RW250,SA966,SB677,SC248,SD249,SE46,SG65,SH290,SI386,SJ47,SK421,SL232,SM378,SN221,SO252,SR597,SS211,ST239,SV503,SX1,SY963,SZ268,TA290,TC1,TD235,TG228,TH66,TJ992,TK690,TL670,TM993,TN216,TO676,TR90,TT1,TV688,TW886,TZ255,UA380,UG256,US1,UY598,UZ998,VA39,VC1,VE58,VG1,VI1,VN84,VU678,WF681,WS685,XK383,YE967,YT262,ZA27,ZM260,ZW263';
  const regionName = (() => { try { const names = new Intl.DisplayNames(['it'], {type:'region'}); return code => names.of(code) || code; } catch (_) { return code => code; } })();
  const flag = code => String.fromCodePoint(...[...code].map(c => 127397 + c.charCodeAt(0)));
  // Italy first and selected by default, then every other country by Italian name.
  const prefixOptions = () => {
    const all = PREFIXES.split(',').map(entry => ({country:entry.slice(0, 2), dial:entry.slice(2), name:regionName(entry.slice(0, 2))}));
    const rest = all.filter(o => o.country !== 'IT').sort((a, b) => a.name.localeCompare(b.name, 'it'));
    const option = o => `<option value="${o.dial}" data-country="${o.country}"${o.country === 'IT' ? ' selected' : ''}>${flag(o.country)} +${o.dial} · ${o.name}</option>`;
    return option(all.find(o => o.country === 'IT')) + '<option disabled>──────────</option>' + rest.map(option).join('');
  };
  window.NewsletterOtp = { loadConfig, loadTurnstile, prefixOptions, PREFIXES };
})();
Object.assign(window.NewsletterOtp, {
  attach(form, onSuccess) {
    const popup = form.classList.contains('nlp-form');
    const submit = form.querySelector('[type="submit"]');
    const field = document.createElement('div');
    field.className = 'nl-field otp-phone';
    const suffix = popup ? 'popup' : 'page';
    field.innerHTML = `<label for="phone-${suffix}">Numero di telefono con prefisso</label>
      <div class="otp-phone-row">
        <select name="phone_prefix" aria-label="Prefisso internazionale" autocomplete="tel-country-code">${window.NewsletterOtp.prefixOptions()}</select>
        <input id="phone-${suffix}" name="phone" type="tel" inputmode="tel" placeholder="333 123 4567" required autocomplete="tel-national" maxlength="30" aria-describedby="phone-note-${suffix}">
      </div>
      <p id="phone-note-${suffix}" class="otp-note">Riceverai un codice di verifica per confermare il numero. Il numero verificato sarà salvato insieme al contatto newsletter.</p>`;
    form.insertBefore(field, submit);
    // Email entry = name + a fixed "@" + a domain dropdown: the 5 most used domains on our Brevo lists
    // (about 89% of subscribers), then "Altro…" to type any other domain. Used for the email and for
    // "Conferma email"; each writes the full address into a hidden field that the rest of the form reads.
    const EMAIL_DOMAINS = ['gmail.com', 'libero.it', 'hotmail.it', 'virgilio.it', 'yahoo.it'];
    function emailPicker(hidden, { id, label, placeholder, autocomplete }) {
      const row = document.createElement('div');
      row.className = 'otp-email-row';
      row.innerHTML = `<input id="${id}" class="otp-email-local" type="text" inputmode="email" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="${autocomplete}" maxlength="64" placeholder="${placeholder}" aria-label="${label}: nome prima della @">
        <span class="otp-email-at" aria-hidden="true">@</span>
        <select class="otp-email-domain" aria-label="${label}: dominio"><option value="" disabled selected>dominio</option>${EMAIL_DOMAINS.map(d => `<option value="${d}">${d}</option>`).join('')}<option value="other">Altro…</option></select>
        <input class="otp-email-other" type="text" inputmode="email" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="190" placeholder="altro dominio, es. alice.it" aria-label="${label}: altro dominio" hidden>`;
      const local = row.querySelector('.otp-email-local'), select = row.querySelector('select'), other = row.querySelector('.otp-email-other');
      const domain = () => select.value === 'other' ? other.value.trim().replace(/^@/, '') : select.value;
      const sync = () => {
        other.hidden = select.value !== 'other';
        const name = local.value.trim(), d = domain();
        hidden.value = name && d ? `${name}@${d}` : '';
      };
      local.addEventListener('input', () => {
        // A pasted or autofilled full address is split into name and domain.
        const at = local.value.indexOf('@');
        if (at >= 0) {
          const d = local.value.slice(at + 1).trim().toLowerCase();
          local.value = local.value.slice(0, at);
          if (EMAIL_DOMAINS.includes(d)) select.value = d;
          else if (d) { select.value = 'other'; other.value = d; }
        }
        sync();
      });
      select.addEventListener('change', () => { sync(); if (select.value === 'other') other.focus(); });
      other.addEventListener('input', sync);
      form.addEventListener('reset', () => setTimeout(sync, 0));
      // Marks the first part that needs fixing; true when the address is complete.
      const check = () => {
        [local, select, other].forEach(el => el.setCustomValidity(''));
        if (!local.value.trim()) { local.setCustomValidity('Inserisci la prima parte della tua email (prima della @).'); return false; }
        if (!select.value) { select.setCustomValidity('Scegli il dominio della tua email.'); return false; }
        if (select.value === 'other' && !/^[^\s@]+\.[^\s@]+$/.test(domain())) { other.setCustomValidity('Inserisci il dominio, es. alice.it.'); return false; }
        return true;
      };
      return { row, local, check };
    }
    const emailInput = form.elements.email || form.elements.EMAIL;
    emailInput.type = 'hidden';
    emailInput.required = false;
    const mainEmail = emailPicker(emailInput, { id:`email-${suffix}`, label:'Email', placeholder: popup ? 'Email*' : 'nome', autocomplete:'email' });
    emailInput.after(mainEmail.row);
    const emailLabel = emailInput.closest('.nl-field')?.querySelector('label');
    if (emailLabel) emailLabel.htmlFor = `email-${suffix}`;
    // "Conferma email" right under the email: same picker, must match before any code is requested.
    const emailConfirm = document.createElement('input');
    Object.assign(emailConfirm, { type:'hidden', name:'email_confirm' });
    const confirmEmail = emailPicker(emailConfirm, { id:`email-confirm-${suffix}`, label:'Conferma email', placeholder: popup ? 'Conferma email*' : 'nome', autocomplete:'off' });
    const confirmWrap = document.createElement('div');
    if (!popup) {
      confirmWrap.className = 'nl-field';
      confirmWrap.innerHTML = `<label for="email-confirm-${suffix}">Conferma e-mail</label>`;
    }
    confirmWrap.append(emailConfirm, confirmEmail.row);
    (popup ? mainEmail.row : (emailInput.closest('.nl-field') || mainEmail.row)).after(confirmWrap);
    function checkEmails() {
      const mainOk = mainEmail.check(), confirmOk = confirmEmail.check();
      if (mainOk && confirmOk && emailInput.value.toLowerCase() !== emailConfirm.value.toLowerCase())
        confirmEmail.local.setCustomValidity('Le email non coincidono.');
    }
    const panel = document.createElement('div');
    panel.className = 'otp-panel';
    panel.hidden = true;
    panel.innerHTML = `<label for="otp-${suffix}">Codice di verifica</label>
      <input id="otp-${suffix}" name="otp" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" aria-describedby="otp-status-${suffix}">
      <p id="otp-status-${suffix}" class="otp-note otp-countdown" role="timer" aria-live="off"></p>
      <div class="otp-actions"><button type="button" data-channel="whatsapp">Invia di nuovo su WhatsApp</button><button type="button" data-channel="sms">Invia tramite SMS</button></div>`;
    form.insertBefore(panel, submit);
    // Cloudflare Turnstile widget: usually invisible, shows a checkbox only when unsure.
    const human = document.createElement('div');
    human.className = 'otp-turnstile';
    form.insertBefore(human, submit);
    const message = document.createElement('p');
    message.className = 'otp-message';
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');
    form.appendChild(message);
    const otp = panel.querySelector('input');
    const status = panel.querySelector('.otp-countdown');
    const buttons = [...panel.querySelectorAll('button')];
    let challenge = null, busy = false, timer;
    // The server decides which channels exist (WhatsApp can be switched off); the first is primary.
    let channels = ['whatsapp', 'sms'];
    const label = channel => channel === 'whatsapp' ? 'Invia di nuovo su WhatsApp' : channels[0] === 'sms' ? 'Invia di nuovo via SMS' : 'Invia tramite SMS';
    const value = name => (form.elements[name] || form.elements[name.toUpperCase()]).value.trim();
    // Prefix from the dropdown + the typed number; a number typed with its own + or 00 prefix wins.
    function fullPhone() {
      const typed = value('phone').replace(/[^\d+]/g, '');
      if (typed.startsWith('+')) return typed;
      if (typed.startsWith('00')) return `+${typed.slice(2)}`;
      return `+${form.elements.phone_prefix.value}${typed}`;
    }
    function details() {
      const [day, month, year] = value('compleanno').split('-');
      return { nome:value('nome'), cognome:value('cognome'), email:value('email'), compleanno:`${year}-${month}-${day}`, citta:value('citta'), phone:fullPhone(), consent:form.querySelector('input[type="checkbox"]').checked };
    }
    function update() {
      if (!challenge) return;
      const remaining = Math.max(0, Math.ceil((challenge.expires - Date.now()) / 1000));
      status.textContent = remaining ? `Il codice scade tra ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}.` : 'Codice scaduto. Richiedi un nuovo codice.';
      buttons.forEach(button => {
        const wait = Math.max(0, Math.ceil((challenge[button.dataset.channel === 'sms' ? 'smsAt' : 'resendAt'] - Date.now()) / 1000));
        button.hidden = !channels.includes(button.dataset.channel);
        button.disabled = busy || wait > 0;
        button.textContent = label(button.dataset.channel) + (wait ? ` (${wait}s)` : '');
      });
      submit.disabled = busy || remaining === 0 || !challenge.sent;
    }
    function reset() {
      challenge = null; clearInterval(timer); panel.hidden = true; otp.required = false; otp.value = '';
      submit.disabled = false; submit.textContent = 'Ricevi il codice';
    }
    reset();
    form.addEventListener('input', event => {
      if (event.target !== otp && !busy) { reset(); message.textContent = 'Dati aggiornati. Richiedi un nuovo codice per continuare.'; }
    });
    form.addEventListener('change', event => {
      if (event.target !== otp && !busy) reset();
    });
    async function api(path, payload) {
      const response = await fetch(`/.netlify/functions/${path}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const body = await response.json();
      if (!response.ok) throw Error(body.error || 'Operazione non riuscita. Riprova.');
      return body;
    }
    async function run(action) {
      if (busy) return;
      busy = true; submit.disabled = true;
      // Freeze signup details while their bound request is in flight.
      const fields = [...form.querySelectorAll('input,select')];
      fields.forEach(input => { input.disabled = true; });
      buttons.forEach(button => { button.disabled = true; });
      message.textContent = 'Invio in corso…';
      try { await action(); }
      catch (err) { message.textContent = err.message || 'Connessione non riuscita. Riprova.'; }
      finally {
        busy = false; fields.forEach(input => { input.disabled = false; });
        if (challenge) update(); else submit.disabled = false;
      }
    }
    // Fresh single-use Turnstile token for each code request; null when the bot check is off.
    let widgetId = null, pending = null;
    async function humanToken() {
      const { turnstileSiteKey } = await window.NewsletterOtp.loadConfig();
      if (!turnstileSiteKey) return null;
      const failed = Error('Verifica di sicurezza non riuscita. Ricarica la pagina e riprova.');
      let turnstile;
      try { turnstile = await window.NewsletterOtp.loadTurnstile(); } catch (_) { throw failed; }
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { pending = null; reject(failed); }, 60000);
        pending = { resolve: token => { clearTimeout(timeout); pending = null; resolve(token); },
          reject: () => { clearTimeout(timeout); pending = null; reject(failed); } };
        if (widgetId === null) {
          widgetId = turnstile.render(human, { sitekey:turnstileSiteKey, execution:'execute', appearance:'interaction-only', size:'flexible', language:'it',
            callback: token => pending && pending.resolve(token),
            'error-callback': () => { if (pending) pending.reject(); return true; },
            'expired-callback': () => {} });
        } else turnstile.reset(widgetId);
        turnstile.execute(widgetId);
      });
    }
    async function send(channel) {
      const turnstileToken = await humanToken();
      // No channel on the first send: the server uses its primary channel.
      const body = await api('challenge', {...details(), ...(channel ? {channel} : {}), ...(challenge ? {challengeId:challenge.id} : {}), ...(turnstileToken ? {turnstileToken} : {})});
      const start = Date.now();
      if (Array.isArray(body.channels) && body.channels.length) channels = body.channels;
      challenge = {id:body.challengeId, sent:body.sent, expires:start+body.expiresIn*1000, resendAt:start+body.resendAfter*1000, smsAt:start+body.smsAfter*1000};
      panel.hidden = false; otp.required = true; otp.value = '';
      submit.textContent = 'Verifica e iscriviti';
      message.textContent = body.sent ? `Codice inviato ${body.channel === 'sms' ? 'tramite SMS' : 'su WhatsApp'}. Inseriscilo per iscriverti.`
        : channels.length > 1 ? 'Invio non riuscito. Riprova o richiedi un SMS quando disponibile.' : 'Invio non riuscito. Riprova tra poco.';
      clearInterval(timer); timer = setInterval(update, 1000); update();
      // Focus after run() re-enables the inputs.
      setTimeout(() => otp.focus(), 0);
    }
    buttons.forEach(button => button.addEventListener('click', () => run(() => send(button.dataset.channel))));
    form.addEventListener('submit', event => {
      event.preventDefault();
      checkEmails();
      if (!form.reportValidity()) return;
      run(async () => {
        if (!challenge) return send();
        await api('subscribe', {...details(), challengeId:challenge.id, otp:otp.value.trim()});
        clearInterval(timer); reset(); form.reset();
        message.textContent = 'Iscrizione completata — benvenuta nel club!';
        onSuccess();
      });
    });
  }
});
