 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/public/client.js b/public/client.js
index 587ac98e9d214a2a6739f931d39d2705cf58e514..0755a4603d90822655b2384c708095d86a348ea5 100644
--- a/public/client.js
+++ b/public/client.js
@@ -1,110 +1,374 @@
 const socket = io();
 const canvas = document.getElementById("game");
 const ctx = canvas.getContext("2d");
 
+const ui = {
+  name: document.getElementById("name"),
+  lobbyId: document.getElementById("lobbyId"),
+  host: document.getElementById("host"),
+  join: document.getElementById("join"),
+  start: document.getElementById("start"),
+  hostControls: document.getElementById("hostControls"),
+  lobbyInfo: document.getElementById("lobbyInfo"),
+  status: document.getElementById("status"),
+  assetsCard: document.getElementById("assetsCard"),
+  popup: document.getElementById("territoryPopup"),
+  popupTitle: document.getElementById("popupTitle"),
+  popupStats: document.getElementById("popupStats"),
+  popupClose: document.getElementById("popupClose"),
+  sunAudio: document.getElementById("sunAudio")
+};
+
 let lobbyId = null;
 let gameState = null;
+let buyMode = null;
+let selectedUnitId = null;
+let selectedTerritoryId = null;
+let knownOwnedNukeIds = new Set();
+let sunStopTimer = null;
 
-const bomberImg = new Image();
-bomberImg.src = "Assets/BOMBER.png";
+const images = {};
+[
+  ["tankBody", "Assets/TANK_BODY.png"],
+  ["tankTurret", "Assets/TANK_TURRET.png"],
+  ["jet", "Assets/JET.png"],
+  ["bomber", "Assets/BOMBER.png"],
+  ["nuke", "Assets/NUKE.png"],
+  ["explosion", "Assets/NUKE_EXPLOSION.png"],
+  ["battleship", "Assets/BATTLESHIP.png"],
+  ["carrier", "Assets/CARRIER_SHIP.png"],
+  ["base", "Assets/BASE.png"]
+].forEach(([key, src]) => {
+  const img = new Image();
+  img.src = src;
+  images[key] = img;
+});
 
-const nukeImg = new Image();
-nukeImg.src = "Assets/NUKE.png";
+function setStatus(message) {
+  ui.status.textContent = message;
+}
 
-const explosionImg = new Image();
-explosionImg.src = "Assets/NUKE_EXPLOSION.png";
+function pointInPolygon(point, polygon) {
+  let inside = false;
+  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
+    const xi = polygon[i].x;
+    const yi = polygon[i].y;
+    const xj = polygon[j].x;
+    const yj = polygon[j].y;
+    const intersect = yi > point.y !== yj > point.y
+      && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
+    if (intersect) inside = !inside;
+  }
+  return inside;
+}
 
-document.getElementById("host").onclick = () => {
-    const name = document.getElementById("name").value;
-    socket.emit("hostLobby", name);
-};
+function territoryAt(x, y) {
+  return Object.values(gameState.territories).find((territory) =>
+    pointInPolygon({ x, y }, territory.polygon)
+  );
+}
 
-document.getElementById("join").onclick = () => {
-    const name = document.getElementById("name").value;
-    const id = document.getElementById("lobbyId").value;
-    socket.emit("joinLobby", { lobbyId: id, name });
-};
+function openPopup(territory) {
+  selectedTerritoryId = territory.id;
+  const ownerName = territory.owner ? (gameState.players[territory.owner]?.name || "Unknown") : "Neutral";
+  ui.popupTitle.textContent = `Territory ${territory.id}`;
+  ui.popupStats.textContent = `Owner: ${ownerName} | Tanks: ${territory.tankCount} | Defense: ${Math.floor(
+    territory.defense
+  )} | Resources: ${territory.resourcesRate} | Economy: ${territory.economy}`;
+  ui.popup.classList.remove("hidden");
+}
 
-socket.on("lobbyCreated", id => {
-    lobbyId = id;
-    alert("Lobby ID: " + id);
-});
+function closePopup() {
+  ui.popup.classList.add("hidden");
+  selectedTerritoryId = null;
+}
 
-socket.on("joinedLobby", id => {
-    lobbyId = id;
-});
+function playSunSnippet() {
+  if (sunStopTimer) {
+    clearTimeout(sunStopTimer);
+    sunStopTimer = null;
+  }
 
-socket.on("gameState", state => {
-    gameState = state;
-    render(// DRAW AIR UNITS
-gameState.airUnits.forEach(unit => {
+  ui.sunAudio.pause();
+  ui.sunAudio.currentTime = 0;
+  ui.sunAudio.loop = false;
+  ui.sunAudio.play().catch(() => {});
 
-    ctx.save();
-    ctx.translate(unit.x, unit.y);
-    ctx.scale(unit.scale, unit.scale);
+  sunStopTimer = setTimeout(() => {
+    ui.sunAudio.pause();
+    ui.sunAudio.currentTime = 0;
+    sunStopTimer = null;
+  }, 20000);
+}
 
-    if (unit.type === "bomber")
-        ctx.drawImage(bomberImg, -20, -20, 40, 40);
+function maybePlaySunOnNukePurchase() {
+  if (!gameState) return;
+  const ownedNukes = gameState.nukes.filter((nuke) => nuke.owner === socket.id);
+  const currentIds = new Set(ownedNukes.map((nuke) => nuke.id));
 
-    ctx.restore();
-});
+  ownedNukes.forEach((nuke) => {
+    if (!knownOwnedNukeIds.has(nuke.id)) {
+      playSunSnippet();
+    }
+  });
 
-// DRAW BOMBS
-gameState.bombs?.forEach(bomb => {
-    ctx.drawImage(nukeImg, bomb.x - 10, bomb.y - 20, 20, 40);
-});
+  knownOwnedNukeIds = currentIds;
+}
 
-// DRAW EXPLOSIONS
-gameState.explosions.forEach(exp => {
-    ctx.drawImage(
-        explosionImg,
-        exp.x - exp.radius/2,
-        exp.y - exp.radius/2,
-        exp.radius,
-        exp.radius
-    );
-});
+function updateLobbyCard() {
+  if (!gameState) {
+    ui.lobbyInfo.classList.add("hidden");
+    ui.assetsCard.classList.add("hidden");
+    return;
+  }
 
+  const players = Object.values(gameState.players)
+    .map((player) => `<li><span style="color:${player.color}">⬤</span> ${player.name}${player.id === socket.id ? " (you)" : ""}</li>`)
+    .join("");
 
-canvas.onclick = e => {
-    if (!gameState) return;
+  ui.lobbyInfo.innerHTML = `
+    <h3>Lobby ${gameState.id}</h3>
+    <p>${gameState.started ? "Match started" : "Waiting for host to start"}</p>
+    <ul>${players}</ul>
+  `;
+  ui.lobbyInfo.classList.remove("hidden");
 
-    const rect = canvas.getBoundingClientRect();
-    const mx = e.clientX - rect.left;
-    const my = e.clientY - rect.top;
+  const isHost = gameState.hostId === socket.id;
+  ui.hostControls.classList.toggle("hidden", !(isHost && !gameState.started));
+  ui.assetsCard.classList.toggle("hidden", !gameState.started);
 
-    Object.values(gameState.territories).forEach(t => {
-        const dx = mx - t.center.x;
-        const dy = my - t.center.y;
+  const me = gameState.players[socket.id];
+  if (me) {
+    setStatus(`Resources ${Math.floor(me.resources)} | Money ${Math.floor(me.money)}${buyMode ? ` | Buy Mode: ${buyMode}` : ""}`);
+  }
+}
 
-        if (Math.sqrt(dx*dx + dy*dy) < 20) {
-            socket.emit("claimTerritory", { lobbyId, territoryId: t.id });
-        }
-    });
-};
+function getTerritoryFill(territory) {
+  if (!territory.owner) return "#d4d4d4";
+  return gameState.players[territory.owner]?.color || "#888";
+}
+
+function drawTerritory(territory) {
+  ctx.beginPath();
+  ctx.moveTo(territory.polygon[0].x, territory.polygon[0].y);
+  for (let i = 1; i < territory.polygon.length; i += 1) {
+    ctx.lineTo(territory.polygon[i].x, territory.polygon[i].y);
+  }
+  ctx.closePath();
+  ctx.fillStyle = getTerritoryFill(territory);
+  ctx.fill();
+  ctx.strokeStyle = "#223";
+  ctx.lineWidth = 1.1;
+  ctx.stroke();
+
+  ctx.fillStyle = "#1f2b38";
+  ctx.font = "14px Arial";
+  ctx.fillText(String(territory.id), territory.center.x - 7, territory.center.y + 5);
+}
+
+function drawUnit(unit) {
+  const bob = Math.sin(unit.bobPhase || 0) * 2;
+  const x = unit.x;
+  const y = unit.y + bob;
 
-function drawTerritory(t) {
+  if (selectedUnitId === unit.id) {
     ctx.beginPath();
-    ctx.moveTo(t.polygon[0].x, t.polygon[0].y);
+    ctx.arc(x, y, 18, 0, Math.PI * 2);
+    ctx.strokeStyle = "#fff";
+    ctx.lineWidth = 2;
+    ctx.stroke();
+  }
+
+  if (unit.type === "tank") {
+    ctx.drawImage(images.tankBody, x - 12, y - 10, 24, 20);
+    const ang = unit.targetX != null ? Math.atan2(unit.targetY - unit.y, unit.targetX - unit.x) : 0;
+    ctx.save();
+    ctx.translate(x, y);
+    ctx.rotate(ang);
+    ctx.drawImage(images.tankTurret, -9, -6, 18, 12);
+    ctx.restore();
+  } else if (unit.type === "base") {
+    ctx.drawImage(images.base, x - 18, y - 14, 36, 28);
+  } else if (unit.type === "jet") {
+    ctx.drawImage(images.jet, x - 12, y - 12, 24, 24);
+  } else if (unit.type === "bomber") {
+    ctx.drawImage(images.bomber, x - 16, y - 16, 32, 32);
+  } else if (unit.type === "battleship") {
+    ctx.drawImage(images.battleship, x - 13, y - 22, 26, 44);
+  } else if (unit.type === "carrier") {
+    ctx.drawImage(images.carrier, x - 14, y - 22, 28, 44);
+  }
+}
 
-    for (let i = 1; i < t.polygon.length; i++) {
-        ctx.lineTo(t.polygon[i].x, t.polygon[i].y);
+function renderNukes() {
+  gameState.nukes.forEach((nukeState) => {
+    if (nukeState.phase === "flying") {
+      ctx.drawImage(images.bomber, nukeState.bomberX - 16, nukeState.bomberY - 16, 32, 32);
     }
 
-    ctx.closePath();
+    if (nukeState.phase === "dropped") {
+      ctx.drawImage(images.nuke, nukeState.dropX - 10, nukeState.nukeY - 18, 20, 36);
+    }
+  });
+}
 
-    if (!t.owner) ctx.fillStyle = "#d9c76e";
-    else ctx.fillStyle = getPlayerColor(t.owner);
+function render() {
+  ctx.clearRect(0, 0, canvas.width, canvas.height);
 
-    ctx.fill();
-    ctx.strokeStyle = "black";
-    ctx.stroke();
+  if (!gameState) {
+    ctx.fillStyle = "#eef";
+    ctx.font = "34px Arial";
+    ctx.fillText("Create or join a lobby", 350, 290);
+    return;
+  }
+
+  Object.values(gameState.territories).forEach(drawTerritory);
+  gameState.units.forEach(drawUnit);
+
+  renderNukes();
+
+  gameState.explosions.forEach((exp) => {
+    if (exp.flash) {
+      ctx.fillStyle = `rgba(255,255,190,${Math.max(0.15, 1 - exp.radius / exp.maxRadius)})`;
+      ctx.fillRect(0, 0, canvas.width, canvas.height);
+    }
+
+    ctx.globalAlpha = 0.92;
+    ctx.drawImage(images.explosion, exp.x - exp.radius / 2, exp.y - exp.radius / 2, exp.radius, exp.radius);
+    ctx.globalAlpha = 1;
+  });
 }
-function getPlayerColor(id) {
-    const colors = ["#e74c3c", "#3498db", "#2ecc71", "#9b59b6"];
-    const index = Object.keys(gameState.players).indexOf(id);
-    return colors[index % colors.length];
+
+function canvasToGameCoords(event) {
+  const rect = canvas.getBoundingClientRect();
+  return {
+    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
+    y: ((event.clientY - rect.top) / rect.height) * canvas.height
+  };
+}
+
+function unitNear(x, y) {
+  return gameState.units.find((unit) => {
+    const dx = unit.x - x;
+    const dy = unit.y - y;
+    return Math.sqrt(dx * dx + dy * dy) < 18;
+  });
 }
-Object.values(gameState.territories).forEach(t => {
-    drawTerritory(t);
+
+function clearBuySelection() {
+  buyMode = null;
+  document.querySelectorAll(".assetBtn").forEach((btn) => btn.classList.remove("selected"));
+}
+
+function handleCanvasClick(event) {
+  if (!gameState?.started) return;
+
+  const { x, y } = canvasToGameCoords(event);
+  const clickedUnit = unitNear(x, y);
+
+  if (clickedUnit && clickedUnit.owner === socket.id) {
+    selectedUnitId = clickedUnit.id;
+    setStatus(`Selected ${clickedUnit.type}. Click destination to move.`);
+    render();
+    return;
+  }
+
+  if (selectedUnitId) {
+    socket.emit("moveUnit", { lobbyId, unitId: selectedUnitId, x, y });
+    selectedUnitId = null;
+    return;
+  }
+
+  const territory = territoryAt(x, y);
+  if (!territory) return;
+
+  if (buyMode && buyMode !== "nuke") {
+    socket.emit("buyAndPlaceUnit", {
+      lobbyId,
+      territoryId: territory.id,
+      unitType: buyMode,
+      x,
+      y
+    });
+    clearBuySelection();
+    return;
+  }
+
+  if (buyMode === "nuke") {
+    socket.emit("launchNukeStrike", { lobbyId, targetTerritoryId: territory.id });
+    clearBuySelection();
+    return;
+  }
+
+  openPopup(territory);
+}
+
+ui.host.addEventListener("click", () => {
+  socket.emit("hostLobby", ui.name.value.trim() || "Commander");
 });
+
+ui.join.addEventListener("click", () => {
+  socket.emit("joinLobby", { lobbyId: ui.lobbyId.value.trim(), name: ui.name.value.trim() || "Commander" });
+});
+
+ui.start.addEventListener("click", () => {
+  if (!lobbyId) return;
+  socket.emit("startGame", { lobbyId });
+});
+
+ui.popupClose.addEventListener("click", closePopup);
+
+Array.from(document.querySelectorAll(".assetBtn")).forEach((button) => {
+  button.addEventListener("click", () => {
+    const type = button.dataset.buy;
+    buyMode = type;
+    document.querySelectorAll(".assetBtn").forEach((btn) => btn.classList.remove("selected"));
+    button.classList.add("selected");
+
+    if (type === "nuke") setStatus("Nuke selected: click any territory to buy and call bomber strike.");
+    else setStatus(`${type} selected: click in your own territory to place.`);
+  });
+});
+
+Array.from(document.querySelectorAll("[data-popup-action]")).forEach((button) => {
+  button.addEventListener("click", () => {
+    if (!gameState || selectedTerritoryId == null) return;
+
+    if (button.dataset.popupAction === "claim") {
+      socket.emit("claimTerritory", { lobbyId, territoryId: selectedTerritoryId });
+    }
+
+    if (button.dataset.popupAction === "nuke") {
+      socket.emit("launchNukeStrike", { lobbyId, targetTerritoryId: selectedTerritoryId });
+    }
+
+    closePopup();
+  });
+});
+
+canvas.addEventListener("click", handleCanvasClick);
+
+socket.on("lobbyCreated", ({ lobbyId: newLobbyId }) => {
+  lobbyId = newLobbyId;
+  ui.lobbyId.value = newLobbyId;
+  setStatus(`Lobby created: ${newLobbyId}.`);
+});
+
+socket.on("joinedLobby", ({ lobbyId: joinedLobby }) => {
+  lobbyId = joinedLobby;
+  ui.lobbyId.value = joinedLobby;
+  setStatus(`Joined lobby ${joinedLobby}.`);
+});
+
+socket.on("gameState", (state) => {
+  gameState = state;
+  maybePlaySunOnNukePurchase();
+  updateLobbyCard();
+  render();
+});
+
+socket.on("errorMessage", (message) => {
+  setStatus(message);
+});
+
+render();
 
EOF
)
