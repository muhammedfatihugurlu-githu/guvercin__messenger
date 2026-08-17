const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const users = {};
const userLocations = {};
const messageHistory = [];
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
socketLogin();

function socketLogin() {
  io.on('connection', (socket) => {

    socket.on('login', (data) => {

      const {
        phoneNumber,
        latitude,
        longitude
      } = data;

      // Kullanıcıyı kaydet
      users[phoneNumber] = socket.id;
      socket.phoneNumber = phoneNumber;

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

      // Kullanıcının mesaj geçmişi
      const userHistory = messageHistory.filter(
        (m) =>
          m.senderPhone === phoneNumber ||
          m.receiverPhone === phoneNumber
      );

      socket.emit('login success', {
        phoneNumber,
        history: userHistory,
        pigeonState: pigeonState[phoneNumber]
      });

      console.log(
        `📍 ${phoneNumber} giriş yaptı:`,
        userLocations[phoneNumber]
      );
    });


    // KULLANICI KONUMU GÜNCELLEDİ
    socket.on('update location', (data) => {

      const phoneNumber = socket.phoneNumber;

      if (!phoneNumber) return;

      const {
        latitude,
        longitude
      } = data;

      if (
        typeof latitude !== 'number' ||
        typeof longitude !== 'number'
      ) {
        return;
      }

      userLocations[phoneNumber] = {
        latitude,
        longitude
      };

      console.log(
        `📍 ${phoneNumber} konumunu güncelledi:`,
        latitude,
        longitude
      );
    });


    // GÜVERCİN GÖNDER
    socket.on('send pigeon', (data) => {

      const {
        senderPhone,
        receiverPhone,
        message
      } = data;

      // Gönderenin konumu
      const senderLocation =
        userLocations[senderPhone];

      // Alıcının konumu
      const receiverLocation =
        userLocations[receiverPhone];


      // Gönderenin konumu yoksa
      if (!senderLocation) {

        return socket.emit('pigeon error', {
          message:
            'Senin konumun henüz alınamadı. Konum iznini açıp tekrar dene.'
        });

      }


      // Alıcının konumu yoksa
      if (!receiverLocation) {

        return socket.emit('pigeon error', {
          message:
            'Alıcının konumu henüz kayıtlı değil. Alıcının Messenger’a giriş yapması gerekiyor.'
        });

      }


      // Güvercin meşgul mü?
      if (pigeonState[senderPhone] === 'busy') {

        return socket.emit('pigeon error', {
          message:
            'Güvercinin şu an yolda! Teslimatı tamamlamasını beklemelisin.'
        });

      }


      pigeonState[senderPhone] = 'busy';


      // GERÇEK MESAFE
      const distance = calculateDistance(
        senderLocation.latitude,
        senderLocation.longitude,

        receiverLocation.latitude,
        receiverLocation.longitude
      );


      const flightTimeInSeconds = Math.round(distance * 60);


      const timestamp =
        new Date().toLocaleTimeString(
          [],
          {
            hour: '2-digit',
            minute: '2-digit'
          }
        );


      const newMsg = {

        id: Date.now(),

        senderPhone,

        receiverPhone,

        message,

        distance:
          distance.toFixed(2),

        time:
          timestamp,

        status:
          'yolda'

      };


      messageHistory.push(newMsg);


      console.log(
        `🕊️ ${senderPhone} → ${receiverPhone}`
      );

      console.log(
        `📍 Mesafe: ${distance.toFixed(2)} km`
      );

      console.log(
        `⏱️ Uçuş: ${flightTimeInSeconds} saniye`
      );


      // GÖNDERENE GÜVERCİNİN ÇIKTIĞINI BİLDİR
      socket.emit(
        'pigeon status',
        {

          receiverPhone,

          distance:
            newMsg.distance,

          flightTimeInSeconds,

          messageData:
            newMsg

        }
      );


      // UÇUŞ
      setTimeout(() => {

        newMsg.status =
          'teslim edildi';


        pigeonState[senderPhone] =
          'home';


        // Alıcı çevrimiçiyse mesajı gönder
        const receiverSocketId =
          users[receiverPhone];


        if (receiverSocketId) {

          io.to(receiverSocketId).emit(
            'pigeon arrived',
            newMsg
          );

        }


        // Gönderene bilgi
        socket.emit(
          'pigeon delivered',
          {

            message:
              'Güvercin mesajı teslim etti ve tekrar hazır! 🕊️'

          }
        );


        console.log(
          `✅ Mesaj teslim edildi: ${senderPhone} → ${receiverPhone}`
        );

      }, flightTimeInSeconds * 1000);

    });


    // BAĞLANTI KESİLDİ
    socket.on('disconnect', () => {

      if (socket.phoneNumber) {

        delete users[
          socket.phoneNumber
        ];

        console.log(
          `🔴 ${socket.phoneNumber} bağlantıyı kesti`
        );

      }

    });

  });
}

const PORT = process.env.PORT || 3001;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🕊️ Güvercin Sunucusu Hazır: ${PORT}`);
});