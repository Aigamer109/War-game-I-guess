const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let rooms = {};

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function generateBots(room) {
  const maxPlayers = 4;
  while (room.players.length < maxPlayers) {
    const botId = `bot_${Math.random().toString(36).substring(2, 7)}`;
    room.players.push({ id: botId, name: `[Bot] ${botId}`, country: null });
  }
}

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  socket.on("createRoom", () => {
    const code = generateRoomCode();
    rooms[code] = {
      players: [{ id: socket.id, name: "Host", country: null }],
      host: socket.id,
      turnIndex: 0,
      started: false
    };
    socket.join(code);
    socket.emit("roomCreated", code);
    io.to(code).emit("updatePlayers", rooms[code].players);
  });

  socket.on("joinRoom", (code, name) => {
    const room = rooms[code];
    if (!room) {
      socket.emit("errorMessage", "Room not found.");
      return;
    }
    if (room.started) {
      socket.emit("errorMessage", "Game already started.");
      return;
    }
    room.players.push({ id: socket.id, name: name || `Player ${room.players.length+1}`, country: null });
    socket.join(code);
    io.to(code).emit("updatePlayers", room.players);
  });

  socket.on("startGame", (code) => {
    const room = rooms[code];
    if (!room) return;
    if (socket.id !== room.host) {
      socket.emit("errorMessage", "Only host can start.");
      return;
    }
    room.started = true;

    // Fill bots
    generateBots(room);

    // Assign random playable countries to all players
    const countries = ["USA","Russia","China","UK"];
    const shuffled = [...countries].sort(() => Math.random() - 0.5);
    room.players.forEach((p,i)=> p.country = shuffled[i] || null);

    io.to(code).emit("gameStarted", room.players);
  });

  socket.on("endTurn", (code) => {
    const room = rooms[code];
    if (!room || !room.started) return;

    const currentPlayer = room.players[room.turnIndex];
    if (currentPlayer.id !== socket.id && !currentPlayer.id.startsWith("bot_")) return;

    // Advance turn
    room.turnIndex = (room.turnIndex + 1) % room.players.length;
    io.to(code).emit("turnUpdate", room.turnIndex, room.players);
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});
