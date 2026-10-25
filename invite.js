const app = document.getElementById('app');
let id = new URLSearchParams(location.search).get('id');
let saved = null;
// תצוגה מקדימה למנהל: דורשת סיסמת ניהול שמורה בדפדפן. בלעדיה הדף פועל כרגיל ורושם צפיה.
let adminToken = '', PREVIEW = false;
// תצוגה מקדימה חיה של נוסח לא שמור, מתוך לשונית "נוסחים" בדף הניהול (הדף רץ בתוך iframe ומקבל את הנוסח בהודעה)
let tplOverride = null, lastG = null;
window.addEventListener('message', e => {
  if (!PREVIEW || e.origin !== location.origin || !e.data || e.data.type !== 'tpl') return;
  tplOverride = String(e.data.page || '');
  if (lastG) render(lastG);
});

// אזהרה אם מנסים לצאת בזמן שהאישור עדיין נשלח
let sending = false;
window.addEventListener('beforeunload', e => { if (sending) { e.preventDefault(); e.returnValue = ''; } });

function notFound() {
  app.innerHTML = '<p class="hl">נראה שהקישור אינו תקין</p><h2>404</h2><h1>הדף לא קיים</h1>';
}

function render(g) {
  const w = FORM_WORDS[g.form] || FORM_WORDS['יחיד'];
  const MAP = CONFIG.theme && CONFIG.theme.mapImage ? EVENT_DIR + CONFIG.theme.mapImage : '';
  // רק ברכת "נשמח לראות" מותאמת לנוסח הפניה. שאר ההודעות נטרליות.
  const T = {
    'יחיד': { see1: 'נשמח לראותך', seeN: 'נשמח לראותכם' },
    'יחידה': { see1: 'נשמח לראותך', seeN: 'נשמח לראותכם' },
    'רבים': { see1: 'נשמח לראותכם', seeN: 'נשמח לראותכם' },
    'רבות': { see1: 'נשמח לראותכן', seeN: 'נשמח לראותכן' }
  }[g.form] || { see1: 'נשמח לראותך', seeN: 'נשמח לראותכם' };
  saved = g.count;
  lastG = g;
  app.innerHTML =
    (PREVIEW ? '<div class="banner"><b>תצוגה מקדימה בלבד!</b> הצפיה בהזמנה ואישור כמות המשתתפים אינם נשמרים במאגר הנתונים</div>' : '') +
    pageHtml(tplOverride != null ? (tplOverride || DEFAULT_PAGE) : (CONFIG.pageTemplate || g.pageTemplate || DEFAULT_PAGE), guestVars(g)) +
    '<p class="ask">על מנת שנוכל להיערך נשמח ' + w.confirm + '</p>' +
    '<label for="count">כמות המשתתפים</label>' +
    '<div class="stepper"><button type="button" id="minus" aria-label="הפחת">-</button>' +
    '<input type="number" id="count" min="0" max="50" inputmode="numeric" value="' + (g.count == null ? '' : g.count) + '">' +
    '<button type="button" id="plus" aria-label="הוסף">+</button></div>' +
    '<button type="button" class="primary" id="ok" disabled>אישור</button>' +
    '<p id="msg"></p>' +
    (MAP ? '<p class="mapbox"><span class="muted">מפת הגעה (לחיצה להגדלה)</span><a href="' + esc(MAP) + '"><img class="map" src="' + esc(MAP) + '" alt="מפת הגעה"></a></p>' : '');
  const count = document.getElementById('count'), ok = document.getElementById('ok'), msg = document.getElementById('msg');

  // מפת ההגעה נפתחת בחלון מודל. הרקע וכפתור הסגירה קבועים, וההגדלה (צביטה, גלגלת, הקשה כפולה) והגרירה פועלות רק על המפה עצמה
  const mapLink = app.querySelector('.mapbox a');
  if (mapLink) {
    let modal = document.getElementById('mapModal');
    if (!modal) {
      modal = document.createElement('div'); modal.id = 'mapModal'; modal.hidden = true;
      modal.innerHTML = '<button type="button" id="mapClose" aria-label="סגירה">✕</button><div class="mapstage"><img id="mapBig" alt="מפת הגעה" draggable="false"></div><div class="maphint">צביטה או הקשה כפולה: הגדלה והקטנה</div>';
      document.body.append(modal);
    }
    const stage = modal.querySelector('.mapstage'), big = document.getElementById('mapBig');
    let s = 1, tx = 0, ty = 0;
    const pts = new Map();
    let start = null, moved = false, lastTap = 0;
    const apply = () => {
      const sw = stage.clientWidth, sh = stage.clientHeight, w = big.offsetWidth, h = big.offsetHeight;
      const mx = Math.max(0, (w * s - sw) / 2), my = Math.max(0, (h * s - sh) / 2);
      tx = Math.max(-mx, Math.min(mx, tx)); ty = Math.max(-my, Math.min(my, ty));
      if (s <= 1) { tx = 0; ty = 0; }
      big.style.transform = 'translate(-50%,-50%) translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')';
    };
    const zoomAt = (px, py, ns) => {
      ns = Math.max(1, Math.min(4, ns));
      const r = stage.getBoundingClientRect(), cx = px - r.left - r.width / 2, cy = py - r.top - r.height / 2;
      tx = cx - (ns / s) * (cx - tx); ty = cy - (ns / s) * (cy - ty); s = ns; apply();
    };
    const reset = () => { s = 1; tx = 0; ty = 0; apply(); };
    const hide = () => { modal.hidden = true; document.body.style.overflow = ''; reset(); };
    const close = () => { if (!modal.hidden && history.state && history.state.map) history.back(); else hide(); };
    mapLink.onclick = e => { e.preventDefault(); big.src = mapLink.href; modal.hidden = false; document.body.style.overflow = 'hidden'; reset(); history.pushState({ map: 1 }, ''); };
    document.getElementById('mapClose').onclick = close;
    window.addEventListener('popstate', hide);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) close(); });
    stage.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, s * Math.pow(1.0015, -e.deltaY)); }, { passive: false });
    stage.addEventListener('pointerdown', e => {
      try { stage.setPointerCapture(e.pointerId); } catch (x) {}
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      start = { x: e.clientX, y: e.clientY, t: Date.now() }; moved = pts.size > 1;
    });
    stage.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId); if (!p) return;
      if (pts.size >= 2) {
        const [a, b] = [...pts.values()]; const d0 = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX; p.y = e.clientY;
        const [c, d] = [...pts.values()]; const d1 = Math.hypot(c.x - d.x, c.y - d.y);
        if (d0 > 0) zoomAt((c.x + d.x) / 2, (c.y + d.y) / 2, s * d1 / d0);
        moved = true;
      } else {
        const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
        if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) moved = true;
        if (s > 1) { tx += dx; ty += dy; apply(); }
      }
    });
    const up = e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (!moved && start && pts.size === 0 && Date.now() - start.t < 400) {
        const r = big.getBoundingClientRect(); // לפי מיקום האצבע, כי עם pointer capture היעד תמיד הרקע
        const onImg = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!onImg) { close(); }
        else if (Date.now() - lastTap < 350) { s > 1 ? reset() : zoomAt(e.clientX, e.clientY, 2.5); lastTap = 0; }
        else lastTap = Date.now();
      }
    };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', e => { pts.delete(e.pointerId); });
  }
  function check() {
    if (PREVIEW) { ok.disabled = true; return; }
    const v = count.value === '' ? NaN : Number(count.value);
    msg.className = '';
    if (!Number.isInteger(v) || v < 0 || v > 50) { msg.textContent = '⚠️ ערך לא חוקי'; msg.className = 'bad'; ok.disabled = true; return; }
    if (v === saved) { ok.disabled = true; msg.textContent = '🟰 הכמות שנבחרה זהה לכמות שכבר נשמרה'; return; }
    ok.disabled = false; msg.textContent = '';
  }
  count.addEventListener('input', check);
  document.getElementById('minus').onclick = () => { count.value = Math.max(0, (Number(count.value) || 0) - 1); check(); };
  document.getElementById('plus').onclick = () => { count.value = Math.min(50, (Number(count.value) || 0) + 1); check(); };

  if (!PREVIEW) ok.onclick = async () => {
    const v = Number(count.value);
    ok.disabled = true; msg.className = ''; msg.textContent = 'שולח נתונים…';
    ok.innerHTML = '<span class="spin sm"></span>אישור';
    sending = true;
    try {
      const r = await api('rsvp', { id, count: v });
      if (!r.ok) throw new Error(r.error);
      saved = v;
      msg.className = 'good';
      msg.textContent = v === 0
        ? 'תודה, העדכון התקבל. בעז"ה נתראה בשמחות הבאות'
        : 'תודה! העדכון התקבל. ' + (v === 1 ? T.see1 : T.seeN) + ' 😊';
      const b = ok.getBoundingClientRect(), portrait = innerHeight > innerWidth;
      if (window.confetti) confetti({
        particleCount: 100, spread: 70, startVelocity: portrait ? 60 : 45, scalar: portrait ? 1.6 : 1.2,
        origin: { x: (b.left + b.width / 2) / innerWidth, y: (b.top + b.height / 2) / innerHeight }
      });
    } catch (e) {
      msg.className = 'bad';
      msg.textContent = '⚠️ העדכון לא התקבל, מומלץ לנסות שוב בעוד מספר דקות';
      ok.disabled = false;
    } finally {
      sending = false;
      ok.textContent = 'אישור';
    }
  };
}

(async () => {
  try { await loadEvent(); } catch (e) { return notFound(); }
  document.title = CONFIG.title || 'הזמנה';
  try { adminToken = localStorage.getItem(tokenKey()) || ''; } catch (e) {}
  PREVIEW = new URLSearchParams(location.search).get('preview') === '1' && !!adminToken;
  if (!id) return notFound();
  try {
    const g = PREVIEW ? await api('preview', { token: adminToken, id }) : await getInvitation(id);
    if (g.error === 'unauthorized' || g.error === 'locked') { app.innerHTML = '<p>אין הרשאה לתצוגה מקדימה. היכנסו קודם לדף הניהול.</p>'; return; }
    if (!g.ok) return notFound();
    render(g);
    if (PREVIEW && window.parent !== window) {
      parent.postMessage({ type: 'tpl-ready' }, location.origin);
      // מדווח להורה את גובה הכרטיס (גם כשתמונה נטענת או הנוסח משתנה)
      const report = () => parent.postMessage({ type: 'tpl-height', h: app.offsetHeight + 40 }, location.origin);
      new ResizeObserver(report).observe(app); report();
    }
  } catch (e) {
    app.innerHTML = '<p>⚠️ ההזמנה לא נטענה, מומלץ לרענן את הדף</p>';
  }
})();
  