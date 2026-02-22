const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let lobbies = {}; // lobbyID -> { players: [], hostId, gameStarted }

io.on("connection", (socket) => {
  socket.on("createLobby", ({ playerName }) => {
    const lobbyID = Math.random().toString(36).substr(2, 5);
    lobbies[lobbyID] = {
      players: [{ id: socket.id, name: playerName, isBot: false }],
      hostId: socket.id,
      gameStarted: false,
      currentTurn: 0,
      countries: [], // countries will be generated later
      wars: [], // ongoing wars
      resources: {}, // player resources
    };
    socket.join(lobbyID);
    socket.emit("lobbyCreated", { lobbyID });
    io.to(lobbyID).emit("updatePlayers", lobbies[lobbyID].players);
  });

  socket.on("joinLobby", ({ lobbyID, playerName }) => {
    const lobby = lobbies[lobbyID];
    if (!lobby || lobby.players.length >= 4 || lobby.gameStarted) return;
    if (lobby.players.find((p) => p.id === socket.id)) return; // prevent spamming
    lobby.players.push({ id: socket.id, name: playerName, isBot: false });
    socket.join(lobbyID);
    io.to(lobbyID).emit("updatePlayers", lobby.players);
  });

  socket.on("startGame", ({ lobbyID }) => {
    const lobby = lobbies[lobbyID];
    if (!lobby || socket.id !== lobby.hostId || lobby.players.length < 2) return;
    lobby.gameStarted = true;

    // fill bots
    const botNames = ["Bot Alpha", "Bot Bravo", "Bot Charlie", "Bot Delta"];
    while (lobby.players.length < 4) {
      const name = botNames.shift();
      lobby.players.push({ id: `bot_${name}`, name, isBot: true });
    }

    // initialize resources and countries
    lobby.players.forEach((p) => {
      lobby.resources[p.id] = { money: 100, units: { army: 10, navy: 5, air: 5 } };
    });

    // generate 50 countries
    lobby.countries = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      name: `Country ${i + 1}`,
      owner: null,
      stats: {
        air: Math.floor(Math.random() * 10) + 5,
        naval: Math.floor(Math.random() * 10) + 5,
        ground: Math.floor(Math.random() * 10) + 5,
        resources: Math.floor(Math.random() * 20) + 10,
      },
      position: { x: Math.random(), y: Math.random() },
      isLandLocked: Math.random() < 0.5,
    }));

    io.to(lobbyID).emit("gameStarted", {
      players: lobby.players,
      countries: lobby.countries,
      currentTurn: lobby.currentTurn,
      resources: lobby.resources,
    });
  });

  socket.on("endTurn", ({ lobbyID }) => {
    const lobby = lobbies[lobbyID];
    if (!lobby) return;
    lobby.currentTurn = (lobby.currentTurn + 1) % lobby.players.length;
    io.to(lobbyID).emit("updateTurn", lobby.currentTurn);

    // bot moves
    const player = lobby.players[lobby.currentTurn];
    if (player.isBot) {
      // simple bot logic: random attacks or resource allocation
      setTimeout(() => {
        io.to(lobbyID).emit("botAction", { botId: player.id });
        socket.emit("endTurn", { lobbyID }); // move to next turn
      }, 1000);
    }
  });

  socket.on("disconnect", () => {
    Object.keys(lobbies).forEach((lobbyID) => {
      const lobby = lobbies[lobbyID];
      const idx = lobby.players.findIndex((p) => p.id === socket.id);
      if (idx !== -1) {
        lobby.players.splice(idx, 1);
        io.to(lobbyID).emit("updatePlayers", lobby.players);
      }
      if (lobby.players.length === 0) delete lobbies[lobbyID];
    });
  });
});

server.listen(3000, () => console.log("Server running on port 3000"));
