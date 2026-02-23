const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const lobbies = {};

/* =============================
   TERRITORY GENERATION
============================= */

function generateMap() {
    const territories = {};
    const size = 50;

    for (let i = 0; i < size; i++) {
        territories[i] = {
            id: i,
            owner: null,
            resources: Math.floor(Math.random() * 10) + 1,
            economy: Math.floor(Math.random() * 100),
            bases: 0,
            center: {
                x: Math.random() * 1000,
                y: Math.random() * 600
            },
            neighbors: []
        };
    }

    // simple neighbor linking
    for (let i = 0; i < size; i++) {
        for (let j = i + 1; j < size; j++) {
            if (Math.random() < 0.05) {
                territories[i].neighbors.push(j);
                territories[j].neighbors.push(i);
            }
        }
    }

    return territories;
}

/* =============================
   LOBBY
============================= */

function createLobby(socket, name) {
    const id = uuidv4().slice(0, 6);

    lobbies[id] = {
        id,
        players: {},
        territories: generateMap(),
        airUnits: [],
        explosions: []
    };

    lobbies[id].players[socket.id] = {
        name,
        resources: 5000,
        money: 2000
    };

    socket.join(id);
    return id;
}

/* =============================
   NUKE SYSTEM
============================= */

function isWithinRange(lobby, playerId, targetId) {
    const visited = new Set();
    const queue = [];

    Object.values(lobby.territories)
        .filter(t => t.owner === playerId)
        .forEach(t => {
            queue.push({ id: t.id, depth: 0 });
            visited.add(t.id);
        });

    while (queue.length) {
        const { id, depth } = queue.shift();
        if (id === targetId && depth <= 3) return true;
        if (depth >= 3) continue;

        lobby.territories[id].neighbors.forEach(n => {
            if (!visited.has(n)) {
                visited.add(n);
                queue.push({ id: n, depth: depth + 1 });
            }
        });
    }

    return false;
}

function explodeTerritory(lobby, territoryId) {
    const territory = lobby.territories[territoryId];

    territory.owner = null;
    territory.bases = 0;
    territory.resources = 0;

    lobby.explosions.push({
        x: territory.center.x,
        y: territory.center.y,
        radius: 10,
        maxRadius: 200
    });
}

/* =============================
   GAME LOOP
============================= */

setInterval(() => {
    Object.values(lobbies).forEach(lobby => {

        // resource generation
        Object.entries(lobby.players).forEach(([id, player]) => {
            const owned = Object.values(lobby.territories)
                .filter(t => t.owner === id);

            owned.forEach(t => {
                player.resources += t.resources * 0.1;
                player.money += t.economy * 0.05;
            });
        });

        // explosions grow
        lobby.explosions.forEach(exp => {
            exp.radius += 4;
        });

        lobby.explosions = lobby.explosions.filter(e => e.radius < e.maxRadius);

        io.to(lobby.id).emit("gameState", lobby);
    });

}, 1000 / 30);

/* =============================
   SOCKET EVENTS
============================= */

io.on("connection", socket => {

    socket.on("hostLobby", name => {
        const id = createLobby(socket, name);
        socket.emit("lobbyCreated", id);
    });

    socket.on("joinLobby", ({ lobbyId, name }) => {
        const lobby = lobbies[lobbyId];
        if (!lobby) return;

        lobby.players[socket.id] = {
            name,
            resources: 5000,
            money: 2000
        };

        socket.join(lobbyId);
        socket.emit("joinedLobby", lobbyId);
    });

    socket.on("claimTerritory", ({ lobbyId, territoryId }) => {
        const lobby = lobbies[lobbyId];
        const territory = lobby.territories[territoryId];

        if (!territory.owner) {
            territory.owner = socket.id;
        }
    });

    socket.on("launchNuke", ({ lobbyId, territoryId }) => {
        const lobby = lobbies[lobbyId];
        const player = lobby.players[socket.id];

        if (player.resources < 3000 || player.money < 1000) return;
        if (!isWithinRange(lobby, socket.id, territoryId)) return;

        player.resources -= 3000;
        player.money -= 1000;

        explodeTerritory(lobby, territoryId);
    });

    socket.on("disconnect", () => {
        Object.values(lobbies).forEach(lobby => {
            delete lobby.players[socket.id];
        });
    });

});

server.listen(3000, () => {
    console.log("Server running on port 3000");
});
