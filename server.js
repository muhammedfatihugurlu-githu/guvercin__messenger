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
const FIREBASE_LOCATIONS_URL = "https://guvercin-chat-8d21e-default-rtdb.firebaseio.com/locations.json";
const FIREBASE_PASSWORDS_URL = "https://guvercin-chat-8d21e-default-rtdb.firebaseio.com/passwords.json";

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
      headers: { 'Content-Type': 'application/json' },
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
    const userUrl = `https://guvercin-chat-8d21e-default-rtdb.firebaseio.com/users/${phone}.json`;
    await fetch(userUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(name)
    });
  } catch (err) {
    console.error('Firebase isim kaydetme hatası:', err);
  }
}

// Firebase'den konumları okuma
async function loadLocationsFromFirebase() {
  try {
    const response = await fetch(FIREBASE_LOCATIONS_URL);
    if (!response.ok) return {};
    const data = await response.json();
    return data || {};
  } catch (err) {
    console.error('Firebase konum okuma hatası:', err);
    return {};
  }
}

// Firebase'e konum kaydetme
async function saveLocationToFirebase(phone, location) {
  try {
    const locUrl = `https://guvercin-chat-8d21e-default-rtdb.firebaseio.com/locations/${phone}.json`;
    await fetch(locUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(location)
    });
  } catch (err) {
    console.error('Firebase konum kaydetme hatası:', err);
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
    const passUrl = `https://guvercin-chat-8d21e-default-rtdb.firebaseio.com/passwords/${phone}.json`;
    await fetch(passUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(password)
    });
  } catch (err) {
    console.error('Firebase şifre kaydetme hatası:', err);
  }
}

const userNames = {};
const userLocations = {};
const userPasswords = {};
const pigeonState = {};

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;

  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);

  const c = 2 * Math.atan2(
    Math.sqrt(a),
    Math.sqrt(1 - a)
  );

  return R * c;
}

io.on('connection', (socket) => {

  // =========================
  // KULLANICI GİRİŞİ VE ŞİFRE KONTROLÜ
  // =========================
  socket.on('login', async (data) => {
    const { phoneNumber, password, latitude, longitude } = data;

    if (!phoneNumber || !password) {
      return socket.emit('login error', { message: 'Telefon numarası ve şifre zorunludur!' });
    }

    // Şifre uzunluk kontrolü (4 - 12 karakter)
    if (password.length < 4 || password.length > 12) {
      return socket.emit('login error', { message: 'Şifreniz en az 4, en fazla 12 karakter olmalıdır!' });
    }

    // Firebase'den güncel şifreleri çek
    const firebasePasswords = await loadPasswordsFromFirebase();

    if (firebasePasswords[phoneNumber]) {
      // Kullanıcı var -> Şifre kontrolü yap
      if (firebasePasswords[phoneNumber] !== password) {
        return socket.emit('login error', { message: 'Girdiğiniz şifre yanlış!' });
      }
    } else {
      // Kullanıcı ilk defa giriş yapıyor -> Kaydet
      await savePasswordToFirebase(phoneNumber, password);
      console.log(`🔑 Yeni kullanıcı kaydoldu: ${phoneNumber}`);
    }

    userPasswords[phoneNumber] = password;
    socket.phoneNumber = phoneNumber;

    // Kullanıcıyı kendi telefon numarasına özel odaya dahil et
    socket.join(phoneNumber);

    // Firebase verilerini çek
    const [firebaseNames, firebaseLocations] = await Promise.all([
      loadUserNamesFromFirebase(),
      loadLocationsFromFirebase()
    ]);

    userNames[phoneNumber] = firebaseNames[phoneNumber] || userNames[phoneNumber] || phoneNumber;

    // Konum güncellemesi ve kalıcı kaydı
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      const locObj = { latitude, longitude };
      userLocations[phoneNumber] = locObj;
      await saveLocationToFirebase(phoneNumber, locObj);
    } else if (firebaseLocations[phoneNumber]) {
      userLocations[phoneNumber] = firebaseLocations[phoneNumber];
    }

    if (!pigeonState[phoneNumber]) {
      pigeonState[phoneNumber] = 'home';
    }

    const allMessages = await loadMessages();
    const userHistory = allMessages.filter(
      (m) => m.senderPhone === phoneNumber || m.receiverPhone === phoneNumber
    );

    socket.emit('login success', {
      phoneNumber,
      name: userNames[phoneNumber],
      userNamesMap: { ...firebaseNames, ...userNames },
      history: userHistory,
      pigeonState: pigeonState[phoneNumber]
    });

    console.log(`📍 ${phoneNumber} (${userNames[phoneNumber]}) başarıyla giriş yaptı.`);
  });

  // =========================
  // İSİM GÜNCELLEME
  // =========================
  socket.on('update name', async (data) => {
    const phoneNumber = socket.phoneNumber;
    if (!phoneNumber) return;

    const newName = data.name ? data.name.trim() : phoneNumber;
    userNames[phoneNumber] = newName || phoneNumber;

    await saveUserNameToFirebase(phoneNumber, userNames[phoneNumber]);

    io.emit('user name updated', {
      phoneNumber,
      name: userNames[phoneNumber]
    });
  });

  // =========================
  // ŞİFRE DEĞİŞTİRME
  // =========================
  socket.on('change password', async (data) => {
    const phoneNumber = socket.phoneNumber;
    if (!phoneNumber) return;

    const { oldPassword, newPassword } = data;
    const firebasePasswords = await loadPasswordsFromFirebase();
    const currentPassword = firebasePasswords[phoneNumber] || userPasswords[phoneNumber];

    if (currentPassword && currentPassword !== oldPassword) {
      return socket.emit('password result', {
        success: false,
        message: 'Mevcut şifrenizi yanlış girdiniz!'
      });
    }

    const trimmedNewPass = newPassword ? newPassword.trim() : '';
    if (trimmedNewPass.length < 4 || trimmedNewPass.length > 12) {
      return socket.emit('password result', {
        success: false,
        message: 'Yeni şifreniz en az 4, en fazla 12 karakter olmalıdır!'
      });
    }

    userPasswords[phoneNumber] = trimmedNewPass;
    await savePasswordToFirebase(phoneNumber, trimmedNewPass);

    socket.emit('password result', {
      success: true,
      message: 'Şifreniz başarıyla değiştirildi! 🕊️'
    });
  });

  // =========================
  // KONUM GÜNCELLEME
  // =========================
  socket.on('update location', async (data) => {
    const phoneNumber = socket.phoneNumber;
    if (!phoneNumber) return;

    const { latitude, longitude } = data;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') return;

    const locObj = { latitude, longitude };
    userLocations[phoneNumber] = locObj;
    await saveLocationToFirebase(phoneNumber, locObj);
  });

  // =========================
  // GÜVERCİN GÖNDER
  // =========================
  socket.on('send pigeon', async (data) => {
    const { senderPhone, receiverPhone, message } = data;

    // Firebase'den güncel konumları kontrol et
    if (!userLocations[receiverPhone]) {
      const firebaseLocations = await loadLocationsFromFirebase();
      if (firebaseLocations[receiverPhone]) {
        userLocations[receiverPhone] = firebaseLocations[receiverPhone];
      }
    }

    const senderLocation = userLocations[senderPhone];
    const receiverLocation = userLocations[receiverPhone];

    if (pigeonState[senderPhone] === 'busy') {
      return socket.emit('pigeon error', {
        message: 'Güvercinin şu an yolda! Teslimatı tamamlamasını beklemelisin.'
      });
    }

    // Mesafe hesaplama
    let distanceText = "Bilinmiyor";
    if (senderLocation && receiverLocation) {
      const dist = calculateDistance(
        senderLocation.latitude,
        senderLocation.longitude,
        receiverLocation.latitude,
        receiverLocation.longitude
      );
      distanceText = dist.toFixed(2);
    } else if (senderLocation && !receiverLocation) {
      distanceText = "0.00";
    }

    pigeonState[senderPhone] = 'busy';

    const timestamp = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });

    const newMsg = {
      id: Date.now(),
      senderPhone,
      senderName: userNames[senderPhone] || senderPhone,
      receiverPhone,
      message,
      distance: distanceText,
      time: timestamp,
      status: 'teslim edildi'
    };

    // Mesajı veritabanına kaydet
    await saveMessage(newMsg);

    // Gönderene ilet
    socket.emit('pigeon status', {
      receiverPhone,
      distance: newMsg.distance,
      flightTimeInSeconds: 0,
      messageData: newMsg
    });

    // Alıcının oda adresine anında gönder
    io.to(receiverPhone).emit('pigeon arrived', newMsg);

    pigeonState[senderPhone] = 'home';

    socket.emit('pigeon delivered', {
      message: 'Güvercin mesajı teslim etti ve tekrar hazır! 🕊️'
    });

    console.log(`✅ Mesaj iletildi ve kaydedildi: ${senderPhone} → ${receiverPhone}`);
  });

  // =========================
  // BAĞLANTI KESİLDİ
  // =========================
  socket.on('disconnect', () => {
    if (socket.phoneNumber) {
      console.log(`🔴 ${socket.phoneNumber} bağlantıyı kesti.`);
    }
  });

});

// =========================
// SUNUCU
// =========================
const PORT = process.env.PORT || 3001;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🕊️ Güvercin Sunucusu Hazır: ${PORT}`);
});