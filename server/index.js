import http from "node:http";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket, { WebSocketServer } from "ws";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = normalize(join(__dirname, "..", "public"));
const PORT = Number(process.env.PORT || 3000);
const WORLD = { width: 960, height: 540 };
const TANK_RADIUS = 18;
const BULLET_SPEED = 8;
const PLAYER_SPEED = 3.1;
const ROOM_LIMIT = 4;

const rooms = new Map();
const sockets = new Map();

const walls = [
  { x: 210, y: 96, w: 44, h: 156, breakable: false },
  { x: 706, y: 288, w: 44, h: 156, breakable: false },
  { x: 428, y: 60, w: 104, h: 36, breakable: true, hp: 2 },
  { x: 428, y: 444, w: 104, h: 36, breakable: true, hp: 2 },
  { x: 144, y: 354, w: 132, h: 34, breakable: true, hp: 2 },
  { x: 684, y: 152, w: 132, h: 34, breakable: true, hp: 2 },
  { x: 438, y: 244, w: 84, h: 52, breakable: false }
];

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = normalize(join(publicDir, path));
    if (!file.startsWith(publicDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  const id = crypto.randomUUID();
  sockets.set(ws, { id, room: "", input: { x: 0, y: 0, fire: false } });

  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (message.type === "join") joinRoom(ws, id, message);
    if (message.type === "input") {
      const meta = sockets.get(ws);
      if (!meta) return;
      meta.input = sanitizeInput(message.input);
    }
  });

  ws.on("close", () => {
    const meta = sockets.get(ws);
    if (meta?.room) {
      const room = rooms.get(meta.room);
      if (room) {
        room.players.delete(id);
        if (room.players.size === 0) rooms.delete(meta.room);
      }
    }
    sockets.delete(ws);
  });
});

function joinRoom(ws, id, message) {
  const requestedRoom = String(message.room || "").replace(/[^A-Z0-9]/g, "").slice(0, 8);
  const roomCode = requestedRoom || createRoomCode();
  let room = rooms.get(roomCode);
  if (!room) {
    room = {
      code: roomCode,
      players: new Map(),
      bullets: [],
      walls: walls.map((wall) => ({ ...wall })),
      explosions: []
    };
    rooms.set(roomCode, room);
  }
  if (room.players.size >= ROOM_LIMIT && !room.players.has(id)) {
    ws.send(JSON.stringify({ type: "error", message: "房间已满" }));
    return;
  }

  const spawn = spawnPoint(room.players.size);
  const name = String(message.name || "玩家").trim().slice(0, 12);
  room.players.set(id, {
    id,
    name,
    x: spawn.x,
    y: spawn.y,
    angle: spawn.angle,
    hp: 3,
    score: 0,
    alive: true,
    cooldown: 0,
    respawn: 0
  });
  sockets.set(ws, { ...sockets.get(ws), room: roomCode });
  ws.send(JSON.stringify({ type: "joined", id, room: roomCode }));
}

function createRoomCode() {
  let code = "";
  do {
    code = crypto.randomBytes(3).toString("hex").toUpperCase();
  } while (rooms.has(code));
  return code;
}

function spawnPoint(index) {
  return [
    { x: 76, y: 78, angle: 0 },
    { x: 884, y: 462, angle: Math.PI },
    { x: 884, y: 78, angle: Math.PI },
    { x: 76, y: 462, angle: 0 }
  ][index % ROOM_LIMIT];
}

function sanitizeInput(input = {}) {
  const x = Math.max(-1, Math.min(1, Number(input.x) || 0));
  const y = Math.max(-1, Math.min(1, Number(input.y) || 0));
  return { x, y, fire: Boolean(input.fire) };
}

function updateRoom(room) {
  for (const [id, player] of room.players) {
    const ws = [...sockets.entries()].find(([, meta]) => meta.id === id)?.[0];
    const meta = ws ? sockets.get(ws) : null;
    const input = meta?.input || { x: 0, y: 0, fire: false };

    if (!player.alive) {
      player.respawn -= 1;
      if (player.respawn <= 0) {
        const spawn = spawnPoint(Math.floor(Math.random() * ROOM_LIMIT));
        Object.assign(player, { x: spawn.x, y: spawn.y, angle: spawn.angle, hp: 3, alive: true });
      }
      continue;
    }

    const length = Math.hypot(input.x, input.y);
    if (length > 0.08) {
      const nx = input.x / Math.max(1, length);
      const ny = input.y / Math.max(1, length);
      player.angle = Math.atan2(ny, nx);
      movePlayer(room, player, nx * PLAYER_SPEED, ny * PLAYER_SPEED);
    }

    player.cooldown = Math.max(0, player.cooldown - 1);
    if (input.fire && player.cooldown === 0) {
      player.cooldown = 18;
      room.bullets.push({
        id: crypto.randomUUID(),
        owner: id,
        x: player.x + Math.cos(player.angle) * 26,
        y: player.y + Math.sin(player.angle) * 26,
        vx: Math.cos(player.angle) * BULLET_SPEED,
        vy: Math.sin(player.angle) * BULLET_SPEED,
        life: 72
      });
    }
  }

  updateBullets(room);
  room.explosions = room.explosions.map((boom) => ({ ...boom, life: boom.life - 1 })).filter((boom) => boom.life > 0);
  broadcast(room);
}

function movePlayer(room, player, dx, dy) {
  const next = {
    x: Math.max(TANK_RADIUS, Math.min(WORLD.width - TANK_RADIUS, player.x + dx)),
    y: Math.max(TANK_RADIUS, Math.min(WORLD.height - TANK_RADIUS, player.y + dy))
  };
  const blocked = room.walls.some((wall) => circleRect(next.x, next.y, TANK_RADIUS, wall));
  if (!blocked) {
    player.x = next.x;
    player.y = next.y;
  }
}

function updateBullets(room) {
  const kept = [];
  for (const bullet of room.bullets) {
    bullet.x += bullet.vx;
    bullet.y += bullet.vy;
    bullet.life -= 1;
    if (bullet.life <= 0 || bullet.x < 0 || bullet.y < 0 || bullet.x > WORLD.width || bullet.y > WORLD.height) continue;

    const wall = room.walls.find((item) => pointRect(bullet.x, bullet.y, item));
    if (wall) {
      room.explosions.push({ x: bullet.x, y: bullet.y, life: 16 });
      if (wall.breakable) {
        wall.hp -= 1;
        if (wall.hp <= 0) room.walls = room.walls.filter((item) => item !== wall);
      }
      continue;
    }

    const target = [...room.players.values()].find((player) => {
      return player.alive && player.id !== bullet.owner && Math.hypot(player.x - bullet.x, player.y - bullet.y) < TANK_RADIUS;
    });
    if (target) {
      target.hp -= 1;
      room.explosions.push({ x: bullet.x, y: bullet.y, life: 16 });
      if (target.hp <= 0) {
        target.alive = false;
        target.respawn = 90;
        const owner = room.players.get(bullet.owner);
        if (owner) owner.score += 1;
      }
      continue;
    }
    kept.push(bullet);
  }
  room.bullets = kept;
}

function broadcast(room) {
  const state = {
    players: [...room.players.values()].map(({ cooldown, respawn, ...player }) => player),
    bullets: room.bullets.map(({ id, x, y }) => ({ id, x, y })),
    walls: room.walls,
    explosions: room.explosions
  };
  for (const [ws, meta] of sockets) {
    if (meta.room === room.code && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "state", state }));
    }
  }
}

function circleRect(cx, cy, radius, rect) {
  const x = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const y = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  return Math.hypot(cx - x, cy - y) < radius;
}

function pointRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

setInterval(() => {
  for (const room of rooms.values()) updateRoom(room);
}, 1000 / 30);

server.listen(PORT, () => {
  console.log(`Tank battle server listening on http://localhost:${PORT}`);
});
