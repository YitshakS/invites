// הגדרות האירוע. כל הנתיבים יחסיים לתיקייה הזו.
// הנוסחים (נוסח הדף ונוסח הוואטסאפ) נשמרים בגיליון ונערכים בדף הניהול, בלשונית "נוסחים".
window.CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbxP-Srj1yl1xFClWhkGmJUt6BPRGavlSqSLA_53OBCoXWmOGKHg9XHqrpAvMmOXdut4/exec',
  SITE_URL: '', // ריק = אותה כתובת של דף הניהול
  title: 'הזמנה לבת מצווה',
  transport: true, // שאלת הסעה בהרשמה. חייב להתאים ל-TRANSPORT בסקריפט של האירוע

  // תצוגת הקישור בוואטסאפ (נקראת מ-index.html של האירוע, שנוצר ב-node tools/build-event.mjs). התמונה: 1200 על 630
  share: {
    title: 'הזמנה לבת מצווה',
    description: 'משפחת בר-חי',
    image: 'img/share.jpg'
  },

  theme: {
    accent: '#7a5a3c',
    accentDark: '#573f29',
    bg: '#f4f0e8',
    bgImage: '',
    mapImage: '',
    decor: []
  }
};
