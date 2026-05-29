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

function handleSubmit(e) {
  e.preventDefault();
  const fb = document.getElementById('form-feedback');
  e.target.querySelector('input').value = '';
  fb.textContent = 'Thank you — we\'ll be in touch soon.';
}
