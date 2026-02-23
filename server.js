const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const lobbies = {airUnits: [],
bombs: [],};

/* =============================
   TERRITORY GENERATION
============================= */

function generateMap() {
    const width = 1000;
    const height = 600;
    const count = 50;

    const points = [];
    const territories = {};

    // Generate random points
    for (let i = 0; i < count; i++) {
        points.push({
            id: i,
            x: Math.random() * width,
            y: Math.random() * height
        });
    }

    // Create territories
    points.forEach(p => {
        territories[p.id] = {
            id: p.id,
            owner: null,
            resources: Math.floor(Math.random() * 10) + 1,
            economy: Math.floor(Math.random() * 100),
            bases: 0,
            center: { x: p.x, y: p.y },
            polygon: [],
            neighbors: []
        };
    });

    // Assign polygon vertices (fake Voronoi style radial blob)
    points.forEach(p => {
        const verts = [];
        const sides = 6 + Math.floor(Math.random() * 4);
        const radius = 60 + Math.random() * 40;

        for (let i = 0; i < sides; i++) {
            const angle = (Math.PI * 2 / sides) * i;
            verts.push({
                x: p.x + Math.cos(angle) * radius,
                y: p.y + Math.sin(angle) * radius
            });
        }

        territories[p.id].polygon = verts;
    });

    // Neighbor detection (close centers)
    for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
            const dx = points[i].x - points[j].x;
            const dy = points[i].y - points[j].y;
            const dist = Math.sqrt(dx*dx + dy*dy);

            if (dist < 150) {
                territories[i].neighbors.push(j);
                territories[j].neighbors.push(i);
            }
        }
    }

    return territories;
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

}, 1000 / 30);
// AIR MOVEMENT
lobby.airUnits.forEach(unit => {

    if (unit.state === "takingoff") {
        unit.scale += 0.02;
        if (unit.scale >= 1) unit.state = "flying";
    }

    else if (unit.state === "flying") {
        const target = lobby.territories[unit.target];
        const dx = target.center.x - unit.x;
        const dy = target.center.y - unit.y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        if (dist < 10) {

            if (unit.type === "bomber" && unit.hasNuke) {
                lobby.bombs.push({
                    x: unit.x,
                    y: unit.y,
                    target: unit.target,
                    vy: 4
                });
                unit.hasNuke = false;
            }

            unit.state = "returning";
        } else {
            unit.x += (dx/dist) * (unit.speed/30);
            unit.y += (dy/dist) * (unit.speed/30);
        }
    }

    else if (unit.state === "returning") {
        const home = lobby.territories[unit.home];
        const dx = home.center.x - unit.x;
        const dy = home.center.y - unit.y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        if (dist < 10) unit.state = "landing";
        else {
            unit.x += (dx/dist) * (unit.speed/30);
            unit.y += (dy/dist) * (unit.speed/30);
        }
    }

    else if (unit.state === "landing") {
        unit.scale -= 0.02;
        if (unit.scale <= 0.2) unit.state = "idle";
    }
lobby.bombs.forEach(bomb => {
    bomb.y += bomb.vy;

    const territory = lobby.territories[bomb.target];

    if (bomb.y >= territory.center.y) {
        explodeTerritory(lobby, bomb.target);
        bomb.done = true;
    }

lobby.bombs = lobby.bombs.filter(b => !b.done);
});
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

    socket.on("launchNuke", ({ lobbyId, territoryId, fromTerritory }) => {

    const lobby = lobbies[lobbyId];
    const player = lobby.players[socket.id];

    if (!player) return;
    if (player.resources < 3000 || player.money < 1000) return;
    if (!isWithinRange(lobby, socket.id, territoryId)) return;

    player.resources -= 3000;
    player.money -= 1000;

    const start = lobby.territories[fromTerritory];

    const bomber = {
        id: uuidv4(),
        type: "bomber",
        owner: socket.id,
        x: start.center.x,
        y: start.center.y,
        home: fromTerritory,
        target: territoryId,
        state: "takingoff",
        scale: 0.2,
        speed: 25,
        hasNuke: true
    };

    lobby.airUnits.push(bomber);
});

server.listen(3000, () => {
    console.log("Server running on port 3000");
});
