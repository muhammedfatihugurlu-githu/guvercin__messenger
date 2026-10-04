// Socket bağlantısının tanımlı olduğunu varsayıyoruz
// const socket = io();

const empireClickBtn = document.getElementById('empire-click-btn'); 

let isEmpirePunished = false;
let empirePunishInterval = null;

// 1. BUTONA TIKLANDIĞINDA: Doğrudan parayı artırma, sunucuya onay isteği at!
if (empireClickBtn) {
    empireClickBtn.addEventListener('click', () => {
        if (isEmpirePunished) return;
        socket.emit('click empire');
    });
}

// 2. SUNUCU TIKLAMAYI ONAYLADINDA: Parayı artır ve UI güncelle
socket.on('empire click approved', () => {
    if (isEmpirePunished) return;

    // Oyundaki para artırma fonksiyonun/mantığın:
    if (typeof gameState !== 'undefined') {
        gameState.money += (typeof getClickPower === 'function' ? getClickPower() : 1);
        if (typeof updateEmpireUI === 'function') {
            updateEmpireUI();
        }
    }
});

// 3. CEZA GELDİĞİNDE: Oyunu kilitle ve uyarıyı başlat
socket.on('empire error', (data) => {
    startEmpirePunishment(data.message, data.remainingTime);
});

function startEmpirePunishment(message, seconds) {
    isEmpirePunished = true;

    // Butonu tıklanamaz yap
    if (empireClickBtn) {
        empireClickBtn.disabled = true;
        empireClickBtn.style.opacity = '0.3';
        empireClickBtn.style.cursor = 'not-allowed';
    }

    // Ceza Bildirim Kutusunu Oluştur / Güncelle
    let punishBox = document.getElementById('empire-punish-box');
    if (!punishBox) {
        punishBox = document.createElement('div');
        punishBox.id = 'empire-punish-box';
        punishBox.style.cssText = "position:fixed; top:20px; left:50%; transform:translateX(-50%); background:#d32f2f; color:white; padding:20px 30px; border-radius:12px; font-weight:bold; font-size:16px; z-index:999999; text-align:center; box-shadow:0 10px 25px rgba(0,0,0,0.5); font-family:sans-serif;";
        document.body.appendChild(punishBox);
    }

    let remaining = seconds;
    punishBox.innerHTML = `🚨 OTO-TIKLAYICI ALGILANDI!<br><span style="font-size:13px; font-weight:normal;">${message}</span><br><br>Kalan Ceza Süresi: <span id="punish-timer-val" style="font-size:22px; color:#ffeb3b;">${remaining}</span> sn`;

    if (empirePunishInterval) clearInterval(empirePunishInterval);

    empirePunishInterval = setInterval(() => {
        remaining--;
        const timerVal = document.getElementById('punish-timer-val');
        if (timerVal) timerVal.innerText = remaining;

        if (remaining <= 0) {
            clearInterval(empirePunishInterval);
            isEmpirePunished = false;
            
            if (punishBox) punishBox.remove();
            
            // Butonu tekrar aktif et
            if (empireClickBtn) {
                empireClickBtn.disabled = false;
                empireClickBtn.style.opacity = '1';
                empireClickBtn.style.cursor = 'pointer';
            }
        }
    }, 1000);
}