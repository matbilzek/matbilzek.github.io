```markdown
# Matematik Oyunları — Global Top10 & Skor Gönderme

Bu güncelleme:
- Her oyun paneline "Global Top 10" görüntüleme ve "Skor Gönder" butonu eklendi.
- Eğer Firebase yapılandırırsanız global leaderboard (Firestore) kullanılır.
- Firebase yoksa localStorage fallback ile yerel skorlar gösterilir/gönderilir.

Firebase (isteğe bağlı) — hızlı kurulum
1. Firebase Console'da bir proje oluştur.
2. Firestore (Cloud Firestore) koleksiyonu kullanın.
3. Güvenlik kuralları başlangıç için read: true, write: true yapabilirsiniz; production için kuralları düzenleyin.
4. Proje ayarlarından web app ekleyin ve elde ettiğiniz konfigürü repo köküne `firebase-config.js` dosyası olarak ekleyin:
   ```js
   // firebase-config.js
   window.FIREBASE_CONFIG = {
     apiKey: "API_KEY",
     authDomain: "PROJECT.firebaseapp.com",
     projectId: "PROJECT_ID",
     storageBucket: "PROJECT.appspot.com",
     messagingSenderId: "SENDER_ID",
     appId: "APP_ID"
   };
   ```
5. `index.html` içindeki comment olarak bırakılan satırı uncomment edin:
   `<script src="firebase-config.js"></script>`
6. Global skorlar Firestore'da `scores` koleksiyonuna eklenecek. Belge yapısı:
   { game: 'addition', name: 'Ali', score: 120, date: '...' }

Kullanım
- "Global Top 10" butonuna basınca modal açılır ve Firestore'dan (varsa) top10 çekilir; yoksa local top10 gösterilir.
- "Skor Gönder" butonu modal içinde, önce local en iyi skoru önerir; kullanıcı ismi girip gönderirse Firestore'a yazılır (veya localStorage'a kaydedilir).

Notlar
- Güvenlik: Firestore kurallarını production ortamında mutlaka sıkılaştırın (ör. rate-limit, auth).
- Varsayılan: sistem localStorage'e kaydeder. Oyunların bitişinde `saveLocalScore(game,score,name)` çağrısı yapılır — app.js içinde `_saveLocalScore` global olarak export edildi.