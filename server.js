const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// =========================
// KALICI VERİTABANI BAĞLANTISI (MONGODB)
// =========================
const MONGO_URI = "mongodb+srv://muhammedfatihugurlu10_db_user:j50noxQfBA1wFBTH@cluster0.7zsiuor.mongodb.net/guvercinDB?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Veritabanına (MongoDB) bağlandı! Mesajlar Render kapansa da kalıcı kalacak.'))
  .catch(err => console.error('❌ Veritabanı bağlantı hatası:', err));

// Mesaj Şablonu (Sadece isimler ve veriler tutulur)
const MessageSchema = new mongoose.Schema({
  id: Number,
  senderName: String,
  receiverName: String,
  message: String,
  distance: String,
  time: String,
  status: String
});

const Message = mongoose.model('Message', MessageSchema);

// Anlık Oturum Bilgileri (RAM'de tutulur, sunucu yenilendiğinde resetlenir)
const users = {};
const userLocations = {};
const pigeonState = {};

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// SOCKET SÜREÇLERİ
io.on('connection', (socket) => {

  // =========================
  // KULLANICI GİRİŞİ (Sadece İsim + Konum)
  // =========================
  socket.on('login', async (data) => {
    const { username, latitude, longitude } = data;

    if (!username) return;

    users[username] = socket.id;
    socket.username = username;

    if (typeof latitude === 'number' && typeof longitude === 'number') {
      userLocations[username] = { latitude, longitude };
    }

    if (!pigeonState[username]) {
      pigeonState[username] = 'home';
    }

    try {
      // Kullanıcının geçmiş mesajlarını veritabanından çek
      const userHistory = await Message.find({
        $or: [{ senderName: username }, { receiverName: username }]
      });

      socket.emit('login success', {
        username,
        history: userHistory,
        pigeonState: pigeonState[username]
      });

      console.log(`📍 ${username} giriş yaptı:`, userLocations[username]);
    } catch (error) {
      console.error("Geçmiş mesajlar veritabanından çekilemedi:", error);
    }
  });

  // =========================
  // KONUM GÜNCELLEME
  // =========================
  socket.on('update location', (data) => {
    const username = socket.username;
    if (!username) return;

    const { latitude, longitude } = data;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') return;

    userLocations[username] = { latitude, longitude };
    console.log(`📍 ${username} konumunu güncelledi:`, latitude, longitude);
  });

  // =========================
  // GÜVERCİN GÖNDER (MESAJ)
  // =========================
  socket.on('send pigeon', async (data) => {
    const { senderName, receiverName, message } = data;

    const senderLocation = userLocations[senderName];
    const receiverLocation = userLocations[receiverName];

    if (!senderLocation) return socket.emit('pigeon error', { message: 'Senin konumun henüz alınamadı. Konum iznini açıp tekrar dene.' });
    if (!receiverLocation) return socket.emit('pigeon error', { message: 'Alıcının konumu henüz kayıtlı değil. Alıcının önce giriş yapması gerekiyor.' });
    if (pigeonState[senderName] === 'busy') return socket.emit('pigeon error', { message: 'Güvercinin şu an yolda! Teslimatı beklemelisin.' });

    pigeonState[senderName] = 'busy';

    const distance = calculateDistance(
      senderLocation.latitude, senderLocation.longitude,
      receiverLocation.latitude, receiverLocation.longitude
    );

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const newMsgData = {
      id: Date.now(),
      senderName,
      receiverName,
      message,
      distance: distance.toFixed(2),
      time: timestamp,
      status: 'teslim edildi'
    };

    try {
      // Veritabanına kalıcı olarak kaydet
      const newMsg = new Message(newMsgData);
      await newMsg.save();

      console.log(`🕊️ ${senderName} → ${receiverName} (Veritabanına Kaydedildi)`);

      socket.emit('pigeon status', {
        receiverName,
        distance: newMsgData.distance,
        flightTimeInSeconds: 0,
        messageData: newMsgData
      });

      const receiverSocketId = users[receiverName];
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('pigeon arrived', newMsgData);
      }

      pigeonState[senderName] = 'home';
      socket.emit('pigeon delivered', { message: 'Güvercin mesajı teslim etti ve tekrar hazır! 🕊️' });

    } catch (error) {
      console.error("Mesaj kaydetme hatası:", error);
    }
  });

  // =========================
  // BAĞLANTI KESİLDİ
  // =========================
  socket.on('disconnect', () => {
    if (socket.username) {
      delete users[socket.username];
      console.log(`🔴 ${socket.username} bağlantıyı kesti`);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🕊️ Güvercin Sunucusu Hazır: ${PORT}`);
});