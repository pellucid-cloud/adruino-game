import './style.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const scoreEl = document.querySelector('#score');
const speedEl = document.querySelector('#speed');
const startPanel = document.querySelector('#startPanel');
const gameOverPanel = document.querySelector('#gameOverPanel');
const finalScoreEl = document.querySelector('#finalScore');
const startBtn = document.querySelector('#startBtn');
const restartBtn = document.querySelector('#restartBtn');
const arduinoStatusEl = document.querySelector('#arduinoStatus');

const W = canvas.width;
const H = canvas.height;

const road = {
  left: 72,
  right: 408,
  laneCount: 3,
};

const player = {
  x: W / 2 - 19,
  y: H - 118,
  width: 38,
  height: 62,
  moveSpeed: 360,
};

const keys = {
  left: false,
  right: false,
};

let state = 'ready';
let obstacles = [];
let roadLines = [];
let lastTime = 0;
let elapsed = 0;
let spawnTimer = 0;
let distance = 0;
let animationId = 0;
let arduinoUnlisteners = [];

async function initArduino() {
  try {
    arduinoUnlisteners = await Promise.all([
      listen('arduino-left-down', () => {
        keys.left = true;
      }),
      listen('arduino-left-up', () => {
        keys.left = false;
      }),
      listen('arduino-right-down', () => {
        keys.right = true;
      }),
      listen('arduino-right-up', () => {
        keys.right = false;
      }),
      listen('arduino-status', (event) => {
        arduinoStatusEl.textContent = event.payload;
      }),
    ]);

    const port = await invoke('start_serial');
    arduinoStatusEl.textContent = `Arduino：${port}`;
  } catch (error) {
    arduinoStatusEl.textContent = `Arduino：未连接`;
    console.warn('Arduino 串口未连接：', error);
  }
}

function resetGame() {
  state = 'running';
  obstacles = [];
  elapsed = 0;
  spawnTimer = 0;
  distance = 0;
  player.x = W / 2 - player.width / 2;
  keys.left = false;
  keys.right = false;

  roadLines = [];
  for (let i = 0; i < 18; i++) {
    roadLines.push({ y: i * 48, length: 28 });
  }

  startPanel.classList.add('hidden');
  gameOverPanel.classList.add('hidden');
  scoreEl.textContent = '0 m';
  speedEl.textContent = '1.0x';
}

function startGame() {
  resetGame();
  lastTime = performance.now();
  cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(gameLoop);
}

function endGame() {
  state = 'gameover';
  finalScoreEl.textContent = `${Math.floor(distance)} m`;
  gameOverPanel.classList.remove('hidden');
}

function togglePause() {
  if (state === 'running') {
    state = 'paused';
  } else if (state === 'paused') {
    state = 'running';
    lastTime = performance.now();
    animationId = requestAnimationFrame(gameLoop);
  }
}

function spawnObstacle() {
  const lane = Math.floor(Math.random() * road.laneCount);
  const laneWidth = (road.right - road.left) / road.laneCount;
  const width = 46 + Math.random() * 8;
  const height = 58 + Math.random() * 22;

  obstacles.push({
    x: road.left + lane * laneWidth + laneWidth / 2 - width / 2,
    y: -height - 10,
    width,
    height,
    rotation: (Math.random() - .5) * .08,
  });
}

function getWorldSpeed() {
  return 260 + Math.min(elapsed * 13, 460);
}

function update(dt) {
  elapsed += dt;
  distance += getWorldSpeed() * dt * 0.038;

  const speedMultiplier = getWorldSpeed() / 260;
  speedEl.textContent = `${speedMultiplier.toFixed(1)}x`;
  scoreEl.textContent = `${Math.floor(distance)} m`;

  const move = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  player.x += move * player.moveSpeed * dt;

  const minX = road.left + 14;
  const maxX = road.right - player.width - 14;
  player.x = Math.max(minX, Math.min(maxX, player.x));

  const worldSpeed = getWorldSpeed();
  for (const line of roadLines) {
    line.y += worldSpeed * dt;
    if (line.y > H + 20) line.y = -line.length;
  }

  spawnTimer += dt;
  const spawnInterval = Math.max(0.52, 0.95 - elapsed * 0.008);
  if (spawnTimer >= spawnInterval) {
    spawnTimer = 0;
    spawnObstacle();

    if (Math.random() < Math.min(0.18 + elapsed * 0.004, 0.42)) {
      setTimeout(() => {
        if (state === 'running') spawnObstacle();
      }, 140);
    }
  }

  for (const obstacle of obstacles) {
    obstacle.y += worldSpeed * dt;
  }

  obstacles = obstacles.filter(obstacle => obstacle.y < H + 100);

  for (const obstacle of obstacles) {
    if (rectsOverlap(player, obstacle)) {
      endGame();
      break;
    }
  }
}

function rectsOverlap(a, b) {
  const paddingX = 7;
  const paddingY = 7;
  return (
    a.x + paddingX < b.x + b.width - paddingX &&
    a.x + a.width - paddingX > b.x + paddingX &&
    a.y + paddingY < b.y + b.height - paddingY &&
    a.y + a.height - paddingY > b.y + paddingY
  );
}

function draw() {
  drawBackground();
  drawRoad();
  drawRoadLines();
  drawObstacles();
  drawPlayer();

  if (state === 'paused') {
    ctx.fillStyle = 'rgba(4, 7, 15, .42)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = '700 34px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('已暂停', W / 2, H / 2);
  }
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, '#15213a');
  gradient.addColorStop(1, '#09101e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#20314e';
  ctx.beginPath();
  ctx.moveTo(0, 260);
  ctx.lineTo(90, 170);
  ctx.lineTo(155, 260);
  ctx.lineTo(235, 150);
  ctx.lineTo(330, 260);
  ctx.lineTo(410, 175);
  ctx.lineTo(W, 260);
  ctx.lineTo(W, 0);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
}

function drawRoad() {
  ctx.fillStyle = '#222a3b';
  ctx.beginPath();
  ctx.moveTo(road.left - 42, 0);
  ctx.lineTo(road.right + 42, 0);
  ctx.lineTo(road.right + 74, H);
  ctx.lineTo(road.left - 74, H);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#141a27';
  ctx.beginPath();
  ctx.moveTo(road.left, 0);
  ctx.lineTo(road.right, 0);
  ctx.lineTo(road.right + 28, H);
  ctx.lineTo(road.left - 28, H);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#66708a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(road.left, 0);
  ctx.lineTo(road.left - 28, H);
  ctx.moveTo(road.right, 0);
  ctx.lineTo(road.right + 28, H);
  ctx.stroke();
}

function drawRoadLines() {
  const laneWidth = (road.right - road.left) / road.laneCount;
  ctx.strokeStyle = 'rgba(255,255,255,.17)';
  ctx.lineWidth = 4;

  for (let lane = 1; lane < road.laneCount; lane++) {
    const x = road.left + lane * laneWidth;
    for (const line of roadLines) {
      const perspective = 1 + Math.max(0, line.y / H) * 1.2;
      const half = (line.length * perspective) / 2;
      ctx.beginPath();
      ctx.moveTo(x, line.y - half);
      ctx.lineTo(x, line.y + half);
      ctx.stroke();
    }
  }
}

function drawObstacles() {
  for (const obstacle of obstacles) {
    ctx.save();
    ctx.translate(obstacle.x + obstacle.width / 2, obstacle.y + obstacle.height / 2);
    ctx.rotate(obstacle.rotation);

    const grad = ctx.createLinearGradient(0, -obstacle.height / 2, 0, obstacle.height / 2);
    grad.addColorStop(0, '#ff6b77');
    grad.addColorStop(1, '#b82f48');
    ctx.fillStyle = grad;
    roundedRect(ctx, -obstacle.width / 2, -obstacle.height / 2, obstacle.width, obstacle.height, 10);
    ctx.fill();

    ctx.fillStyle = '#ffd4d8';
    ctx.fillRect(-obstacle.width * .30, -obstacle.height * .16, obstacle.width * .60, 8);
    ctx.fillRect(-obstacle.width * .30, obstacle.height * .08, obstacle.width * .60, 8);

    ctx.restore();
  }
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x + player.width / 2, player.y + player.height / 2);

  const grad = ctx.createLinearGradient(0, -player.height / 2, 0, player.height / 2);
  grad.addColorStop(0, '#5ee7ff');
  grad.addColorStop(1, '#2d70ff');
  ctx.fillStyle = grad;
  roundedRect(ctx, -player.width / 2, -player.height / 2, player.width, player.height, 11);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,.85)';
  roundedRect(ctx, -11, -18, 22, 18, 6);
  ctx.fill();

  ctx.fillStyle = '#18326f';
  ctx.fillRect(-11, 5, 8, 16);
  ctx.fillRect(3, 5, 8, 16);

  ctx.fillStyle = 'rgba(0,0,0,.20)';
  ctx.beginPath();
  ctx.ellipse(0, player.height / 2 + 8, 25, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function gameLoop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.035);
  lastTime = now;

  if (state === 'running') update(dt);
  draw();

  if (state === 'running' || state === 'paused') {
    animationId = requestAnimationFrame(gameLoop);
  }
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    if (event.key === 'ArrowLeft') keys.left = true;
    if (event.key === 'ArrowRight') keys.right = true;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    if (state === 'running' || state === 'paused') togglePause();
  }

  if (event.key === 'Enter' && (state === 'ready' || state === 'gameover')) {
    startGame();
  }
});

document.addEventListener('keyup', (event) => {
  if (event.key === 'ArrowLeft') keys.left = false;
  if (event.key === 'ArrowRight') keys.right = false;
});

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

resetGame();
draw();
initArduino();
