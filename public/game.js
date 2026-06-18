const WORLD = { width: 960, height: 540 };
const COLORS = ["#22c55e", "#38bdf8", "#f97316", "#e879f9"];

const lobby = document.querySelector("#lobby");
const game = document.querySelector("#game");
const form = document.querySelector("#joinForm");
const nameInput = document.querySelector("#nameInput");
const roomInput = document.querySelector("#roomInput");
const serverStatus = document.querySelector("#serverStatus");
const roomLabel = document.querySelector("#roomLabel");
const playersLabel = document.querySelector("#playersLabel");
const copyRoom = document.querySelector("#copyRoom");
const canvas = document.querySelector("#battlefield");
const ctx = canvas.getContext("2d");
const stick = document.querySelector("#stick");
const knob = document.querySelector("#knob");
const fire = document.querySelector("#fire");

let socket;
let myId = "";
let roomCode = "";
let state = { players: [], bullets: [], walls: [], explosions: [] };
let input = { x: 0, y: 0, fire: false };
let lastSent = 0;

const wsUrl = (() => {
  const configured = new URLSearchParams(location.search).get("server");
  if (configured) return configured;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}`;
})();

function connect() {
  socket = new WebSocket(wsUrl);
  socket.addEventListener("open", () => {
    serverStatus.textContent = "服务器已连接";
  });
  socket.addEventListener("close", () => {
    serverStatus.textContent = "连接已断开，正在重连...";
    setTimeout(connect, 1200);
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "joined") {
      myId = message.id;
      roomCode = message.room;
      lobby.classList.add("hidden");
      game.classList.remove("hidden");
      roomLabel.textContent = `房间 ${roomCode}`;
      resizeCanvas();
    }
    if (message.type === "state") {
      state = message.state;
      playersLabel.textContent = `${state.players.length}/4`;
    }
    if (message.type === "error") {
      serverStatus.textContent = message.message;
    }
  });
}

function send(type, payload = {}) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, ...payload }));
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = nameInput.value.trim() || `玩家${Math.floor(Math.random() * 90 + 10)}`;
  send("join", { name, room: roomInput.value.trim().toUpperCase() });
});

copyRoom.addEventListener("click", async () => {
  await navigator.clipboard?.writeText(roomCode);
  copyRoom.textContent = "已复制";
  setTimeout(() => {
    copyRoom.textContent = "复制房间号";
  }, 900);
});

function bindStick() {
  let activeId = null;
  const max = 42;

  function update(point) {
    const rect = stick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = point.clientX - cx;
    const dy = point.clientY - cy;
    const distance = Math.hypot(dx, dy) || 1;
    const limited = Math.min(max, distance);
    const x = (dx / distance) * limited;
    const y = (dy / distance) * limited;
    knob.style.transform = `translate(${x}px, ${y}px)`;
    input.x = Math.abs(dx) < 8 ? 0 : dx / max;
    input.y = Math.abs(dy) < 8 ? 0 : dy / max;
  }

  stick.addEventListener("pointerdown", (event) => {
    activeId = event.pointerId;
    stick.setPointerCapture(activeId);
    update(event);
  });
  stick.addEventListener("pointermove", (event) => {
    if (event.pointerId === activeId) update(event);
  });
  stick.addEventListener("pointerup", () => {
    activeId = null;
    input.x = 0;
    input.y = 0;
    knob.style.transform = "translate(0, 0)";
  });
}

fire.addEventListener("pointerdown", () => {
  input.fire = true;
});
fire.addEventListener("pointerup", () => {
  input.fire = false;
});
fire.addEventListener("pointercancel", () => {
  input.fire = false;
});

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") input.x = -1;
  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") input.x = 1;
  if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") input.y = -1;
  if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") input.y = 1;
  if (event.code === "Space") input.fire = true;
});
window.addEventListener("keyup", (event) => {
  if (["ArrowLeft", "ArrowRight", "a", "d"].includes(event.key)) input.x = 0;
  if (["ArrowUp", "ArrowDown", "w", "s"].includes(event.key)) input.y = 0;
  if (event.code === "Space") input.fire = false;
});

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = WORLD.width * ratio;
  canvas.height = WORLD.height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function drawGrid() {
  ctx.fillStyle = "#172033";
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= WORLD.width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD.height);
    ctx.stroke();
  }
  for (let y = 0; y <= WORLD.height; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD.width, y);
    ctx.stroke();
  }
}

function drawWalls() {
  for (const wall of state.walls) {
    ctx.fillStyle = wall.breakable ? "#92400e" : "#334155";
    ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.strokeRect(wall.x + 0.5, wall.y + 0.5, wall.w - 1, wall.h - 1);
  }
}

function drawTank(player, index) {
  const color = COLORS[index % COLORS.length];
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);
  ctx.fillStyle = player.alive ? color : "#64748b";
  ctx.fillRect(-17, -14, 34, 28);
  ctx.fillStyle = "rgba(15,23,42,0.6)";
  ctx.fillRect(-11, -9, 22, 18);
  ctx.fillStyle = player.alive ? "#f8fafc" : "#94a3b8";
  ctx.fillRect(4, -4, 24, 8);
  ctx.restore();

  ctx.fillStyle = "#f8fafc";
  ctx.font = "12px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(player.name, player.x, player.y - 24);

  ctx.fillStyle = player.id === myId ? "#facc15" : "rgba(255,255,255,0.35)";
  ctx.fillRect(player.x - 18, player.y + 22, 36, 4);
  ctx.fillStyle = "#22c55e";
  ctx.fillRect(player.x - 18, player.y + 22, 36 * Math.max(0, player.hp / 3), 4);
}

function drawBullets() {
  ctx.fillStyle = "#fde68a";
  for (const bullet of state.bullets) {
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawExplosions() {
  for (const boom of state.explosions) {
    ctx.strokeStyle = `rgba(248, 113, 113, ${boom.life / 16})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(boom.x, boom.y, 28 - boom.life, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawScoreboard() {
  const rows = [...state.players].sort((a, b) => b.score - a.score);
  ctx.textAlign = "left";
  ctx.font = "14px system-ui";
  rows.forEach((player, index) => {
    ctx.fillStyle = COLORS[index % COLORS.length];
    ctx.fillRect(18, 68 + index * 24, 10, 10);
    ctx.fillStyle = "#f8fafc";
    ctx.fillText(`${player.name}  ${player.score}`, 36, 78 + index * 24);
  });
}

function frame(time) {
  if (time - lastSent > 33) {
    send("input", { input });
    lastSent = time;
  }

  drawGrid();
  drawWalls();
  state.players.forEach(drawTank);
  drawBullets();
  drawExplosions();
  drawScoreboard();
  requestAnimationFrame(frame);
}

window.addEventListener("resize", resizeCanvas);
bindStick();
connect();
resizeCanvas();
requestAnimationFrame(frame);
