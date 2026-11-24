const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 60);
}, { passive: true });

const toggle  = document.querySelector('.nav-toggle');
const mobileMenu = document.getElementById('mobile-menu');
const closeBtn   = document.querySelector('.mobile-close');

toggle.addEventListener('click', () => mobileMenu.classList.add('open'));
closeBtn.addEventListener('click', () => mobileMenu.classList.remove('open'));

mobileMenu.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => mobileMenu.classList.remove('open'));
});

/* ===== POP-UP NEWSLETTER ===== */
(function () {
  const KEY_DONE = 'h2_nl_iscritta';      // già iscritta → non mostrare più
  const KEY_SEEN = 'h2_nl_chiuso';        // chiuso → ripresenta dopo 7 giorni
  const DELAY_MS = 3000;
  const page = location.pathname.split('/').pop();
  if (['newsletter.html', 'grazie.html'].includes(page)) return;

  let store;
  try { store = window.localStorage; } catch (_) { store = null; }
  const get = k => { try { return store && store.getItem(k); } catch (_) { return null; } };
  const set = (k, v) => { try { store && store.setItem(k, v); } catch (_) {} };

  if (get(KEY_DONE)) return;
  const seen = Number(get(KEY_SEEN) || 0);
  if (seen && Date.now() - seen < 7 * 24 * 3600 * 1000) return;

  const negozi = ['Alcamo','Augusta','Bagheria','Belpasso','Caltanissetta','Catania — Via Simili','Catania — Viale Rapisardi','Catania — Via Umberto','Gela — Corso V. Emanuele 441','Lentini','Messina — Via dei Mille','Messina — Via Catania','Modica — Polo Commerciale','Modica — Corso Umberto','Monreale','Palermo','Partanna','Pozzallo','Ragusa','Ramacca','Riposto','Rosolini','Sciacca','Scordia','Siracusa — Via Mosco','Siracusa — Viale Zecchino','Termini Imerese'];

  const wrap = document.createElement('div');
  wrap.className = 'nlp-overlay';
  wrap.innerHTML = `
    <div class="nlp" role="dialog" aria-modal="true" aria-labelledby="nlp-title">
      <button class="nlp-close" aria-label="Chiudi">&times;</button>
      <p class="nlp-eyebrow">Benvenuta</p>
      <h2 id="nlp-title" class="nlp-title">Entra nel mondo H2 Collection<br>e ricevi <em>10€</em> sul tuo primo acquisto*</h2>
      <form class="nlp-form" novalidate>
        <div class="nlp-row">
          <input name="nome" aria-label="Nome" placeholder="Nome*" required maxlength="200" autocomplete="given-name">
          <input name="cognome" aria-label="Cognome" placeholder="Cognome*" required maxlength="200" autocomplete="family-name">
        </div>
        <input name="email" aria-label="Email" type="email" placeholder="Email*" required autocomplete="email">
        <div class="nlp-row">
          <input name="compleanno" aria-label="Data di nascita" placeholder="Data di nascita* (GG-MM-AAAA)" required maxlength="10" inputmode="numeric" pattern="^([0-2][0-9]|3[0-1])-(0[1-9]|1[0-2])-\\d{4}$">
          <select name="citta" aria-label="Il tuo negozio" required><option value="" disabled selected>Il tuo negozio*</option>${negozi.map(n => `<option>${n}</option>`).join('')}</select>
        </div>
        <label class="nlp-optin"><input type="checkbox" required> <span>Acconsento a ricevere la newsletter e dichiaro di aver letto la <a href="https://www.iubenda.com/privacy-policy/18339689" target="_blank" rel="noopener">Privacy Policy</a>.</span></label>
        <button type="submit" class="nlp-btn">Iscriviti</button>
        <p class="nlp-msg" aria-live="polite"></p>
      </form>
      <p class="nlp-note">*Buono valido in tutti i punti vendita H2 Collection. Puoi disiscriverti in qualsiasi momento.</p>
    </div>`;
  document.body.appendChild(wrap);

  const close = () => {
    wrap.classList.remove('open');
    document.body.classList.remove('nlp-lock');
    if (!get(KEY_DONE)) set(KEY_SEEN, String(Date.now()));
  };
  const open = () => { wrap.classList.add('open'); document.body.classList.add('nlp-lock'); };

  wrap.querySelector('.nlp-close').addEventListener('click', close);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && wrap.classList.contains('open')) close(); });

  const form = wrap.querySelector('.nlp-form');
  const dob  = form.elements.compleanno;
  dob.addEventListener('input', () => {
    const d = dob.value.replace(/\D/g, '').slice(0, 8);
    dob.value = d.length > 4 ? `${d.slice(0,2)}-${d.slice(2,4)}-${d.slice(4)}` : d.length > 2 ? `${d.slice(0,2)}-${d.slice(2)}` : d;
  });

  NewsletterOtp.attach(form, () => {
      set(KEY_DONE, '1');
      wrap.querySelector('.nlp').innerHTML = `
        <button class="nlp-close" aria-label="Chiudi">&times;</button>
        <p class="nlp-eyebrow">Grazie</p>
        <h2 class="nlp-title">Benvenuta nel mondo<br><em>H2 Collection</em></h2>
        <p class="nlp-note">Controlla la tua email: il tuo buono da 10€ è in arrivo.</p>`;
      wrap.querySelector('.nlp-close').addEventListener('click', close);
  });

  setTimeout(open, DELAY_MS);
})();
