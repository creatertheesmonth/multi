const express = require('express');
const http = require('http');
const path = require('path'); // <- NEU: Importiere das 'path' Modul
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// NEU: Diese Zeile weist Express an, alle statischen Dateien (index.html, CSS, JS)
// aus dem Ordner, in dem server.js liegt, auszuliefern.
app.use(express.static(path.join(__dirname)));

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- KONSTANTEN ---
const PORT = process.env.PORT || 3000; 
const MAX_PLAYERS = 8; 
const REVEAL_DURATION_MS = 10000; 
const TOPICS = [
    "Lieblingseis", "Ein Haustier", "Pizzabelag", "Reiseziel", 
    "Superheld", "Automarke", "Eine Farbe", "Etwas Rundes", 
    "Ein Trennungsgrund", "Etwas im Kühlschrank", "Ein Hobby",
    "Eine App", "Etwas, das man im Urlaub vergisst"
];

const activeRooms = {}; 

function generateUniqueCode() {
    let code;
    do {
        code = Math.random().toString(36).substring(2, 6).toUpperCase();
    } while (activeRooms[code]);
    return code;
}

function startNewRound(roomCode) {
    const room = activeRooms[roomCode];
    if (!room || room.players.length < 2) { 
        if (room) {
             io.to(roomCode).emit('gameStop', 'Nicht genügend Spieler für eine neue Runde.');
        }
        return; 
    }

    const randomIndex = Math.floor(Math.random() * TOPICS.length);
    const newTopic = TOPICS[randomIndex];

    room.roundInputs = {}; 
    room.currentTopic = newTopic; 
    
    io.to(roomCode).emit('newRound', { topic: newTopic });
}

function updateWaitingStatus(roomCode) {
    const room = activeRooms[roomCode];
    if (!room) return;

    const answersCount = Object.keys(room.roundInputs).length;
    const playersCount = room.players.length;
    const remaining = playersCount - answersCount;
    
    room.players.forEach(player => {
        if (room.roundInputs[player.id]) {
            io.to(player.id).emit('waitingForOpponent', { count: remaining });
        }
    });
}

function checkRoundCompletion(roomCode) {
    const room = activeRooms[roomCode];
    if (!room) return;

    const answers = Object.values(room.roundInputs);
    
    if (answers.length === room.players.length) { 
        
        io.to(roomCode).emit('roundReveal', { 
            answers: answers,
            topic: room.currentTopic 
        });
        
        setTimeout(() => {
            startNewRound(roomCode);
        }, REVEAL_DURATION_MS); 
        return true;
    }
    return false;
}


io.on('connection', (socket) => {
    
    socket.on('createRoom', (data) => {
        try {
            const username = (data && data.username) ? data.username : "Host";
            const roomCode = generateUniqueCode();
            socket.join(roomCode);
            
            activeRooms[roomCode] = {
                players: [{ id: socket.id, username: username }],
                roundInputs: {},
                currentTopic: null
            };

            socket.emit('roomCreated', roomCode);
        } catch (e) {
            console.error("Fehler beim Erstellen:", e);
        }
    });

    socket.on('joinRoom', (data) => {
        try {
            let code = "", username = "Gast";
            if (typeof data === 'string') { code = data; } 
            else if (data && data.code) { code = data.code; username = data.username || "Gast"; }
            else { socket.emit('error', 'Fehlender Raum-Code.'); return; }

            code = code.toUpperCase();
            const room = activeRooms[code];
            
            if (!room) { socket.emit('error', 'Raum nicht gefunden.'); return; }
            if (room.players && room.players.length >= MAX_PLAYERS) { 
                socket.emit('error', `Raum ist voll (Max ${MAX_PLAYERS} Spieler).`); 
                return; 
            }

            socket.join(code);
            room.players.push({ id: socket.id, username: username });

            // Sendet den Code und das aktuelle Topic (falls vorhanden) an den neuen Spieler
            socket.emit('roomJoined', { code: code, topic: room.currentTopic }); 
            
            if (room.players.length >= 2) {
                io.to(code).emit('gameStart');
                
                // *** KORREKTUR: Neue Runde nur starten, wenn KEIN currentTopic läuft ***
                if (!room.currentTopic && Object.keys(room.roundInputs).length === 0) { 
                     startNewRound(code);
                } else if (room.currentTopic) {
                    // NEU: Wenn eine Runde läuft, senden wir den Begriff zurück
                    socket.emit('newRound', { topic: room.currentTopic });
                }
            }
        } catch (e) {
            console.error("Fehler beim Beitreten:", e);
            socket.emit('error', 'Serverfehler beim Beitreten.');
        }
    });

    socket.on('submitAnswer', (term) => {
        try {
            const roomCode = Array.from(socket.rooms).find(r => r !== socket.id);
            const room = activeRooms[roomCode];

            if (room) {
                const player = room.players.find(p => p.id === socket.id);
                if (!player || room.roundInputs[socket.id]) return; 

                room.roundInputs[socket.id] = { 
                    username: player.username, 
                    term: term 
                };
                
                updateWaitingStatus(roomCode); 
                checkRoundCompletion(roomCode); 
            }
        } catch (e) {
            console.error("Fehler bei Antwort:", e);
        }
    });

    // ... (disconnect bleibt gleich) ...
    socket.on('disconnect', () => {
        const roomCode = Array.from(socket.rooms).find(r => activeRooms[r]);
        const room = activeRooms[roomCode];

        if (room) {
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                const disconnectedPlayer = room.players[playerIndex].username;
                room.players.splice(playerIndex, 1);
                delete room.roundInputs[socket.id];
                
                const playerList = room.players.map(p => p.username);
                io.to(roomCode).emit('playerLeft', { username: disconnectedPlayer, players: playerList });

                if (room.players.length < 2) {
                    io.to(roomCode).emit('gameStop', 'Spiel beendet: Nicht genügend Spieler übrig.');
                    delete activeRooms[roomCode]; 
                    return;
                }
                
                if (checkRoundCompletion(roomCode)) {
                    // Runde wurde beendet
                } else {
                    updateWaitingStatus(roomCode);
                }
            }
        }
    });
});

server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
