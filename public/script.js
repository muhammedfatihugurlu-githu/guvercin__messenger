// Güvercin/Tıklama butonunun ID'si (Kendi HTML'indeki ID ile değiştir):
const empireClickBtn = document.getElementById('empire-click-btn'); 

let isPunished = false;
let empireWarningInterval = null;

// 1. BUTONA TIKLANDIĞINDA: Doğrudan parayı artırma, sunucuya gönder!
if (empireClickBtn) {
    empireClickBtn.addEventListener('click', () => {
        if (isPunished) return; // Cezalıysa tıklama çalışmaz
        socket.emit('click empire');
    });
}

// 2. SUNUCU TIKLAMAYI ONAYLARSA: Parayı burada artır
socket.on('empire click approved', () => {
    if (isPunished) return;

    // Kendi oyundaki para artırma mantığını buraya koy:
    gameState.money += getClickPower(); 
    updateEmpireUI(); // Arayüzü güncelle
});

// 3. SUNUCUDAN CEZA GELİRSE: Oyunu kilitle ve ekrana uyarıyı bas
socket.on('empire error', (data) => {
    applyEmpirePunishment(data.message, data.remainingTime);
});

function applyEmpirePunishment(message, seconds) {
    isPunished = true;

    // Tıklama butonunu pasifleştir
    if (empireClickBtn) {
        empireClickBtn.disabled = true;
        empireClickBtn.style.opacity = '0.4';
        empireClickBtn.style.cursor = 'not-allowed';
    }

    // Ceza Kutusunu Ekrana Ekle
    let box = document.getElementById('empire-punishment-box');
    if (!box) {
        box = document.createElement('div');
        box.id = 'empire-punishment-box';
        box.style.cssText = "position:fixed; top:30px; left:50%; transform:translateX(-50%); background:#ff0033; color:white; padding:20px 30px; border-radius:12px; font-weight:bold; font-size:18px; z-index:999999; text-align:center; box-shadow:0 0 20px rgba(255,0,51,0.6); font-family:sans-serif;";
        document.body.appendChild(box);
    }

    let remaining = seconds;
    box.innerHTML = `🚫 CEZALANDIRILDIN!<br><span style="font-size:14px; font-weight:normal;">${message}</span><br><br>Kalan Süre: <span id="punish-timer" style="font-size:22px; color:#ffea00;">${remaining}</span> sn`;

    if (empireWarningInterval) clearInterval(empireWarningInterval);

    empireWarningInterval = setInterval(() => {
        remaining--;
        const timerEl = document.getElementById('punish-timer');
        if (timerEl) timerEl.innerText = remaining;

        if (remaining <= 0) {
            clearInterval(empireWarningInterval);
            isPunished = false;
            
            if (box) box.remove();
            
            // Butonu tekrar aktif et
            if (empireClickBtn) {
                empireClickBtn.disabled = false;
                empireClickBtn.style.opacity = '1';
                empireClickBtn.style.cursor = 'pointer';
            }
        }
    }, 1000);
}