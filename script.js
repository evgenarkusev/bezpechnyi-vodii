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

// Плаваючі кнопки ховаються, коли форма замовлення вже на екрані
const fab = document.getElementById('fab');
new IntersectionObserver(([entry]) => {
  fab.classList.toggle('is-hidden', entry.isIntersecting);
}, { threshold: 0.2 }).observe(document.getElementById('order'));

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

// Підказки адрес у полях «Звідки» і «Куди»:
// спершу миттєво — райони й вокзали Києва зі списку в HTML,
// потім — будь-яка адреса України з сервісу Photon (дані OpenStreetMap).
const KYIV_PLACES = [...document.querySelectorAll('#kyiv-places option')].map((o) => o.value);
const ADDRESS_API = 'https://photon.komoot.io/api/';
const UKRAINE_BBOX = '22.1,44.3,40.3,52.4';
// Трохи вище в списку — адреси ближче до Києва, але великі міста не губляться
const KYIV_BIAS = 'lat=50.45&lon=30.52&location_bias_scale=0.6';

function photonUrl(q, limit) {
  return `${ADDRESS_API}?q=${encodeURIComponent(q)}&limit=${limit}&lang=default&bbox=${UKRAINE_BBOX}&${KYIV_BIAS}`;
}

function formatAddress(p) {
  const main = p.housenumber
    ? `${p.street || p.name}, ${p.housenumber}`
    : (p.name || p.street || '');
  // для Києва область зайва, для сіл — показуємо район
  const parts = [
    p.district,
    p.city,
    p.city ? '' : p.county,
    p.city === 'Київ' ? '' : p.state,
  ];
  const extra = parts.filter((part, i) => part && part !== main && parts.indexOf(part) === i);
  return { main, extra: extra.join(', ') };
}

function setupAddressSuggest(input) {
  const list = document.createElement('ul');
  list.className = 'suggest';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  input.closest('.field').append(list);

  let items = [];
  let active = -1;
  let showCredit = false;
  let timer;
  let controller;

  function render() {
    list.replaceChildren();
    items.forEach((item, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.className = i === active ? 'is-active' : '';
      const b = document.createElement('b');
      b.textContent = item.main;
      li.append(b);
      if (item.extra) {
        const span = document.createElement('span');
        span.textContent = item.extra;
        li.append(span);
      }
      // mousedown, а не click: спрацьовує до того, як поле втратить фокус
      li.addEventListener('mousedown', (e) => { e.preventDefault(); choose(i); });
      list.append(li);
    });
    if (showCredit && items.length) {
      const credit = document.createElement('li');
      credit.className = 'suggest__credit';
      credit.textContent = 'Адреси: © OpenStreetMap';
      list.append(credit);
    }
    list.hidden = items.length === 0;
  }

  function choose(i) {
    const item = items[i];
    input.value = item.extra ? `${item.main}, ${item.extra}` : item.main;
    if (item.coords) input.dataset.coords = item.coords.join(',');
    else delete input.dataset.coords;
    close();
    // Прибирає червону рамку помилки; власний обробник підказок ігнорує цю подію
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('addresschange'));
  }

  function close() {
    items = [];
    active = -1;
    list.hidden = true;
    clearTimeout(timer);
    if (controller) controller.abort();
  }

  input.addEventListener('input', (e) => {
    if (!e.isTrusted) return;
    delete input.dataset.coords; // адресу змінили вручну — координати вже не ті
    const q = input.value.trim();
    clearTimeout(timer);
    if (controller) controller.abort();
    if (!q) return close();

    const lower = q.toLowerCase();
    const local = KYIV_PLACES
      .filter((place) => place.toLowerCase().includes(lower))
      .slice(0, 5)
      .map((place) => ({ main: place, extra: '' }));
    items = local;
    active = -1;
    showCredit = false;
    render();

    if (q.length < 3) return;
    timer = setTimeout(async () => {
      controller = new AbortController();
      try {
        const res = await fetch(photonUrl(q, 15), { signal: controller.signal });
        const data = await res.json();
        const seen = new Set(local.map((item) => item.main));
        const found = data.features
          .filter((f) => f.properties.countrycode === 'UA')
          .map((f) => ({ ...formatAddress(f.properties), coords: f.geometry.coordinates }))
          .filter((item) => {
            const key = `${item.main}|${item.extra}`;
            if (!item.main || seen.has(key) || seen.has(item.main)) return false;
            seen.add(key);
            return true;
          });
        items = [...local, ...found].slice(0, 8);
        active = -1;
        showCredit = found.length > 0;
        render();
      } catch (err) {
        if (err.name !== 'AbortError') console.warn('Підказки адрес недоступні:', err);
      }
    }, 300);
  });

  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      active = (active + step + items.length) % items.length;
      render();
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape') {
      close();
    }
  });

  input.addEventListener('blur', () => {
    close();
    input.dispatchEvent(new Event('addresschange'));
  });
}

setupAddressSuggest(form.elements.from);
setupAddressSuggest(form.elements.to);

// Попередній розрахунок: відстань дорогами (сервіс OSRM) × тариф за кілометр
const PRICE_PER_KM = 25;
const ANIMALS_PRICE_PER_KM = [30, 35];
// Мінімальна вартість поїздки — як «від …» у розділі «Тарифи»
const MIN_PRICE = { 'Пасажири': 150, 'Посилки': 400, 'Продукти': 400, 'Тварини': 150 };
const ROUTE_API = 'https://router.project-osrm.org/route/v1/driving/';

const estimateBox = document.getElementById('estimate');
const geocodeCache = new Map();
let lastRoute = null; // { key, km, minutes }
let estimateSeq = 0;

async function coordsOf(input) {
  if (input.dataset.coords) return input.dataset.coords.split(',').map(Number);
  let q = input.value.trim();
  // Масиви Києва зі швидкого списку (напр. «Троєщина») є й серед сіл — уточнюємо місто
  if (KYIV_PLACES.includes(q) && !q.includes('Київ')) q += ', Київ';
  if (!geocodeCache.has(q)) {
    const res = await fetch(photonUrl(q, 1));
    const data = await res.json();
    const f = data.features.find((feature) => feature.properties.countrycode === 'UA');
    geocodeCache.set(q, f ? f.geometry.coordinates : null);
  }
  return geocodeCache.get(q);
}

const roundUp10 = (x) => Math.ceil(x / 10) * 10;
const uah = (x) => `${roundUp10(x).toLocaleString('uk-UA')} ₴`;

function showEstimate(lines, isError) {
  estimateBox.replaceChildren(...lines.map(([tag, text]) => {
    const el = document.createElement(tag);
    el.textContent = text;
    return el;
  }));
  estimateBox.classList.toggle('estimate--error', Boolean(isError));
  estimateBox.hidden = false;
}

function renderPrice() {
  const type = form.elements.type.value;
  const { km, minutes } = lastRoute;
  const min = MIN_PRICE[type];
  let price;
  if (type === 'Тварини') {
    const [low, high] = ANIMALS_PRICE_PER_KM.map((rate) => Math.max(min, km * rate));
    price = low === high ? uah(low) : `${uah(low)} – ${uah(high)}`;
  } else {
    price = uah(Math.max(min, km * PRICE_PER_KM));
  }
  const kmText = km.toLocaleString('uk-UA', { maximumFractionDigits: 1 });
  const time = minutes < 60 ? `${minutes} хв` : `${Math.floor(minutes / 60)} год ${minutes % 60} хв`;
  showEstimate([
    ['span', `Відстань ≈ ${kmText} км · у дорозі ≈ ${time}`],
    ['b', `Орієнтовна вартість: ${price}`],
    ['small', 'Точну ціну підтвердимо телефоном'],
  ]);
  form.elements.estimate.value = `${kmText} км, ${price}`;
}

async function updateEstimate() {
  const from = form.elements.from;
  const to = form.elements.to;
  const seq = ++estimateSeq;
  form.elements.estimate.value = '';
  if (!from.value.trim() || !to.value.trim()) {
    estimateBox.hidden = true;
    return;
  }
  const key = `${from.value.trim()}|${from.dataset.coords || ''}|${to.value.trim()}|${to.dataset.coords || ''}`;
  if (lastRoute && lastRoute.key === key) return renderPrice();

  showEstimate([['span', 'Розраховуємо відстань…']]);
  try {
    const [a, b] = await Promise.all([coordsOf(from), coordsOf(to)]);
    if (seq !== estimateSeq) return;
    if (!a || !b) {
      showEstimate([['span', 'Не знайшли адресу на карті — оберіть її з підказок або назвемо ціну телефоном.']], true);
      return;
    }
    const res = await fetch(`${ROUTE_API}${a.join(',')};${b.join(',')}?overview=false`);
    const data = await res.json();
    if (seq !== estimateSeq) return;
    if (data.code !== 'Ok' || !data.routes.length) throw new Error(data.code);
    lastRoute = {
      key,
      km: data.routes[0].distance / 1000,
      minutes: Math.max(1, Math.round(data.routes[0].duration / 60)),
    };
    renderPrice();
  } catch (err) {
    if (seq !== estimateSeq) return;
    console.warn('Не вдалося розрахувати маршрут:', err);
    showEstimate([['span', 'Не вдалося розрахувати відстань — назвемо ціну телефоном.']], true);
  }
}

form.elements.from.addEventListener('addresschange', updateEstimate);
form.elements.to.addEventListener('addresschange', updateEstimate);
form.querySelectorAll('input[name="type"]').forEach((radio) => {
  radio.addEventListener('change', () => { if (lastRoute && !estimateBox.hidden) updateEstimate(); });
});
form.addEventListener('reset', () => {
  estimateSeq++;
  lastRoute = null;
  estimateBox.hidden = true;
  delete form.elements.from.dataset.coords;
  delete form.elements.to.dataset.coords;
});

// Лічильник кілометрів у тарифі «Доставка»
const deliveryKm = document.getElementById('delivery-km');
const deliveryTotal = document.getElementById('delivery-total');

function updateDeliveryTotal() {
  const km = Math.max(0, Number(deliveryKm.value) || 0);
  deliveryTotal.textContent = uah(Math.max(MIN_PRICE['Посилки'], km * PRICE_PER_KM));
}

deliveryKm.addEventListener('input', updateDeliveryTotal);
document.querySelectorAll('.km-calc__btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    deliveryKm.value = Math.max(0, (Number(deliveryKm.value) || 0) + Number(btn.dataset.step));
    updateDeliveryTotal();
  });
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
