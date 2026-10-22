'use strict';

const $app = document.getElementById('app');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const list = v => (Array.isArray(v) ? v : [v]);

function plural(n, one, few, many) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}
const words = n => n + ' ' + plural(n, 'слово', 'слова', 'слов');

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- данные ----------
const TOPICS = (window.TOPICS || []).map(t => ({
  ...t,
  words: t.words.map(w => ({ en: list(w.en), ru: list(w.ru), note: w.note || '', topic: t.id })),
}));
const wordKey = w => w.topic + '|' + w.en[0];

// ---------- прогресс (хранится только на этом телефоне) ----------
const store = {
  get(k, def) {
    try { const v = JSON.parse(localStorage.getItem('lv.' + k)); return v == null ? def : v; } catch (e) { return def; }
  },
  set(k, v) {
    try { localStorage.setItem('lv.' + k, JSON.stringify(v)); } catch (e) { /* приватный режим */ }
  },
};
const stats = store.get('stats', {}); // wordKey -> { ok, bad, last }
const best = store.get('best', {});   // topicId:dir -> лучший процент
const prefs = Object.assign({ dir: 'en-ru', len: 20 }, store.get('prefs', {}));

function record(w, ok, override) {
  const k = wordKey(w);
  const s = stats[k] || (stats[k] = { ok: 0, bad: 0 });
  if (override) { s.bad = Math.max(0, s.bad - 1); s.ok++; }
  else if (ok) s.ok++;
  else s.bad++;
  s.last = ok ? 'ok' : 'bad';
  store.set('stats', stats);
}

const mistakeWords = () => TOPICS.flatMap(t => t.words).filter(w => stats[wordKey(w)]?.last === 'bad');
const MISTAKES = '__mistakes';
function findTopic(id) {
  if (id === MISTAKES) {
    return {
      id: MISTAKES,
      title: 'Работа над ошибками',
      description: 'Слова, в которых была ошибка при последнем ответе. Ответишь верно — слово уйдёт из списка.',
      words: mistakeWords(),
    };
  }
  return TOPICS.find(t => t.id === id);
}

// ---------- проверка ответа ----------
function norm(s, lang) {
  s = String(s).toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[’‘`´]/g, "'")
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-zа-я0-9']+/g, ' ')
    .trim();
  if (lang === 'en') s = s.replace(/^(to|the|a|an) /, '');
  return s;
}

function lev(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Короткие слова — только точно, длинные прощают 1–2 опечатки
function check(input, answers, lang) {
  const x = norm(input, lang);
  if (!x) return { ok: false };
  let typo = false;
  for (const a of answers) {
    const y = norm(a, lang);
    if (x === y) return { ok: true, typo: false };
    const tolerance = y.length <= 4 ? 0 : y.length <= 8 ? 1 : 2;
    if (lev(x, y) <= tolerance) typo = true;
  }
  return { ok: typo, typo };
}

// ---------- экраны ----------
let quiz = null;

function badge(label, v) {
  if (v == null) return '';
  return `<span class="badge ${v >= 90 ? 'good' : v >= 60 ? 'mid' : 'low'}">${label} ${v}%</span>`;
}

function showHome() {
  quiz = null;
  const total = TOPICS.reduce((n, t) => n + t.words.length, 0);
  const mist = mistakeWords().length;
  $app.innerHTML = `
    <header class="home-head">
      <div class="logo">§</div>
      <div>
        <h1>Legal English</h1>
        <p class="muted">${TOPICS.length} ${plural(TOPICS.length, 'тема', 'темы', 'тем')} · ${words(total)}</p>
      </div>
    </header>
    ${mist ? `
      <button class="card mistakes" data-topic="${MISTAKES}">
        <div class="card-title">Работа над ошибками</div>
        <div class="card-meta">${words(mist)} на повторение</div>
      </button>` : ''}
    <h2 class="section">Темы</h2>
    <div class="topics">
      ${TOPICS.map(t => `
        <button class="card" data-topic="${esc(t.id)}">
          <div class="card-title">${esc(t.title)}</div>
          <div class="card-meta">
            <span>${words(t.words.length)}</span>
            ${badge('EN→RU', best[t.id + ':en-ru'])}
            ${badge('RU→EN', best[t.id + ':ru-en'])}
          </div>
        </button>`).join('') || '<p class="muted">Пока нет тем.</p>'}
    </div>`;
  $app.querySelectorAll('[data-topic]').forEach(b => { b.onclick = () => showTopic(b.dataset.topic); });
  window.scrollTo(0, 0);
}

function setupSeg(id, value, onChange) {
  const btns = [...document.getElementById(id).children];
  const paint = v => btns.forEach(b => { b.classList.toggle('on', b.dataset.v === v); b.setAttribute('aria-pressed', b.dataset.v === v); });
  paint(value);
  btns.forEach(b => { b.onclick = () => { paint(b.dataset.v); onChange(b.dataset.v); }; });
}

function showTopic(id) {
  const t = findTopic(id);
  if (!t || !t.words.length) return showHome();
  const lens = [10, 20].filter(n => n < t.words.length).concat(0);
  let len = lens.includes(prefs.len) ? prefs.len : 0;

  $app.innerHTML = `
    <header class="bar"><button class="icon-btn" id="back" aria-label="Назад">‹</button></header>
    <h1 class="topic-title">${esc(t.title)}</h1>
    ${t.description ? `<p class="muted">${esc(t.description)}</p>` : ''}
    <div class="field-label">Направление</div>
    <div class="seg" id="dir">
      <button data-v="en-ru">EN → RU</button>
      <button data-v="ru-en">RU → EN</button>
    </div>
    <div class="field-label">Сколько слов</div>
    <div class="seg" id="len">
      ${lens.map(n => `<button data-v="${n}">${n || 'Все · ' + t.words.length}</button>`).join('')}
    </div>
    <button class="primary" id="start">Начать тест</button>
    <details class="vocab">
      <summary>Словарь темы · ${t.words.length}</summary>
      <ul>
        ${t.words.map(w => `
          <li>
            <b>${esc(w.en.join(' / '))}</b>
            <span>${esc(w.ru.join('; '))}</span>
            ${w.note ? `<small>${esc(w.note)}</small>` : ''}
          </li>`).join('')}
      </ul>
    </details>`;

  setupSeg('dir', prefs.dir, v => { prefs.dir = v; });
  setupSeg('len', String(len), v => { len = +v; prefs.len = len; });
  document.getElementById('back').onclick = showHome;
  document.getElementById('start').onclick = () => {
    store.set('prefs', prefs);
    startQuiz(t, prefs.dir, len, t.words);
  };
  window.scrollTo(0, 0);
}

function startQuiz(topic, dir, len, pool) {
  const items = shuffle([...pool]);
  quiz = { topic, dir, len, items: len ? items.slice(0, len) : items, i: 0, results: [], checked: false };
  renderQuestion();
}

function renderQuestion() {
  const q = quiz;
  const w = q.items[q.i];
  const toRu = q.dir === 'en-ru';
  const answers = toRu ? w.ru : w.en;
  const lang = toRu ? 'ru' : 'en';

  $app.innerHTML = `
    <header class="bar">
      <button class="icon-btn" id="quit" aria-label="Выйти">✕</button>
      <div class="progress"><div style="width:${(q.i / q.items.length) * 100}%"></div></div>
      <span class="count">${q.i + 1}/${q.items.length}</span>
    </header>
    <div class="q">
      <div class="q-label">${toRu ? 'Переведи на русский' : 'Translate into English'}</div>
      <div class="q-word" lang="${toRu ? 'en' : 'ru'}">${esc(toRu ? w.en.join(' / ') : w.ru.join('; '))}</div>
      ${w.note ? `<div class="q-note">${esc(w.note)}</div>` : ''}
    </div>
    <div id="fb" aria-live="polite"></div>
    <form id="form" autocomplete="off">
      <input id="answer" type="text" lang="${lang}" placeholder="${toRu ? 'Твой ответ' : 'Your answer'}"
        autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="go">
      <button class="primary" id="go">Проверить</button>
    </form>
    <button class="ghost" id="skip">Не знаю</button>`;

  const input = document.getElementById('answer');
  const go = document.getElementById('go');
  const skip = document.getElementById('skip');
  const fb = document.getElementById('fb');

  function showFeedback(r, value) {
    const right = `<div class="right">${esc(answers.join('; '))}</div>`;
    if (r.ok && !r.typo) {
      fb.innerHTML = `<div class="fb ok"><b class="head">Верно!</b>${answers.length > 1 ? right : ''}</div>`;
    } else if (r.ok) {
      fb.innerHTML = `<div class="fb warn"><b class="head">Засчитано, но с опечаткой</b>${right}</div>`;
    } else {
      fb.innerHTML = `<div class="fb bad"><b class="head">${value ? 'Неверно' : 'Правильный ответ'}</b>${right}
        ${value ? '<button type="button" class="link" id="override">Мой ответ тоже верный — засчитать</button>' : ''}</div>`;
      const ov = document.getElementById('override');
      if (ov) {
        ov.onclick = () => {
          q.results[q.results.length - 1].ok = true;
          record(w, true, true);
          showFeedback({ ok: true, typo: false }, value);
          input.focus();
        };
      }
    }
  }

  function submit(value) {
    const r = value.trim() ? check(value, answers, lang) : { ok: false };
    q.checked = true;
    q.results.push({ w, ok: r.ok, answer: value.trim() });
    record(w, r.ok);
    showFeedback(r, value.trim());
    input.classList.add('locked');
    skip.hidden = true;
    go.textContent = q.i + 1 < q.items.length ? 'Дальше' : 'Результаты';
  }

  document.getElementById('form').onsubmit = e => {
    e.preventDefault();
    if (q.checked) return next();
    if (!input.value.trim()) return input.focus();
    submit(input.value);
  };
  input.addEventListener('beforeinput', e => { if (q.checked) e.preventDefault(); });
  skip.onclick = () => { submit(''); input.focus(); };
  document.getElementById('quit').onclick = () => {
    if (q.i > 0 && !confirm('Прервать тест? Результат теста не сохранится.')) return;
    showTopic(q.topic.id);
  };
  input.focus();
}

function next() {
  quiz.i++;
  quiz.checked = false;
  if (quiz.i >= quiz.items.length) showResult();
  else renderQuestion();
}

function showResult() {
  const q = quiz;
  const toRu = q.dir === 'en-ru';
  const okCount = q.results.filter(r => r.ok).length;
  const pct = Math.round((okCount / q.results.length) * 100);
  const wrong = q.results.filter(r => !r.ok);

  if (q.topic.id !== MISTAKES) {
    const key = q.topic.id + ':' + q.dir;
    best[key] = Math.max(best[key] || 0, pct);
    store.set('best', best);
  }
  const verdict = pct === 100 ? 'Идеально!' : pct >= 90 ? 'Отличный результат' : pct >= 70 ? 'Хорошо, ещё немного практики' : 'Стоит повторить';

  $app.innerHTML = `
    <header class="bar"><button class="icon-btn" id="close" aria-label="Закрыть">✕</button></header>
    <div class="result">
      <div class="score">${pct}%</div>
      <div class="verdict">${verdict}</div>
      <p>${okCount} из ${q.results.length} верно · ${esc(q.topic.title)}</p>
    </div>
    ${wrong.length ? `
      <h2 class="section">Ошибки</h2>
      <ul class="wrong-list">
        ${wrong.map(r => `
          <li>
            <div class="w-q">${esc(toRu ? r.w.en.join(' / ') : r.w.ru.join('; '))}</div>
            <div class="w-a">${esc((toRu ? r.w.ru : r.w.en).join('; '))}</div>
            ${r.answer ? `<div class="w-y">${esc(r.answer)}</div>` : ''}
          </li>`).join('')}
      </ul>
      <button class="primary" id="redo">Повторить ошибки · ${wrong.length}</button>` : ''}
    <button class="${wrong.length ? 'secondary' : 'primary'}" id="again">Пройти тему ещё раз</button>
    <button class="ghost" id="home">К списку тем</button>`;

  const redo = document.getElementById('redo');
  if (redo) redo.onclick = () => startQuiz(q.topic, q.dir, 0, wrong.map(r => r.w));
  document.getElementById('again').onclick = () => {
    const t = findTopic(q.topic.id);
    if (!t || !t.words.length) return showHome();
    startQuiz(t, q.dir, q.len, t.words);
  };
  document.getElementById('close').onclick = () => showTopic(q.topic.id);
  document.getElementById('home').onclick = showHome;
  window.scrollTo(0, 0);
}

// ---------- офлайн ----------
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

showHome();
