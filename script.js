// --- Socket.IO Setup ---
const socket = io({
    path: '/socket.io/'
});

const appContainer = document.getElementById('app');
const messageArea = document.getElementById('message-area');

let currentRoomCode = '';

// --- UI / Navigation ---

function renderWelcome() {
    appContainer.innerHTML = `
        <h2>Assoziations-Duell</h2>
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
}

// Lobby anzeigen
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
        renderGame(topic);
    }
}

// Spielrunde anzeigen
function renderGame(topic) {
    appContainer.innerHTML = `
        <h2>Thema: ${topic}</h2>
        <p id="game-status">Gib deinen Begriff ein:</p>
        <form id="term-form">
            <input type="text" id="term-input" placeholder="Dein Begriff" maxlength="30" required>
            <button type="submit">Senden</button>
        </form>
    `;

    const currentForm = document.getElementById('term-form');
    currentForm.onsubmit = handleTermSubmit;
    document.getElementById('term-input').focus();
}

// Auflösung anzeigen
function renderReveal(data) {
    const topic = data.topic;
    const answers = data.answers;
    const answerListHtml = answers.map(a => `<li><strong>${a.username}:</strong> ${a.term}</li>`).join('');
    appContainer.innerHTML = `
        <h2>✨ AUFLÖSUNG: ${topic} ✨</h2>
        <ul>${answerListHtml}</ul>
        <p class="small-info">Neue Runde startet in 10 Sekunden...</p>
    `;
}

// Meldungen anzeigen
function displayMessage(message, type = 'info') {
    const msgElement = document.createElement('div');
    msgElement.className = `message ${type}`;
    msgElement.textContent = message;
    messageArea.insertBefore(msgElement, messageArea.firstChild);
    setTimeout(() => {
        msgElement.remove();
    }, 5000);
}

// --- Event Handler ---

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

socket.on('connect', () => displayMessage('Verbunden mit dem Server.', 'success'));
socket.on('disconnect', () => displayMessage('Verbindung unterbrochen.', 'error'));
socket.on('error', (msg) => displayMessage(`Fehler: ${msg}`, 'error'));

socket.on('roomCreated', (code) => {
    currentRoomCode = code;
    displayMessage(`Raum ${code} erstellt!`, 'success');
    renderLobby(code, [{ id: socket.id, username: document.getElementById('start-username').value }]);
});

socket.on('roomJoined', (data) => {
    currentRoomCode = data.code;
    displayMessage(`Raum ${data.code} beigetreten.`, 'success');
    if (data.topic) renderGame(data.topic);
    else renderLobby(data.code);
});

socket.on('gameStart', () => displayMessage('Das Spiel beginnt!', 'info'));
socket.on('newRound', (data) => renderGame(data.topic));
socket.on('roundReveal', (data) => renderReveal(data));
socket.on('waitingForOpponent', (data) => {
    const statusElement = document.getElementById('game-status');
    if (statusElement) statusElement.textContent = `Warten auf ${data.count} weitere Spieler...`;
});
socket.on('playerLeft', (data) => displayMessage(`Spieler ${data.username} hat den Raum verlassen.`, 'warning'));
socket.on('gameStop', (message) => {
    displayMessage(`Spiel gestoppt: ${message}`, 'error');
    currentRoomCode = '';
    renderWelcome();
});

// --- Start App ---
renderWelcome();
