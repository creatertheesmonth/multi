// --- DEINE RENDER URL (ANPASSEN!) ---
const SERVER_URL = 'https://multiplayer-server-3mkd.onrender.com'; 
const socket = io(SERVER_URL); 

// Elemente
const lobbyView = document.getElementById('lobby-view');
const gameView = document.getElementById('game-view');
const topicText = document.getElementById('topic-text');
const gameInput = document.getElementById('game-input');
const sendBtn = document.getElementById('send-btn');
const statusMsg = document.getElementById('status-msg');
const revealArea = document.getElementById('reveal-area');
const historyList = document.getElementById('history-list');
const lobbyMessage = document.getElementById('lobby-message');
const roomDisplay = document.getElementById('room-display');
const copyButton = document.getElementById('copy-room-btn'); 

let myUsername = "Spieler";
let currentRoomCode = null; 

// Countdown Variablen
const REVEAL_DURATION_S = 10; 
let countdownInterval = null;

// --- HILFSFUNKTIONEN ---

function copyRoomLink() {
    if (!currentRoomCode) return;
    
    const url = `${window.location.origin}?code=${currentRoomCode}`;
    
    navigator.clipboard.writeText(url).then(() => {
        alert("Raumlink und Code in die Zwischenablage kopiert! Der Link öffnet die Lobby direkt.");
        copyButton.innerText = "Link kopiert!";
        setTimeout(() => { copyButton.innerText = "Link kopieren"; }, 2000);
    }).catch(err => {
        console.error('Kopieren fehlgeschlagen:', err);
        alert(`Fehler beim Kopieren. Code: ${currentRoomCode}`);
    });
}

function startCountdown(duration) {
    let timeLeft = duration;
    
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    
    statusMsg.innerText = `Nächster Begriff in ${timeLeft} Sekunden...`;

    countdownInterval = setInterval(() => {
        timeLeft--;
        if (timeLeft > 0) {
            statusMsg.innerText = `Nächster Begriff in ${timeLeft} Sekunden...`;
        } else {
            clearInterval(countdownInterval);
            statusMsg.innerText = "Nächster Begriff wird geladen..."; 
        }
    }, 1000);
}

// --- LOBBY LOGIK ---

const urlParams = new URLSearchParams(window.location.search);
const initialCode = urlParams.get('code');
if (initialCode) {
    document.getElementById('room-input').value = initialCode;
    lobbyMessage.innerText = `Bereit, Raum ${initialCode} beizutreten. Name eingeben!`;
}

document.getElementById('create-btn').addEventListener('click', () => {
    myUsername = document.getElementById('username-input').value || "Host";
    if (myUsername.length < 2) { alert("Bitte gib einen Namen ein."); return; }
    
    socket.emit('createRoom', { username: myUsername });
    lobbyMessage.innerText = "Erstelle Raum...";
});

document.getElementById('join-btn').addEventListener('click', () => {
    myUsername = document.getElementById('username-input').value || "Gast";
    const code = document.getElementById('room-input').value.toUpperCase();
    
    if (myUsername.length < 2) { alert("Bitte gib einen Namen ein."); return; }
    if(code) {
        socket.emit('joinRoom', { code: code, username: myUsername });
        lobbyMessage.innerText = "Trete Raum " + code + " bei...";
    } else {
        lobbyMessage.innerText = "Code fehlt!";
    }
});

// --- SPIEL LOGIK ---
document.getElementById('send-btn').addEventListener('click', sendAnswer);

// *** KORREKTUR: Enter-Taste zum Senden in der Lobby und im Spiel (wenn Input aktiv) ***
document.addEventListener('keypress', (e) => { 
    if (e.key === 'Enter') {
        // 1. Wenn in der Lobby
        if (lobbyView.style.display !== 'none') {
            const activeElement = document.activeElement;
            if (activeElement === document.getElementById('room-input') || activeElement === document.getElementById('username-input')) {
                 // Füge standardmäßig zur Einfachheit bei Enter im Input-Feld bei
                 document.getElementById('join-btn').click();
            }
        }
        // 2. Wenn im Spiel und Input nicht disabled
        else if (gameView.style.display !== 'none' && !gameInput.disabled) {
            sendAnswer();
        }
    }
});

function sendAnswer() {
    const term = gameInput.value.trim();
    if (term) {
        socket.emit('submitAnswer', term);
        gameInput.disabled = true;
        sendBtn.disabled = true;
        gameInput.value = "";
        statusMsg.innerText = "⏳ Du hast abgegeben. Warte auf Mitspieler..."; 
    }
}

// --- SERVER EVENTS ---

socket.on('roomCreated', (code) => {
    currentRoomCode = code;
    lobbyView.style.display = 'none';
    gameView.style.display = 'block';
    roomDisplay.innerText = "Raum: " + code;
    statusMsg.innerText = "Warte auf weitere Mitspieler...";
    lobbyMessage.innerText = "";
    copyButton.style.display = 'block'; 
    copyButton.addEventListener('click', copyRoomLink);
});

// KORREKTUR: Gast erhält jetzt auch Topic-Information
socket.on('roomJoined', (data) => {
    currentRoomCode = data.code;
    roomDisplay.innerText = "Raum: " + data.code;
    
    if (data.topic) {
        // Wenn eine Runde läuft, zeige den Begriff an
        topicText.innerText = data.topic;
    }
});

socket.on('gameStart', () => {
    lobbyView.style.display = 'none';
    gameView.style.display = 'block';
    lobbyMessage.innerText = "";
    if (copyButton) copyButton.style.display = 'block'; 
    if (!copyButton.onclick) copyButton.addEventListener('click', copyRoomLink);
});

socket.on('playerLeft', (data) => {
    alert(`${data.username} hat den Raum verlassen.`);
    statusMsg.innerText = `Spieler ${data.username} hat verlassen. Warte auf andere...`;
});

socket.on('gameStop', (msg) => {
    alert(msg);
    window.location.href = window.location.origin;
});


socket.on('waitingForOpponent', (data) => {
    const msg = data.count === 1 
        ? "Warte auf 1 weiteren Spieler..." 
        : `Warte auf ${data.count} weitere Spieler...`;
    statusMsg.innerText = "⏳ Du hast abgegeben. " + msg;
});

// Enthüllung
socket.on('roundReveal', (data) => {
    gameInput.style.display = 'none'; 
    sendBtn.style.display = 'none';   

    startCountdown(REVEAL_DURATION_S);
    
    revealArea.style.display = 'flex';
    revealArea.innerHTML = ''; 
    
    const historyTerms = [];
    
    data.answers.forEach(answer => {
        const item = document.createElement('div');
        item.className = 'reveal-item'; 
        item.innerHTML = `
            <div class="reveal-name">${answer.username}</div>
            <div class="reveal-term">${answer.term}</div>
        `;
        revealArea.appendChild(item);
        historyTerms.push(`${answer.username}: ${answer.term}`);
    });

    const entry = document.createElement('div');
    entry.className = 'history-entry';
    // KORREKTUR: Fügt HTML-Tags für die visuelle Hervorhebung hinzu (statt **), nutzt CSS dafür
    entry.innerHTML = `<span class="history-topic">Begriff: ${data.topic}</span> <span class="history-separator">|</span> ${historyTerms.join(' <span class="history-separator">|</span> ')}`;
    historyList.prepend(entry);
    
    if (historyList.children.length > 5) {
        historyList.removeChild(historyList.lastChild);
    }
});

// Neue Runde
socket.on('newRound', (data) => {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    
    gameInput.style.display = 'inline-block'; 
    sendBtn.style.display = 'inline-block';   
    
    revealArea.style.display = 'none'; 
    gameInput.disabled = false;
    sendBtn.disabled = false;
    gameInput.focus();
    gameInput.value = ""; 
    
    topicText.innerText = data.topic;
    statusMsg.innerText = "Gib deine Assoziation ein!";
});


socket.on('error', (msg) => {
    alert("Fehler: " + msg);
    lobbyMessage.innerText = msg;
    lobbyView.style.display = 'block'; 
    gameView.style.display = 'none';
    if (copyButton) copyButton.style.display = 'none';
});

socket.on('disconnect', () => {
    alert("Verbindung zum Server verloren!");
    window.location.href = window.location.origin;
});