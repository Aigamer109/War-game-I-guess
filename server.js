/* server.js */
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname + '/public'));

let lobbies = {};

function generateLobbyCode() {
    return Math.random().toString(36).substr(2, 5).toUpperCase();
}

io.on('connection', (socket) => {
    let currentLobby = null;

    socket.on('createLobby', (playerName) => {
        const code = generateLobbyCode();
        lobbies[code] = { 
            host: socket.id, 
            players: [{id: socket.id, name: playerName, type: 'human'}], 
            bots: [],
            started: false
        };
        socket.join(code);
        currentLobby = code;
        io.to(socket.id).emit('lobbyCreated', code);
        io.to(code).emit('updateLobby', lobbies[code]);
    });

    socket.on('joinLobby', (code, playerName) => {
        const lobby = lobbies[code];
        if (lobby && lobby.players.length + lobby.bots.length < 4 && !lobby.started) {
            lobby.players.push({id: socket.id, name: playerName, type: 'human'});
            socket.join(code);
            currentLobby = code;
            io.to(code).emit('updateLobby', lobby);
        } else {
            io.to(socket.id).emit('errorMessage', 'Cannot join lobby');
        }
    });

    socket.on('startGame', () => {
        const lobby = lobbies[currentLobby];
        if (lobby && socket.id === lobby.host && lobby.players.length >= 2) {
            while(lobby.players.length + lobby.bots.length < 4) {
                const botId = 'bot_' + Math.random().toString(36).substr(2, 5);
                lobby.bots.push({id: botId, name: 'Bot', type: 'bot'});
            }
            lobby.started = true;
            io.to(currentLobby).emit('gameStarted', lobby);
        }
    });

    socket.on('disconnect', () => {
        if(currentLobby){
            const lobby = lobbies[currentLobby];
            if(lobby){
                lobby.players = lobby.players.filter(p => p.id !== socket.id);
                if(lobby.players.length === 0) delete lobbies[currentLobby];
                else io.to(currentLobby).emit('updateLobby', lobby);
            }
        }
    });
});

http.listen(3000, () => console.log('Server running on port 3000'));
