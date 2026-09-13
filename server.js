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

const userNames = {};
const userLocations = {};
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
  // KULLANICI GİRİŞİ
  // =========================
  socket.on('login', async (data) => {
    const { phoneNumber, latitude, longitude } = data;
    if (!phoneNumber) return;

    socket.phoneNumber = phoneNumber;

    // Kullanıcıyı kendi telefon numarasına özel odaya dahil et (Kritik Düzeltme)
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

    console.log(`📍 ${phoneNumber} (${userNames[phoneNumber]}) giriş yaptı ve odaya katıldı.`);
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

    // Alıcının oda adresine anında gönder (Sayfa yenilense dahi bağlantı odaya bağlandığından kaybolmaz)
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