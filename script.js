// Куди надсилати заявки:
//   'send.php' — якщо сайт на хостингу з PHP;
//   адреса Cloudflare Worker, напр. 'https://bezpechnyi-vodii.ваш-акаунт.workers.dev'
const ORDER_ENDPOINT = 'https://bezpechnyi-vodii-zayavky.evgenarkusev.workers.dev';

// Мобільне меню
const burger = document.getElementById('burger');
const nav = document.getElementById('nav');

function toggleMenu(open) {
  burger.classList.toggle('is-open', open);
  nav.classList.toggle('is-open', open);
  burger.setAttribute('aria-expanded', String(open));
}

burger.addEventListener('click', () => toggleMenu(!nav.classList.contains('is-open')));
nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => toggleMenu(false)));

// Підказка в коментарі залежить від типу замовлення
const form = document.getElementById('order');
const comment = form.elements.comment;
const hints = {
  'Пасажири': 'Коментар: кількість пасажирів, дитяче крісло, багаж…',
  'Посилки': 'Коментар: що веземо (документи, букет, подарунок), приблизний розмір…',
  'Продукти': 'Коментар: список покупок, магазин, час доставки…',
  'Тварини': 'Коментар: хто їде (кіт, собака), вага, чи є переноска, чи їде власник…',
};
form.querySelectorAll('input[name="type"]').forEach((radio) => {
  radio.addEventListener('change', () => { comment.placeholder = hints[radio.value]; });
});

// Сьогоднішня дата за замовчуванням
const today = new Date();
form.elements.date.value = today.toISOString().slice(0, 10);
form.elements.date.min = form.elements.date.value;

// Маска телефону
form.elements.phone.addEventListener('input', (e) => {
  // Приймаємо +380 67…, 380 67…, 067… та 67…
  let p = e.target.value.replace(/\D/g, '');
  if ('380'.startsWith(p)) { e.target.value = p ? '+' + p : ''; return; }
  if (p.startsWith('380')) p = p.slice(3);
  else if (p.startsWith('0')) p = p.slice(1);
  p = p.slice(0, 9);
  let out = '+380';
  if (p.length > 0) out += ' (' + p.slice(0, 2);
  if (p.length > 2) out += ') ' + p.slice(2, 5);
  if (p.length > 5) out += '-' + p.slice(5, 7);
  if (p.length > 7) out += '-' + p.slice(7, 9);
  e.target.value = out;
});

// Надсилання заявки
const submitBtn = document.getElementById('orderSubmit');
const successBox = document.getElementById('orderSuccess');
const errorBox = document.getElementById('orderError');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  successBox.hidden = true;
  errorBox.hidden = true;

  let valid = true;
  ['from', 'to', 'name', 'phone'].forEach((name) => {
    const input = form.elements[name];
    const ok = name === 'phone'
      ? input.value.replace(/\D/g, '').length === 12
      : input.value.trim() !== '';
    input.closest('.field').classList.toggle('is-invalid', !ok);
    if (!ok) valid = false;
  });
  if (!valid) return;

  const data = Object.fromEntries(new FormData(form));
  submitBtn.disabled = true;
  submitBtn.textContent = 'Надсилаємо…';

  try {
    const res = await fetch(ORDER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || !result.ok) throw new Error(result.error || res.status);

    successBox.hidden = false;
    form.reset();
    form.elements.date.value = today.toISOString().slice(0, 10);
    comment.placeholder = hints['Пасажири'];
  } catch (err) {
    console.error('Помилка надсилання заявки:', err);
    errorBox.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Надіслати заявку';
  }
});

form.addEventListener('input', (e) => {
  const field = e.target.closest('.field');
  if (field) field.classList.remove('is-invalid');
});

document.getElementById('year').textContent = today.getFullYear();
