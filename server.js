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

async function loadMessages() {
  try {
    const response = await fetch(FIREBASE_MESSAGES_URL);
    if (!response.ok) return [];
    const data = await response.json();
    return data ? Object.values(data) : [];
  } catch (err) { return []; }
}

async function saveMessage(newMsg) {
  try {
    await fetch(FIREBASE_MESSAGES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newMsg)
    });
  } catch (err) {}
}

async function loadUserNamesFromFirebase() {
  try {
    const response = await fetch(FIREBASE_USERS_URL);
    if (!response.ok) return {};
    return (await response.json()) || {};
  } catch (err) { return {}; }
}

async function saveUserNameToFirebase(phone, name) {
  try {
    await fetch(`https://guvercin-chat-8d21e-default-rtdb.firebaseio.com/users/${phone}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(name)
    });
  } catch (err) {}
}

async function loadPasswordsFromFirebase() {
  try {
    const response = await fetch(FIREBASE_PASSWORDS_URL);
    if (!response.ok) return {};
    return (await response.json()) || {};
  } catch (err) { return {}; }
}

async function savePasswordToFirebase(phone, password) {
  try {
    await fetch(`https://guvercin-chat-8d21e-default-rtdb.firebaseio.com/passwords/${phone}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(password)
    });
  } catch (err) {}
}

async function loadHighScoresFromFirebase() {
  try {
    const response = await fetch(FIREBASE_HIGHSCORES_URL);
    if (!response.ok) return {};
    return (await response.json()) || {};
  } catch (err) { return {}; }
}

async function saveHighScoreToFirebase(phone, score) {
  try {
    await fetch(`https://guvercin-chat-8d21e-default-rtdb.firebaseio.com/highscores/${phone}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(score)
    });
  } catch (err) {}
}

async function loadEmpireGameFromFirebase(phone) {
  try {
    const response = await fetch(`${FIREBASE_EMPIRE_GAMES_URL}/${encodeURIComponent(phone)}.json`);
    if (!response.ok) return null;
    return await response.json();
  } catch (err) { return null; }
}

async function saveEmpireGameToFirebase(phone, state) {
  try {
    const safeState = {
      money: Math.max(0, Number(state?.money) || 0),
      totalEarned: Math.max(0, Number(state?.totalEarned) || 0),
      level: Math.max(1, Math.floor(Number(state?.level) || 1)),
      upgrades: {
        bag: {
          count: Math.max(0, Math.floor(Number(state?.upgrades?.bag?.count) || 0)),
          tier: Math.max(1, Math.floor(Number(state?.upgrades?.bag?.tier) || 1))
        },
        bird: {
          count: Math.max(0, Math.floor(Number(state?.upgrades?.bird?.count) || 0)),
          tier: Math.max(1, Math.floor(Number(state?.upgrades?.bird?.tier) || 1))
        }
      }
    };
    const response = await fetch(`${FIREBASE_EMPIRE_GAMES_URL}/${encodeURIComponent(phone)}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(safeState)
    });
    return response.ok;
  } catch (err) { return false; }
}

const userNames = {};
const userPasswords = {};
const pigeonState = {};

// Anti-Cheat Veri Yapıları
const userClickTimestamps = {};
const userPunishments = {};
const userLastClicks = {}; // Koordinat ve tekrar takibi

io.on('connection', (socket) => {

  socket.on('login', async (data) => {
    const { phoneNumber, password } = data;
    if (!phoneNumber || !password) return socket.emit('login error', { message: 'Telefon numarası ve şifre zorunludur!' });

    const firebasePasswords = await loadPasswordsFromFirebase();
    if (firebasePasswords[phoneNumber]) {
      if (firebasePasswords[phoneNumber] !== password) return socket.emit('login error', { message: 'Girdiğiniz şifre yanlış!' });
    } else {
      await savePasswordToFirebase(phoneNumber, password);
    }

    userPasswords[phoneNumber] = password;
    socket.phoneNumber = phoneNumber;
    socket.join(phoneNumber);

    const [firebaseNames, firebaseScores, empireGameState] = await Promise.all([
      loadUserNamesFromFirebase(),
      loadHighScoresFromFirebase(),
      loadEmpireGameFromFirebase(phoneNumber)
    ]);

    userNames[phoneNumber] = firebaseNames[phoneNumber] || phoneNumber;
    if (!pigeonState[phoneNumber]) pigeonState[phoneNumber] = 'home';

    const allMessages = await loadMessages();
    const userHistory = allMessages.filter(m => m.senderPhone === phoneNumber || m.receiverPhone === phoneNumber);

    socket.emit('login success', {
      phoneNumber,
      name: userNames[phoneNumber],
      userNamesMap: { ...firebaseNames, ...userNames },
      history: userHistory,
      pigeonState: pigeonState[phoneNumber],
      highScore: firebaseScores[phoneNumber] || 0,
      empireGameState: empireGameState || null
    });
  });

  socket.on('update name', async (data) => {
    const phoneNumber = socket.phoneNumber;
    if (!phoneNumber) return;
    userNames[phoneNumber] = data.name ? data.name.trim() : phoneNumber;
    await saveUserNameToFirebase(phoneNumber, userNames[phoneNumber]);
    io.emit('user name updated', { phoneNumber, name: userNames[phoneNumber] });
  });

  socket.on('change password', async (data) => {
    const phoneNumber = socket.phoneNumber;
    if (!phoneNumber) return;
    const { oldPassword, newPassword } = data;
    const firebasePasswords = await loadPasswordsFromFirebase();
    const currentPassword = firebasePasswords[phoneNumber] || userPasswords[phoneNumber];

    if (currentPassword && currentPassword !== oldPassword) {
      return socket.emit('password result', { success: false, message: 'Mevcut şifrenizi yanlış girdiniz!' });
    }
    const trimmedNewPass = newPassword ? newPassword.trim() : '';
    if (trimmedNewPass.length < 4 || trimmedNewPass.length > 12) {
      return socket.emit('password result', { success: false, message: 'Yeni şifreniz 4-12 karakter olmalıdır!' });
    }
    userPasswords[phoneNumber] = trimmedNewPass;
    await savePasswordToFirebase(phoneNumber, trimmedNewPass);
    socket.emit('password result', { success: true, message: 'Şifreniz değiştirildi! 🕊️' });
  });

  socket.on('update score', async (data) => {
    const phoneNumber = socket.phoneNumber;
    if (!phoneNumber) return;
    const newScore = parseInt(data.score, 10);
    if (isNaN(newScore) || newScore <= 0) return;

    const highScores = await loadHighScoresFromFirebase();
    if (newScore > (highScores[phoneNumber] || 0)) {
      await saveHighScoreToFirebase(phoneNumber, newScore);
      socket.emit('score updated', { highScore: newScore, message: 'Yeni rekor! 🏆' });
    }
  });

  socket.on('send pigeon', async (data) => {
    const { senderPhone, receiverPhone, message } = data;
    if (pigeonState[senderPhone] === 'busy') return socket.emit('pigeon error', { message: 'Güvercinin yolda!' });

    pigeonState[senderPhone] = 'busy';
    const timestamp = new Date().toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });

    const newMsg = {
      id: Date.now(),
      senderPhone,
      senderName: userNames[senderPhone] || senderPhone,
      receiverPhone,
      message,
      time: timestamp,
      status: 'teslim edildi'
    };

    await saveMessage(newMsg);
    socket.emit('pigeon status', { receiverPhone, flightTimeInSeconds: 0, messageData: newMsg });
    io.to(receiverPhone).emit('pigeon arrived', newMsg);
    pigeonState[senderPhone] = 'home';
    socket.emit('pigeon delivered', { message: 'Güvercin döndü! 🕊️' });
  });

  // --- GÜVERCİN İMPARATORLUĞU: KOORDİNAT VE HIZ TABANLI ANTI-CHEAT ---
  socket.on('click empire', (data) => {
    const phoneNumber = socket.phoneNumber;
    if (!phoneNumber) return;

    const now = Date.now();

    // 1. Cezalı mı kontrol et
    if (userPunishments[phoneNumber] && now < userPunishments[phoneNumber]) {
      const kalanSaniye = Math.ceil((userPunishments[phoneNumber] - now) / 1000);
      return socket.emit('empire error', { 
        message: 'Aşırı hızlı veya sabit noktaya tıkladın! Auto Clicker engellendi.', 
        remainingTime: kalanSaniye 
      });
    } else if (userPunishments[phoneNumber]) {
      delete userPunishments[phoneNumber];
    }

    const { x, y } = data || {};

    // 2. KOORDİNAT KONTROLÜ (Aynı noktaya art arda tıklama tespiti)
    if (typeof x === 'number' && typeof y === 'number') {
      const last = userLastClicks[phoneNumber] || { x: null, y: null, count: 0 };

      // Tam aynı piksele mi basıldı?
      if (last.x === x && last.y === y) {
        last.count += 1;
      } else {
        last.x = x;
        last.y = y;
        last.count = 1;
      }

      userLastClicks[phoneNumber] = last;

      // Eğer 5 kez üst üste milimetrik aynı noktaya basıldıysa auto-clicker'dır
      if (last.count >= 5) {
        userPunishments[phoneNumber] = now + 60000; // 1 Dakika Ceza
        delete userLastClicks[phoneNumber];
        return socket.emit('empire error', { 
          message: 'Sabit piksel tıklaması (Auto Clicker) tespit edildi! 1 dakika ceza aldın.', 
          remainingTime: 60 
        });
      }
    }

    // 3. CPS (HIZ) KONTROLÜ
    if (!userClickTimestamps[phoneNumber]) {
      userClickTimestamps[phoneNumber] = [];
    }

    userClickTimestamps[phoneNumber] = userClickTimestamps[phoneNumber].filter(t => now - t < 1000);

    if (userClickTimestamps[phoneNumber].length >= 15) {
      userPunishments[phoneNumber] = now + 60000;
      return socket.emit('empire error', { 
        message: 'Aşırı hızlı tıklama tespit edildi! 1 dakika ceza aldın.', 
        remainingTime: 60 
      });
    }

    userClickTimestamps[phoneNumber].push(now);
    socket.emit('empire click approved');
  });

  socket.on('save empire game', async (data) => {
    const phoneNumber = socket.phoneNumber;
    if (!phoneNumber || !data?.state) return;
    const success = await saveEmpireGameToFirebase(phoneNumber, data.state);
    socket.emit('empire game saved', { success, message: success ? 'Kaydedildi! 👑🕊️' : 'Kaydedilemedi.' });
  });

  socket.on('load empire game', async () => {
    const phoneNumber = socket.phoneNumber;
    if (!phoneNumber) return;
    const state = await loadEmpireGameFromFirebase(phoneNumber);
    socket.emit('empire game loaded', { state: state || null });
  });

  socket.on('disconnect', () => {
    if (socket.phoneNumber) {
      delete userClickTimestamps[socket.phoneNumber];
      delete userPunishments[socket.phoneNumber];
      delete userLastClicks[socket.phoneNumber];
    }
  });

});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🕊️ Güvercin Sunucusu Hazır: ${PORT}`);
});