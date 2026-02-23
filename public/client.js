const socket = io();
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let lobbyId = null;
let gameState = null;

const bomberImg = new Image();
bomberImg.src = "Assets/BOMBER.png";

const nukeImg = new Image();
nukeImg.src = "Assets/NUKE.png";

const explosionImg = new Image();
explosionImg.src = "Assets/NUKE_EXPLOSION.png";

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
    render(// DRAW AIR UNITS
gameState.airUnits.forEach(unit => {

    ctx.save();
    ctx.translate(unit.x, unit.y);
    ctx.scale(unit.scale, unit.scale);

    if (unit.type === "bomber")
        ctx.drawImage(bomberImg, -20, -20, 40, 40);

    ctx.restore();
});

// DRAW BOMBS
gameState.bombs?.forEach(bomb => {
    ctx.drawImage(nukeImg, bomb.x - 10, bomb.y - 20, 20, 40);
});

// DRAW EXPLOSIONS
gameState.explosions.forEach(exp => {
    ctx.drawImage(
        explosionImg,
        exp.x - exp.radius/2,
        exp.y - exp.radius/2,
        exp.radius,
        exp.radius
    );
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
function getPlayerColor(id) {
    const colors = ["#e74c3c", "#3498db", "#2ecc71", "#9b59b6"];
    const index = Object.keys(gameState.players).indexOf(id);
    return colors[index % colors.length];
}
Object.values(gameState.territories).forEach(t => {
    drawTerritory(t);
});
