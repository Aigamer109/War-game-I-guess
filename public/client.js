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

function render() {
    ctx.clearRect(0,0,canvas.width,canvas.height);

    if (!gameState) return;

    Object.values(gameState.territories).forEach(t => {
        ctx.beginPath();
        ctx.arc(t.center.x, t.center.y, 20, 0, Math.PI*2);

        if (!t.owner) ctx.fillStyle = "yellow";
        else ctx.fillStyle = "red";

        ctx.fill();
    });

    gameState.explosions.forEach(exp => {
        ctx.beginPath();
        ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI*2);
        ctx.fillStyle = "orange";
        ctx.fill();
    });
}
