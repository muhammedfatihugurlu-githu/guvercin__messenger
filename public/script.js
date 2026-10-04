const empireClickBtn = document.getElementById('empire-click-btn'); 

let isEmpirePunished = false;
let empirePunishInterval = null;

if (empireClickBtn) {
    empireClickBtn.addEventListener('click', (event) => {
        if (isEmpirePunished) return;

        // 1. GERÇEK İNSAN TIKLAMASI MI KONTROLÜ (En Kritik Nokta!)
        // Auto clicker programları genelde event.isTrusted = false üretir
        if (!event.isTrusted) {
            alert("Oto-tıklayıcı (Auto Clicker) tespit edildi!");
            startEmpirePunishment("Yapay tıklama algılandı!", 60);
            return;
        }

        // Koordinatları al (Auto Clicker'lar genelde 0,0 gönderir)
        const x = Math.round(event.clientX);
        const y = Math.round(event.clientY);

        if (x === 0 && y === 0) {
            startEmpirePunishment("Makro/Bot kullanımı tespit edildi!", 60);
            return;
        }

        // Sunucuya koordinat ve insan doğrulamasıyla gönder
        socket.emit('click empire', { x, y, trusted: event.isTrusted });
    });
}

// Sunucu onay verince parayı artır
socket.on('empire click approved', () => {
    if (isEmpirePunished) return;

    if (typeof gameState !== 'undefined') {
        gameState.money += (typeof getClickPower === 'function' ? getClickPower() : 1);
        if (typeof updateEmpireUI === 'function') {
            updateEmpireUI();
        }
    }
});

// Sunucudan ceza uyarısı gelince
socket.on('empire error', (data) => {
    startEmpirePunishment(data.message, data.remainingTime);
});

function startEmpirePunishment(message, seconds) {
    isEmpirePunished = true;

    if (empireClickBtn) {
        empireClickBtn.disabled = true;
        empireClickBtn.style.opacity = '0.3';
        empireClickBtn.style.cursor = 'not-allowed';
    }

    let punishBox = document.getElementById('empire-punish-box');
    if (!punishBox) {
        punishBox = document.createElement('div');
        punishBox.id = 'empire-punish-box';
        punishBox.style.cssText = "position:fixed; top:20px; left:50%; transform:translateX(-50%); background:#d32f2f; color:white; padding:20px 30px; border-radius:12px; font-weight:bold; font-size:16px; z-index:999999; text-align:center; box-shadow:0 10px 25px rgba(0,0,0,0.5); font-family:sans-serif;";
        document.body.appendChild(punishBox);
    }

    let remaining = seconds;
    punishBox.innerHTML = `🚨 AUTO CLICKER ENGELLENDİ!<br><span style="font-size:13px; font-weight:normal;">${message}</span><br><br>Kalan Ceza Süresi: <span id="punish-timer-val" style="font-size:22px; color:#ffeb3b;">${remaining}</span> sn`;

    if (empirePunishInterval) clearInterval(empirePunishInterval);

    empirePunishInterval = setInterval(() => {
        remaining--;
        const timerVal = document.getElementById('punish-timer-val');
        if (timerVal) timerVal.innerText = remaining;

        if (remaining <= 0) {
            clearInterval(empirePunishInterval);
            isEmpirePunished = false;
            
            if (punishBox) punishBox.remove();
            
            if (empireClickBtn) {
                empireClickBtn.disabled = false;
                empireClickBtn.style.opacity = '1';
                empireClickBtn.style.cursor = 'pointer';
            }
        }
    }, 1000);
}