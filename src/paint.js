import * as THREE from 'three';
import { ARENA_SIZE, HALF, TEAMS } from './config.js';

const TEX = 1024;
const GRID = 256;
const CELL = ARENA_SIZE / GRID;

// The floor's ink lives in two places: a canvas texture for looks, and a coarse ownership grid
// that drives gameplay (swimming, damage, scoring). Every splat writes to both.
export class PaintSurface {
  constructor(obstacles) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = TEX;
    this.ctx = this.canvas.getContext('2d');
    this.grid = new Uint8Array(GRID * GRID);
    this.mask = new Uint8Array(GRID * GRID);
    this.total = 0;
    for (let gz = 0; gz < GRID; gz++) {
      const z = (gz + 0.5) * CELL - HALF;
      for (let gx = 0; gx < GRID; gx++) {
        const x = (gx + 0.5) * CELL - HALF;
        const blocked = obstacles.some((o) => x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ);
        if (blocked) this.mask[gz * GRID + gx] = 1;
        else this.total++;
      }
    }
    this.counts = new Int32Array(3);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.reset();
  }

  reset() {
    this.grid.fill(0);
    this.counts.fill(0);
    this.counts[0] = this.total;
    this.drawBase();
    this.dirty = true;
  }

  drawBase() {
    const c = this.ctx;
    c.fillStyle = '#4a5063';
    c.fillRect(0, 0, TEX, TEX);
    c.strokeStyle = 'rgba(255,255,255,0.07)';
    c.lineWidth = 2;
    for (let i = 0; i <= ARENA_SIZE; i += 4) {
      const p = (i / ARENA_SIZE) * TEX;
      c.beginPath();
      c.moveTo(p, 0);
      c.lineTo(p, TEX);
      c.moveTo(0, p);
      c.lineTo(TEX, p);
      c.stroke();
    }
    c.strokeStyle = 'rgba(255,255,255,0.18)';
    c.lineWidth = 6;
    c.setLineDash([24, 18]);
    c.beginPath();
    c.moveTo(TEX / 2, 0);
    c.lineTo(TEX / 2, TEX);
    c.stroke();
    c.setLineDash([]);
  }

  toTex(v) {
    return ((v + HALF) / ARENA_SIZE) * TEX;
  }

  ownerAt(x, z) {
    const gx = Math.floor((x + HALF) / CELL);
    const gz = Math.floor((z + HALF) / CELL);
    if (gx < 0 || gz < 0 || gx >= GRID || gz >= GRID) return 0;
    return this.grid[gz * GRID + gx];
  }

  splat(x, z, r, teamId, scatter = 4) {
    this.circle(x, z, r, teamId);
    for (let i = 0; i < scatter; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = r * (0.7 + Math.random() * 0.6);
      this.circle(x + Math.cos(a) * d, z + Math.sin(a) * d, r * (0.15 + Math.random() * 0.3), teamId);
    }
  }

  circle(x, z, r, teamId) {
    const c = this.ctx;
    c.fillStyle = TEAMS[teamId - 1].css;
    c.beginPath();
    c.arc(this.toTex(x), this.toTex(z), (r / ARENA_SIZE) * TEX, 0, Math.PI * 2);
    c.fill();

    const gx0 = Math.max(0, Math.floor((x - r + HALF) / CELL));
    const gx1 = Math.min(GRID - 1, Math.floor((x + r + HALF) / CELL));
    const gz0 = Math.max(0, Math.floor((z - r + HALF) / CELL));
    const gz1 = Math.min(GRID - 1, Math.floor((z + r + HALF) / CELL));
    const r2 = r * r;
    for (let gz = gz0; gz <= gz1; gz++) {
      const dz = (gz + 0.5) * CELL - HALF - z;
      for (let gx = gx0; gx <= gx1; gx++) {
        const dx = (gx + 0.5) * CELL - HALF - x;
        if (dx * dx + dz * dz > r2) continue;
        const i = gz * GRID + gx;
        if (this.mask[i]) continue;
        const old = this.grid[i];
        if (old !== teamId) {
          this.counts[old]--;
          this.counts[teamId]++;
          this.grid[i] = teamId;
        }
      }
    }
    this.dirty = true;
  }

  coverage() {
    return [this.counts[1] / this.total, this.counts[2] / this.total];
  }

  flush() {
    if (this.dirty) {
      this.texture.needsUpdate = true;
      this.dirty = false;
    }
  }
}
