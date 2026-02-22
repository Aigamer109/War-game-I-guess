const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static("public"));

let rooms = {};

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  socket.on("createRoom", () => {
    const code = generateRoomCode();
    rooms[code] = {
      players: [],
      turn: 0,
      cycleCount: 0
    };

    socket.join(code);
    rooms[code].players.push(socket.id);

    socket.emit("roomCreated", code);
    io.to(code).emit("updatePlayers", rooms[code].players);
    console.log(`Room ${code} created by ${socket.id}`);
  });

  socket.on("joinRoom", (code) => {
    if (!rooms[code]) {
      socket.emit("errorMessage", "Room not found.");
      return;
    }

    if (!rooms[code].players.includes(socket.id)) {
      socket.join(code);
      rooms[code].players.push(socket.id);
      io.to(code).emit("updatePlayers", rooms[code].players);
      console.log(`${socket.id} joined room ${code}`);
    } else {
      socket.emit("errorMessage", "You are already in this room!");
    }
  });

  socket.on("endTurn", (code) => {
    if (!rooms[code]) return;

    const room = rooms[code];
    if (socket.id !== room.players[room.turn]) {
      socket.emit("errorMessage", "Not your turn!");
      return;
    }

    room.turn++;

    if (room.turn >= room.players.length) {
      room.turn = 0;
      room.cycleCount++;

      if (room.cycleCount >= 4) {
        io.to(code).emit("worldPeaceVote");
        room.cycleCount = 0;
      }
    }

    io.to(code).emit("turnUpdate", {
      turnSocketId: room.players[room.turn],
      turnIndex: room.turn,
      players: room.players
    });
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
    // Remove from any rooms
    for (let code in rooms) {
      let index = rooms[code].players.indexOf(socket.id);
      if (index !== -1) {
        rooms[code].players.splice(index, 1);
        io.to(code).emit("updatePlayers", rooms[code].players);
      }
    }
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});
