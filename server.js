const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Firebase Realtime Database Adresleri
const FIREBASE_MESSAGES_URL = "https://guvercin-chat-8d21e-default-rtdb.firebaseio.com/messages.json";
const FIREBASE_USERS_URL = "https://guvercin-chat-8d21e-default-rtdb.firebaseio.com/users.json";
const FIREBASE_PASSWORDS_URL = "https://guvercin-chat-8d21e-default-rtdb.firebaseio.com/passwords.json";
const FIREBASE_HIGHSCORES_URL = "https://guvercin-chat-8d21e-default-rtdb.firebaseio.com/highscores.json";
const FIREBASE_EMPIRE_GAMES_URL = "https://guvercin-chat-8d21e-default-rtdb.firebaseio.com/gameStates";

// Firebase'den tüm mesajları okuma
async function loadMessages() {
  try {
    const response = await fetch(FIREBASE_MESSAGES_URL);
    if (!response.ok) return [];

    const data = await response.json();

    return data ? Object.values(data) : [];

  } catch (err) {
    console.error('Firebase mesaj okuma hatası:', err);
    return [];
  }
}

// Firebase'e yeni mesaj kaydetme
async function saveMessage(newMsg) {
  try {

    await fetch(FIREBASE_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(newMsg)
    });

    console.log('✅ Mesaj Firebase veritabanına kaydedildi.');

  } catch (err) {
    console.error('Firebase mesaj kaydetme hatası:', err);
  }
}

// Firebase'den kayıtlı kullanıcı isimlerini okuma
async function loadUserNamesFromFirebase() {
  try {

    const response = await fetch(FIREBASE_USERS_URL);

    if (!response.ok) return {};

    const data = await response.json();

    return data || {};

  } catch (err) {
    console.error('Firebase isim okuma hatası:', err);
    return {};
  }
}

// Firebase'e kullanıcı ismini kaydetme
async function saveUserNameToFirebase(phone, name) {
  try {

    const userUrl =
      `https://guvercin-chat-8d21e-default-rtdb.firebaseio.com/users/${phone}.json`;

    await fetch(userUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(name)
    });

  } catch (err) {
    console.error('Firebase isim kaydetme hatası:', err);
  }
}

// Firebase'den şifreleri okuma
async function loadPasswordsFromFirebase() {
  try {

    const response = await fetch(FIREBASE_PASSWORDS_URL);

    if (!response.ok) return {};

    const data = await response.json();

    return data || {};

  } catch (err) {
    console.error('Firebase şifre okuma hatası:', err);
    return {};
  }
}

// Firebase'e şifre kaydetme
async function savePasswordToFirebase(phone, password) {
  try {

    const passUrl =
      `https://guvercin-chat-8d21e-default-rtdb.firebaseio.com/passwords/${phone}.json`;

    await fetch(passUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(password)
    });

  } catch (err) {
    console.error('Firebase şifre kaydetme hatası:', err);
  }
}

// Firebase'den rekorları okuma
async function loadHighScoresFromFirebase() {
  try {

    const response = await fetch(FIREBASE_HIGHSCORES_URL);

    if (!response.ok) return {};

    const data = await response.json();

    return data || {};

  } catch (err) {
    console.error('Firebase rekor okuma hatası:', err);
    return {};
  }
}

// Firebase'e rekor kaydetme
async function saveHighScoreToFirebase(phone, score) {
  try {

    const scoreUrl =
      `https://guvercin-chat-8d21e-default-rtdb.firebaseio.com/highscores/${phone}.json`;

    await fetch(scoreUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(score)
    });

  } catch (err) {
    console.error('Firebase rekor kaydetme hatası:', err);
  }
}


// ==========================================
// GÜVERCİN İMPARATORLUĞU FIREBASE
// ==========================================

async function loadEmpireGameFromFirebase(phone) {

  try {

    const url =
      `${FIREBASE_EMPIRE_GAMES_URL}/${encodeURIComponent(phone)}.json`;

    const response = await fetch(url);

    if (!response.ok) return null;

    return await response.json();

  } catch (err) {

    console.error(
      'Firebase imparatorluk oyunu okuma hatası:',
      err
    );

    return null;
  }
}


async function saveEmpireGameToFirebase(phone, state) {

  try {

    const safeState = {

      money:
        Math.max(
          0,
          Number(state?.money) || 0
        ),

      totalEarned:
        Math.max(
          0,
          Number(state?.totalEarned) || 0
        ),

      level:
        Math.max(
          1,
          Math.floor(
            Number(state?.level) || 1
          )
        ),

      upgrades: {

        bag: {

          count:
            Math.max(
              0,
              Math.floor(
                Number(
                  state?.upgrades?.bag?.count
                ) || 0
              )
            ),

          tier:
            Math.max(
              1,
              Math.floor(
                Number(
                  state?.upgrades?.bag?.tier
                ) || 1
              )
            )
        },

        bird: {

          count:
            Math.max(
              0,
              Math.floor(
                Number(
                  state?.upgrades?.bird?.count
                ) || 0
              )
            ),

          tier:
            Math.max(
              1,
              Math.floor(
                Number(
                  state?.upgrades?.bird?.tier
                ) || 1
              )
            )
        }
      }
    };


    const url =
      `${FIREBASE_EMPIRE_GAMES_URL}/${encodeURIComponent(phone)}.json`;


    const response = await fetch(url, {

      method: 'PUT',

      headers: {
        'Content-Type': 'application/json'
      },

      body: JSON.stringify(safeState)

    });


    return response.ok;

  } catch (err) {

    console.error(
      'Firebase imparatorluk oyunu kaydetme hatası:',
      err
    );

    return false;
  }
}


// ==========================================
// KULLANICI VERİLERİ
// ==========================================

const userNames = {};
const userPasswords = {};
const pigeonState = {};


// ==========================================
// SOCKET.IO
// ==========================================

io.on('connection', (socket) => {


  // ========================================
  // KULLANICI GİRİŞİ VE ŞİFRE KONTROLÜ
  // ========================================

  socket.on('login', async (data) => {

    const {
      phoneNumber,
      password
    } = data;


    if (!phoneNumber || !password) {

      return socket.emit(
        'login error',
        {
          message:
            'Telefon numarası ve şifre zorunludur!'
        }
      );
    }


    // Şifre uzunluk kontrolü

    if (
      password.length < 4 ||
      password.length > 12
    ) {

      return socket.emit(
        'login error',
        {
          message:
            'Şifreniz en az 4, en fazla 12 karakter olmalıdır!'
        }
      );
    }


    // Firebase'den güncel şifreleri çek

    const firebasePasswords =
      await loadPasswordsFromFirebase();


    if (firebasePasswords[phoneNumber]) {

      // Kullanıcı var

      if (
        firebasePasswords[phoneNumber] !==
        password
      ) {

        return socket.emit(
          'login error',
          {
            message:
              'Girdiğiniz şifre yanlış!'
          }
        );
      }

    } else {

      // İlk giriş

      await savePasswordToFirebase(
        phoneNumber,
        password
      );

      console.log(
        `🔑 Yeni kullanıcı kaydoldu: ${phoneNumber}`
      );
    }


    userPasswords[phoneNumber] =
      password;

    socket.phoneNumber =
      phoneNumber;


    // Kullanıcıyı telefon numarasına özel odaya al

    socket.join(phoneNumber);


    // Firebase verilerini getir

    const [
      firebaseNames,
      firebaseScores,
      empireGameState
    ] = await Promise.all([

      loadUserNamesFromFirebase(),

      loadHighScoresFromFirebase(),

      loadEmpireGameFromFirebase(
        phoneNumber
      )

    ]);


    userNames[phoneNumber] =
      firebaseNames[phoneNumber] ||
      userNames[phoneNumber] ||
      phoneNumber;


    const userHighScore =
      firebaseScores[phoneNumber] || 0;


    if (!pigeonState[phoneNumber]) {

      pigeonState[phoneNumber] =
        'home';
    }


    // Mesaj geçmişini Firebase'den getir

    const allMessages =
      await loadMessages();


    const userHistory =
      allMessages.filter(
        (m) =>
          m.senderPhone === phoneNumber ||
          m.receiverPhone === phoneNumber
      );


    // ======================================
    // LOGIN SUCCESS
    // ======================================

    socket.emit(
      'login success',
      {

        phoneNumber,

        name:
          userNames[phoneNumber],

        userNamesMap:
          {
            ...firebaseNames,
            ...userNames
          },

        history:
          userHistory,

        pigeonState:
          pigeonState[phoneNumber],

        highScore:
          userHighScore,

        // YENİ:
        empireGameState:
          empireGameState || null
      }
    );


    console.log(
      `📍 ${phoneNumber} (${userNames[phoneNumber]}) başarıyla giriş yaptı.`
    );

  });


  // ========================================
  // İSİM GÜNCELLEME
  // ========================================

  socket.on(
    'update name',
    async (data) => {

      const phoneNumber =
        socket.phoneNumber;

      if (!phoneNumber) return;


      const newName =
        data.name
          ? data.name.trim()
          : phoneNumber;


      userNames[phoneNumber] =
        newName || phoneNumber;


      await saveUserNameToFirebase(
        phoneNumber,
        userNames[phoneNumber]
      );


      io.emit(
        'user name updated',
        {

          phoneNumber,

          name:
            userNames[phoneNumber]

        }
      );

    }
  );


  // ========================================
  // ŞİFRE DEĞİŞTİRME
  // ========================================

  socket.on(
    'change password',
    async (data) => {

      const phoneNumber =
        socket.phoneNumber;

      if (!phoneNumber) return;


      const {
        oldPassword,
        newPassword
      } = data;


      const firebasePasswords =
        await loadPasswordsFromFirebase();


      const currentPassword =
        firebasePasswords[phoneNumber] ||
        userPasswords[phoneNumber];


      if (
        currentPassword &&
        currentPassword !== oldPassword
      ) {

        return socket.emit(
          'password result',
          {

            success: false,

            message:
              'Mevcut şifrenizi yanlış girdiniz!'

          }
        );
      }


      const trimmedNewPass =
        newPassword
          ? newPassword.trim()
          : '';


      if (
        trimmedNewPass.length < 4 ||
        trimmedNewPass.length > 12
      ) {

        return socket.emit(
          'password result',
          {

            success: false,

            message:
              'Yeni şifreniz en az 4, en fazla 12 karakter olmalıdır!'

          }
        );
      }


      userPasswords[phoneNumber] =
        trimmedNewPass;


      await savePasswordToFirebase(
        phoneNumber,
        trimmedNewPass
      );


      socket.emit(
        'password result',
        {

          success: true,

          message:
            'Şifreniz başarıyla değiştirildi! 🕊️'

        }
      );

    }
  );


  // ========================================
  // FLAPPY BIRD REKOR
  // ========================================

  socket.on(
    'update score',
    async (data) => {

      const phoneNumber =
        socket.phoneNumber;

      if (!phoneNumber) return;


      const newScore =
        parseInt(
          data.score,
          10
        );


      if (
        isNaN(newScore) ||
        newScore <= 0
      ) {
        return;
      }


      const highScores =
        await loadHighScoresFromFirebase();


      const currentHighScore =
        highScores[phoneNumber] || 0;


      if (
        newScore >
        currentHighScore
      ) {

        await saveHighScoreToFirebase(
          phoneNumber,
          newScore
        );


        socket.emit(
          'score updated',
          {

            highScore:
              newScore,

            message:
              'Yeni rekor kırıldı! 🏆'

          }
        );


        console.log(
          `🏆 ${phoneNumber} yeni rekor kırdı: ${newScore}`
        );
      }

    }
  );


  // ========================================
  // GÜVERCİN GÖNDER
  // ========================================

  socket.on(
    'send pigeon',
    async (data) => {

      const {
        senderPhone,
        receiverPhone,
        message
      } = data;


      if (
        pigeonState[senderPhone] ===
        'busy'
      ) {

        return socket.emit(
          'pigeon error',
          {

            message:
              'Güvercinin şu an yolda! Teslimatı tamamlamasını beklemelisin.'

          }
        );
      }


      pigeonState[senderPhone] =
        'busy';


      // Türkiye saati

      const timestamp =
        new Date().toLocaleTimeString(
          'tr-TR',
          {

            timeZone:
              'Europe/Istanbul',

            hour:
              '2-digit',

            minute:
              '2-digit'

          }
        );


      const newMsg = {

        id:
          Date.now(),

        senderPhone,

        senderName:
          userNames[senderPhone] ||
          senderPhone,

        receiverPhone,

        message,

        time:
          timestamp,

        status:
          'teslim edildi'

      };


      // Firebase'e kaydet

      await saveMessage(
        newMsg
      );


      // Gönderene bildir

      socket.emit(
        'pigeon status',
        {

          receiverPhone,

          flightTimeInSeconds:
            0,

          messageData:
            newMsg

        }
      );


      // Alıcıya anında gönder

      io.to(
        receiverPhone
      ).emit(
        'pigeon arrived',
        newMsg
      );


      pigeonState[senderPhone] =
        'home';


      socket.emit(
        'pigeon delivered',
        {

          message:
            'Güvercin mesajı teslim etti ve tekrar hazır! 🕊️'

        }
      );


      console.log(
        `✅ Mesaj iletildi ve kaydedildi: ${senderPhone} → ${receiverPhone} (Saat: ${timestamp})`
      );

    }
  );


  // ========================================
  // GÜVERCİN İMPARATORLUĞU KAYDET
  // ========================================

  socket.on(
    'save empire game',
    async (data) => {

      const phoneNumber =
        socket.phoneNumber;


      if (
        !phoneNumber ||
        !data?.state
      ) {
        return;
      }


      const success =
        await saveEmpireGameToFirebase(
          phoneNumber,
          data.state
        );


      socket.emit(
        'empire game saved',
        {

          success,

          message:
            success
              ? 'Güvercin İmparatorluğu kaydedildi! 👑🕊️'
              : 'Oyun kaydedilemedi.'

        }
      );

    }
  );


  // ========================================
  // GÜVERCİN İMPARATORLUĞU YÜKLE
  // ========================================

  socket.on(
    'load empire game',
    async () => {

      const phoneNumber =
        socket.phoneNumber;


      if (!phoneNumber) return;


      const state =
        await loadEmpireGameFromFirebase(
          phoneNumber
        );


      socket.emit(
        'empire game loaded',
        {

          state:
            state || null

        }
      );

    }
  );


  // ========================================
  // BAĞLANTI KESİLDİ
  // ========================================

  socket.on(
    'disconnect',
    () => {

      if (socket.phoneNumber) {

        console.log(
          `🔴 ${socket.phoneNumber} bağlantıyı kesti.`
        );

      }

    }
  );

});


// ==========================================
// SUNUCU
// ==========================================

const PORT =
  process.env.PORT || 3001;


server.listen(
  PORT,
  '0.0.0.0',
  () => {

    console.log(
      `🕊️ Güvercin Sunucusu Hazır: ${PORT}`
    );

  }
);