// API בלבד: ההזמנה והממשק יושבים ב-GitHub Pages. הסקריפט מחובר לגוגל שיט.
// הפעלה ראשונה: להריץ את setup() ולקרוא ביומן הביצוע את ADMIN_TOKEN.
// כל אירוע = גיליון משלו + פרויקט Apps Script משלו (עותק של הקובץ הזה) + סיסמה משלו.

const SHEET_NAME = 'הזמנות';
const HEADERS = ['שולחן', 'שם פרטי', 'שם משפחה', 'שם בהזמנה', 'נוסח הפניה', 'מספר טלפון נייד', 'מזהה', 'ההזמנה נצפתה לאחרונה', 'כמות משתתפים', 'ההזמנה נשלחה לאחרונה', 'הערות'];
const COL = { TABLE: 1, FIRST: 2, LAST: 3, DISPLAY: 4, FORM: 5, PHONE: 6, ID: 7, VIEWED: 8, COUNT: 9, SENT: 10, NOTE: 11 };
const SETTINGS_SHEET = 'הגדרות';
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const DT_FORMAT = 'dd/mm/yyyy hh:mm:ss'; // תאריך ושעה (עם דקות ושניות) בעמודות הצפיה והשליחה
const FORMS = ['יחיד', 'יחידה', 'רבים', 'רבות'];
const EDITABLE = { table: COL.TABLE, first: COL.FIRST, last: COL.LAST, display: COL.DISPLAY, form: COL.FORM, note: COL.NOTE };

// נוסחי ברירת מחדל. מילים שמורות: {שם בהזמנה} {שם פרטי} {שם משפחה}, ובוואטסאפ גם {קישור}. {א|ב|ג|ד} = ארבע צורות לפי נוסח הפניה
const DEFAULT_PAGE = '**{שם בהזמנה} {היקר|היקרה|היקרים|היקרות}**\nבשבח והודיה לה\' יתברך\nאנו שמחים ונרגשים {להודיעך|להודיעך|להודיעכם|להודיעכן}\nעל שמחת האירוע שלנו\n\nשתתקיים בעז"ה\n*תאריך האירוע\nשעת האירוע\nמקום האירוע*';
const DEFAULT_MESSAGE = '{שם בהזמנה} {היקר|היקרה|היקרים|היקרות},\nבשבח והודיה לה\' יתברך\nאנו שמחים ונרגשים {להודיעך|להודיעך|להודיעכם|להודיעכן} על שמחת האירוע שלנו\nפרטים נוספים ואישור הגעה בקישור:\n{קישור}';

function setup() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('SECRET_KEY')) p.setProperty('SECRET_KEY', Utilities.getUuid() + Utilities.getUuid());
  if (!p.getProperty('ADMIN_TOKEN')) p.setProperty('ADMIN_TOKEN', Utilities.getUuid().replace(/-/g, '').slice(0, 12));
  const sh = sheet_();
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.setRightToLeft(true);
  sh.getRange(2, COL.PHONE, sh.getMaxRows() - 1, 1).setNumberFormat('@');
  sh.getRange(2, COL.VIEWED, sh.getMaxRows() - 1, 1).setNumberFormat(DT_FORMAT);
  sh.getRange(2, COL.SENT, sh.getMaxRows() - 1, 1).setNumberFormat(DT_FORMAT);
  const t = readTemplates_();
  if (!settings_().getRange('B3').getValue()) saveTemplates_(t.page, t.message);
  Logger.log('ADMIN_TOKEN = ' + p.getProperty('ADMIN_TOKEN'));
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('הזמנות').addItem('חשב מזהים חסרים', 'fillMissingIds').addToUi();
}

function fillMissingIds() {
  const sh = sheet_();
  const n = sh.getLastRow() - 1;
  if (n < 1) return;
  const phones = sh.getRange(2, COL.PHONE, n, 1).getValues();
  const ids = sh.getRange(2, COL.ID, n, 1).getValues();
  const out = ids.map((r, i) => [r[0] || (digits_(phones[i][0]) ? idFor_(phones[i][0]) : '')]);
  sh.getRange(2, COL.ID, n, 1).setValues(out);
}

function doGet(e) {
  // כותרת ותיאור תצוגת הקישור בוואטסאפ. ציבורי, ונקרא על ידי הבנייה האוטומטית של האתר (tools/build-event.mjs)
  if (e.parameter && e.parameter.share) return json_(Object.assign({ ok: true }, readShare_()));
  const id = String((e.parameter && e.parameter.id) || '').trim();
  if (!id) return json_({ ok: true });
  return withLock_(() => {
    const g = find_(id);
    if (!g) return json_({ ok: false, error: 'not_found' });
    sheet_().getRange(g.row, COL.VIEWED).setNumberFormat(DT_FORMAT).setValue(new Date());
    return json_({ ok: true, display: g.display || g.first, first: g.first, last: g.last, form: g.form, count: g.count, pageTemplate: readTemplates_().page });
  });
}

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.action === 'rsvp') return withLock_(() => rsvp_(d));
    const a = auth_(d.token);
    if (a === 'locked') return json_({ ok: false, error: 'locked' });
    if (a !== 'ok') return json_({ ok: false, error: 'unauthorized' });
    switch (d.action) {
      case 'list': {
        const t = readTemplates_();
        return json_({ ok: true, guests: readAll_(), settings: { page: t.page, message: t.message, share: readShare_() } });
      }
      case 'saveSettings': return withLock_(() => {
        saveTemplates_(String(d.page || ''), String(d.message || ''));
        let build = 'none';
        if ('shareTitle' in d || 'shareDescription' in d) {
          const before = JSON.stringify(readShare_());
          saveShare_(String(d.shareTitle || ''), String(d.shareDescription || ''));
          if (JSON.stringify(readShare_()) !== before) build = triggerBuild_();
        }
        return json_({ ok: true, build });
      });
      case 'add': return withLock_(() => add_(d.guests || []));
      case 'setSent': return withLock_(() => setSent_(d));
      case 'update': return withLock_(() => update_(d));
      case 'delete': return withLock_(() => delete_(d));
      case 'preview': {
        const g = find_(String(d.id || '').trim()); // קריאה בלבד: לא נרשמת צפיה
        return g ? json_({ ok: true, display: g.display || g.first, first: g.first, last: g.last, form: g.form, count: g.count, pageTemplate: readTemplates_().page }) : json_({ ok: false, error: 'not_found' });
      }
      default: return json_({ ok: false, error: 'bad_action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// לשונית "הגדרות": B1 = שעת פתיחה אחרי נעילה (מחיקת התא פותחת מיד), B3 = נוסח דף ההזמנה, B4 = נוסח הוואטסאפ.
function settings_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SETTINGS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(SETTINGS_SHEET);
    sh.setRightToLeft(true);
    sh.getRange('A1').setValue('נעול עד (למחוק את התא פותח מיד)').setFontWeight('bold');
    sh.getRange('B1').setNumberFormat('dd/mm/yyyy hh:mm:ss');
    sh.setColumnWidth(1, 260);
    sh.setColumnWidth(2, 460);
  }
  return sh;
}

function readTemplates_() {
  const v = settings_().getRange('B3:B4').getValues();
  return { page: String(v[0][0] || '') || DEFAULT_PAGE, message: String(v[1][0] || '') || DEFAULT_MESSAGE };
}

function saveTemplates_(page, message) {
  const sh = settings_();
  sh.getRange('A3:A4').setValues([['נוסח דף ההזמנה'], ['נוסח הודעת הוואטסאפ']]).setFontWeight('bold');
  sh.getRange('B3:B4').setNumberFormat('@').setValues([[page], [message]]).setWrap(true);
}

// B5 = כותרת תצוגת הקישור בוואטסאפ, B6 = התיאור. ריק = נשארים הערכים שב-config.js של האירוע
function readShare_() {
  const v = settings_().getRange('B5:B6').getValues();
  return { title: String(v[0][0] || ''), description: String(v[1][0] || '') };
}

function saveShare_(title, description) {
  const sh = settings_();
  sh.getRange('A5:A6').setValues([['כותרת תצוגת הקישור בוואטסאפ'], ['תיאור תצוגת הקישור בוואטסאפ']]).setFontWeight('bold');
  sh.getRange('B5:B6').setNumberFormat('@').setValues([[title], [description]]).setWrap(true);
}

// מפעיל ב-GitHub את הבנייה של האתר (.github/workflows/pages.yml), כדי שתצוגת הקישור תתעדכן.
// דורש ב-Script Properties (הגדרות הפרויקט): GITHUB_TOKEN (טוקן עם הרשאת Actions: Read and write לריפו) ו-GITHUB_REPO (למשל YitshakS/invites).
// בלי אלה השמירה עובדת, והתצוגה תתעדכן בבנייה הבאה.
function triggerBuild_() {
  const p = PropertiesService.getScriptProperties();
  const token = p.getProperty('GITHUB_TOKEN'), repo = p.getProperty('GITHUB_REPO');
  if (!token || !repo) return 'no_token';
  try {
    const r = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/actions/workflows/pages.yml/dispatches', {
      method: 'post', contentType: 'application/json', payload: JSON.stringify({ ref: 'main' }), muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
    });
    return r.getResponseCode() === 204 ? 'started' : 'failed';
  } catch (err) {
    return 'failed';
  }
}

function auth_(token) {
  return withLock_(() => {
    const sh = settings_(), p = PropertiesService.getScriptProperties();
    const until = sh.getRange('B1').getValue();
    if (until instanceof Date && until.getTime() > Date.now()) return 'locked';
    if (token === p.getProperty('ADMIN_TOKEN')) { p.deleteProperty('FAILS'); return 'ok'; }
    let f = JSON.parse(p.getProperty('FAILS') || '{"n":0,"t":0}');
    if (Date.now() - f.t > LOCK_MINUTES * 60000) f = { n: 0, t: 0 };
    f.n++; f.t = Date.now();
    if (f.n >= MAX_FAILS) {
      sh.getRange('B1').setValue(new Date(Date.now() + LOCK_MINUTES * 60000));
      p.deleteProperty('FAILS');
      return 'locked';
    }
    p.setProperty('FAILS', JSON.stringify(f));
    return 'bad';
  });
}

function rsvp_(d) {
  const count = Number(d.count);
  if (!Number.isInteger(count) || count < 0 || count > 50) return json_({ ok: false, error: 'bad_count' });
  const g = find_(String(d.id || '').trim());
  if (!g) return json_({ ok: false, error: 'not_found' });
  sheet_().getRange(g.row, COL.COUNT).setValue(count);
  return json_({ ok: true });
}

function add_(list) {
  const sh = sheet_();
  const existing = new Set(readAll_().map(g => g.id));
  const rows = [], duplicates = [], invalid = [];
  list.forEach(x => {
    const phone = String(x.phone || '').trim();
    const first = String(x.first || '').trim();
    if (!first) return;
    if (!validPhone_(phone)) { invalid.push(first); return; }
    const id = idFor_(phone);
    if (existing.has(id)) { duplicates.push(first); return; }
    existing.add(id);
    const form = FORMS.indexOf(x.form) >= 0 ? x.form : 'יחיד';
    rows.push([x.table || '', first, x.last || '', x.display || '', form, formatPhone_(phone), id, '', '', '', x.note || '']);
  });
  if (rows.length) {
    const start = sh.getLastRow() + 1;
    sh.getRange(start, COL.PHONE, rows.length, 1).setNumberFormat('@');
    sh.getRange(start, 1, rows.length, HEADERS.length).setValues(rows);
  }
  return json_({ ok: true, added: rows.length, duplicates, invalid });
}

function setSent_(d) {
  const g = find_(String(d.id || '').trim());
  if (!g) return json_({ ok: false, error: 'not_found' });
  sheet_().getRange(g.row, COL.SENT).setNumberFormat(DT_FORMAT).setValue(d.sent ? new Date() : '');
  return json_({ ok: true });
}

function update_(d) {
  const g = find_(String(d.id || '').trim());
  if (!g) return json_({ ok: false, error: 'not_found' });
  const sh = sheet_(), f = d.fields || {};
  Object.keys(EDITABLE).forEach(k => { if (k in f) sh.getRange(g.row, EDITABLE[k]).setValue(f[k]); });
  if ('count' in f) {
    const c = f.count === null || f.count === '' ? '' : Number(f.count);
    if (c !== '' && (!Number.isInteger(c) || c < 0 || c > 50)) return json_({ ok: false, error: 'bad_count' });
    sh.getRange(g.row, COL.COUNT).setValue(c);
  }
  if ('viewed' in f) sh.getRange(g.row, COL.VIEWED).setNumberFormat(DT_FORMAT).setValue(f.viewed ? new Date(f.viewed) : '');
  if ('sent' in f) sh.getRange(g.row, COL.SENT).setNumberFormat(DT_FORMAT).setValue(f.sent ? new Date(f.sent) : '');
  let id = g.id;
  if ('phone' in f && !validPhone_(f.phone)) return json_({ ok: false, error: 'bad_phone' });
  if ('phone' in f && idFor_(f.phone) !== g.id) {
    id = idFor_(f.phone);
    if (readAll_().some(x => x.id === id)) return json_({ ok: false, error: 'duplicate' });
    sh.getRange(g.row, COL.PHONE).setNumberFormat('@').setValue(formatPhone_(f.phone));
    sh.getRange(g.row, COL.ID).setValue(id);
  }
  return json_({ ok: true, id });
}

// מחיקה: נמחקת רק שורה שכל שדותיה זהים למה שהמסך הציג (עד דיוק של שנייה בתאריכים).
function sig_(g) {
  const s = v => (v ? Math.floor(new Date(v).getTime() / 1000) : '');
  const t = v => String(v == null ? '' : v).trim();
  return JSON.stringify([t(g.table), t(g.first), t(g.last), t(g.display), t(g.form), t(g.phone), t(g.id), s(g.viewed),
    g.count === null || g.count === '' || g.count === undefined ? '' : Number(g.count), s(g.sent), t(g.note)]);
}

function delete_(d) {
  const want = sig_(d.guest || {});
  const hit = readAll_().find(g => sig_(g) === want);
  if (!hit) return json_({ ok: false, error: 'not_found' });
  sheet_().deleteRow(hit.row);
  return json_({ ok: true });
}

// מזהה: HMAC-SHA256 של 9 הספרות האחרונות בטלפון, 16 בייט ראשונים. אותו טלפון נותן תמיד אותו מזהה, ואי אפשר לנחש בלי המפתח.
function idFor_(phone) {
  const key = PropertiesService.getScriptProperties().getProperty('SECRET_KEY');
  const sig = Utilities.computeHmacSha256Signature(digits_(phone), key);
  return Utilities.base64EncodeWebSafe(sig.slice(0, 16)).replace(/=+$/, '');
}

// ניקוי טלפון: רק ספרות, בלי קידומת 972 ובלי אפסים בתחילה.
// נייד ישראלי (9 ספרות שמתחילות ב-5) נשמר ב-8 ספרות, בלי ה-5. מספר מחו"ל (10 עד 15 ספרות) נשמר כמו שהוא. כל השאר לא תקין ומחזיר ''.
function digits_(s) {
  let d = String(s || '').replace(/\D/g, '');
  if (d.indexOf('972') === 0 && d.length > 9) d = d.slice(3);
  d = d.replace(/^0+/, '');
  if (d.length === 9 && d[0] === '5') return d.slice(1);
  if (d.length >= 10 && d.length <= 15) return d;
  return '';
}

function validPhone_(s) { return digits_(s) !== ''; }

// פורמט אחיד לשמירה בגיליון: נייד ישראלי 050-1234567, מספר מחו"ל +ספרות. המזהה מחושב מהמספר המנוקה ולכן לא משתנה.
function formatPhone_(s) {
  const d = digits_(s);
  if (d.length === 8) return '05' + d[0] + '-' + d.slice(1);
  return d ? '+' + d : String(s || '').trim();
}

function sheet_() {
  const ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function readAll_() {
  const sh = sheet_();
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const iso = v => (v instanceof Date ? v.toISOString() : '');
  return sh.getRange(2, 1, n, HEADERS.length).getValues().map((r, i) => ({
    row: i + 2, table: r[0], first: r[1], last: r[2], display: r[3], form: r[4], phone: String(r[5]),
    id: String(r[6]), viewed: iso(r[7]), count: r[8] === '' ? null : Number(r[8]), sent: iso(r[9]), note: r[10]
  }));
}

function find_(id) {
  return readAll_().find(g => g.id === id) || null;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
