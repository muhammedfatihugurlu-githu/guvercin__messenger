const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs'); // Node.js dahili dosya modülü
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Mesajların kaydedileceği dosya yolu
const MESSAGES_FILE = path.join(__dirname, 'mesajlar.json');

// Dosyadan mesajları oku
function loadMessages() {
  try {
    if (fs.existsSync(MESSAGES_FILE)) {
      const data = fs.readFileSync(MESSAGES_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Mesajlar okunamadı:', err);
  }
  return [];
}

// Mesajları dosyaya kaydet
function saveMessage(newMsg) {
  const messages = loadMessages();
  messages.push(newMsg);
  try {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2), 'utf8');
  } catch (err) {
    console.error('Mesaj kaydedilemedi:', err);
  }
}

const users = {};
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

// KULLANICI GİRİŞİ
io.on('connection', (socket) => {

  // =========================
  // KULLANICI GİRİŞİ
  // =========================
  socket.on('login', (data) => {
    const { phoneNumber, latitude, longitude } = data;

    users[phoneNumber] = socket.id;
    socket.phoneNumber = phoneNumber;

    if (typeof latitude === 'number' && typeof longitude === 'number') {
      userLocations[phoneNumber] = { latitude, longitude };
    }

    if (!pigeonState[phoneNumber]) {
      pigeonState[phoneNumber] = 'home';
    }

    // Dosyadan tüm mesajları çek ve bu kullanıcının olanları filtrele
    const allMessages = loadMessages();
    const userHistory = allMessages.filter(
      msg => msg.senderPhone === phoneNumber || msg.receiverPhone === phoneNumber
    );

    socket.emit('login success', {
      phoneNumber,
      history: userHistory,
      pigeonState: pigeonState[phoneNumber]
    });

    console.log(`📍 ${phoneNumber} giriş yaptı:`, userLocations[phoneNumber]);
  });

  // =========================
  // KONUM GÜNCELLEME
  // =========================
  socket.on('update location', (data) => {
    const phoneNumber = socket.phoneNumber;
    if (!phoneNumber) return;

    const { latitude, longitude } = data;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') return;

    userLocations[phoneNumber] = { latitude, longitude };
  });

  // =========================
  // GÜVERCİN GÖNDER
  // =========================
  socket.on('send pigeon', (data) => {
    const { senderPhone, receiverPhone, message } = data;

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
      receiverPhone,
      message,
      distance: distance.toFixed(2),
      time: timestamp,
      status: 'teslim edildi'
    };

    // Mesajı JSON dosyasına yaz
    saveMessage(newMsg);

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

    console.log(`✅ Mesaj kaydedildi ve teslim edildi: ${senderPhone} → ${receiverPhone}`);
  });

  socket.on('disconnect', () => {
    if (socket.phoneNumber) {
      delete users[socket.phoneNumber];
      console.log(`🔴 ${socket.phoneNumber} bağlantıyı kesti`);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🕊️ Güvercin Sunucusu Hazır: ${PORT}`);
});