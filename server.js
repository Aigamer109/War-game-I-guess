 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/server.js b/server.js
index f20b7e9a66c49423e08d0c2d7491887e95a23122..c2ffdb2bd7934c6e7a016cd8900ec5deafe6e577 100644
--- a/server.js
+++ b/server.js
@@ -1,325 +1,614 @@
 const express = require("express");
 const http = require("http");
 const { Server } = require("socket.io");
 const { v4: uuidv4 } = require("uuid");
 
 const app = express();
 const server = http.createServer(app);
 const io = new Server(server);
 
 app.use(express.static("public"));
 
-const lobbies = {airUnits: [],
-bombs: [],};
-
-/* =============================
-   TERRITORY GENERATION
-============================= */
-
-function generateMap() {
-    const width = 1000;
-    const height = 600;
-    const count = 50;
-
-    const points = [];
-    const territories = {};
-
-    // Generate random points
-    for (let i = 0; i < count; i++) {
-        points.push({
-            id: i,
-            x: Math.random() * width,
-            y: Math.random() * height
-        });
-    }
+const MAP_WIDTH = 1100;
+const MAP_HEIGHT = 640;
+
+const lobbies = {};
+
+const UNIT_STATS = {
+  tank: { costR: 100, costM: 50, power: 28, speed: 0.9, domain: "ground", hp: 120 },
+  base: { costR: 2500, costM: 1500, power: 0, speed: 0, domain: "structure", hp: 700 },
+  jet: { costR: 200, costM: 150, power: 35, speed: 2.9, domain: "air", hp: 90 },
+  bomber: { costR: 250, costM: 200, power: 55, speed: 2.1, domain: "air", hp: 130 },
+  battleship: { costR: 2500, costM: 1500, power: 50, speed: 1.4, domain: "naval", hp: 1400 },
+  carrier: { costR: 2200, costM: 1400, power: 35, speed: 1.2, domain: "naval", hp: 1000 },
+  nuke: { costR: 3000, costM: 1000 }
+};
+
+function randomInt(min, max) {
+  return Math.floor(Math.random() * (max - min + 1)) + min;
+}
 
-    // Create territories
-    points.forEach(p => {
-        territories[p.id] = {
-            id: p.id,
-            owner: null,
-            resources: Math.floor(Math.random() * 10) + 1,
-            economy: Math.floor(Math.random() * 100),
-            bases: 0,
-            center: { x: p.x, y: p.y },
-            polygon: [],
-            neighbors: []
-        };
-    });
+function clamp(value, min, max) {
+  return Math.max(min, Math.min(max, value));
+}
 
-    // Assign polygon vertices (fake Voronoi style radial blob)
-    points.forEach(p => {
-        const verts = [];
-        const sides = 6 + Math.floor(Math.random() * 4);
-        const radius = 60 + Math.random() * 40;
-
-        for (let i = 0; i < sides; i++) {
-            const angle = (Math.PI * 2 / sides) * i;
-            verts.push({
-                x: p.x + Math.cos(angle) * radius,
-                y: p.y + Math.sin(angle) * radius
-            });
-        }
+function pointInPolygon(point, polygon) {
+  let inside = false;
+  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
+    const xi = polygon[i].x;
+    const yi = polygon[i].y;
+    const xj = polygon[j].x;
+    const yj = polygon[j].y;
 
-        territories[p.id].polygon = verts;
-    });
+    const intersect = yi > point.y !== yj > point.y
+      && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
 
-    // Neighbor detection (close centers)
-    for (let i = 0; i < count; i++) {
-        for (let j = i + 1; j < count; j++) {
-            const dx = points[i].x - points[j].x;
-            const dy = points[i].y - points[j].y;
-            const dist = Math.sqrt(dx*dx + dy*dy);
-
-            if (dist < 150) {
-                territories[i].neighbors.push(j);
-                territories[j].neighbors.push(i);
-            }
-        }
-    }
+    if (intersect) inside = !inside;
+  }
+  return inside;
+}
 
-    return territories;
+function getTerritoryAtPoint(lobby, x, y) {
+  return Object.values(lobby.territories).find((territory) =>
+    pointInPolygon({ x, y }, territory.polygon)
+  );
 }
 
-    // simple neighbor linking
-    for (let i = 0; i < size; i++) {
-        for (let j = i + 1; j < size; j++) {
-            if (Math.random() < 0.05) {
-                territories[i].neighbors.push(j);
-                territories[j].neighbors.push(i);
-            }
-        }
+function isPointOnLand(lobby, x, y) {
+  return !!getTerritoryAtPoint(lobby, x, y);
+}
+
+function generateMap(width = MAP_WIDTH, height = MAP_HEIGHT, count = 50) {
+  const cols = 10;
+  const rows = Math.ceil(count / cols);
+  const cellWidth = width / cols;
+  const cellHeight = height / rows;
+
+  const pointGrid = [];
+  const territories = {};
+
+  for (let r = 0; r < rows; r += 1) {
+    pointGrid[r] = [];
+    for (let c = 0; c < cols; c += 1) {
+      const id = r * cols + c;
+      if (id >= count) {
+        pointGrid[r][c] = null;
+        continue;
+      }
+
+      const jitterX = randomInt(-12, 12);
+      const jitterY = randomInt(-12, 12);
+      const centerX = clamp((c + 0.5) * cellWidth + jitterX, 24, width - 24);
+      const centerY = clamp((r + 0.5) * cellHeight + jitterY, 24, height - 24);
+      pointGrid[r][c] = { id, x: centerX, y: centerY, r, c };
+    }
+  }
+
+  for (let r = 0; r < rows; r += 1) {
+    for (let c = 0; c < cols; c += 1) {
+      const point = pointGrid[r][c];
+      if (!point) continue;
+
+      const left = c === 0 ? 0 : (pointGrid[r][c - 1].x + point.x) / 2;
+      const right = c === cols - 1 || !pointGrid[r][c + 1]
+        ? width
+        : (point.x + pointGrid[r][c + 1].x) / 2;
+      const top = r === 0 ? 0 : (pointGrid[r - 1][c].y + point.y) / 2;
+      const bottom = r === rows - 1 || !pointGrid[r + 1][c]
+        ? height
+        : (point.y + pointGrid[r + 1][c].y) / 2;
+
+      // shrink territory to leave water lanes between territories
+      const waterGap = 6;
+      territories[point.id] = {
+        id: point.id,
+        center: { x: point.x, y: point.y },
+        polygon: [
+          { x: left + waterGap, y: top + waterGap },
+          { x: right - waterGap, y: top + waterGap },
+          { x: right - waterGap, y: bottom - waterGap },
+          { x: left + waterGap, y: bottom - waterGap }
+        ],
+        owner: null,
+        neighbors: [],
+        resourcesRate: randomInt(1, 10),
+        economy: randomInt(20, 100),
+        defense: randomInt(35, 85),
+        tankCount: randomInt(1, 4)
+      };
+
+      const neighbors = [];
+      if (c > 0 && pointGrid[r][c - 1]) neighbors.push(pointGrid[r][c - 1].id);
+      if (c < cols - 1 && pointGrid[r][c + 1]) neighbors.push(pointGrid[r][c + 1].id);
+      if (r > 0 && pointGrid[r - 1][c]) neighbors.push(pointGrid[r - 1][c].id);
+      if (r < rows - 1 && pointGrid[r + 1][c]) neighbors.push(pointGrid[r + 1][c].id);
+      territories[point.id].neighbors = neighbors;
     }
+  }
 
-    return territories;
+  return territories;
 }
 
-/* =============================
-   LOBBY
-============================= */
-
 function createLobby(socket, name) {
-    const id = uuidv4().slice(0, 6);
-
-    lobbies[id] = {
-        id,
-        players: {},
-        territories: generateMap(),
-        airUnits: [],
-        explosions: []
-    };
+  const id = uuidv4().slice(0, 6).toUpperCase();
+  const hostName = name?.trim() || "Host";
+
+  lobbies[id] = {
+    id,
+    hostId: socket.id,
+    started: false,
+    players: {},
+    territories: generateMap(),
+    units: [],
+    nukes: [],
+    explosions: []
+  };
+
+  lobbies[id].players[socket.id] = {
+    id: socket.id,
+    name: hostName,
+    resources: 3000,
+    money: 1800,
+    color: "#f4d35e"
+  };
+
+  socket.join(id);
+  return id;
+}
 
-    lobbies[id].players[socket.id] = {
-        name,
-        resources: 5000,
-        money: 2000
-    };
+function availableColors(lobby) {
+  const palette = ["#f4d35e", "#ef476f", "#06d6a0", "#118ab2"];
+  const inUse = new Set(Object.values(lobby.players).map((p) => p.color));
+  return palette.find((color) => !inUse.has(color)) || "#8d99ae";
+}
 
-    socket.join(id);
-    return id;
+function assignStartingTerritory(lobby, playerId) {
+  const unclaimed = Object.values(lobby.territories).filter((t) => !t.owner);
+  if (!unclaimed.length) return;
+  const start = unclaimed[randomInt(0, unclaimed.length - 1)];
+  start.owner = playerId;
+  start.defense = 120;
+  start.tankCount = 6;
 }
 
-/* =============================
-   NUKE SYSTEM
-============================= */
-
-function isWithinRange(lobby, playerId, targetId) {
-    const visited = new Set();
-    const queue = [];
-
-    Object.values(lobby.territories)
-        .filter(t => t.owner === playerId)
-        .forEach(t => {
-            queue.push({ id: t.id, depth: 0 });
-            visited.add(t.id);
-        });
-
-    while (queue.length) {
-        const { id, depth } = queue.shift();
-        if (id === targetId && depth <= 3) return true;
-        if (depth >= 3) continue;
-
-        lobby.territories[id].neighbors.forEach(n => {
-            if (!visited.has(n)) {
-                visited.add(n);
-                queue.push({ id: n, depth: depth + 1 });
-            }
-        });
-    }
+function canReachWithinSteps(lobby, playerId, targetId, maxSteps) {
+  const queue = [];
+  const visited = new Set();
+
+  Object.values(lobby.territories)
+    .filter((territory) => territory.owner === playerId)
+    .forEach((territory) => {
+      queue.push({ id: territory.id, steps: 0 });
+      visited.add(territory.id);
+    });
 
-    return false;
+  while (queue.length) {
+    const current = queue.shift();
+    if (current.id === targetId && current.steps <= maxSteps) return true;
+    if (current.steps >= maxSteps) continue;
+
+    lobby.territories[current.id].neighbors.forEach((neighborId) => {
+      if (!visited.has(neighborId)) {
+        visited.add(neighborId);
+        queue.push({ id: neighborId, steps: current.steps + 1 });
+      }
+    });
+  }
+
+  return false;
 }
 
-function explodeTerritory(lobby, territoryId) {
-    const territory = lobby.territories[territoryId];
+function canClaimTerritory(lobby, playerId, territoryId) {
+  const territory = lobby.territories[territoryId];
+  if (!territory || territory.owner === playerId) return false;
 
-    territory.owner = null;
-    territory.bases = 0;
-    territory.resources = 0;
+  const owned = Object.values(lobby.territories).filter((t) => t.owner === playerId);
+  if (!owned.length) return true;
+  return owned.some((t) => t.neighbors.includes(territoryId));
+}
 
-    lobby.explosions.push({
-        x: territory.center.x,
-        y: territory.center.y,
-        radius: 10,
-        maxRadius: 200
-    });
+function getHalfMapRange() {
+  return Math.sqrt(MAP_WIDTH * MAP_WIDTH + MAP_HEIGHT * MAP_HEIGHT) / 2;
 }
 
-/* =============================
-   GAME LOOP
-============================= */
+function isPlaneTargetInRange(lobby, playerId, toId) {
+  const target = lobby.territories[toId];
+  if (!target) return false;
 
-setInterval(() => {
-    Object.values(lobbies).forEach(lobby => {
+  const maxRange = getHalfMapRange();
+  const owned = Object.values(lobby.territories).filter((territory) => territory.owner === playerId);
+  if (!owned.length) return false;
 
-        // resource generation
-        Object.entries(lobby.players).forEach(([id, player]) => {
-            const owned = Object.values(lobby.territories)
-                .filter(t => t.owner === id);
+  return owned.some((territory) => {
+    const dx = territory.center.x - target.center.x;
+    const dy = territory.center.y - target.center.y;
+    return Math.sqrt(dx * dx + dy * dy) <= maxRange;
+  });
+}
 
-            owned.forEach(t => {
-                player.resources += t.resources * 0.1;
-                player.money += t.economy * 0.05;
-            });
-        });
+function resolveGroundClaimBattle(lobby, playerId, territoryId) {
+  const target = lobby.territories[territoryId];
+  if (!target) return { ok: false, reason: "Invalid target territory." };
+  if (!canClaimTerritory(lobby, playerId, territoryId)) {
+    return { ok: false, reason: "You can only claim bordering territory." };
+  }
+
+  const attackerNeighbors = target.neighbors
+    .map((id) => lobby.territories[id])
+    .filter((territory) => territory?.owner === playerId);
+
+  const nearbyUnits = lobby.units.filter(
+    (unit) => unit.owner === playerId && unit.domain === "ground" && target.neighbors.includes(unit.territoryId)
+  );
+
+  const attackerStrength = attackerNeighbors.reduce(
+    (sum, territory) => sum + territory.tankCount * 16 + territory.defense * 0.25,
+    0
+  ) + nearbyUnits.length * 22;
+
+  const defenderUnits = lobby.units.filter(
+    (unit) => unit.domain === "ground" && unit.territoryId === target.id
+  ).length;
+  const defenderStrength = target.tankCount * 18 + target.defense + defenderUnits * 24;
+
+  attackerNeighbors.forEach((territory) => {
+    territory.tankCount = Math.max(0, territory.tankCount - randomInt(1, 2));
+    territory.defense = Math.max(20, territory.defense - randomInt(3, 10));
+  });
+
+  if (attackerStrength > defenderStrength) {
+    target.owner = playerId;
+    target.tankCount = Math.max(1, Math.floor(attackerStrength / 42));
+    target.defense = clamp(Math.floor(attackerStrength / 3.5), 40, 130);
+
+    lobby.units.forEach((unit) => {
+      if (unit.territoryId === target.id && unit.owner !== playerId && unit.domain === "ground") unit.hp = 0;
+    });
 
-        // explosions grow
-        lobby.explosions.forEach(exp => {
-            exp.radius += 4;
-        });
+    return { ok: true, message: "Ground units won and captured the territory." };
+  }
 
-        lobby.explosions = lobby.explosions.filter(e => e.radius < e.maxRadius);
+  target.tankCount = Math.max(0, target.tankCount - randomInt(1, 3));
+  target.defense = Math.max(15, target.defense - randomInt(5, 16));
+  return { ok: true, message: "Your units fought but failed to capture the territory." };
+}
 
-        io.to(lobby.id).emit("gameState", lobby);
+function canPlaceUnit(lobby, playerId, unitType, territoryId, x, y) {
+  const territory = lobby.territories[territoryId];
+  if (!territory) return { ok: false, reason: "Invalid territory." };
+  if (territory.owner !== playerId) return { ok: false, reason: "Place units only in your own territory." };
+  if (!pointInPolygon({ x, y }, territory.polygon)) return { ok: false, reason: "Placement must be inside territory." };
 
-}, 1000 / 30);
-// AIR MOVEMENT
-lobby.airUnits.forEach(unit => {
+  const stat = UNIT_STATS[unitType];
+  if (!stat) return { ok: false, reason: "Unknown unit." };
+
+  if (stat.domain === "naval" && isPointOnLand(lobby, x, y)) {
+    return { ok: false, reason: "Naval units must be placed on water." };
+  }
 
-    if (unit.state === "takingoff") {
-        unit.scale += 0.02;
-        if (unit.scale >= 1) unit.state = "flying";
+  if (stat.domain !== "naval" && stat.domain !== "air" && !pointInPolygon({ x, y }, territory.polygon)) {
+    return { ok: false, reason: "Ground and base units must be in owned territory." };
+  }
+
+  return { ok: true };
+}
+
+function broadcastLobbyState(lobbyId) {
+  const lobby = lobbies[lobbyId];
+  if (!lobby) return;
+
+  io.to(lobbyId).emit("gameState", {
+    id: lobby.id,
+    hostId: lobby.hostId,
+    started: lobby.started,
+    players: lobby.players,
+    territories: lobby.territories,
+    units: lobby.units,
+    nukes: lobby.nukes,
+    explosions: lobby.explosions
+  });
+}
+
+io.on("connection", (socket) => {
+  socket.on("hostLobby", (name) => {
+    const lobbyId = createLobby(socket, name);
+    socket.emit("lobbyCreated", { lobbyId, playerId: socket.id });
+    broadcastLobbyState(lobbyId);
+  });
+
+  socket.on("joinLobby", ({ lobbyId, name }) => {
+    const lobby = lobbies[lobbyId?.toUpperCase()];
+    if (!lobby) {
+      socket.emit("errorMessage", "Lobby not found.");
+      return;
     }
 
-    else if (unit.state === "flying") {
-        const target = lobby.territories[unit.target];
-        const dx = target.center.x - unit.x;
-        const dy = target.center.y - unit.y;
-        const dist = Math.sqrt(dx*dx + dy*dy);
-
-        if (dist < 10) {
-
-            if (unit.type === "bomber" && unit.hasNuke) {
-                lobby.bombs.push({
-                    x: unit.x,
-                    y: unit.y,
-                    target: unit.target,
-                    vy: 4
-                });
-                unit.hasNuke = false;
-            }
-
-            unit.state = "returning";
-        } else {
-            unit.x += (dx/dist) * (unit.speed/30);
-            unit.y += (dy/dist) * (unit.speed/30);
-        }
+    if (Object.keys(lobby.players).length >= 4) {
+      socket.emit("errorMessage", "Lobby is full (max 4 players).");
+      return;
     }
 
-    else if (unit.state === "returning") {
-        const home = lobby.territories[unit.home];
-        const dx = home.center.x - unit.x;
-        const dy = home.center.y - unit.y;
-        const dist = Math.sqrt(dx*dx + dy*dy);
+    lobby.players[socket.id] = {
+      id: socket.id,
+      name: name?.trim() || `Player-${Object.keys(lobby.players).length + 1}`,
+      resources: 3000,
+      money: 1800,
+      color: availableColors(lobby)
+    };
 
-        if (dist < 10) unit.state = "landing";
-        else {
-            unit.x += (dx/dist) * (unit.speed/30);
-            unit.y += (dy/dist) * (unit.speed/30);
-        }
+    socket.join(lobby.id);
+    socket.emit("joinedLobby", { lobbyId: lobby.id, playerId: socket.id });
+    broadcastLobbyState(lobby.id);
+  });
+
+  socket.on("startGame", ({ lobbyId }) => {
+    const lobby = lobbies[lobbyId];
+    if (!lobby || lobby.hostId !== socket.id || lobby.started) return;
+
+    Object.keys(lobby.players).forEach((playerId) => assignStartingTerritory(lobby, playerId));
+    lobby.started = true;
+    broadcastLobbyState(lobbyId);
+  });
+
+  socket.on("claimTerritory", ({ lobbyId, territoryId }) => {
+    const lobby = lobbies[lobbyId];
+    const territory = lobby?.territories[territoryId];
+    if (!lobby || !territory || !lobby.started) return;
+
+    const result = resolveGroundClaimBattle(lobby, socket.id, territoryId);
+    if (!result.ok) {
+      socket.emit("errorMessage", result.reason);
+      return;
     }
 
-    else if (unit.state === "landing") {
-        unit.scale -= 0.02;
-        if (unit.scale <= 0.2) unit.state = "idle";
+    socket.emit("errorMessage", result.message);
+    broadcastLobbyState(lobbyId);
+  });
+
+  socket.on("buyAndPlaceUnit", ({ lobbyId, territoryId, unitType, x, y }) => {
+    const lobby = lobbies[lobbyId];
+    const player = lobby?.players[socket.id];
+    const stat = UNIT_STATS[unitType];
+    if (!lobby || !player || !stat || !lobby.started) return;
+    if (unitType === "nuke") return;
+
+    const placement = canPlaceUnit(lobby, socket.id, unitType, territoryId, x, y);
+    if (!placement.ok) {
+      socket.emit("errorMessage", placement.reason);
+      return;
+    }
+
+    if (player.resources < stat.costR || player.money < stat.costM) {
+      socket.emit("errorMessage", "Not enough resources/money for that unit.");
+      return;
     }
-lobby.bombs.forEach(bomb => {
-    bomb.y += bomb.vy;
 
-    const territory = lobby.territories[bomb.target];
+    player.resources -= stat.costR;
+    player.money -= stat.costM;
+
+    lobby.units.push({
+      id: uuidv4(),
+      owner: socket.id,
+      type: unitType,
+      domain: stat.domain,
+      x,
+      y,
+      territoryId,
+      hp: stat.hp,
+      power: stat.power,
+      speed: stat.speed,
+      targetX: null,
+      targetY: null,
+      bobPhase: Math.random() * Math.PI * 2
+    });
+
+    broadcastLobbyState(lobbyId);
+  });
 
-    if (bomb.y >= territory.center.y) {
-        explodeTerritory(lobby, bomb.target);
-        bomb.done = true;
+  socket.on("moveUnit", ({ lobbyId, unitId, x, y }) => {
+    const lobby = lobbies[lobbyId];
+    const unit = lobby?.units.find((u) => u.id === unitId && u.owner === socket.id);
+    if (!lobby || !unit || !lobby.started) return;
+
+    const targetTerritory = getTerritoryAtPoint(lobby, x, y);
+
+    if ((unit.domain === "ground" || unit.domain === "structure") && (!targetTerritory || targetTerritory.owner !== socket.id)) {
+      socket.emit("errorMessage", "Ground/base units can move only in your own territories.");
+      return;
     }
 
-lobby.bombs = lobby.bombs.filter(b => !b.done);
-});
-/* =============================
-   SOCKET EVENTS
-============================= */
+    if (unit.domain === "naval" && targetTerritory) {
+      socket.emit("errorMessage", "Ships avoid land. Move them on water lanes.");
+      return;
+    }
 
-io.on("connection", socket => {
+    if (unit.domain === "air" && targetTerritory && !isPlaneTargetInRange(lobby, socket.id, targetTerritory.id)) {
+      socket.emit("errorMessage", "Air unit target is out of range.");
+      return;
+    }
+
+    unit.targetX = clamp(x, 0, MAP_WIDTH);
+    unit.targetY = clamp(y, 0, MAP_HEIGHT);
+    if (targetTerritory) unit.territoryId = targetTerritory.id;
+
+    broadcastLobbyState(lobbyId);
+  });
+
+  socket.on("launchNukeStrike", ({ lobbyId, targetTerritoryId }) => {
+    const lobby = lobbies[lobbyId];
+    const player = lobby?.players[socket.id];
+    const target = lobby?.territories[targetTerritoryId];
+    if (!lobby || !player || !target || !lobby.started) return;
 
-    socket.on("hostLobby", name => {
-        const id = createLobby(socket, name);
-        socket.emit("lobbyCreated", id);
+    if (player.resources < UNIT_STATS.nuke.costR || player.money < UNIT_STATS.nuke.costM) {
+      socket.emit("errorMessage", "Not enough resources/money for tactical nuke.");
+      return;
+    }
+
+    player.resources -= UNIT_STATS.nuke.costR;
+    player.money -= UNIT_STATS.nuke.costM;
+
+    lobby.nukes.push({
+      id: uuidv4(),
+      owner: socket.id,
+      phase: "flying",
+      bomberX: 40,
+      bomberY: MAP_HEIGHT - 40,
+      dropX: target.center.x,
+      dropY: target.center.y,
+      nukeX: null,
+      nukeY: null,
+      dropAtMs: null,
+      detonateAtMs: null,
+      sunAudio: true
     });
 
-    socket.on("joinLobby", ({ lobbyId, name }) => {
-        const lobby = lobbies[lobbyId];
-        if (!lobby) return;
+    broadcastLobbyState(lobbyId);
+  });
+
+  socket.on("disconnect", () => {
+    Object.values(lobbies).forEach((lobby) => {
+      if (!lobby.players[socket.id]) return;
+
+      delete lobby.players[socket.id];
+      lobby.units = lobby.units.filter((unit) => unit.owner !== socket.id);
+
+      Object.values(lobby.territories).forEach((territory) => {
+        if (territory.owner === socket.id) {
+          territory.owner = null;
+          territory.defense = randomInt(20, 55);
+          territory.tankCount = randomInt(0, 2);
+        }
+      });
 
-        lobby.players[socket.id] = {
-            name,
-            resources: 5000,
-            money: 2000
-        };
+      if (lobby.hostId === socket.id) {
+        const nextHostId = Object.keys(lobby.players)[0];
+        lobby.hostId = nextHostId || null;
+      }
 
-        socket.join(lobbyId);
-        socket.emit("joinedLobby", lobbyId);
+      if (!Object.keys(lobby.players).length) delete lobbies[lobby.id];
+      else broadcastLobbyState(lobby.id);
+    });
+  });
+});
+
+setInterval(() => {
+  Object.values(lobbies).forEach((lobby) => {
+    if (!lobby.started) return;
+
+    Object.values(lobby.players).forEach((player) => {
+      const ownedTerritories = Object.values(lobby.territories).filter((territory) => territory.owner === player.id);
+      ownedTerritories.forEach((territory) => {
+        player.resources += territory.resourcesRate;
+        player.money += Math.max(1, Math.floor(territory.economy / 14));
+      });
     });
 
-    socket.on("claimTerritory", ({ lobbyId, territoryId }) => {
-        const lobby = lobbies[lobbyId];
-        const territory = lobby.territories[territoryId];
+    lobby.units.forEach((unit) => {
+      unit.bobPhase += 0.11;
+
+      if (unit.targetX == null || unit.targetY == null || unit.speed <= 0) return;
+
+      const dx = unit.targetX - unit.x;
+      const dy = unit.targetY - unit.y;
+      const distance = Math.sqrt(dx * dx + dy * dy);
+
+      if (distance < unit.speed) {
+        unit.x = unit.targetX;
+        unit.y = unit.targetY;
+        unit.targetX = null;
+        unit.targetY = null;
+        return;
+      }
+
+      const nextX = unit.x + (dx / distance) * unit.speed;
+      const nextY = unit.y + (dy / distance) * unit.speed;
+
+      if (unit.domain === "naval" && isPointOnLand(lobby, nextX, nextY)) {
+        unit.targetX = null;
+        unit.targetY = null;
+        return;
+      }
+
+      if ((unit.domain === "ground" || unit.domain === "structure")) {
+        const terr = getTerritoryAtPoint(lobby, nextX, nextY);
+        if (!terr || terr.owner !== unit.owner) {
+          unit.targetX = null;
+          unit.targetY = null;
+          return;
+        }
+      }
+
+      unit.x = nextX;
+      unit.y = nextY;
+      const terr = getTerritoryAtPoint(lobby, unit.x, unit.y);
+      if (terr) unit.territoryId = terr.id;
+    });
 
-        if (!territory.owner) {
-            territory.owner = socket.id;
+    lobby.nukes.forEach((nuke) => {
+      if (nuke.phase === "flying") {
+        const dx = nuke.dropX - nuke.bomberX;
+        const dy = nuke.dropY - nuke.bomberY;
+        const distance = Math.sqrt(dx * dx + dy * dy);
+        const speed = 2.8;
+
+        if (distance <= speed) {
+          nuke.phase = "dropped";
+          nuke.nukeX = nuke.dropX;
+          nuke.nukeY = 0;
+          nuke.dropAtMs = Date.now();
+          nuke.detonateAtMs = Date.now() + 5000;
+        } else {
+          nuke.bomberX += (dx / distance) * speed;
+          nuke.bomberY += (dy / distance) * speed;
+        }
+      } else if (nuke.phase === "dropped") {
+        nuke.nukeY += 2.8;
+
+        if (Date.now() >= nuke.detonateAtMs) {
+          const target = getTerritoryAtPoint(lobby, nuke.dropX, nuke.dropY);
+          if (target) {
+            target.owner = null;
+            target.tankCount = 0;
+            target.defense = 6;
+            target.resourcesRate = 0;
+          }
+
+          lobby.units.forEach((unit) => {
+            const ux = unit.x - nuke.dropX;
+            const uy = unit.y - nuke.dropY;
+            if (Math.sqrt(ux * ux + uy * uy) < 80) unit.hp = 0;
+          });
+
+          lobby.explosions.push({
+            id: uuidv4(),
+            x: nuke.dropX,
+            y: nuke.dropY,
+            radius: 30,
+            maxRadius: 230,
+            flash: true
+          });
+
+          nuke.phase = "done";
+          nuke.sunAudio = false;
         }
+      }
     });
 
-    socket.on("launchNuke", ({ lobbyId, territoryId, fromTerritory }) => {
+    lobby.explosions.forEach((explosion) => {
+      explosion.radius += explosion.flash ? 4.3 : 3;
+      if (explosion.flash) explosion.flash = explosion.radius < 120;
+    });
 
-    const lobby = lobbies[lobbyId];
-    const player = lobby.players[socket.id];
-
-    if (!player) return;
-    if (player.resources < 3000 || player.money < 1000) return;
-    if (!isWithinRange(lobby, socket.id, territoryId)) return;
-
-    player.resources -= 3000;
-    player.money -= 1000;
-
-    const start = lobby.territories[fromTerritory];
-
-    const bomber = {
-        id: uuidv4(),
-        type: "bomber",
-        owner: socket.id,
-        x: start.center.x,
-        y: start.center.y,
-        home: fromTerritory,
-        target: territoryId,
-        state: "takingoff",
-        scale: 0.2,
-        speed: 25,
-        hasNuke: true
-    };
+    lobby.units = lobby.units.filter((unit) => unit.hp > 0);
+    lobby.nukes = lobby.nukes.filter((nuke) => nuke.phase !== "done");
+    lobby.explosions = lobby.explosions.filter((explosion) => explosion.radius < explosion.maxRadius);
 
-    lobby.airUnits.push(bomber);
-});
+    broadcastLobbyState(lobby.id);
+  });
+}, 1000 / 30);
 
-server.listen(3000, () => {
-    console.log("Server running on port 3000");
+const PORT = process.env.PORT || 3000;
+server.listen(PORT, () => {
+  console.log(`Pixel Wars server running on port ${PORT}`);
 });
 
EOF
)
