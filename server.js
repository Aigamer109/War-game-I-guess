const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const MAX_PLAYERS = 4;
const COUNTRY_COUNT = 50;
let lobbies = {};

function generateCountries() {
  const countries = [];
  for (let i = 0; i < COUNTRY_COUNT; i++) {
    countries.push({
      id: i,
      name: `Country ${i + 1}`,
      owner: null,
      color: `hsl(${Math.random() * 360}, 50%, 50%)`,
      shape: generatePolygon(),
      stats: {
        air: Math.floor(Math.random() * 50) + 50,
        ground: Math.floor(Math.random() * 50) + 50,
        naval: Math.floor(Math.random() * 50) + 50,
        resources: Math.floor(Math.random() * 100) + 50,
      },
      units: { air: [], ground: [], sea: [] },
      coastal: Math.random() > 0.3, // 70% have coast
    });
  }
  return countries;
}

function generatePolygon() {
  const points = [];
  const sides = 5 + Math.floor(Math.random() * 4);
  const radius = 20 + Math.random() * 30;
  const centerX = Math.random() * 700 + 50;
  const centerY = Math.random() * 500 + 50;
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2;
    const x = centerX + radius * Math.cos(angle) + (Math.random() * 10 - 5);
    const y = centerY + radius * Math.sin(angle) + (Math.random() * 10 - 5);
    points.push({ x, y });
  }
  return points;
}

io.on("connection", (socket) => {
  console.log("a user connected", socket.id);

  socket.on("createLobby", ({ playerName }) => {
    const lobbyCode = Math.random().toString(36).substr(2, 5).toUpperCase();
    lobbies[lobbyCode] = {
      host: socket.id,
      started: false,
      players: [{ id: socket.id, name: playerName || "Player", isBot: false }],
      countries: generateCountries(),
      turnIndex: 0,
      wars: [],
    };
    socket.join(lobbyCode);
    socket.emit("lobbyCreated", { lobbyCode });
    io.to(lobbyCode).emit("updateLobby", lobbies[lobbyCode]);
  });

  socket.on("joinLobby", ({ lobbyCode, playerName }) => {
    const lobby = lobbies[lobbyCode];
    if (!lobby) return socket.emit("errorMsg", "Lobby not found.");
    if (lobby.started) return socket.emit("errorMsg", "Game already started.");
    if (lobby.players.find(p => p.id === socket.id)) return;
    if (lobby.players.filter(p => !p.isBot).length >= MAX_PLAYERS) return;
    
    lobby.players.push({ id: socket.id, name: playerName || "Player", isBot: false });
    socket.join(lobbyCode);
    io.to(lobbyCode).emit("updateLobby", lobby);
  });

  socket.on("startGame", ({ lobbyCode }) => {
    const lobby = lobbies[lobbyCode];
    if (!lobby) return;
    if (socket.id !== lobby.host) return;
    if (lobby.players.length < 2) return;
    lobby.started = true;

    // Fill bots
    while (lobby.players.length < MAX_PLAYERS) {
      lobby.players.push({ id: `bot_${Math.random()}`, name: `Bot`, isBot: true });
    }

    // Assign starting countries
    const unassigned = lobby.countries.filter(c => !c.owner);
    lobby.players.forEach((p, i) => {
      const country = unassigned.splice(Math.floor(Math.random() * unassigned.length), 1)[0];
      if (country) country.owner = p.id;
    });

    io.to(lobbyCode).emit("gameStarted", lobby);
  });

  socket.on("endTurn", ({ lobbyCode }) => {
    const lobby = lobbies[lobbyCode];
    if (!lobby) return;
    lobby.turnIndex = (lobby.turnIndex + 1) % lobby.players.length;

    // Bot actions
    lobby.players.forEach(p => {
      if (p.isBot) {
        // Randomly move resources/units/attack for demo purposes
      }
    });

    io.to(lobbyCode).emit("updateGame", lobby);
  });

  socket.on("disconnect", () => {
    for (const code in lobbies) {
      const lobby = lobbies[code];
      const index = lobby.players.findIndex(p => p.id === socket.id);
      if (index > -1) {
        lobby.players.splice(index, 1);
        io.to(code).emit("updateLobby", lobby);
      }
    }
    console.log("user disconnected", socket.id);
  });
});

server.listen(3000, () => {
  console.log("listening on *:3000");
});
