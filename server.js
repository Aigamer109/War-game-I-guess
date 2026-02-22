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
  });

  socket.on("joinRoom", (code) => {
    if (!rooms[code]) {
      socket.emit("errorMessage", "Room not found.");
      return;
    }

    socket.join(code);
    rooms[code].players.push(socket.id);

    io.to(code).emit("updatePlayers", rooms[code].players);
  });

  socket.on("endTurn", (code) => {
    if (!rooms[code]) return;

    rooms[code].turn++;

    if (rooms[code].turn >= rooms[code].players.length) {
      rooms[code].turn = 0;
      rooms[code].cycleCount++;

      if (rooms[code].cycleCount >= 4) {
        io.to(code).emit("worldPeaceVote");
        rooms[code].cycleCount = 0;
      }
    }

    io.to(code).emit("turnUpdate", rooms[code].turn);
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});
