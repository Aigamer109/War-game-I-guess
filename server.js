const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let rooms = {};
const MAX_PLAYERS = 4;

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);
  socket.emit("myId", socket.id);

  socket.on("createRoom", () => {
    const code = generateRoomCode();

    rooms[code] = {
      host: socket.id,
      players: [socket.id],
      turn: 0,
      cycleCount: 0,
      started: false
    };

    socket.join(code);
    socket.emit("roomCreated", code);
    io.to(code).emit("updatePlayers", rooms[code]);
  });

  socket.on("joinRoom", (code) => {
    if (!rooms[code]) {
      socket.emit("errorMessage", "Room not found.");
      return;
    }

    if (!rooms[code].players.includes(socket.id)) {
      rooms[code].players.push(socket.id);
    }

    socket.join(code);
    io.to(code).emit("updatePlayers", rooms[code]);
  });

  socket.on("startGame", (code) => {
    if (!rooms[code]) return;
    const room = rooms[code];

    if (socket.id !== room.host) {
      socket.emit("errorMessage", "Only the host can start the game!");
      return;
    }

    // Fill empty slots with AI players
    while (room.players.length < MAX_PLAYERS) {
      room.players.push("AI_" + (room.players.length + 1));
    }

    room.started = true;
    io.to(code).emit("gameStarted", room);
    io.to(code).emit("turnUpdate", { turnIndex: room.turn, players: room.players });
  });

  socket.on("endTurn", (code) => {
    if (!rooms[code]) return;
    const room = rooms[code];
    if (!room.started) return;

    room.turn++;
    if (room.turn >= room.players.length) {
      room.turn = 0;
      room.cycleCount++;

      if (room.cycleCount >= 4) {
        io.to(code).emit("worldPeaceVote");
        room.cycleCount = 0;
      }
    }

    io.to(code).emit("turnUpdate", { turnIndex: room.turn, players: room.players });
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
    for (let code in rooms) {
      const room = rooms[code];
      room.players = room.players.filter(p => p !== socket.id);

      if (room.host === socket.id && room.players.length > 0) {
        room.host = room.players[0]; // assign new host
      }

      if (room.players.length === 0) delete rooms[code];

      else io.to(code).emit("updatePlayers", room);
    }
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("Server running on port 3000");
});
