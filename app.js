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
const terms = n => n + ' ' + plural(n, 'термин', 'термина', 'терминов');
const lessons = n => n + ' ' + plural(n, 'урок', 'урока', 'уроков');

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

const ICON = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
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
  // Как в Duolingo: опечатка засчитывается как верный ответ, но показываем, где она.
  // Запоминаем ближайший вариант ответа — по нему подсветим ошибочные буквы.
  let best = null;
  for (const a of answers) {
    const plain = a.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    for (const [y, shown] of [[norm(plain, lang), plain], [norm(a, lang), a]]) {
      if (core(x, lang) === core(y, lang)) continue;
      const tolerance = y.length <= 4 ? 0 : y.length <= 8 ? 1 : y.length <= 20 ? 2 : 3;
      const d = lev(x, y);
      if (d <= tolerance && (!best || d < best.d)) best = { d, shown };
    }
  }
  return best ? { ok: true, typo: true, shown: best.shown } : { ok: false };
}

// Правильное написание, где <mark> отмечает буквы, в которых ошибся пользователь
function typoMarkup(shown, input, lang) {
  const low = s => s.toLowerCase().replace(/ё/g, 'е').replace(/[’‘`´]/g, "'");
  let start = 0; // «to», «the» перед английским словом можно не писать — их не подсвечиваем
  const lead = lang === 'en' && /^(to|the|a|an) /i.exec(shown);
  if (lead && !low(input).startsWith(lead[1].toLowerCase() + ' ')) start = lead[0].length;
  const src = shown.slice(start);
  // Сравниваем только буквы и цифры: пробелы, скобки и дефисы не считаются ошибкой
  const lowSrc = low(src);
  const pos = [];
  for (let k = 0; k < lowSrc.length; k++) if (/[a-zа-я0-9]/.test(lowSrc[k])) pos.push(k);
  const a = pos.map(k => lowSrc[k]).join('');
  const b = low(input).replace(/[^a-zа-я0-9]/g, '');
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  const bad = new Array(n).fill(false);
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      if (a[i - 1] !== b[j - 1]) bad[i - 1] = true; // не та буква
      i--; j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      bad[i - 1] = true; // пропущенная буква
      i--;
    } else {
      // лишняя буква: отмечаем такую же букву рядом (удвоение), иначе соседнюю слева
      if (n) bad[i < n && a[i] === b[j - 1] ? i : i > 0 ? i - 1 : 0] = true;
      j--;
    }
  }
  const marked = new Array(src.length).fill(false);
  bad.forEach((v, k) => { if (v) marked[pos[k]] = true; });
  let html = esc(shown.slice(0, start));
  for (let k = 0; k < src.length;) {
    let e = k;
    while (e < src.length && marked[e] === marked[k]) e++;
    html += marked[k] ? `<mark>${esc(src.slice(k, e))}</mark>` : esc(src.slice(k, e));
    k = e;
  }
  return html;
}

// ---------- данные: документы → темы (уроки) → термины ----------
const DOCUMENTS = (window.DOCUMENTS || []).map(d => ({
  ...d,
  topics: d.topics.map(t => ({
    ...t,
    doc: d.id,
    words: t.words.map(w => ({ en: list(w.en), ru: list(w.ru), note: w.note || '', topic: t.id })),
  })),
}));
const TOPICS = DOCUMENTS.flatMap(d => d.topics);
const docWords = d => d.topics.flatMap(t => t.words);
const wordKey = w => w.topic + '|' + w.en[0];

// «Урок 1 · Договорное право» → метка урока и название
const lessonOf = t => (t.title.includes(' · ') ? t.title.split(' · ')[0] : '');
const nameOf = t => (t.title.includes(' · ') ? t.title.split(' · ').slice(1).join(' · ') : t.title);
const originalOf = t => (t.description || '').split(' · ')[0];

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

// Ссылка из письма «сбросить пароль» открывает сайт с #...type=recovery (или с ошибкой, если ссылка устарела).
// Читаем до создания клиента: он сразу убирает эти параметры из адреса.
const RECOVERY = /type=recovery/.test(location.hash);
const LINK_ERROR = /error_code=([^&]+)/.exec(location.hash)?.[1] || null;
const clearUrl = () => history.replaceState(null, '', location.pathname);

// implicit: ссылка из письма открывается в Safari, а не в приложении — PKCE там не сработает
const db = window.SUPABASE_URL && window.SUPABASE_KEY && window.supabase
  ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY, {
    auth: { storage: authStorage, storageKey: 'lv-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
  })
  : null;
let recovering = false;

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

// Состояние термина по последнему ответу: выучен, с ошибкой или ещё не встречался
const stateOf = w => progress.stats[wordKey(w)]?.last || '';
function summary(ws) {
  const s = { total: ws.length, ok: 0, bad: 0, none: 0, answers: 0, correct: 0 };
  for (const w of ws) {
    const st = progress.stats[wordKey(w)];
    if (st?.last === 'ok') s.ok++;
    else if (st?.last === 'bad') s.bad++;
    else s.none++;
    if (st) { s.answers += st.ok + st.bad; s.correct += st.ok; }
  }
  return s;
}

// Подпись приложения: полоса урока — по клетке на каждый термин, выученные | с ошибкой | не встречались
function strip(ws, big = false) {
  const s = summary(ws);
  const html = [
    ...Array(s.ok).fill('<i class="ok"></i>'),
    ...Array(s.bad).fill('<i class="bad"></i>'),
    ...Array(s.none).fill('<i></i>'),
  ].join('');
  const gap = ws.length > 40 ? 1 : 2;
  return `<div class="strip${big ? ' big' : ''}" style="gap:${gap}px" role="img"
    aria-label="${s.ok} выучено, ${s.bad} с ошибкой, ${s.none} не встречались">${html}</div>`;
}
// Документ целиком: та же полоса, но сегментами, чтобы 200+ клеток не слиплись
function docStrip(ws) {
  const s = summary(ws);
  const seg = (n, cls) => (n ? `<i class="${cls}" style="flex:${n} 1 0"></i>` : '');
  return `<div class="strip" role="img" aria-label="${s.ok} выучено, ${s.bad} с ошибкой, ${s.none} не встречались">${seg(s.ok, 'ok')}${seg(s.bad, 'bad')}${seg(s.none, '')}</div>`;
}
const legend = s => `
  <div class="legend">
    <span><i class="ok"></i><b>${s.ok}</b> выучено</span>
    <span><i class="bad"></i><b>${s.bad}</b> с ошибкой</span>
    <span><i></i><b>${s.none}</b> не встречались</span>
  </div>`;

const MISTAKES = '__mistakes:';
const mistakeWords = docId => TOPICS.filter(t => t.doc === docId).flatMap(t => t.words).filter(w => stateOf(w) === 'bad');
function findTopic(id) {
  if (id.startsWith(MISTAKES)) {
    const doc = id.slice(MISTAKES.length);
    return {
      id,
      doc,
      title: 'Работа над ошибками',
      description: 'Термины с ошибкой в последнем ответе. Ответишь верно, и термин уйдёт из списка',
      words: mistakeWords(doc),
    };
  }
  return TOPICS.find(t => t.id === id);
}

// ---------- оболочка ----------
function bar({ left = '', title = '', right = '', brand = false } = {}) {
  if (brand) {
    return `<header class="bar"><div class="bar-brand"><span class="mark" aria-hidden="true">§</span>Legal English</div><div>${right}</div></header>`;
  }
  return `<header class="bar"><div>${left}</div><div class="bar-title">${esc(title)}</div><div>${right}</div></header>`;
}
const backBtn = (label = 'Назад') => `<button class="icon-btn" id="back" aria-label="${label}">${ICON.back}</button>`;

function setupSeg(id, value, onChange) {
  const seg = document.getElementById(id);
  const btns = [...seg.querySelectorAll('button')];
  let pill = seg.querySelector('.seg-pill');
  if (!pill) { pill = document.createElement('span'); pill.className = 'seg-pill'; seg.prepend(pill); }
  let current = value;
  // Плашка выбранного варианта переезжает к нажатой кнопке
  const place = () => {
    const b = btns.find(x => x.dataset.v === current);
    if (!b || !b.offsetWidth) return;
    pill.style.width = b.offsetWidth + 'px';
    pill.style.transform = 'translateX(' + b.offsetLeft + 'px)';
  };
  const paint = v => {
    current = v;
    btns.forEach(b => { b.classList.toggle('on', b.dataset.v === v); b.setAttribute('aria-pressed', b.dataset.v === v); });
    place();
  };
  paint(value);
  requestAnimationFrame(() => { place(); seg.classList.add('ready'); });
  if (window.ResizeObserver) new ResizeObserver(place).observe(seg);
  let settle;
  btns.forEach(b => {
    b.onclick = () => {
      if (b.dataset.v !== current && seg.classList.contains('ready') && !reduceMotion()) {
        seg.classList.add('moving');
        clearTimeout(settle);
        settle = setTimeout(() => seg.classList.remove('moving'), 260);
      }
      paint(b.dataset.v);
      onChange(b.dataset.v);
    };
  });
}

function render(html) {
  $app.innerHTML = html;
  window.scrollTo(0, 0);
}

// ---------- переходы между экранами ----------
// forward — вглубь (документ → урок → тест), back — обратно, next — следующий вопрос, fade — вход и выход.
// shared.from / shared.to — элементы, которые должны перетечь между экранами (сейчас не используется: при пуше экран едет целиком).
const reduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const named = new Set();
function nameEls(pairs = []) {
  for (const [target, name] of pairs) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (el) { el.style.viewTransitionName = name; named.add(el); }
  }
}
function clearNames() {
  named.forEach(el => { el.style.viewTransitionName = ''; });
  named.clear();
}
function navigate(type, update, shared = {}) {
  const run = () => { clearNames(); update(); nameEls(shared.to); };
  // Без поддержки, при «Уменьшении движения», в фоне и до первой отрисовки — просто сменить экран
  if (!document.startViewTransition || reduceMotion() || document.visibilityState !== 'visible' || !$app.firstElementChild) return run();
  clearNames();
  nameEls(shared.from);
  document.documentElement.dataset.nav = type;
  const vt = document.startViewTransition(run);
  vt.ready.catch(() => {}); // браузер может отменить анимацию — экран всё равно сменится
  vt.finished.catch(() => {}).finally(() => { delete document.documentElement.dataset.nav; clearNames(); });
}

// ---------- вход и регистрация ----------
const AUTH_ERRORS = [
  [/invalid login credentials/i, 'Неверная почта или пароль'],
  [/already registered|already exists/i, 'Эта почта уже зарегистрирована — войди с ней'],
  [/email not confirmed/i, 'Почта не подтверждена — открой ссылку из письма'],
  [/password.*(at least|short|characters)/i, 'Пароль слишком короткий — минимум 6 символов'],
  [/invalid.*email|email.*invalid/i, 'Проверь адрес почты'],
  [/rate limit|too many/i, 'Слишком много попыток, попробуй через пару минут'],
  [/should be different|same.*password/i, 'Новый пароль должен отличаться от старого'],
  [/not authorized|error sending/i, 'Письмо не отправилось: почта приложения ещё не настроена'],
  [/session.*missing|auth session/i, 'Ссылка устарела — запроси новую через «Забыли пароль?»'],
  [/fetch|network/i, 'Нет связи с сервером, проверь интернет'],
];
const authError = e => (AUTH_ERRORS.find(([re]) => re.test(e?.message || '')) || [, 'Не получилось: ' + (e?.message || 'неизвестная ошибка')])[1];

function messenger(el) {
  return (text, kind = 'error') => { el.textContent = text; el.className = 'auth-msg ' + (text ? kind : ''); };
}
const validEmail = s => /^\S+@\S+\.\S+$/.test(s);
const emailField = (value = '') => `
  <label class="field">
    <span class="label">Почта</span>
    <input class="input" id="email" type="email" autocomplete="email" inputmode="email" autocapitalize="none" autocorrect="off" spellcheck="false" value="${esc(value)}">
  </label>`;

function showAuth(mode = 'login', message = '') {
  user = null;
  const total = TOPICS.reduce((n, t) => n + t.words.length, 0);
  render(`
    <main class="page">
      <div class="auth">
        <div class="mark" aria-hidden="true">§</div>
        <h1 class="greeting">Legal English</h1>
        <p class="subline">Тесты по юридическому английскому по твоему учебнику: ${terms(total)} с переводом в обе стороны.</p>
        <div class="seg" id="mode">
          <button type="button" data-v="login">Вход</button>
          <button type="button" data-v="signup">Регистрация</button>
        </div>
        <form id="auth-form" novalidate>
          ${emailField()}
          <label class="field">
            <span class="label">Пароль</span>
            <input class="input" id="password" type="password" minlength="6">
          </label>
          <label class="check"><input type="checkbox" id="remember" ${remember() ? 'checked' : ''}> Запомнить меня на этом устройстве</label>
          <div id="auth-msg" class="auth-msg" role="alert"></div>
          <button class="btn primary" id="auth-go"></button>
        </form>
        <p class="center"><button type="button" class="text-btn" id="forgot">Забыли пароль?</button></p>
      </div>
    </main>`);

  const go = document.getElementById('auth-go');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const forgot = document.getElementById('forgot');
  const say = messenger(document.getElementById('auth-msg'));

  const setMode = m => {
    mode = m;
    go.textContent = m === 'login' ? 'Войти' : 'Создать аккаунт';
    password.autocomplete = m === 'login' ? 'current-password' : 'new-password';
    password.placeholder = m === 'login' ? '' : 'Минимум 6 символов';
    forgot.hidden = m !== 'login';
    say('');
  };
  forgot.onclick = () => navigate('forward', () => showReset(email.value.trim()));
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
    if (!validEmail(mail)) return say('Проверь адрес почты');
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
}

// «Забыли пароль?» — письмо со ссылкой на экран нового пароля
function showReset(prefill = '') {
  user = null;
  render(`
    ${bar({ left: backBtn(), title: 'Пароль' })}
    <main class="page">
      <div class="auth">
        <h1 class="title">Восстановление пароля</h1>
        <p class="subline">Введи почту, указанную при регистрации, — пришлём ссылку, чтобы задать новый пароль.</p>
        <form id="reset-form" novalidate>
          ${emailField(prefill)}
          <div id="auth-msg" class="auth-msg" role="alert"></div>
          <button class="btn primary" id="auth-go">Отправить ссылку</button>
        </form>
      </div>
    </main>`);

  const go = document.getElementById('auth-go');
  const email = document.getElementById('email');
  const say = messenger(document.getElementById('auth-msg'));
  document.getElementById('back').onclick = () => navigate('back', () => showAuth('login'));

  document.getElementById('reset-form').onsubmit = async e => {
    e.preventDefault();
    const mail = email.value.trim();
    if (!validEmail(mail)) return say('Проверь адрес почты');
    go.disabled = true;
    go.textContent = 'Подожди…';
    try {
      const { error } = await db.auth.resetPasswordForEmail(mail, { redirectTo: location.origin + location.pathname });
      if (error) throw error;
      say(`Если аккаунт с почтой ${mail} есть, мы отправили на неё письмо. Открой ссылку из письма в ближайший час — проверь и папку «Спам».`, 'info');
      go.textContent = 'Отправить ещё раз';
    } catch (err) {
      say(authError(err));
      go.textContent = 'Отправить ссылку';
    } finally {
      go.disabled = false;
    }
  };
}

// Открыта ссылка из письма: сессия восстановления уже есть, осталось задать пароль
function showNewPassword() {
  user = null;
  recovering = true;
  render(`
    <main class="page">
      <div class="auth">
        <div class="mark" aria-hidden="true">§</div>
        <h1 class="title">Новый пароль</h1>
        <p class="subline">Придумай новый пароль для входа в Legal English.</p>
        <form id="pw-form" novalidate>
          <label class="field">
            <span class="label">Новый пароль</span>
            <input class="input" id="password" type="password" autocomplete="new-password" placeholder="Минимум 6 символов">
          </label>
          <label class="field">
            <span class="label">Повтори пароль</span>
            <input class="input" id="password2" type="password" autocomplete="new-password">
          </label>
          <div id="auth-msg" class="auth-msg" role="alert"></div>
          <button class="btn primary" id="auth-go">Сохранить и войти</button>
        </form>
      </div>
    </main>`);

  const go = document.getElementById('auth-go');
  const p1 = document.getElementById('password');
  const p2 = document.getElementById('password2');
  const say = messenger(document.getElementById('auth-msg'));

  document.getElementById('pw-form').onsubmit = async e => {
    e.preventDefault();
    if (p1.value.length < 6) return say('Пароль — минимум 6 символов');
    if (p1.value !== p2.value) return say('Пароли не совпадают');
    go.disabled = true;
    go.textContent = 'Подожди…';
    try {
      const { data, error } = await db.auth.updateUser({ password: p1.value });
      if (error) throw error;
      recovering = false;
      clearUrl();
      await enter(data.user);
    } catch (err) {
      say(authError(err));
      go.disabled = false;
      go.textContent = 'Сохранить и войти';
    }
  };
}

async function enter(u) {
  if (user?.id === u.id) return;
  user = u;
  render('<p class="loading">Загружаю прогресс…</p>');
  await loadProgress();
  navigate('fade', showHome);
}

async function logout() {
  if (saveTimer || ls.json(cacheKey())?.dirty) await pushProgress();
  user = null;
  progress = emptyProgress();
  await db.auth.signOut({ scope: 'local' }).catch(() => {});
  navigate('fade', () => showAuth());
}

// ---------- главная: документы ----------
function greeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Доброе утро';
  if (h >= 12 && h < 18) return 'Добрый день';
  if (h >= 18 && h < 23) return 'Добрый вечер';
  return 'Доброй ночи';
}

function showHome() {
  quiz = null;
  const all = DOCUMENTS.flatMap(docWords);
  const s = summary(all);
  const fact = s.bad
    ? `<b>${terms(s.bad)}</b> ${plural(s.bad, 'ждёт', 'ждут', 'ждут')} повторения. Они собраны в «Работе над ошибками» внутри документа.`
    : s.ok
      ? `Выучено <b>${s.ok} из ${terms(s.total)}</b>. Ошибок к повторению нет.`
      : 'Выбери документ и пройди первый тест, прогресс появится здесь.';
  const accuracy = s.answers ? Math.round((s.correct / s.answers) * 100) : null;

  render(`
    ${bar({ brand: true })}
    <main class="page">
      <div class="head">
        <h1 class="greeting">${greeting()}</h1>
        <p class="subline">${fact}</p>
      </div>
      <section class="tiles" aria-label="Итоги">
        <div class="tile"><span class="tile-label">Выучено</span><span class="tile-value">${s.ok}<small> из ${s.total}</small></span><span class="tile-note">последний ответ верный</span></div>
        <div class="tile"><span class="tile-label">На повторение</span><span class="tile-value">${s.bad}</span><span class="tile-note">${s.bad ? 'ошибка в последнем ответе' : 'ошибок нет'}</span></div>
        <div class="tile"><span class="tile-label">Ответов</span><span class="tile-value">${s.answers}</span><span class="tile-note">за всё время</span></div>
        <div class="tile"><span class="tile-label">Точность</span><span class="tile-value${accuracy == null ? ' dash' : ''}">${accuracy == null ? '—' : accuracy + '%'}</span><span class="tile-note">${accuracy == null ? 'ещё не было ответов' : 'верных ответов'}</span></div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Документы</h2><span class="chip">${DOCUMENTS.length}</span></div>
        <div class="rows">
          ${DOCUMENTS.map(d => {
            const ws = docWords(d);
            const ds = summary(ws);
            return `
              <button class="row" data-doc="${esc(d.id)}">
                <div>
                  <div class="row-title">${esc(d.title)}</div>
                  <div class="row-sub">${lessons(d.topics.length)} · ${terms(ds.total)}</div>
                </div>
                <div class="row-figure">${Math.round((ds.ok / ds.total) * 100)}%<small>выучено</small></div>
                ${docStrip(ws)}
              </button>`;
          }).join('') || '<p class="empty">Документов пока нет.</p>'}
        </div>
      </section>
      <footer class="account">
        <span>${esc(user.email || '')}</span>
        <button class="text-btn" id="logout">Выйти</button>
      </footer>
    </main>`);
  $app.querySelectorAll('[data-doc]').forEach(b => {
    b.onclick = () => navigate('forward', () => showDocument(b.dataset.doc));
  });
  document.getElementById('logout').onclick = logout;
}

// ---------- документ: его уроки ----------
function showDocument(id) {
  quiz = null;
  const d = DOCUMENTS.find(x => x.id === id);
  if (!d) return showHome();
  const ws = docWords(d);
  const ds = summary(ws);
  const best = (t, dir) => progress.best[t.id + ':' + dir];
  const pct = v => (v == null ? '<span class="dash">—</span>' : v + '%');

  render(`
    ${bar({ left: backBtn('К документам'), title: 'Документы' })}
    <main class="page">
      <div class="head">
        <h1 class="title">${esc(d.title)}</h1>
        <p class="subline">${esc(d.description || '')} · ${lessons(d.topics.length)} · ${terms(ds.total)}</p>
        <div style="margin-top:18px">${docStrip(ws)}</div>
      </div>
      ${ds.bad ? `
        <section class="panel">
          <div class="panel-head"><h2>Работа над ошибками</h2><span class="chip">${ds.bad}</span></div>
          <button class="row" data-topic="${MISTAKES + d.id}">
            <div>
              <div class="row-title">Повторить ${terms(ds.bad)}</div>
              <div class="row-sub">С ошибкой в последнем ответе, из всех уроков документа</div>
            </div>
            <div class="row-figure">${ds.bad}<small>${plural(ds.bad, 'термин', 'термина', 'терминов')}</small></div>
          </button>
        </section>` : ''}
      <section class="panel">
        <div class="panel-head"><h2>Уроки</h2><span class="chip">${d.topics.length}</span><span class="aside">лучший результат</span></div>
        <div class="rows-2">
          ${d.topics.map(t => `
            <button class="row" data-topic="${esc(t.id)}">
              <div>
                <div class="row-title">${esc(nameOf(t))}</div>
                <div class="row-sub">${esc(lessonOf(t))} · ${esc(originalOf(t))} · ${terms(t.words.length)}</div>
              </div>
              <div class="row-figure pair">
                <span>${pct(best(t, 'en-ru'))}<small>EN → RU</small></span>
                <span>${pct(best(t, 'ru-en'))}<small>RU → EN</small></span>
              </div>
              ${strip(t.words)}
            </button>`).join('')}
        </div>
        ${legend(ds)}
      </section>
    </main>`);
  document.getElementById('back').onclick = () => navigate('back', showHome);
  $app.querySelectorAll('[data-topic]').forEach(b => {
    b.onclick = () => navigate('forward', () => showTopic(b.dataset.topic));
  });
}

// ---------- урок: настройка теста и словарь ----------
const GLOSSARY_CAP = 12;

function showTopic(id) {
  quiz = null;
  const t = findTopic(id);
  if (!t) return showHome();
  if (!t.words.length) return showDocument(t.doc);
  const isMistakes = id.startsWith(MISTAKES);
  const prefs = progress.prefs;
  const lens = [10, 20].filter(n => n < t.words.length).concat(0);
  let len = lens.includes(prefs.len) ? prefs.len : 0;
  const s = summary(t.words);
  const best = dir => progress.best[t.id + ':' + dir];
  const doc = DOCUMENTS.find(d => d.id === t.doc);
  const glossRow = w => `
    <li>
      <i class="dot ${stateOf(w)}" aria-label="${{ ok: 'выучен', bad: 'с ошибкой' }[stateOf(w)] || 'не встречался'}"></i>
      <b lang="en">${esc(w.en.join(' / '))}</b>
      <span>${esc(w.ru.join('; '))}</span>
      ${w.note ? `<small>${esc(w.note)}</small>` : ''}
    </li>`;

  render(`
    ${bar({ left: backBtn('К урокам'), title: doc ? doc.title : '' })}
    <main class="page">
      <div class="head">
        <h1 class="title">${esc(isMistakes ? t.title : nameOf(t))}</h1>
        <p class="subline">${isMistakes ? esc(t.description) : `${esc(lessonOf(t))} · ${esc(originalOf(t))} · ${terms(t.words.length)}`}</p>
        <div style="margin-top:18px">${strip(t.words, true)}${legend(s)}</div>
      </div>
      <div class="grid">
        <section class="panel span-12">
          <div class="panel-head"><h2>Тест</h2></div>
          <div class="stack test-grid">
            <div>
              <span class="label">Направление</span>
              <div class="seg" id="dir"><button data-v="en-ru">EN → RU</button><button data-v="ru-en">RU → EN</button></div>
            </div>
            <div>
              <span class="label">Сколько терминов</span>
              <div class="seg" id="len">${lens.map(n => `<button data-v="${n}">${n || 'Все ' + t.words.length}</button>`).join('')}</div>
            </div>
            <button class="btn primary" id="start">Начать тест</button>
          </div>
          ${isMistakes ? '' : `
            <div class="best">
              <div><span class="tile-label">Лучший EN → RU</span><div class="tile-value${best('en-ru') == null ? ' dash' : ''}">${best('en-ru') == null ? '—' : best('en-ru') + '%'}</div></div>
              <div><span class="tile-label">Лучший RU → EN</span><div class="tile-value${best('ru-en') == null ? ' dash' : ''}">${best('ru-en') == null ? '—' : best('ru-en') + '%'}</div></div>
            </div>`}
        </section>
        <section class="panel span-12">
          <div class="panel-head"><h2>Словарь урока</h2><span class="chip">${t.words.length}</span></div>
          <ul class="glossary" id="glossary">${t.words.slice(0, GLOSSARY_CAP).map(glossRow).join('')}</ul>
          ${t.words.length > GLOSSARY_CAP ? `<button class="btn small more" id="more">Показать все ${t.words.length}</button>` : ''}
        </section>
      </div>
    </main>`);

  setupSeg('dir', prefs.dir, v => { prefs.dir = v; });
  setupSeg('len', String(len), v => { len = +v; prefs.len = len; });
  document.getElementById('back').onclick = () => navigate('back', () => showDocument(t.doc));
  const more = document.getElementById('more');
  if (more) more.onclick = () => { document.getElementById('glossary').innerHTML = t.words.map(glossRow).join(''); more.remove(); };
  document.getElementById('start').onclick = () => {
    save();
    navigate('forward', () => startQuiz(t, prefs.dir, len, t.words));
  };
}

// ---------- тест ----------
let quiz = null;

function startQuiz(topic, dir, len, pool) {
  const items = shuffle([...pool]);
  quiz = { topic, dir, len, items: len ? items.slice(0, len) : items, i: 0, results: [], checked: false };
  renderQuestion();
}

// Термин крупно, но без переноса посреди слова: уменьшаем кегль, пока самое длинное слово не влезет
function fitWord(el) {
  const max = window.innerWidth >= 900 ? 40 : 34;
  const min = 20;
  let size = max;
  el.classList.remove('hyph');
  el.style.fontSize = size + 'px';
  while (el.scrollWidth > el.clientWidth + 1 && size > min) {
    size -= 1;
    el.style.fontSize = size + 'px';
  }
  if (el.scrollWidth > el.clientWidth + 1) el.classList.add('hyph'); // даже 20px не влезает — переносим по слогам
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
      <div><button class="icon-btn" id="quit" aria-label="Выйти из теста">${ICON.close}</button></div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${q.items.length}" aria-valuenow="${q.i}"><div id="progress-fill" style="width:${(Math.max(q.i - 1, 0) / q.items.length) * 100}%"></div></div>
      <div class="count">${q.i + 1}/${q.items.length}</div>
    </header>
    <main class="page">
      <div class="quiz">
        <div class="q">
          <div class="q-label">${toRu ? 'Переведи на русский' : 'Translate into English'}</div>
          <h1 class="q-word" id="word" lang="${toRu ? 'en' : 'ru'}">${esc(toRu ? w.en.join(' / ') : w.ru.join('; '))}</h1>
          ${w.note ? `<div class="q-note">${esc(w.note)}</div>` : ''}
        </div>
        <div id="fb" aria-live="polite"></div>
        <form id="form" autocomplete="off">
          <label class="label" for="answer" hidden>Ответ</label>
          <input class="input" id="answer" type="text" lang="${lang}" placeholder="${toRu ? 'Твой ответ' : 'Your answer'}"
            autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="go">
          <button class="btn primary" id="go">Проверить</button>
        </form>
        <p class="center"><button class="text-btn" id="skip">Не знаю</button></p>
      </div>
    </main>`;

  const input = document.getElementById('answer');
  const go = document.getElementById('go');
  const skip = document.getElementById('skip');
  const fb = document.getElementById('fb');
  const word = document.getElementById('word');
  const fill = document.getElementById('progress-fill');
  requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = (q.i / q.items.length) * 100 + '%'; }));
  fitWord(word);
  if (document.fonts) document.fonts.ready.then(() => { if (word.isConnected) fitWord(word); });

  function showFeedback(r, value) {
    const right = `<div class="right">${esc(shown.join('; '))}</div>`;
    if (r.ok && !r.typo) {
      fb.innerHTML = `<div class="fb ok"><b class="head">Верно</b>${shown.length > 1 || /\(/.test(shown[0]) ? right : ''}</div>`;
    } else if (r.ok) {
      fb.innerHTML = `<div class="fb ok"><b class="head">Верно, но есть опечатка</b><div class="right">${typoMarkup(r.shown, value, lang)}</div></div>`;
    } else {
      fb.innerHTML = `<div class="fb bad"><b class="head">${value ? 'Неверно' : 'Правильный ответ'}</b>${right}
        ${value ? '<button type="button" class="text-btn" id="override">Мой ответ тоже верный, засчитать</button>' : ''}</div>`;
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
    if (q.checked) return; // ответ на это слово уже засчитан
    const r = value.trim() ? check(value, answers, lang) : { ok: false };
    q.checked = true;
    q.results.push({ w, ok: r.ok, answer: value.trim() });
    record(w, r.ok);
    showFeedback(r, value.trim());
    if (!r.ok && value.trim()) { input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake'); }
    // Ответ принят: поле только для чтения и клавиатура прячется, дальше — кнопкой
    input.readOnly = true;
    input.placeholder = '';
    input.classList.add('locked');
    input.blur();
    input.hidden = !value.trim(); // «Не знаю»: вводить нечего — поле убираем
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
    navigate('back', () => showTopic(q.topic.id));
  };
  input.focus();
}

function next() {
  quiz.i++;
  quiz.checked = false;
  if (quiz.i >= quiz.items.length) navigate('forward', showResult);
  else navigate('next', renderQuestion);
}

function showResult() {
  const q = quiz;
  const toRu = q.dir === 'en-ru';
  const okCount = q.results.filter(r => r.ok).length;
  const pct = Math.round((okCount / q.results.length) * 100);
  const wrong = q.results.filter(r => !r.ok);

  if (!q.topic.id.startsWith(MISTAKES)) {
    const key = q.topic.id + ':' + q.dir;
    progress.best[key] = Math.max(progress.best[key] || 0, pct);
    save();
  }
  logAttempt(q.topic.id, q.dir, q.results.length, okCount);
  const verdict = pct === 100 ? 'Без единой ошибки' : pct >= 90 ? 'Отличный результат' : pct >= 70 ? 'Хорошо, ещё немного практики' : 'Стоит повторить';
  const name = q.topic.id.startsWith(MISTAKES) ? q.topic.title : nameOf(q.topic);

  render(`
    ${bar({ left: `<button class="icon-btn" id="close" aria-label="Закрыть">${ICON.close}</button>`, title: 'Результат' })}
    <main class="page">
      <div class="head">
        <h1 class="title">${verdict}</h1>
        <p class="score" style="margin-top:14px">${pct}%</p>
        <p class="score-line">${okCount} из ${q.results.length} верно · ${esc(name)} · ${toRu ? 'EN → RU' : 'RU → EN'}</p>
      </div>
      <div class="grid">
        ${wrong.length ? `
          <section class="panel span-8">
            <div class="panel-head"><h2>Ошибки</h2><span class="chip">${wrong.length}</span></div>
            <div>
              ${wrong.map(r => `
                <div class="mistake">
                  <div class="w-q">${esc(toRu ? r.w.en.join(' / ') : r.w.ru.join('; '))}</div>
                  <div class="w-a">${esc((toRu ? r.w.ru : r.w.en).join('; '))}</div>
                  ${r.answer ? `<div class="w-y">${esc(r.answer)}</div>` : ''}
                </div>`).join('')}
            </div>
          </section>` : ''}
        <section class="${wrong.length ? 'span-4' : 'span-6'}">
          ${wrong.length ? `<button class="btn primary" id="redo">Повторить ошибки · ${wrong.length}</button>` : ''}
          <button class="btn ${wrong.length ? '' : 'primary'}" id="again">Пройти урок ещё раз</button>
          <button class="btn" id="home">К урокам</button>
        </section>
      </div>
    </main>`);

  const redo = document.getElementById('redo');
  if (redo) redo.onclick = () => navigate('forward', () => startQuiz(q.topic, q.dir, 0, wrong.map(r => r.w)));
  document.getElementById('again').onclick = () => {
    const t = findTopic(q.topic.id);
    if (!t || !t.words.length) return navigate('back', () => showDocument(q.topic.doc));
    navigate('forward', () => startQuiz(t, q.dir, q.len, t.words));
  };
  document.getElementById('close').onclick = () => navigate('back', () => showTopic(q.topic.id));
  document.getElementById('home').onclick = () => navigate('back', () => showDocument(q.topic.doc));
}

// ---------- запуск ----------
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

(async function start() {
  if (!db) return showAuth();
  const { data } = await db.auth.getSession();
  if (RECOVERY && data.session) showNewPassword();
  else if (data.session) { clearUrl(); await enter(data.session.user); }
  else if (LINK_ERROR) {
    clearUrl();
    showAuth('login', LINK_ERROR === 'otp_expired'
      ? 'Ссылка из письма устарела — запроси новую через «Забыли пароль?».'
      : 'Ссылка из письма не сработала — попробуй ещё раз.');
  } else showAuth();
  db.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') { if (!recovering) showNewPassword(); return; }
    if (recovering) return;
    if (event === 'SIGNED_OUT' && user) { progress = emptyProgress(); showAuth('login', 'Сессия закончилась, войди ещё раз.'); }
    else if (event === 'SIGNED_IN' && session && !user) enter(session.user);
  });
})();
