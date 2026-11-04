import * as THREE from 'three';
import './style.css';
import { MATCH_SECONDS, COUNTDOWN_SECONDS, OBSTACLES, TEAMS, HALF } from './config.js';
import { PaintSurface } from './paint.js';
import { buildArena, obstacleAt } from './arena.js';
import { Player } from './player.js';
import { Effects } from './effects.js';
import { Input, PAD } from './input.js';
import { Sfx } from './audio.js';
import { Hud } from './hud.js';
import { Bot } from './bot.js';

class CameraRig {
  constructor(index) {
    this.cam = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
    this.cam.layers.enable(1 + index);
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.tp = new THREE.Vector3();
    this.tl = new THREE.Vector3();
  }

  follow(p, dt, snap) {
    const s = Math.sin(p.yaw);
    const c = Math.cos(p.yaw);
    if (p.alive) {
      const dist = p.squid ? 4.6 : 5.4;
      const height = (p.squid ? 1.9 : 2.6) - p.pitch * 1.6;
      this.tp.set(p.pos.x - s * dist, height, p.pos.z - c * dist);
      const o = obstacleAt(OBSTACLES, this.tp.x, this.tp.z, this.tp.y + 0.3);
      if (o) this.tp.y = o.h + 0.6;
      this.tl.set(p.pos.x + s * 8, 0.9 + p.pitch * 5, p.pos.z + c * 8);
    } else {
      this.tp.set(p.pos.x - s * 5, 9, p.pos.z - c * 5);
      this.tl.set(p.pos.x, 0, p.pos.z);
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 10);
    this.pos.lerp(this.tp, k);
    this.look.lerp(this.tl, k);
    this.cam.position.copy(this.pos);
    this.cam.lookAt(this.look);
  }

  orbit(t, i) {
    const a = t * 0.08 + i * Math.PI;
    this.cam.position.set(Math.cos(a) * 40, 22, Math.sin(a) * 40);
    this.cam.lookAt(0, 0, 0);
  }
}

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
const resize = () => renderer.setSize(innerWidth, innerHeight, false);
addEventListener('resize', resize);
resize();

const scene = new THREE.Scene();
const paint = new PaintSurface(OBSTACLES);
buildArena(scene, paint);
const players = [new Player(0, scene), new Player(1, scene)];
const fx = new Effects(scene);
const input = new Input();
const audio = new Sfx();
const hud = new Hud(document.getElementById('hud'));
const rigs = [new CameraRig(0), new CameraRig(1)];
const overlay = document.getElementById('overlay');

const game = { paint, obstacles: OBSTACLES, players, fx, audio, hud, onSplat };

let state = 'title';
let solo = false;
let bot = null;
let timeLeft = MATCH_SECONDS;
let countdown = 0;
let goT = 0;
let lastBeep = 0;
let warned = false;
let titleT = 0;
let attractT = 0;
let timeupT = 0;

function onSplat(victim, attacker) {
  audio.splatted(victim.index);
  if (attacker) hud.toast(attacker.index, `You splatted ${victim.team.name}!`);
  hud.toast(victim.index, attacker ? `Splatted by ${attacker.team.name}` : 'Splatted!');
}

const CONTROLS = [
  ['Move', 'W / S', 'I / K', 'Left stick'],
  ['Turn', 'A / D', 'J / L', 'Right stick'],
  ['Strafe', 'Q / E', 'U / O', 'Left stick'],
  ['Aim up/down', '—', '—', 'Right stick'],
  ['Shoot', 'F', 'H', 'RT'],
  ['Squid (swim)', 'Shift or C', 'N or ;', 'LT / LB'],
  ['Splat bomb', 'R', 'Y', 'RB'],
];

function showTitle() {
  state = 'title';
  solo = false;
  bot = null;
  hud.show(false);
  fx.clear();
  paint.reset();
  overlay.className = '';
  overlay.innerHTML = `
    <div class="card title-card">
      <h1><span class="a">A Couch</span> <span class="b">Divided</span></h1>
      <p class="sub">a splitscreen ink turf war</p>
      <div class="modes">
        <button data-mode="2p"><b>2 Players</b><small>press 1 · pad Ⓐ</small></button>
        <button data-mode="cpu"><b>vs CPU</b><small>press 2 · pad Ⓧ</small></button>
      </div>
      <table class="controls">
        <thead><tr><th></th><th class="a">P1 (left)</th><th class="b">P2 (right)</th><th>Gamepad</th></tr></thead>
        <tbody>${CONTROLS.map((r) => `<tr>${r.map((c, j) => (j ? `<td>${c}</td>` : `<th>${c}</th>`)).join('')}</tr>`).join('')}</tbody>
      </table>
      <p class="tip">Cover the most floor in your color in ${MATCH_SECONDS / 60} minutes. Swim in your own ink to go fast and refill.
      Enemy ink slows you down and hurts. Gamepads are assigned P1 then P2 in the order they connect. Esc pauses.</p>
    </div>`;
  overlay.querySelectorAll('button[data-mode]').forEach((b) =>
    b.addEventListener('click', () => startMatch(b.dataset.mode === 'cpu')),
  );
}

function showPause() {
  overlay.className = '';
  overlay.innerHTML = `
    <div class="card small-card">
      <h2>Paused</h2>
      <p class="hint">Esc / Start — resume · M / Ⓑ — quit to menu</p>
    </div>`;
}

function showResults() {
  state = 'end';
  const cov = paint.coverage();
  const winner = cov[0] > cov[1] ? 0 : cov[1] > cov[0] ? 1 : -1;
  const headline = winner < 0 ? "It's a tie!" : `${TEAMS[winner].name} wins!`;
  overlay.className = '';
  overlay.innerHTML = `
    <div class="card end-card" style="--win:${winner < 0 ? '#fff' : TEAMS[winner].css}">
      <h2>${headline}</h2>
      ${players
        .map(
          (p, i) => `
        <div class="result ${i ? 'b' : 'a'}">
          <div class="who">P${i + 1}${solo && i === 1 ? ' (CPU)' : ''} · ${p.team.name}</div>
          <div class="bar"><div class="fill" data-w="${(cov[i] * 100).toFixed(1)}"></div></div>
          <div class="num">${(cov[i] * 100).toFixed(1)}%</div>
          <div class="stats">${p.kills} splats · ${p.deaths} splatted</div>
        </div>`,
        )
        .join('')}
      <p class="hint">Enter / Ⓐ — rematch · Esc / Ⓑ — menu</p>
    </div>`;
  requestAnimationFrame(() =>
    overlay.querySelectorAll('.fill').forEach((f) => (f.style.width = `${f.dataset.w}%`)),
  );
}

function startMatch(cpu) {
  audio.unlock();
  solo = cpu;
  audio.solo = cpu;
  hud.setSolo(cpu);
  hud.show(true);
  overlay.className = 'hidden';
  paint.reset();
  fx.clear();
  for (const p of players) {
    p.kills = 0;
    p.deaths = 0;
    p.reset();
    paint.splat(p.spawn.x, p.spawn.z, 4.5, p.teamId, 0);
    p.animate(0);
  }
  bot = cpu ? new Bot(players[1], players[0]) : null;
  timeLeft = MATCH_SECONDS;
  countdown = COUNTDOWN_SECONDS;
  lastBeep = 0;
  goT = 0;
  warned = false;
  state = 'countdown';
  rigs.forEach((r, i) => r.follow(players[i], 0, true));
}

function handleMeta() {
  if (state === 'title') {
    if (input.key('Digit1') || input.key('Numpad1') || input.key('Enter') || input.padButton(PAD.A)) startMatch(false);
    else if (input.key('Digit2') || input.key('Numpad2') || input.padButton(PAD.X)) startMatch(true);
  } else if (state === 'end') {
    if (input.key('Enter') || input.key('Space') || input.padButton(PAD.A)) startMatch(solo);
    else if (input.key('Escape') || input.padButton(PAD.B)) showTitle();
  } else if (state === 'play' || state === 'countdown') {
    if (input.key('Escape') || input.padButton(PAD.START)) {
      state = 'paused';
      showPause();
    }
  } else if (state === 'paused') {
    if (input.key('Escape') || input.key('Enter') || input.padButton(PAD.START)) {
      overlay.className = 'hidden';
      state = countdown > 0 ? 'countdown' : 'play';
    } else if (input.key('KeyM') || input.padButton(PAD.B)) {
      showTitle();
    }
  }
}

function step(dt) {
  if (state === 'title') {
    titleT += dt;
    attractT -= dt;
    if (attractT <= 0) {
      attractT = 0.05;
      const r = HALF - 2;
      paint.splat((Math.random() * 2 - 1) * r, (Math.random() * 2 - 1) * r, 0.8 + Math.random() * 2, Math.random() < 0.5 ? 1 : 2, 4);
      const [a, b] = paint.coverage();
      if (a + b > 0.9) paint.reset();
    }
    rigs.forEach((r, i) => r.orbit(titleT, i));
    return;
  }
  if (state === 'paused') return;

  if (state === 'countdown') {
    countdown -= dt;
    const n = Math.ceil(countdown);
    if (n !== lastBeep && n > 0) {
      lastBeep = n;
      audio.beep(false);
    }
    if (countdown <= 0) {
      countdown = 0;
      state = 'play';
      goT = 0.8;
      audio.beep(true);
    }
  }

  if (state === 'play') {
    goT -= dt;
    players.forEach((p, i) => p.update(dt, bot && i === 1 ? bot.think(dt, game) : input.player(i), game));
    timeLeft -= dt;
    if (!warned && timeLeft <= 60) {
      warned = true;
      players.forEach((p) => hud.toast(p.index, 'One minute left!', 2.5));
    }
    if (timeLeft <= 10 && timeLeft > 0) {
      const n = Math.ceil(timeLeft);
      if (n !== lastBeep) {
        lastBeep = n;
        audio.beep(false);
      }
    }
    if (timeLeft <= 0) {
      timeLeft = 0;
      state = 'timeup';
      timeupT = 1.6;
      audio.whistle();
    }
  } else {
    players.forEach((p) => p.animate(dt));
  }

  if (state === 'timeup') {
    timeupT -= dt;
    if (timeupT <= 0) showResults();
  }

  fx.update(dt, game);
  rigs.forEach((r, i) => r.follow(players[i], dt, false));

  players.forEach((p, i) => {
    let n = '';
    if (state === 'countdown') n = String(Math.ceil(countdown));
    else if (state === 'timeup') n = 'TIME!';
    else if (goT > 0) n = 'GO!';
    else if (!p.alive) n = `Respawn in ${Math.ceil(p.respawnIn)}`;
    hud.notice(i, n);
  });
  hud.update(dt, players, timeLeft, paint.coverage());
}

function render() {
  const W = renderer.domElement.width / renderer.getPixelRatio();
  const H = renderer.domElement.height / renderer.getPixelRatio();
  const views = solo && state !== 'title' ? [[0, 0, W, H]] : [[0, 0, W / 2, H], [W / 2, 0, W / 2, H]];
  renderer.shadowMap.needsUpdate = true;
  renderer.setScissorTest(true);
  views.forEach(([x, y, w, h], i) => {
    const cam = rigs[i].cam;
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    renderer.setViewport(x, y, w, h);
    renderer.setScissor(x, y, w, h);
    renderer.render(scene, cam);
  });
}

let last = performance.now();
let frameNo = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  input.poll();
  handleMeta();
  step(dt);
  paint.flush();
  render();
  if (state !== 'title' && frameNo++ % 4 === 0) hud.drawMinimap(paint, players);
  input.endFrame();
  requestAnimationFrame(frame);
}

showTitle();
requestAnimationFrame(frame);
