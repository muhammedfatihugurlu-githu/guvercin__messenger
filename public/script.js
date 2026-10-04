let empireMoney = 0;
let clickTimestamps = [];
let isPunished = false;
let punishTimerInterval = null;

function handlePigeonClick(event) {
    // 1. CEZALIYSA İŞLEM YAPMA
    if (isPunished) return;

    // 2. INSAN TIKLAMASI MI KONTROL ET (isTrusted)
    // Auto Clicker veya script ile yapılan tıklamalarda isTrusted = false döner.
    if (!event.isTrusted) {
        triggerPunishment("Yapay / Bot tıklama algılandı!");
        return;
    }

    // 3. SENTETİK / MAKRO KONTROLÜ (Koordinatlar 0,0 ise)
    if (event.clientX === 0 && event.clientY === 0) {
        triggerPunishment("Makro yazılımı tespit edildi!");
        return;
    }

    // 4. CPS (SANİYEDE TIKLAMA HIZI) KONTROLÜ
    const now = Date.now();
    clickTimestamps.push(now);

    // Son 1 saniye (1000 ms) dışındaki tıklama geçmişini temizle
    clickTimestamps = clickTimestamps.filter(t => now - t < 1000);

    // Saniyede 12 tıklamadan fazlasını yapıyorsa Auto Clicker kabul et
    if (clickTimestamps.length > 12) {
        triggerPunishment("Aşırı hızlı tıklama (Auto Clicker) tespit edildi!");
        return;
    }

    // 5. BAŞARILI TIKLAMA
    empireMoney += 1; // Tıklama başına kazanç
    document.getElementById('empire-money-text').innerText = empireMoney;

    // Butona küçük bir tıklama efekti ver
    const btn = document.getElementById('empire-click-btn');
    btn.style.transform = 'scale(0.95)';
    setTimeout(() => { btn.style.transform = 'scale(1)'; }, 50);

    // İsteğe bağlı: Sunucuna oyunu kaydetmek için socket isteği gönderebilirsin
    if (typeof socket !== 'undefined' && socket.connected) {
        socket.emit('save empire game', { state: { money: empireMoney } });
    }
}

// 1 DAKİKALIK CEZA MEKANİZMASI
function triggerPunishment(reason) {
    isPunished = true;
    clickTimestamps = [];

    const overlay = document.getElementById('empire-punish-overlay');
    const reasonText = document.getElementById('punish-reason-text');
    const timerDisplay = document.getElementById('punish-timer-display');
    const btn = document.getElementById('empire-click-btn');

    if (reasonText) reasonText.innerText = reason;
    if (overlay) overlay.style.display = 'flex';
    if (btn) btn.disabled = true;

    let remainingSeconds = 60;
    if (timerDisplay) timerDisplay.innerText = remainingSeconds;

    if (punishTimerInterval) clearInterval(punishTimerInterval);

    punishTimerInterval = setInterval(() => {
        remainingSeconds--;
        if (timerDisplay) timerDisplay.innerText = remainingSeconds;

        if (remainingSeconds <= 0) {
            clearInterval(punishTimerInterval);
            isPunished = false;
            if (overlay) overlay.style.display = 'none';
            if (btn) btn.disabled = false;
        }
    }, 1000);
}