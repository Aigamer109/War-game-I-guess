const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

const rooms = {}; // { roomCode: { players:[{id,name}], hostId: socketId, turn:0 } }

function generateRoomCode() {
  let code = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for(let i=0;i<4;i++) code += chars.charAt(Math.floor(Math.random()*chars.length));
  return code;
}

// Lobby creation
io.on("connection", (socket) => {

  socket.on("createRoom", (playerName) => {
    let code;
    do { code = generateRoomCode(); } while(rooms[code]);
    rooms[code] = { players:[{id:socket.id, name:playerName}], hostId: socket.id, turn:0 };
    socket.join(code);
    socket.emit("roomCreated", code);
    io.to(code).emit("updatePlayers", rooms[code].players, rooms[code].hostId);
  });

  socket.on("joinRoom", (code, playerName) => {
    if(!rooms[code]) { socket.emit("errorMessage","Room not found"); return; }
    if(rooms[code].players.length>=4){ socket.emit("errorMessage","Room full"); return; }

    rooms[code].players.push({id:socket.id, name:playerName});
    socket.join(code);
    io.to(code).emit("updatePlayers", rooms[code].players, rooms[code].hostId);
  });

  socket.on("startGame", (code) => {
    const room = rooms[code];
    if(!room) return;
    if(socket.id !== room.hostId){ socket.emit("errorMessage","Only host can start"); return; }
    if(room.players.length<2 || room.players.length>4){ socket.emit("errorMessage","Need 2–4 players to start"); return; }

    // Fill with bots if <4
    const botNames = ["[Bot1]","[Bot2]","[Bot3]"];
    let botIndex = 0;
    while(room.players.length<4){
      room.players.push({id:"bot"+botIndex, name:botNames[botIndex]});
      botIndex++;
    }

    io.to(code).emit("gameStarted", room.players);
  });

  socket.on("endTurn", (code) => {
    const room = rooms[code];
    if(!room) return;
    const currentPlayer = room.players[room.turn];
    if(currentPlayer.id !== socket.id) return; // only current player can end turn

    room.turn = (room.turn + 1) % room.players.length;
    io.to(code).emit("turnUpdate", room.turn, room.players);
  });

  socket.on("disconnect", () => {
    for(const code in rooms){
      const room = rooms[code];
      const index = room.players.findIndex(p=>p.id===socket.id);
      if(index!==-1){
        room.players.splice(index,1);
        // If host left, assign new host
        if(room.hostId===socket.id && room.players.length>0) room.hostId = room.players[0].id;
        io.to(code).emit("updatePlayers", room.players, room.hostId);
        // If room empty, delete
        if(room.players.length===0) delete rooms[code];
      }
    }
  });
});

http.listen(3000, () => console.log("Server running on port 3000"));
