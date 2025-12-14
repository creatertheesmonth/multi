const socket = io(); // Verbindet sich automatisch mit dem Host und Port (z.B. :7000)
const appContainer = document.getElementById('app');
const messageArea = document.getElementById('message-area');
const form = document.getElementById('term-form');
const input = document.getElementById('term-input');
const codeInput = document.getElementById('code-input');
const usernameInput = document.getElementById('username-input');

let currentRoomCode = '';

// --- UI / Navigation ---

function renderWelcome() {
    appContainer.innerHTML = `
        <h2>Assosiation Duell</h2>
        <div class="input-group">
            <input type="text" id="start-username" placeholder="Dein Name" maxlength="15" required value="Spieler-${Math.floor(Math.random() * 100)}">
            <button onclick="createRoom()">Raum erstellen</button>
        </div>
        <div class="input-group">
            <input type="text" id="join-code" placeholder="Raum Code (ABCD)" maxlength="4">
            <button onclick="joinRoom()">Beitreten</button>
        </div>
        <p class="small-info">Maximal 8 Spieler. Spiel startet bei 2 Spielern.</p>
    `;
    // Stellt sicher, dass das Formular bei jedem Neuladen verfügbar ist
    form.onsubmit = (e) => { e.preventDefault(); }; 
}

function renderLobby(code, players = [], topic = null) {
    const playerListHtml = players.map(p => `<li>${p.username} (${p.id === socket.id ? 'DU' : 'Gast'})</li>`).join('');
    
    appContainer.innerHTML = `
        <h2>Warteraum: ${code}</h2>
        <p>Der Host entscheidet, wann es losgeht.</p>
        <div class="player-list-container">
            <h3>Spieler (${players.length}/8):</h3>
            <ul id="player-list">${playerListHtml}</ul>
        </div>
        <p class="small-info">Teile den Code: <strong>${code}</strong></p>
    `;
    if (topic) {
         renderGame(topic); // Wenn die Runde bereits läuft, direkt zum Spiel wechseln
    }
}

function renderGame(topic) {
    appContainer.innerHTML = `
        <h2>Thema: ${topic}</h2>
        <p id="game-status">Gib deinen assoziierten Begriff ein:</p>
        <form id="term-form">
            <input type="text" id="term-input" placeholder="Dein Begriff" maxlength="30" required>
            <button type="submit">Senden</button>
        </form>
    `;
    
    // Formular-Listener neu setzen
    const currentForm = document.getElementById('term-form');
    if (currentForm) {
        currentForm.onsubmit = handleTermSubmit;
    }
    document.getElementById('term-input').focus();
}

function renderReveal(data) {
    const topic = data.topic;
    const answers = data.answers;
    
    let answerListHtml = answers.map(item => 
        `<li class="reveal-item"><strong>${item.username}:</strong> ${item.term}</li>`
    ).join('');

    appContainer.innerHTML = `
        <h2 class="reveal-header">✨ AUFLÖSUNG: ${topic} ✨</h2>
        <ul class="reveal-list">${answerListHtml}</ul>
        <p class="small-info">Neue Runde startet in 10 Sekunden...</p>
    `;
}

function displayMessage(message, type = 'info') {
    const msgElement = document.createElement('div');
    msgElement.className = `message ${type}`;
    msgElement.textContent = message;
    
    // Fügt die Nachricht oben ein
    messageArea.insertBefore(msgElement, messageArea.firstChild); 
    
    setTimeout(() => {
        msgElement.classList.add('fade-out');
        msgElement.addEventListener('transitionend', () => msgElement.remove());
    }, 5000);
}

// --- Handler ---

function createRoom() {
    const username = document.getElementById('start-username').value;
    if (!username) return;
    
    socket.emit('createRoom', { username });
}

function joinRoom() {
    const code = document.getElementById('join-code').value;
    const username = document.getElementById('start-username').value;
    if (!code || !username) return;
    
    socket.emit('joinRoom', { code, username });
}

function handleTermSubmit(e) {
    e.preventDefault();
    const termInput = document.getElementById('term-input');
    const term = termInput.value.trim();
    
    if (term) {
        socket.emit('submitAnswer', term);
        termInput.value = '';
        document.getElementById('game-status').textContent = 'Warten auf die anderen Spieler...';
        termInput.disabled = true;
        document.querySelector('#term-form button').disabled = true;
    }
}

// --- Socket.IO Listener ---

socket.on('connect', () => {
    displayMessage('Verbunden mit dem Server.', 'success');
    // If we reconnect, check if we were in a room (simplification: not strictly necessary for this simple game, but good practice)
    if (currentRoomCode) {
         // Versuch, den Status neu zu synchronisieren
    }
});

socket.on('disconnect', () => {
    displayMessage('Verbindung zum Server unterbrochen.', 'error');
});

socket.on('error', (message) => {
    displayMessage(`Fehler: ${message}`, 'error');
});

socket.on('roomCreated', (code) => {
    currentRoomCode = code;
    displayMessage(`Raum ${code} erstellt!`, 'success');
    renderLobby(code, [{ id: socket.id, username: document.getElementById('start-username').value }]);
});

socket.on('roomJoined', (data) => {
    currentRoomCode = data.code;
    displayMessage(`Raum ${data.code} beigetreten.`, 'success');
    if (data.topic) {
        // Der Spieler tritt mitten in einer Runde bei
        renderGame(data.topic);
    } else {
        // Der Spieler tritt in der Lobby bei
        // Spielerliste wird später vom gameStart-Event gesendet
        renderLobby(data.code); 
    }
});

socket.on('gameStart', () => {
     // Dieses Event signalisiert, dass das Spiel gestartet wurde, aber 'newRound' liefert das Topic
     // Wir erwarten bald 'newRound'
     displayMessage('Das Spiel beginnt!', 'info');
});

socket.on('newRound', (data) => {
    // Hier bekommt jeder Spieler das Thema
    renderGame(data.topic);
});

socket.on('roundReveal', (data) => {
    renderReveal(data);
});

socket.on('waitingForOpponent', (data) => {
    const statusElement = document.getElementById('game-status');
    if (statusElement) {
        statusElement.textContent = `Warten auf ${data.count} weitere(n) Spieler...`;
    }
});

socket.on('playerLeft', (data) => {
    displayMessage(`Spieler ${data.username} hat den Raum verlassen.`, 'warning');
    // Nur in der Lobby ist es relevant, die Liste zu aktualisieren (simplifiziert)
    // Wenn das Spiel läuft, bleibt der Game Screen
});

socket.on('gameStop', (message) => {
    displayMessage(`Spiel gestoppt: ${message}`, 'error');
    currentRoomCode = '';
    renderWelcome(); // Zurück zum Startbildschirm
});

// Startet die App, wenn die Seite geladen ist
renderWelcome();
