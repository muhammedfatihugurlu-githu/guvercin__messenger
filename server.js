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

// ===============================
// FIREBASE
// ===============================

const FIREBASE_DATABASE_URL =
    "https://guvercin-chat-8d21e-default-rtdb.firebaseio.com";

const FIREBASE_NAMES_URL =
    `${FIREBASE_DATABASE_URL}/names.json`;

const FIREBASE_HIGHSCORES_URL =
    `${FIREBASE_DATABASE_URL}/highscores.json`;

const FIREBASE_EMPIRE_GAMES_URL =
    `${FIREBASE_DATABASE_URL}/gameStates`;

// ===============================
// FIREBASE YARDIMCI FONKSİYONLARI
// ===============================

async function firebaseGet(url) {
    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Firebase GET hatası: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Firebase GET hatası:", error);
        return null;
    }
}

async function firebasePut(url, data) {
    try {
        const response = await fetch(url, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`Firebase PUT hatası: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Firebase PUT hatası:", error);
        return null;
    }
}

// ===============================
// İSİM KAYDET / YÜKLE
// ===============================

async function getNameFromFirebase(phone) {
    const names = await firebaseGet(FIREBASE_NAMES_URL);

    if (!names || !names[phone]) {
        return null;
    }

    return names[phone];
}

async function saveNameToFirebase(phone, name) {
    if (!phone || !name) return;

    const url =
        `${FIREBASE_DATABASE_URL}/names/${encodeURIComponent(phone)}.json`;

    await firebasePut(url, name);
}

// ===============================
// SKOR KAYDET / YÜKLE
// ===============================

async function getHighScoreFromFirebase(phone) {
    const scores = await firebaseGet(FIREBASE_HIGHSCORES_URL);

    if (!scores || !scores[phone]) {
        return 0;
    }

    return Number(scores[phone]) || 0;
}

async function saveHighScoreToFirebase(phone, score) {
    if (!phone) return;

    const url =
        `${FIREBASE_DATABASE_URL}/highscores/${encodeURIComponent(phone)}.json`;

    await firebasePut(url, Number(score) || 0);
}

// ===============================
// GÜVERCİN İMPARATORLUĞU
// ===============================

async function loadEmpireGameFromFirebase(phone) {
    if (!phone) return null;

    const url =
        `${FIREBASE_EMPIRE_GAMES_URL}/${encodeURIComponent(phone)}.json`;

    return await firebaseGet(url);
}

async function saveEmpireGameToFirebase(phone, state) {
    if (!phone || !state) return false;

    const safeState = {
        money: Math.max(0, Number(state.money) || 0),

        totalEarned:
            Math.max(0, Number(state.totalEarned) || 0),

        level:
            Math.max(1, Math.floor(Number(state.level) || 1)),

        upgrades: {
            bag: {
                count:
                    Math.max(
                        0,
                        Math.floor(
                            Number(
                                state.upgrades?.bag?.count
                            ) || 0
                        )
                    ),

                tier:
                    Math.max(
                        1,
                        Math.floor(
                            Number(
                                state.upgrades?.bag?.tier
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
                                state.upgrades?.bird?.count
                            ) || 0
                        )
                    ),

                tier:
                    Math.max(
                        1,
                        Math.floor(
                            Number(
                                state.upgrades?.bird?.tier
                            ) || 1
                        )
                    )
            }
        },

        updatedAt: Date.now()
    };

    const url =
        `${FIREBASE_EMPIRE_GAMES_URL}/${encodeURIComponent(phone)}.json`;

    const result = await firebasePut(url, safeState);

    return result !== null;
}

// ===============================
// MESAFE HESAPLAMA
// ===============================

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;

    const dLat =
        (lat2 - lat1) * Math.PI / 180;

    const dLon =
        (lon2 - lon1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) *
        Math.sin(dLat / 2) +

        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *

        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return R * c;
}

// ===============================
// SOCKET.IO
// ===============================

io.on('connection', (socket) => {

    console.log("Yeni bağlantı:", socket.id);

    // ===============================
    // LOGIN
    // ===============================

    socket.on('login', async (data) => {

        try {

            const phoneNumber =
                String(data?.phoneNumber || "").trim();

            const latitude =
                Number(data?.latitude);

            const longitude =
                Number(data?.longitude);

            if (!/^05[0-9]{9}$/.test(phoneNumber)) {

                socket.emit("login error", {
                    message:
                        "Geçerli bir telefon numarası gir."
                });

                return;
            }

            users[socket.id] = {
                phoneNumber,
                latitude,
                longitude
            };

            userLocations[phoneNumber] = {
                latitude,
                longitude
            };

            // Firebase'den bilgileri getir
            const [
                firebaseName,
                highScore,
                empireGameState
            ] = await Promise.all([

                getNameFromFirebase(phoneNumber),

                getHighScoreFromFirebase(phoneNumber),

                loadEmpireGameFromFirebase(phoneNumber)

            ]);

            const userName =
                firebaseName || "İsimsiz";

            users[socket.id].name = userName;

            socket.emit("login success", {

                phoneNumber,

                name: userName,

                highScore,

                empireGameState:
                    empireGameState || null

            });

            console.log(
                "Giriş başarılı:",
                phoneNumber
            );

        } catch (error) {

            console.error(
                "Login hatası:",
                error
            );

            socket.emit("login error", {
                message:
                    "Giriş sırasında hata oluştu."
            });
        }
    });

    // ===============================
    // İSİM KAYDET
    // ===============================

    socket.on('save name', async (data) => {

        try {

            const user =
                users[socket.id];

            if (!user) return;

            const name =
                String(data?.name || "").trim();

            if (!name) return;

            user.name = name;

            await saveNameToFirebase(
                user.phoneNumber,
                name
            );

            socket.emit("name saved", {
                name
            });

        } catch (error) {

            console.error(
                "İsim kaydetme hatası:",
                error
            );
        }
    });

    // ===============================
    // KONUM GÜNCELLE
    // ===============================

    socket.on('update location', (data) => {

        const user =
            users[socket.id];

        if (!user) return;

        const latitude =
            Number(data?.latitude);

        const longitude =
            Number(data?.longitude);

        if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude)
        ) {
            return;
        }

        user.latitude = latitude;
        user.longitude = longitude;

        userLocations[user.phoneNumber] = {
            latitude,
            longitude
        };

        socket.broadcast.emit(
            "user location updated",
            {
                phoneNumber:
                    user.phoneNumber,

                latitude,

                longitude
            }
        );
    });

    // ===============================
    // MESAJ GÖNDER
    // ===============================

    socket.on('send message', (data) => {

        const user =
            users[socket.id];

        if (!user) return;

        const receiver =
            String(data?.receiver || "").trim();

        const message =
            String(data?.message || "").trim();

        if (!receiver || !message) {
            return;
        }

        const messageData = {

            sender:
                user.phoneNumber,

            senderName:
                user.name || "İsimsiz",

            receiver,

            message,

            timestamp:
                Date.now()
        };

        messageHistory.push(
            messageData
        );

        // Göndericiye
        socket.emit(
            "message received",
            messageData
        );

        // Alıcıya
        for (const socketId in users) {

            if (
                users[socketId].phoneNumber ===
                receiver
            ) {

                io.to(socketId).emit(
                    "message received",
                    messageData
                );
            }
        }
    });

    // ===============================
    // YÜKSEK SKOR
    // ===============================

    socket.on('save high score', async (data) => {

        try {

            const user =
                users[socket.id];

            if (!user) return;

            const score =
                Math.max(
                    0,
                    Number(data?.score) || 0
                );

            const currentScore =
                await getHighScoreFromFirebase(
                    user.phoneNumber
                );

            if (score > currentScore) {

                await saveHighScoreToFirebase(
                    user.phoneNumber,
                    score
                );

                socket.emit(
                    "high score saved",
                    {
                        score
                    }
                );
            }

        } catch (error) {

            console.error(
                "Skor kaydetme hatası:",
                error
            );
        }
    });

    // ===============================
    // GÜVERCİN İMPARATORLUĞU KAYDET
    // ===============================

    socket.on(
        'save empire game',
        async (data) => {

            try {

                const user =
                    users[socket.id];

                if (!user) {

                    socket.emit(
                        "empire game saved",
                        {
                            success: false,
                            message:
                                "Giriş yapılmamış."
                        }
                    );

                    return;
                }

                const state =
                    data?.state;

                if (!state) {

                    socket.emit(
                        "empire game saved",
                        {
                            success: false,
                            message:
                                "Oyun verisi bulunamadı."
                        }
                    );

                    return;
                }

                const success =
                    await saveEmpireGameToFirebase(
                        user.phoneNumber,
                        state
                    );

                socket.emit(
                    "empire game saved",
                    {
                        success
                    }
                );

            } catch (error) {

                console.error(
                    "Güvercin İmparatorluğu kaydetme hatası:",
                    error
                );

                socket.emit(
                    "empire game saved",
                    {
                        success: false
                    }
                );
            }
        }
    );

    // ===============================
    // OYUN KAYDINI YÜKLE
    // ===============================

    socket.on(
        'load empire game',
        async () => {

            try {

                const user =
                    users[socket.id];

                if (!user) return;

                const state =
                    await loadEmpireGameFromFirebase(
                        user.phoneNumber
                    );

                socket.emit(
                    "empire game loaded",
                    {
                        state:
                            state || null
                    }
                );

            } catch (error) {

                console.error(
                    "Oyun yükleme hatası:",
                    error
                );
            }
        }
    );

    // ===============================
    // BAĞLANTI KESİLDİ
    // ===============================

    socket.on('disconnect', () => {

        const user =
            users[socket.id];

        if (user) {

            delete userLocations[
                user.phoneNumber
            ];

            console.log(
                "Kullanıcı ayrıldı:",
                user.phoneNumber
            );
        }

        delete users[socket.id];

        console.log(
            "Bağlantı kapandı:",
            socket.id
        );
    });

});

// ===============================
// SUNUCU
// ===============================

const PORT =
    process.env.PORT || 3001;

server.listen(
    PORT,
    () => {

        console.log(
            `Güvercin Messenger çalışıyor: ${PORT}`
        );

    }
);