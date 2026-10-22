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

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* приватный режим */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* приватный режим */ } },
  json(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
};

// ---------- проверка ответа ----------
function norm(s, lang) {
  s = ' ' + String(s).toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[’‘`´]/g, "'")
    .replace(/[^a-zа-я0-9']+/g, ' ') + ' ';
  // «smb.», «кого-либо» и т.п. можно не писать
  s = lang === 'en'
    ? s.replace(/ (smb|smth|sb|sth) /g, ' ').replace(/^ (to|the|a|an) /, ' ')
    : s.replace(/ (кого|чего|чем|что|кому|чьем|чье|чей) (либо|л) /g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

// Пояснение в скобках необязательно: подходит и с ним, и без него
const variants = (a, lang) => [...new Set([norm(a.replace(/\([^)]*\)/g, ' '), lang), norm(a, lang)])];

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

// Отрицательные приставки: «исполненный»/«неисполненный» — не опечатка, а антоним
const NEGATION = { ru: /^не(?=..)/, en: /^(un|in|im|il|ir|non|dis)(?=...)/ };
const core = (s, lang) => s.split(' ').map(t => t.replace(NEGATION[lang], '')).join(' ');

// Короткие слова — только точно, длинные прощают опечатки
function check(input, answers, lang) {
  const x = norm(input, lang);
  if (!x) return { ok: false };
  const own = answers.flatMap(a => variants(a, lang));
  if (own.includes(x)) return { ok: true, typo: false };
  if (KNOWN[lang].has(x)) return { ok: false }; // это другой термин из словаря: consignee вместо consignor
  let typo = false;
  for (const y of own) {
    if (core(x, lang) === core(y, lang)) continue;
    const tolerance = y.length <= 4 ? 0 : y.length <= 8 ? 1 : y.length <= 20 ? 2 : 3;
    if (lev(x, y) <= tolerance) typo = true;
  }
  return { ok: typo, typo };
}

// ---------- данные ----------
const TOPICS = (window.TOPICS || []).map(t => ({
  ...t,
  words: t.words.map(w => ({ en: list(w.en), ru: list(w.ru), note: w.note || '', topic: t.id })),
}));
const wordKey = w => w.topic + '|' + w.en[0];

// Все ответы словаря — чтобы не засчитывать соседний термин как опечатку
const KNOWN = { en: new Set(), ru: new Set() };
for (const t of TOPICS) {
  for (const w of t.words) {
    w.en.forEach(a => variants(a, 'en').forEach(v => KNOWN.en.add(v)));
    w.ru.forEach(a => variants(a, 'ru').forEach(v => KNOWN.ru.add(v)));
  }
}

// RU→EN: если у двух терминов темы один и тот же перевод, подходит любой из них
const enByRu = new Map();
for (const t of TOPICS) {
  for (const w of t.words) {
    for (const r of w.ru) {
      const k = t.id + '|' + norm(r.replace(/\([^)]*\)/g, ' '), 'ru');
      if (!enByRu.has(k)) enByRu.set(k, new Set());
      w.en.forEach(e => enByRu.get(k).add(e));
    }
  }
}
function answersFor(w, dir) {
  if (dir === 'en-ru') return w.ru;
  const all = new Set(w.en);
  for (const r of w.ru) {
    const same = enByRu.get(w.topic + '|' + norm(r.replace(/\([^)]*\)/g, ' '), 'ru'));
    if (same) same.forEach(e => all.add(e));
  }
  return [...all];
}

// ---------- аккаунт ----------
const REMEMBER = 'lv.remember';
const remember = () => ls.get(REMEMBER) !== '0';
// «Запомнить меня» выключено — сессия живёт до закрытия приложения
const authStorage = {
  getItem: k => { try { return localStorage.getItem(k) ?? sessionStorage.getItem(k); } catch (e) { return null; } },
  setItem: (k, v) => { try { (remember() ? localStorage : sessionStorage).setItem(k, v); } catch (e) { /* приватный режим */ } },
  removeItem: k => { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) { /* приватный режим */ } },
};

const db = window.SUPABASE_URL && window.SUPABASE_KEY && window.supabase
  ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY, {
    auth: { storage: authStorage, storageKey: 'lv-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  : null;

let user = null;

// ---------- прогресс: база данных + копия на телефоне ----------
const emptyProgress = () => ({ stats: {}, best: {}, prefs: { dir: 'en-ru', len: 20 } });
let progress = emptyProgress();
let saveTimer = null;

const cacheKey = () => 'lv.cache.' + user.id;
const saveLocal = dirty => ls.set(cacheKey(), JSON.stringify({ ...progress, dirty }));

function save() {
  saveLocal(true);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(pushProgress, 1500);
}

async function pushProgress() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!user) return;
  try {
    const { error } = await db.from('progress').upsert({
      user_id: user.id, stats: progress.stats, best: progress.best, prefs: progress.prefs, updated_at: new Date().toISOString(),
    });
    if (!error) saveLocal(false);
  } catch (e) { /* нет сети — отправим позже */ }
}

// Прогресс из версии 1.0, когда входа ещё не было
function legacyProgress() {
  const stats = ls.json('lv.stats');
  if (!stats) return null;
  return { stats, best: ls.json('lv.best') || {}, prefs: ls.json('lv.prefs') || {} };
}

async function loadProgress() {
  const local = ls.json(cacheKey());
  let remote = null, reached = false;
  try {
    const { data, error } = await db.from('progress').select('stats, best, prefs').eq('user_id', user.id).maybeSingle();
    if (!error) { remote = data; reached = true; }
  } catch (e) { /* нет сети */ }

  const legacy = !remote && !local ? legacyProgress() : null;
  const src = local?.dirty ? local : remote || local || legacy;
  const base = emptyProgress();
  progress = {
    stats: src?.stats || base.stats,
    best: src?.best || base.best,
    prefs: Object.assign(base.prefs, src?.prefs),
  };
  if (legacy) ['lv.stats', 'lv.best', 'lv.prefs'].forEach(ls.del);

  const unsynced = src && src !== remote;
  saveLocal(unsynced);
  if (unsynced && reached) pushProgress();
}

function logAttempt(topicId, dir, total, correct) {
  db.from('attempts').insert({ topic_id: topicId, direction: dir, total, correct }).then(() => {}, () => {});
}

window.addEventListener('online', () => { if (user && ls.json(cacheKey())?.dirty) pushProgress(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && saveTimer) pushProgress(); });

function record(w, ok, override) {
  const k = wordKey(w);
  const s = progress.stats[k] || (progress.stats[k] = { ok: 0, bad: 0 });
  if (override) { s.bad = Math.max(0, s.bad - 1); s.ok++; }
  else if (ok) s.ok++;
  else s.bad++;
  s.last = ok ? 'ok' : 'bad';
  save();
}

const mistakeWords = () => TOPICS.flatMap(t => t.words).filter(w => progress.stats[wordKey(w)]?.last === 'bad');
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

// ---------- вход и регистрация ----------
const AUTH_ERRORS = [
  [/invalid login credentials/i, 'Неверная почта или пароль'],
  [/already registered|already exists/i, 'Эта почта уже зарегистрирована — войди с ней'],
  [/email not confirmed/i, 'Почта не подтверждена — открой ссылку из письма'],
  [/password.*(at least|short|characters)/i, 'Пароль слишком короткий — минимум 6 символов'],
  [/invalid.*email|email.*invalid/i, 'Проверь адрес почты'],
  [/rate limit|too many/i, 'Слишком много попыток, попробуй через пару минут'],
  [/fetch|network/i, 'Нет связи с сервером, проверь интернет'],
];
const authError = e => (AUTH_ERRORS.find(([re]) => re.test(e?.message || '')) || [, 'Не получилось: ' + (e?.message || 'неизвестная ошибка')])[1];

function showAuth(mode = 'login', message = '') {
  user = null;
  $app.innerHTML = `
    <div class="auth">
      <div class="logo big">§</div>
      <h1>Legal English</h1>
      <p class="muted">Тесты по юридическому английскому</p>
      <div class="seg" id="mode">
        <button type="button" data-v="login">Вход</button>
        <button type="button" data-v="signup">Регистрация</button>
      </div>
      <form id="auth-form" novalidate>
        <label class="field">
          <span>Почта</span>
          <input id="email" type="email" autocomplete="email" inputmode="email" autocapitalize="none" autocorrect="off" spellcheck="false" required>
        </label>
        <label class="field">
          <span>Пароль</span>
          <input id="password" type="password" minlength="6" required>
        </label>
        <label class="check"><input type="checkbox" id="remember" ${remember() ? 'checked' : ''}> Запомнить меня на этом устройстве</label>
        <div id="auth-msg" class="auth-msg" role="alert"></div>
        <button class="primary" id="auth-go"></button>
      </form>
    </div>`;

  const msg = document.getElementById('auth-msg');
  const go = document.getElementById('auth-go');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const say = (text, kind = 'error') => { msg.textContent = text; msg.className = 'auth-msg ' + (text ? kind : ''); };

  const setMode = m => {
    mode = m;
    go.textContent = m === 'login' ? 'Войти' : 'Создать аккаунт';
    password.autocomplete = m === 'login' ? 'current-password' : 'new-password';
    password.placeholder = m === 'login' ? '' : 'Минимум 6 символов';
    say('');
  };
  setupSeg('mode', mode, setMode);
  setMode(mode);
  if (message) say(message, 'info');

  if (!db) {
    say('Приложение ещё не подключено к базе данных.');
    go.disabled = true;
    return;
  }

  document.getElementById('auth-form').onsubmit = async e => {
    e.preventDefault();
    const mail = email.value.trim();
    const pass = password.value;
    if (!/^\S+@\S+\.\S+$/.test(mail)) return say('Проверь адрес почты');
    if (pass.length < 6) return say('Пароль — минимум 6 символов');

    ls.set(REMEMBER, document.getElementById('remember').checked ? '1' : '0');
    go.disabled = true;
    go.textContent = 'Подожди…';
    try {
      const res = mode === 'login'
        ? await db.auth.signInWithPassword({ email: mail, password: pass })
        : await db.auth.signUp({ email: mail, password: pass, options: { emailRedirectTo: location.origin + location.pathname } });
      if (res.error) throw res.error;
      if (!res.data.session) {
        setupSeg('mode', 'login', setMode);
        setMode('login');
        say(`Мы отправили письмо на ${mail}. Открой ссылку из него, а потом войди.`, 'info');
        return;
      }
      await enter(res.data.session.user);
    } catch (err) {
      say(authError(err));
    } finally {
      go.disabled = false;
      if (go.textContent === 'Подожди…') setMode(mode);
    }
  };
  email.focus();
}

async function enter(u) {
  if (user?.id === u.id) return;
  user = u;
  $app.innerHTML = '<p class="loading muted">Загружаю прогресс…</p>';
  await loadProgress();
  showHome();
}

async function logout() {
  if (saveTimer || ls.json(cacheKey())?.dirty) await pushProgress();
  user = null;
  progress = emptyProgress();
  await db.auth.signOut({ scope: 'local' }).catch(() => {});
  showAuth();
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
            ${badge('EN→RU', progress.best[t.id + ':en-ru'])}
            ${badge('RU→EN', progress.best[t.id + ':ru-en'])}
          </div>
        </button>`).join('') || '<p class="muted">Пока нет тем.</p>'}
    </div>
    <footer class="account">
      <span>${esc(user.email || '')}</span>
      <button class="link-btn" id="logout">Выйти</button>
    </footer>`;
  $app.querySelectorAll('[data-topic]').forEach(b => { b.onclick = () => showTopic(b.dataset.topic); });
  document.getElementById('logout').onclick = logout;
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
  const prefs = progress.prefs;
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
    save();
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
  const answers = answersFor(w, q.dir);
  const shown = toRu ? w.ru : w.en; // правильный ответ показываем по самому термину
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
    const right = `<div class="right">${esc(shown.join('; '))}</div>`;
    if (r.ok && !r.typo) {
      fb.innerHTML = `<div class="fb ok"><b class="head">Верно!</b>${shown.length > 1 || /\(/.test(shown[0]) ? right : ''}</div>`;
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
    // Ответ принят: поле только для чтения и клавиатура прячется, дальше — кнопкой
    input.readOnly = true;
    input.placeholder = '';
    input.classList.add('locked');
    input.blur();
    skip.hidden = true;
    go.textContent = q.i + 1 < q.items.length ? 'Дальше' : 'Результаты';
  }

  document.getElementById('form').onsubmit = e => {
    e.preventDefault();
    if (q.checked) return next();
    if (!input.value.trim()) return input.focus();
    submit(input.value);
  };
  skip.onclick = () => submit('');
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
    progress.best[key] = Math.max(progress.best[key] || 0, pct);
    save();
  }
  logAttempt(q.topic.id, q.dir, q.results.length, okCount);
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

// ---------- запуск ----------
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

(async function start() {
  if (!db) return showAuth();
  const { data } = await db.auth.getSession();
  if (data.session) await enter(data.session.user);
  else showAuth();
  db.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' && user) { progress = emptyProgress(); showAuth('login', 'Сессия закончилась, войди ещё раз.'); }
    else if (event === 'SIGNED_IN' && session && !user) enter(session.user);
  });
})();
