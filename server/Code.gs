// API בלבד: ההזמנה והממשק יושבים ב-GitHub Pages. הסקריפט מחובר לגוגל שיט.
// הפעלה ראשונה: להריץ את setup() ולקרוא ביומן הביצוע את ADMIN_TOKEN.
// כל אירוע = גיליון משלו + פרויקט Apps Script משלו (עותק של הקובץ הזה) + סיסמה משלו.

const SHEET_NAME = 'הזמנות';
// עמודות ההסעה (אם הוגדרו הסעות בלוח הניהול) נוספות אחרי העמודות הקבועות: עמודה לכל הסעה, הכותרת היא שם ההסעה והתא הוא מספר הנוסעים
// (0 = לא מעוניין, ריק = לא ענה). אסור להזיז או לשנות את כותרות העמודות הקבועות, ואת כותרות ההסעות משנים רק דרך לוח הניהול.
const HEADERS = ['שולחן', 'שם פרטי', 'שם משפחה', 'שם בהזמנה', 'נוסח הפניה', 'מספר טלפון נייד', 'מזהה', 'ההזמנה נצפתה לאחרונה', 'כמות משתתפים', 'ההזמנה נשלחה לאחרונה', 'הערות'];
const COL = { TABLE: 1, FIRST: 2, LAST: 3, DISPLAY: 4, FORM: 5, PHONE: 6, ID: 7, VIEWED: 8, COUNT: 9, SENT: 10, NOTE: 11 };
const MAX_SHUTTLES = 12;
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
    const all = readAll_(), g = all.find(x => x.id === id);
    if (!g) return json_({ ok: false, error: 'not_found' });
    sheet_().getRange(g.row, COL.VIEWED).setNumberFormat(DT_FORMAT).setValue(new Date());
    return json_(guestView_(g, all));
  });
}

// מה שדף ההזמנה מקבל: פרטי המוזמן, ההסעות (שם, ומספר המקומות שנותרו בלי המקומות של המוזמן עצמו, null = בלי הגבלה) ובחירת המוזמן
function guestView_(g, all) {
  const defs = readShuttles_();
  return {
    ok: true, display: g.display || g.first, first: g.first, last: g.last, form: g.form, count: g.count, pageTemplate: readTemplates_().page,
    shuttles: defs.map(s => ({ name: s.name, left: s.cap ? Math.max(0, s.cap - shuttleUsed_(all, s.name, g.id)) : null })),
    mine: g.shuttles
  };
}

function shuttleUsed_(all, name, exceptId) {
  return all.reduce((sum, x) => sum + (x.id !== exceptId && x.count > 0 && Number(x.shuttles[name]) > 0 ? Number(x.shuttles[name]) : 0), 0);
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
        return json_({ ok: true, guests: readAll_(), settings: { page: t.page, message: t.message, share: readShare_(), columns: readColumns_(), shuttles: readShuttles_() } });
      }
      case 'saveColumns': return withLock_(() => { saveColumns_(String(d.columns || '').slice(0, 2000)); return json_({ ok: true }); });
      case 'saveShuttles': return withLock_(() => saveShuttles_(d.shuttles));
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
        const all = readAll_(), g = all.find(x => x.id === String(d.id || '').trim()); // קריאה בלבד: לא נרשמת צפיה
        return g ? json_(guestView_(g, all)) : json_({ ok: false, error: 'not_found' });
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

// B7 = סדר העמודות בלוח הניהול (JSON: מפתחות העמודות לפי הסדר, ונעיצת העמודה הראשונה). ריק = סדר ברירת המחדל. לא משפיע על עמודות הגיליון עצמו
function readColumns_() {
  return String(settings_().getRange('B7').getValue() || '');
}

function saveColumns_(value) {
  const sh = settings_();
  sh.getRange('A7').setValue('סדר העמודות בלוח הניהול (נוצר אוטומטית, למחוק את התא מאפס)').setFontWeight('bold');
  sh.getRange('B7').setNumberFormat('@').setValue(value);
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
  const defs = readShuttles_();
  const writes = []; // [שם הסעה, ערך]
  if (defs.length) {
    // הסעות: מספר הנוסעים בכל הסעה (0 = לא מעוניין), ריק = לא ענה. כשהכמות הכללית 0, מי שענה קודם נשאר עם 0 (אינדיקציה לביטול)
    if (count === 0) {
      defs.forEach(s => writes.push([s.name, g.shuttles[s.name] === '' || g.shuttles[s.name] == null ? '' : 0]));
    } else if (d.shuttles && typeof d.shuttles === 'object') {
      const all = readAll_();
      for (const s of defs) {
        const v = Number(d.shuttles[s.name] || 0);
        if (!Number.isInteger(v) || v < 0 || v > count) return json_({ ok: false, error: 'bad_shuttle' });
        if (v > 0 && s.cap && shuttleUsed_(all, s.name, g.id) + v > s.cap) return json_({ ok: false, error: 'shuttle_full', shuttle: s.name });
        writes.push([s.name, v]);
      }
    }
  }
  sheet_().getRange(g.row, COL.COUNT).setValue(count);
  writeShuttles_(g.row, writes);
  return json_({ ok: true });
}

// ---------- הסעות ----------
// לשונית "הגדרות": B8 = רשימת ההסעות (JSON: [{name, cap}]), cap = מספר מקומות מרבי (ריק = בלי הגבלה). מנוהלת בלוח הניהול.
function readShuttles_() {
  let list = [];
  try { list = JSON.parse(String(settings_().getRange('B8').getValue() || '[]')); } catch (e) {}
  return (Array.isArray(list) ? list : []).map(s => ({ name: String((s && s.name) || '').trim(), cap: Number(s && s.cap) > 0 ? Math.floor(Number(s.cap)) : 0 })).filter(s => s.name);
}

// מיקום עמודות ההסעה בגיליון לפי הכותרת (רק אחרי העמודות הקבועות). הסעה שאין לה עמודה עדיין, לא מופיעה במפה
function shuttleCols_(defs) {
  const sh = sheet_(), lc = sh.getLastColumn(), map = {};
  const hdr = lc > COL.NOTE ? sh.getRange(1, COL.NOTE + 1, 1, lc - COL.NOTE).getValues()[0] : [];
  defs.forEach(s => { const i = hdr.findIndex(h => String(h).trim() === s.name); if (i >= 0) map[s.name] = COL.NOTE + 1 + i; });
  return map;
}

// יוצר בסוף הגיליון עמודה לכל הסעה שחסרה, ומחזיר את המפה המלאה
function ensureShuttleCols_(defs) {
  const sh = sheet_();
  const map = shuttleCols_(defs);
  defs.forEach(s => {
    if (map[s.name]) return;
    const col = Math.max(sh.getLastColumn(), COL.NOTE) + 1;
    sh.getRange(1, col).setValue(s.name).setFontWeight('bold');
    map[s.name] = col;
  });
  return map;
}

function writeShuttles_(row, writes) {
  if (!writes.length) return;
  const map = ensureShuttleCols_(readShuttles_());
  writes.forEach(w => { if (map[w[0]]) sheet_().getRange(row, map[w[0]]).setValue(w[1]); });
}

// שמירת רשימת ההסעות מלוח הניהול. כל פריט: {name, cap, prev}. prev = השם הקודם (שינוי שם משנה גם את הכותרת בגיליון).
// הסעה שהוסרה מהרשימה לא נמחקת מהגיליון: העמודה והנתונים נשארים, והיא פשוט לא מוצגת. הוספה מחדש באותו שם מחברת אותה בחזרה.
function saveShuttles_(raw) {
  if (!Array.isArray(raw) || raw.length > MAX_SHUTTLES) return json_({ ok: false, error: 'bad_shuttles' });
  const list = raw.map(s => ({ name: String((s && s.name) || '').trim().slice(0, 40), cap: Number(s && s.cap) > 0 ? Math.floor(Number(s.cap)) : 0, prev: String((s && s.prev) || '').trim() }));
  const names = list.map(s => s.name);
  if (names.some(n => !n || HEADERS.indexOf(n) >= 0) || new Set(names).size !== names.length) return json_({ ok: false, error: 'bad_name' });
  const sh = sheet_();
  const old = readShuttles_();
  const cols = shuttleCols_(old.concat(list.filter(s => s.prev).map(s => ({ name: s.prev }))));
  const taken = shuttleCols_(list); // עמודות שכבר נושאות את השם החדש
  for (const s of list) {
    if (s.prev && s.prev !== s.name && cols[s.prev]) {
      if (taken[s.name]) return json_({ ok: false, error: 'name_exists', shuttle: s.name });
      sh.getRange(1, cols[s.prev]).setValue(s.name);
    }
  }
  settings_().getRange('A8').setValue('הסעות (נוצר אוטומטית מלוח הניהול)').setFontWeight('bold');
  settings_().getRange('B8').setNumberFormat('@').setValue(JSON.stringify(list.map(s => ({ name: s.name, cap: s.cap || null }))));
  ensureShuttleCols_(readShuttles_());
  return json_({ ok: true, shuttles: readShuttles_() });
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
  if (f.shuttles && typeof f.shuttles === 'object') {
    // עריכה מלוח הניהול: מספר נוסעים בהסעה (ריק = לא ענה). בלי בדיקת קיבולת, כי המנהל רשאי
    const defs = readShuttles_(), writes = [];
    for (const name of Object.keys(f.shuttles)) {
      if (!defs.some(s => s.name === name)) return json_({ ok: false, error: 'bad_shuttle' });
      const v = f.shuttles[name] === null || f.shuttles[name] === '' ? '' : Number(f.shuttles[name]);
      if (v !== '' && (!Number.isInteger(v) || v < 0 || v > 50)) return json_({ ok: false, error: 'bad_shuttle' });
      writes.push([name, v]);
    }
    writeShuttles_(g.row, writes);
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
    g.count === null || g.count === '' || g.count === undefined ? '' : Number(g.count), s(g.sent), t(g.note), JSON.stringify(Object.keys(g.shuttles || {}).sort().map(k => [k, t(g.shuttles[k])]))]);
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
  const defs = readShuttles_(), cols = shuttleCols_(defs);
  const width = Math.max(HEADERS.length, ...Object.keys(cols).map(k => cols[k]));
  return sh.getRange(2, 1, n, width).getValues().map((r, i) => {
    const shuttles = {};
    defs.forEach(s => { const v = cols[s.name] ? r[cols[s.name] - 1] : ''; shuttles[s.name] = v === '' || v == null || isNaN(Number(v)) ? '' : Number(v); });
    return {
      row: i + 2, table: r[0], first: r[1], last: r[2], display: r[3], form: r[4], phone: String(r[5]),
      id: String(r[6]), viewed: iso(r[7]), count: r[8] === '' ? null : Number(r[8]), sent: iso(r[9]), note: r[10], shuttles
    };
  });
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
