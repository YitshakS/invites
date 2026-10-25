// הגדרות האירוע. כל הנתיבים יחסיים לתיקייה הזו.
// הנוסחים (נוסח הדף ונוסח הוואטסאפ) נשמרים בגיליון ונערכים בדף הניהול, בלשונית "נוסחים".
window.CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbzMTaZn4k5EN9UZkz9Owwdhq5ShPsXsRfUSGE8RJej19L6dtg9W2EapSB5TX8C1Vo9D/exec',
  SITE_URL: '', // ריק = אותה כתובת של דף הניהול
  title: 'הזמנה לחתונה',

  // תצוגת הקישור בוואטסאפ (נקראת מ-index.html של האירוע, שנוצר ב-node tools/build-event.mjs). התמונה: 1200 על 630
  share: {
    title: 'הזמנה לחתונה',
    description: 'טובאל יהודה עב"ל חנה',
    image: 'img/share.jpg'
  },

  theme: {
    accent: '#9b6b7a',
    accentDark: '#7a5160',
    bg: '#fbf3f1',
    bgImage: '', // למשל 'img/bg.jpg'
    mapImage: '', // למשל 'img/map.jpg'
    decor: []
  }
};
