// יוצר את דף העטיפה של כל אירוע (events/<אירוע>/index.html) ואת index.html הראשי.
// דף העטיפה קיים רק בשביל תגיות התצוגה המקדימה בוואטסאפ, שנקראות מקוד ה-HTML בלי להריץ JavaScript.
// הלוגיקה כולה יושבת בקוד המשותף (common.js, invite.js).
//
// שימוש: node tools/build-event.mjs            (כל האירועים)
//        node tools/build-event.mjs hana-veltzer
//        node tools/build-event.mjs --from-sheet   (כותרת ותיאור התצוגה נקראים מהגיליון של כל אירוע, ושם הם גוברים על config.js. כך רץ ב-GitHub Actions)
//
// בהגדרות האירוע (config.js): share: { title, description, image: 'img/share.jpg' }  (התמונה יחסית לתיקיית האירוע, מומלץ 1200 על 630)

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = (process.env.SITE || 'https://yitshaks.github.io/invites/').replace(/\/?$/, '/');
const DEFAULT_DESC = 'יש לך הזמנה אישית. לחיצה לפרטים ולאישור הגעה';

const attr = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function page({ rel, title, description, image }) {
  const img = image
    ? `  <meta property="og:image" content="${attr(image)}">\n  <meta property="og:image:width" content="1200">\n  <meta property="og:image:height" content="630">\n  <meta name="twitter:card" content="summary_large_image">\n`
    : '';
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${attr(title)}</title>
  <meta property="og:type" content="website">
  <meta property="og:title" content="${attr(title)}">
  <meta property="og:description" content="${attr(description)}">
${img}  <meta property="og:locale" content="he_IL">
  <link rel="stylesheet" href="${rel}style.css">
</head>
<body>
  <!-- קובץ זה נוצר אוטומטית על ידי tools/build-event.mjs. אין לערוך אותו ידנית -->
  <div id="decor" aria-hidden="true"></div>
  <main class="card" id="app">
    <div class="loading" role="status" aria-live="polite">
      <div class="spin"></div>
      <p>טוען הזמנה…</p>
    </div>
  </main>

  <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js"></script>
  <script src="${rel}common.js"></script>
  <script src="${rel}invite.js"></script>
</body>
</html>
`;
}

function readConfig(dir) {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(dir, 'config.js'), 'utf8'), ctx);
  if (!ctx.window.CONFIG) throw new Error('config.js חייב להגדיר window.CONFIG: ' + dir);
  return ctx.window.CONFIG;
}

const eventsDir = path.join(ROOT, 'events');
const FROM_SHEET = process.argv.includes('--from-sheet');
const wanted = process.argv.slice(2).filter(a => !a.startsWith('--'));
const slugs = (wanted.length ? wanted : fs.readdirSync(eventsDir)).filter(s => fs.existsSync(path.join(eventsDir, s, 'config.js')));
if (wanted.length && slugs.length !== wanted.length) throw new Error('אירוע לא נמצא: ' + wanted.filter(w => !slugs.includes(w)).join(', '));

// כותרת ותיאור מהגיליון של האירוע (נקודת קצה ציבורית ב-Apps Script). ערך ריק או שגיאה: נשארים הערכים שב-config.js
async function sheetShare(cfg, slug) {
  if (!FROM_SHEET || !cfg.API_URL) return {};
  try {
    const r = await fetch(cfg.API_URL + (cfg.API_URL.includes('?') ? '&' : '?') + 'share=1', { redirect: 'follow' });
    const j = await r.json();
    if (!j.ok) throw new Error('תשובה לא תקינה');
    return { title: j.title || undefined, description: j.description || undefined };
  } catch (e) {
    console.warn('אזהרה: ' + slug + ': לא ניתן לקרוא את הגיליון, נשארים ערכי config.js (' + e.message + ')');
    return {};
  }
}

for (const slug of slugs) {
  const dir = path.join(eventsDir, slug);
  const cfg = readConfig(dir);
  const fromSheet = await sheetShare(cfg, slug);
  const share = Object.assign({}, cfg.share || {}, Object.fromEntries(Object.entries(fromSheet).filter(([, v]) => v)));
  let image = '';
  if (share.image) {
    if (!fs.existsSync(path.join(dir, share.image))) throw new Error(`${slug}: תמונת התצוגה לא נמצאה: ${share.image}`);
    image = /^https?:\/\//.test(share.image) ? share.image : SITE + 'events/' + slug + '/' + share.image;
  }
  fs.writeFileSync(path.join(dir, 'index.html'), page({
    rel: '../../', title: share.title || cfg.title || 'הזמנה', description: share.description || DEFAULT_DESC, image
  }));
  console.log('נוצר events/' + slug + '/index.html' + (image ? '  (תמונה: ' + image + ')' : '  (בלי תמונת תצוגה)'));
}

fs.writeFileSync(path.join(ROOT, 'index.html'), page({ rel: '', title: 'הזמנה', description: DEFAULT_DESC, image: '' }));
console.log('נוצר index.html');
