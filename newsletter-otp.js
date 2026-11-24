/* Shared newsletter verification controller for the page and popup. */
window.NewsletterOtp = {
  attach(form, onSuccess) {
    const popup = form.classList.contains('nlp-form');
    const submit = form.querySelector('[type="submit"]');
    const field = document.createElement('div');
    field.className = 'nl-field otp-phone';
    const suffix = popup ? 'popup' : 'page';
    field.innerHTML = `<label for="phone-${suffix}">Numero di telefono con prefisso</label>
      <input id="phone-${suffix}" name="phone" type="tel" value="+39 " required autocomplete="tel" maxlength="30" aria-describedby="phone-note-${suffix}">
      <p id="phone-note-${suffix}" class="otp-note">Riceverai un codice di verifica per confermare il numero. Il numero verificato sarà salvato insieme al contatto newsletter.</p>`;
    form.insertBefore(field, submit);
    const panel = document.createElement('div');
    panel.className = 'otp-panel';
    panel.hidden = true;
    panel.innerHTML = `<label for="otp-${suffix}">Codice di verifica</label>
      <input id="otp-${suffix}" name="otp" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" aria-describedby="otp-status-${suffix}">
      <p id="otp-status-${suffix}" class="otp-note otp-countdown" role="timer" aria-live="off"></p>
      <div class="otp-actions"><button type="button" data-channel="whatsapp">Invia di nuovo su WhatsApp</button><button type="button" data-channel="sms">Invia tramite SMS</button></div>`;
    form.insertBefore(panel, submit);
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
    function details() {
      const [day, month, year] = value('compleanno').split('-');
      return { nome:value('nome'), cognome:value('cognome'), email:value('email'), compleanno:`${year}-${month}-${day}`, citta:value('citta'), phone:value('phone'), consent:form.querySelector('input[type="checkbox"]').checked };
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
    async function send(channel) {
      // No channel on the first send: the server uses its primary channel.
      const body = await api('challenge', {...details(), ...(channel ? {channel} : {}), ...(challenge ? {challengeId:challenge.id} : {})});
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
};
