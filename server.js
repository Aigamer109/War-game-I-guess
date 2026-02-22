const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// Rooms object
let rooms = {};

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  // Store the player's socket id
  socket.emit("myId", socket.id);

  // CREATE ROOM
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
  });

  // JOIN ROOM
  socket.on("joinRoom", (code) => {
    if (!rooms[code]) {
      socket.emit("errorMessage", "Room not found.");
      return;
    }

    const room = rooms[code];

    // Prevent duplicate joins
    if (!room.players.includes(socket.id)) {
      room.players.push(socket.id);
      socket.join(code);
    }

    io.to(code).emit("updatePlayers", room.players);
  });

  // END TURN
  socket.on("endTurn", (code) => {
    const room = rooms[code];
    if (!room) return;

    // only allow the current player to end turn
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
      turnIndex: room.turn,
      players: room.players
    });
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
    // remove from any rooms
    for (let code in rooms) {
      const idx = rooms[code].players.indexOf(socket.id);
      if (idx !== -1) {
        rooms[code].players.splice(idx, 1);
        io.to(code).emit("updatePlayers", rooms[code].players);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
