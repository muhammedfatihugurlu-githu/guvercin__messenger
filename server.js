const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Firebase Realtime Database Adresi
const FIREBASE_URL = "https://guvercin-chat-8d21e-default-rtdb.firebaseio.com/messages.json";

// Firebase'den tüm mesajları okuma
async function loadMessages() {
  try {
    const response = await fetch(FIREBASE_URL);
    if (!response.ok) return [];
    const data = await response.json();
    return data ? Object.values(data) : [];
  } catch (err) {
    console.error('Firebase okuma hatası:', err);
    return [];
  }
}

// Firebase'e yeni mesaj kaydetme
async function saveMessage(newMsg) {
  try {
    await fetch(FIREBASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newMsg)
    });
    console.log('✅ Mesaj Firebase veritabanına kaydedildi.');
  } catch (err) {
    console.error('Firebase kaydetme hatası:', err);
  }
}

const users = {};
const userNames = {}; // Numaralara karşılık gelen isim deposu
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

socketLogin();

function socketLogin() {

  io.on('connection', (socket) => {

    // =========================
    // KULLANICI GİRİŞİ
    // =========================
    socket.on('login', async (data) => {

      const {
        phoneNumber,
        latitude,
        longitude
      } = data;

      // Kullanıcıyı kaydet
      users[phoneNumber] = socket.id;
      socket.phoneNumber = phoneNumber;

      // Varsayılan isim olarak telefon numarasını ata (değiştirilmediyse)
      if (!userNames[phoneNumber]) {
        userNames[phoneNumber] = phoneNumber;
      }

      // Kullanıcının konumunu kaydet
      if (
        typeof latitude === 'number' &&
        typeof longitude === 'number'
      ) {
        userLocations[phoneNumber] = {
          latitude,
          longitude
        };
      }

      // Güvercin durumu
      if (!pigeonState[phoneNumber]) {
        pigeonState[phoneNumber] = 'home';
      }

      // Firebase'den kullanıcı geçmişini çek
      const allMessages = await loadMessages();
      const userHistory = allMessages.filter(
        (m) =>
          m.senderPhone === phoneNumber ||
          m.receiverPhone === phoneNumber
      );

      socket.emit('login success', {
        phoneNumber,
        name: userNames[phoneNumber],
        userNamesMap: userNames,
        history: userHistory,
        pigeonState: pigeonState[phoneNumber]
      });

      console.log(
        `📍 ${phoneNumber} giriş yaptı:`,
        userLocations[phoneNumber]
      );

    });

    // =========================
    // İSİM GÜNCELLEME
    // =========================
    socket.on('update name', (data) => {

      const phoneNumber = socket.phoneNumber;
      if (!phoneNumber) return;

      const newName = data.name ? data.name.trim() : phoneNumber;
      userNames[phoneNumber] = newName || phoneNumber;

      console.log(`👤 ${phoneNumber} ismini güncelledi: ${userNames[phoneNumber]}`);

      // Tüm bağlı kullanıcılara isim güncellemesini duyur
      io.emit('user name updated', {
        phoneNumber,
        name: userNames[phoneNumber]
      });

    });

    // =========================
    // KONUM GÜNCELLEME
    // =========================
    socket.on('update location', (data) => {

      const phoneNumber = socket.phoneNumber;
      if (!phoneNumber) return;

      const { latitude, longitude } = data;

      if (
        typeof latitude !== 'number' ||
        typeof longitude !== 'number'
      ) {
        return;
      }

      userLocations[phoneNumber] = { latitude, longitude };

      console.log(
        `📍 ${phoneNumber} konumunu güncelledi:`,
        latitude,
        longitude
      );

    });

    // =========================
    // GÜVERCİN GÖNDER
    // =========================
    socket.on('send pigeon', async (data) => {

      const {
        senderPhone,
        receiverPhone,
        message
      } = data;

      const senderLocation = userLocations[senderPhone];
      const receiverLocation = userLocations[receiverPhone];

      if (!senderLocation) {
        return socket.emit('pigeon error', {
          message: 'Senin konumun henüz alınamadı. Konum iznini açıp tekrar dene.'
        });
      }

      if (!receiverLocation) {
        return socket.emit('pigeon error', {
          message: 'Alıcının konumu henüz kayıtlı değil. Alıcının Messenger’a giriş yapması gerekiyor.'
        });
      }

      if (pigeonState[senderPhone] === 'busy') {
        return socket.emit('pigeon error', {
          message: 'Güvercinin şu an yolda! Teslimatı tamamlamasını beklemelisin.'
        });
      }

      pigeonState[senderPhone] = 'busy';

      const distance = calculateDistance(
        senderLocation.latitude,
        senderLocation.longitude,
        receiverLocation.latitude,
        receiverLocation.longitude
      );

      const flightTimeInSeconds = 0;

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
        distance: distance.toFixed(2),
        time: timestamp,
        status: 'teslim edildi'
      };

      await saveMessage(newMsg);

      socket.emit('pigeon status', {
        receiverPhone,
        distance: newMsg.distance,
        flightTimeInSeconds,
        messageData: newMsg
      });

      const receiverSocketId = users[receiverPhone];
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('pigeon arrived', newMsg);
      }

      pigeonState[senderPhone] = 'home';

      socket.emit('pigeon delivered', {
        message: 'Güvercin mesajı teslim etti ve tekrar hazır! 🕊️'
      });

      console.log(
        `✅ Mesaj teslim edildi: ${senderPhone} (${userNames[senderPhone]}) → ${receiverPhone}`
      );

    });

    // =========================
    // BAĞLANTI KESİLDİ
    // =========================
    socket.on('disconnect', () => {

      if (socket.phoneNumber) {
        delete users[socket.phoneNumber];
        console.log(`🔴 ${socket.phoneNumber} bağlantıyı kesti`);
      }

    });

  });

}

// =========================
// SUNUCU
// =========================
const PORT = process.env.PORT || 3001;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🕊️ Güvercin Sunucusu Hazır: ${PORT}`);
});