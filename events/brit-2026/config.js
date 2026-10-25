// הגדרות האירוע. כל הנתיבים יחסיים לתיקייה הזו.
// מילים שמורות בנוסחים: {שם בהזמנה} {שם פרטי} {שם משפחה}, ובוואטסאפ גם {קישור}. {א|ב|ג|ד} = ארבע צורות לפי נוסח הפניה (יחיד, יחידה, רבים, רבות).
// *טקסט* = הדגשה. **טקסט** = כותרת גדולה (בדף בלבד). [טקסט](כתובת) = קישור. שורה ריקה = פסקה חדשה.
window.CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbza3nzwuP0mCGCZoVjnNQxd0tUPKknyodH5s0kzQZxeHQhATqJRFZi7asBpvpW9FxqZ/exec',
  SITE_URL: '', // ריק = אותה כתובת של דף הניהול
  title: 'הזמנה לברית',

  // תצוגת הקישור בוואטסאפ (נקראת מ-index.html של האירוע, שנוצר ב-node tools/build-event.mjs)
  share: {
    title: 'ברית',
    description: 'בשבח והודיה לה\' יתברך\nאנו שמחים ונרגשים להודיעך\nעל שמחת ברית המילה של בננו',
    image: 'img/og.png'
  },

  theme: {
    accent: '#2f6fa3',
    accentDark: '#245580',
    bg: '#eaf3fb',
    bgImage: 'img/sky.webp',
    mapImage: 'img/map.jpg', // מפת הגעה (ריק = בלי מפה)
    decor: [
      { src: 'img/items/carriage.png', css: 'left:6%;top:4%;height:min(20vh,30vw)' },
      { src: 'img/items/teddy.png', css: 'right:5%;top:5%;height:min(14vh,22vw)' },
      { src: 'img/items/pacifier.png', css: 'right:5%;top:33%;height:min(8vh,13vw)' },
      { src: 'img/items/bottle.png', css: 'left:5%;top:36%;height:min(12vh,19vw)' },
      { src: 'img/items/chair.png', css: 'left:6%;bottom:3%;height:min(26vh,40vw)' },
      { src: 'img/items/cup.png', css: 'right:7%;bottom:4%;height:min(13vh,20vw)' }
    ]
  },

  // הברית כבר התקיימה והשרת שלה ישן, לכן הנוסחים שלה נשארים כאן. אירועים חדשים שומרים נוסחים בגיליון ועורכים אותם בדף הניהול.
  pageTemplate:
    '**{שם בהזמנה} {היקר|היקרה|היקרים|היקרות}**\n' +
    'בשבח והודיה לה\' יתברך\nאנו שמחים ונרגשים {להודיעך|להודיעך|להודיעכם|להודיעכן}\nעל שמחת ברית המילה של בננו\n\n' +
    'שתתקיים בעז"ה\n*יום שלישי כ"ה בתשרי ה\'תשפ"ז (06/10/2026)\nהברית בשעה 16:45 בעתודה לשכונה הדרומית של הישוב אביתר\nולאחר מכן סעודת המצווה בבית הכנסת עץ יהודה בישוב אביתר*',

  messageTemplate:
    '{שם בהזמנה} {היקר|היקרה|היקרים|היקרות},\nבשבח והודיה לה\' יתברך\nאנו שמחים ונרגשים {להודיעך|להודיעך|להודיעכם|להודיעכן} על שמחת ברית המילה של בננו\n*שתחול בעז"ה ביום שלישי זה!*\nפרטים נוספים ואישור הגעה בקישור:\n{קישור}'
};
