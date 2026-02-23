const socket = io();
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let lobbyId = null;
let gameState = null;

document.getElementById("host").onclick = () => {
    const name = document.getElementById("name").value;
    socket.emit("hostLobby", name);
};

document.getElementById("join").onclick = () => {
    const name = document.getElementById("name").value;
    const id = document.getElementById("lobbyId").value;
    socket.emit("joinLobby", { lobbyId: id, name });
};

socket.on("lobbyCreated", id => {
    lobbyId = id;
    alert("Lobby ID: " + id);
});

socket.on("joinedLobby", id => {
    lobbyId = id;
});

socket.on("gameState", state => {
    gameState = state;
    render();
});

canvas.onclick = e => {
    if (!gameState) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    Object.values(gameState.territories).forEach(t => {
        const dx = mx - t.center.x;
        const dy = my - t.center.y;

        if (Math.sqrt(dx*dx + dy*dy) < 20) {
            socket.emit("claimTerritory", { lobbyId, territoryId: t.id });
        }
    });
};

function drawTerritory(t) {
    ctx.beginPath();
    ctx.moveTo(t.polygon[0].x, t.polygon[0].y);

    for (let i = 1; i < t.polygon.length; i++) {
        ctx.lineTo(t.polygon[i].x, t.polygon[i].y);
    }

    ctx.closePath();

    if (!t.owner) ctx.fillStyle = "#d9c76e";
    else ctx.fillStyle = getPlayerColor(t.owner);

    ctx.fill();
    ctx.strokeStyle = "black";
    ctx.stroke();
}
