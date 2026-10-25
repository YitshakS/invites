const FORM_WORDS = {
  'יחיד': { dear: 'היקר', invite: 'להודיעך', confirm: 'לאישורך' },
  'יחידה': { dear: 'היקרה', invite: 'להודיעך', confirm: 'לאישורך' },
  'רבים': { dear: 'היקרים', invite: 'להודיעכם', confirm: 'לאישורכם' },
  'רבות': { dear: 'היקרות', invite: 'להודיעכן', confirm: 'לאישורכן' }
};

// ---------- אירוע ----------
// האירוע נקבע לפי e= בכתובת. ההגדרות והתמונות שלו יושבות ב-events/<e>/
const DEFAULT_PAGE = '**{שם בהזמנה} {היקר|היקרה|היקרים|היקרות}**\nבשבח והודיה לה\' יתברך\nאנו שמחים ונרגשים {להודיעך|להודיעך|להודיעכם|להודיעכן}\nעל שמחת האירוע שלנו\n\nשתתקיים בעז"ה\n*תאריך האירוע\nשעת האירוע\nמקום האירוע*';
// כתובת השורש של האתר (לפי המקום שממנו נטען הקובץ הזה). עובד גם מדף עטיפה שיושב ב-events/<אירוע>/
const ROOT = new URL('.', document.currentScript.src).href;
let EVENT = '', EVENT_DIR = '';

function eventSlug() {
  const p = location.pathname.match(/\/events\/([a-z0-9][a-z0-9-]*)\/(?:index\.html)?$/);
  const e = (p && p[1]) || new URLSearchParams(location.search).get('e') || '';
  return /^[a-z0-9][a-z0-9-]*$/.test(e) ? e : '';
}

function loadScript(src) {
  return new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = fail;
    document.head.append(s);
  });
}

async function loadEvent() {
  EVENT = eventSlug();
  if (!EVENT) throw new Error('no_event');
  EVENT_DIR = ROOT + 'events/' + EVENT + '/';
  await loadScript(EVENT_DIR + 'config.js');
  applyTheme(CONFIG.theme || {});
}

function applyTheme(t) {
  const r = document.documentElement.style;
  if (t.accent) r.setProperty('--accent', t.accent);
  if (t.accentDark) r.setProperty('--accent-dark', t.accentDark);
  if (t.bg) r.setProperty('--bg', t.bg);
  r.setProperty('--bg-img', t.bgImage ? 'url("' + EVENT_DIR + t.bgImage + '")' : 'none');
  const d = document.getElementById('decor');
  if (d) d.innerHTML = (t.decor || []).map(x => '<img src="' + esc(EVENT_DIR + x.src) + '" alt="" style="' + esc(x.css) + '">').join('');
}

// מפתח הסיסמה בדפדפן נפרד לכל אירוע
const tokenKey = () => 'adminToken:' + EVENT;

// ---------- נוסחים ----------
function guestVars(g) {
  return {
    'שם בהזמנה': g.display || g.first || '', // אם העמודה ריקה, מוצג השם הפרטי
    'שם פרטי': g.first || '',
    'שם משפחה': g.last || '',
    '_form': Math.max(0, FORM_ORDER.indexOf(g.form))
  };
}

// מחליף מילים שמורות. {א|ב|ג|ד} = ארבע צורות לפי נוסח הפניה (יחיד, יחידה, רבים, רבות). מילה לא מוכרת נשארת כמו שהיא
const FORM_ORDER = ['יחיד', 'יחידה', 'רבים', 'רבות'];
function fillTemplate(tpl, vars) {
  return String(tpl || '').replace(/\{([^{}]+)\}/g, (m, k) => {
    if (k in vars) return vars[k];
    const parts = k.split('|');
    return parts.length === 4 ? parts[vars._form || 0].trim() : m;
  });
}

// נוסח הדף: **טקסט** כותרת, *טקסט* מודגש, [טקסט](כתובת) קישור, {שם-קובץ.jpg} תמונה מתיקיית img של האירוע (מזוהה לפי הסיומת), שורה ריקה פסקה חדשה
function pageHtml(tpl, vars) {
  const pic = src => (/^(https?:)?\/\//.test(src) ? src : EVENT_DIR + 'img/' + src);
  const rich = s => esc(s)
    .replace(/\{\s*([^{}\s|]+\.(?:jpe?g|png|webp|gif))\s*\}/gi, (m, src) => '<img class="pic" src="' + pic(src) + '" alt="">')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a target="_blank" rel="noopener" href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<span class="ttl">$1</span>')
    .replace(/\*([^*]+)\*/g, '<span class="hl">$1</span>');
  return fillTemplate(tpl, vars).trim().split(/\n{2,}/).filter(Boolean)
    .map(p => '<p>' + rich(p).replace(/\n/g, '<br>').replace(/(<span class="ttl">[^<]*<\/span>)<br>/g, '$1') + '</p>').join('');
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ניקוי טלפון, זהה ל-digits_ בשרת: נייד ישראלי נשמר ב-8 ספרות (בלי 05), מספר מחו"ל (10 עד 15 ספרות) כמו שהוא, אחר: '' (לא תקין).
function digits9(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.indexOf('972') === 0 && d.length > 9) d = d.slice(3);
  d = d.replace(/^0+/, '');
  if (d.length === 9 && d[0] === '5') return d.slice(1);
  if (d.length >= 10 && d.length <= 15) return d;
  return '';
}

// המספר המלא לוואטסאפ (wa.me)
function waNumber(phone) {
  const n = digits9(phone);
  return n.length === 8 ? '9725' + n : n;
}

async function getInvitation(id) {
  if (!CONFIG.API_URL) return mockApi('get', { id });
  const r = await fetch(CONFIG.API_URL + '?id=' + encodeURIComponent(id));
  return r.json();
}

// POST כמחרוזת (text/plain) כדי להימנע מ-preflight של CORS מול Apps Script
async function api(action, data) {
  if (!CONFIG.API_URL) return mockApi(action, data || {});
  // keepalive: בקשת האישור תושלם גם אם המוזמן סוגר את הדף מיד אחרי הלחיצה
  const r = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify(Object.assign({ action }, data)), keepalive: action === 'rsvp' });
  return r.json();
}

// ---------- מצב דמו ----------
function mockApi(action, d) {
  const key = 'mockGuests';
  let gs = JSON.parse(localStorage.getItem(key) || 'null');
  if (!gs) {
    gs = [
      { id: 'demo1', first: 'דוד', last: 'כהן', display: 'דוד', form: 'יחיד', phone: '050-1234567', table: '1', viewed: '', count: null, sent: '', note: '' },
      { id: 'demo2', first: 'רחל', last: 'לוי', display: 'משפחת לוי', form: 'רבים', phone: '052-7654321', table: '2', viewed: new Date().toISOString(), count: null, sent: new Date().toISOString(), note: '' },
      { id: 'demo3', first: 'שרה', last: 'מזרחי', display: 'שרה', form: 'יחידה', phone: '054-1112233', table: '2', viewed: new Date().toISOString(), count: 3, sent: new Date().toISOString(), note: '' }
    ];
  }
  const save = () => localStorage.setItem(key, JSON.stringify(gs));
  const find = id => gs.find(g => g.id === id);
  let out = { ok: true };
  if (action === 'get') {
    const g = find(d.id);
    if (!g) out = { ok: false, error: 'not_found' };
    else { g.viewed = new Date().toISOString(); out = { ok: true, display: g.display || g.first, first: g.first, last: g.last, form: g.form, count: g.count, pageTemplate: (JSON.parse(localStorage.getItem('mockSettings') || 'null') || {}).page }; }
  } else if (action === 'rsvp') { const g = find(d.id); if (g) g.count = Number(d.count); }
  else if (action === 'list') out = { ok: true, guests: gs, settings: JSON.parse(localStorage.getItem('mockSettings') || 'null') || { page: DEFAULT_PAGE, message: '{שם בהזמנה} {היקר|היקרה|היקרים|היקרות},\nפרטים ואישור הגעה בקישור:\n{קישור}' } };
  else if (action === 'saveSettings') localStorage.setItem('mockSettings', JSON.stringify({ page: d.page, message: d.message }));
  else if (action === 'add') {
    (d.guests || []).forEach(x => gs.push({ id: 'demo' + Date.now() + Math.random().toString(36).slice(2, 5), first: x.first, last: x.last || '', display: x.display || '', form: x.form || 'יחיד', phone: x.phone, table: x.table || '', viewed: '', count: null, sent: '', note: x.note || '' }));
    out = { ok: true, added: (d.guests || []).length, duplicates: [] };
  } else if (action === 'setSent') { const g = find(d.id); if (g) g.sent = d.sent ? new Date().toISOString() : ''; }
  else if (action === 'preview') {
    const g = find(d.id);
    out = g ? { ok: true, display: g.display || g.first, first: g.first, last: g.last, form: g.form, count: g.count, pageTemplate: (JSON.parse(localStorage.getItem('mockSettings') || 'null') || {}).page } : { ok: false, error: 'not_found' };
  }
  else if (action === 'delete') {
    const i = gs.findIndex(g => g.id === (d.guest || {}).id);
    if (i < 0) out = { ok: false, error: 'not_found' }; else gs.splice(i, 1);
  }
  else if (action === 'update') { const g = find(d.id); if (g) Object.assign(g, d.fields); }
  save();
  return Promise.resolve(out);
}
