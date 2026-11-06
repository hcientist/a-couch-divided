import * as THREE from 'three';
import { TEAMS, SHOT, BOMB, HALF } from './config.js';
import { obstacleAt } from './arena.js';

const MAX_PARTICLES = 500;

// Projectiles, bombs, particles and blast flashes. Meshes are pooled per kind.
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.mats = TEAMS.map(
      (t) => new THREE.MeshStandardMaterial({ color: t.hex, emissive: t.hex, emissiveIntensity: 0.3, roughness: 0.25 }),
    );
    this.geo = {
      shot: new THREE.SphereGeometry(0.17, 10, 8),
      drop: new THREE.SphereGeometry(0.12, 6, 5),
      bomb: new THREE.SphereGeometry(0.3, 16, 12),
      blast: new THREE.SphereGeometry(1, 24, 16),
    };
    this.free = { shot: [], drop: [], bomb: [] };
    this.shots = [];
    this.bombs = [];
    this.drops = [];
    this.blasts = [];
  }

  take(kind, teamId) {
    const m = this.free[kind].pop() || new THREE.Mesh(this.geo[kind]);
    m.material = this.mats[teamId - 1];
    m.visible = true;
    m.scale.setScalar(1);
    if (!m.parent) this.scene.add(m);
    return m;
  }

  give(kind, m) {
    m.visible = false;
    this.free[kind].push(m);
  }

  clear() {
    for (const s of this.shots) this.give('shot', s.mesh);
    for (const b of this.bombs) this.give('bomb', b.mesh);
    for (const d of this.drops) this.give('drop', d.m);
    for (const b of this.blasts) this.removeBlast(b);
    this.shots = [];
    this.bombs = [];
    this.drops = [];
    this.blasts = [];
  }

  shoot(p) {
    const s = Math.sin(p.yaw);
    const c = Math.cos(p.yaw);
    const a = p.yaw + (Math.random() - 0.5) * SHOT.spread * 2;
    const pos = new THREE.Vector3(p.pos.x + s * 0.7 - c * 0.3, p.pos.y + 1.05, p.pos.z + c * 0.7 + s * 0.3);
    const vel = new THREE.Vector3(
      Math.sin(a) * SHOT.speed,
      SHOT.lift + p.pitch * 10 + (Math.random() - 0.5),
      Math.cos(a) * SHOT.speed,
    );
    const mesh = this.take('shot', p.teamId);
    mesh.position.copy(pos);
    this.shots.push({ mesh, pos, vel, teamId: p.teamId, owner: p, age: 0, drip: 0 });
  }

  throwBomb(p) {
    const s = Math.sin(p.yaw);
    const c = Math.cos(p.yaw);
    const pos = new THREE.Vector3(p.pos.x + s * 0.5, p.pos.y + 1.4, p.pos.z + c * 0.5);
    const vel = new THREE.Vector3(
      s * BOMB.speed + p.vel.x * 0.5,
      BOMB.lift + p.pitch * 8,
      c * BOMB.speed + p.vel.z * 0.5,
    );
    const mesh = this.take('bomb', p.teamId);
    mesh.castShadow = true;
    mesh.position.copy(pos);
    this.bombs.push({ mesh, pos, vel, teamId: p.teamId, owner: p, fuse: -1 });
  }

  burst(pos, teamId, n, power = 5) {
    for (let i = 0; i < n && this.drops.length < MAX_PARTICLES; i++) {
      const m = this.take('drop', teamId);
      m.position.copy(pos);
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * power;
      const vel = new THREE.Vector3(Math.cos(a) * r, (0.4 + Math.random()) * power, Math.sin(a) * r);
      const life = 0.4 + Math.random() * 0.5;
      this.drops.push({ m, vel, life, max: life, size: 0.6 + Math.random() * 0.9 });
    }
  }

  blast(pos, teamId, radius) {
    const mat = new THREE.MeshBasicMaterial({
      color: TEAMS[teamId - 1].hex,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    const m = new THREE.Mesh(this.geo.blast, mat);
    m.position.copy(pos);
    this.scene.add(m);
    this.blasts.push({ m, t: 0, radius });
  }

  removeBlast(b) {
    this.scene.remove(b.m);
    b.m.material.dispose();
  }

  update(dt, game) {
    this.updateShots(dt, game);
    this.updateBombs(dt, game);

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.vel.y -= 22 * dt;
      d.m.position.addScaledVector(d.vel, dt);
      if (d.m.position.y < 0.05) {
        d.m.position.y = 0.05;
        d.vel.set(0, 0, 0);
      }
      d.life -= dt;
      d.m.scale.setScalar(d.size * Math.max(0, d.life / d.max));
      if (d.life <= 0) {
        this.give('drop', d.m);
        this.drops.splice(i, 1);
      }
    }

    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      b.t += dt;
      const k = Math.min(1, b.t / 0.35);
      b.m.scale.setScalar(b.radius * (0.3 + 0.7 * (1 - (1 - k) ** 3)));
      b.m.material.opacity = 0.7 * (1 - k);
      if (k >= 1) {
        this.removeBlast(b);
        this.blasts.splice(i, 1);
      }
    }
  }

  updateShots(dt, game) {
    const { paint, players, obstacles } = game;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      const px = s.pos.x;
      const pz = s.pos.z;
      s.vel.y -= SHOT.gravity * dt;
      s.pos.addScaledVector(s.vel, dt);
      s.age += dt;
      s.drip += dt;

      let dead = false;
      for (const p of players) {
        if (!p.alive || p.teamId === s.teamId) continue;
        const cy = p.pos.y + (p.squid ? 0.3 : 0.9);
        const r = p.squid ? 0.6 : 0.75;
        const dx = s.pos.x - p.pos.x;
        const dy = s.pos.y - cy;
        const dz = s.pos.z - p.pos.z;
        if (dx * dx + dy * dy + dz * dz < r * r) {
          p.hurt(SHOT.damage, s.owner, game);
          game.audio.hit(s.owner.index);
          this.burst(s.pos, s.teamId, 6, 4);
          paint.splat(s.pos.x, s.pos.z, 0.7, s.teamId, 2);
          dead = true;
          break;
        }
      }
      if (!dead) {
        if (obstacleAt(obstacles, s.pos.x, s.pos.z, s.pos.y)) {
          paint.splat(px, pz, 0.8, s.teamId, 2);
          this.burst(s.pos, s.teamId, 3, 3);
          dead = true;
        } else if (s.pos.y <= 0) {
          paint.splat(s.pos.x, s.pos.z, SHOT.splat, s.teamId, 3);
          this.burst(s.pos, s.teamId, 3, 3);
          dead = true;
        } else if (Math.abs(s.pos.x) > HALF + 1 || Math.abs(s.pos.z) > HALF + 1) {
          dead = true;
        } else if (s.drip > SHOT.dripEvery && s.age > 0.08) {
          s.drip = 0;
          paint.circle(s.pos.x, s.pos.z, SHOT.drip, s.teamId);
        }
      }
      if (dead) {
        this.give('shot', s.mesh);
        this.shots.splice(i, 1);
      } else {
        s.mesh.position.copy(s.pos);
      }
    }
  }

  updateBombs(dt, game) {
    const lim = HALF - 0.3;
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      if (b.fuse < 0) {
        const px = b.pos.x;
        const py = b.pos.y;
        const pz = b.pos.z;
        b.vel.y -= BOMB.gravity * dt;
        b.pos.addScaledVector(b.vel, dt);
        const o = obstacleAt(game.obstacles, b.pos.x, b.pos.z, b.pos.y - 0.3);
        if (o) {
          if (py - 0.3 >= o.h) {
            b.pos.y = o.h + 0.3;
            b.fuse = BOMB.fuse;
          } else {
            b.pos.x = px;
            b.pos.z = pz;
            if (px > o.minX && px < o.maxX) b.vel.z *= -0.4;
            else b.vel.x *= -0.4;
          }
        }
        if (Math.abs(b.pos.x) > lim) {
          b.pos.x = Math.sign(b.pos.x) * lim;
          b.vel.x *= -0.4;
        }
        if (Math.abs(b.pos.z) > lim) {
          b.pos.z = Math.sign(b.pos.z) * lim;
          b.vel.z *= -0.4;
        }
        if (b.fuse < 0 && b.pos.y <= 0.3) {
          b.pos.y = 0.3;
          b.fuse = BOMB.fuse;
          game.paint.splat(b.pos.x, b.pos.z, 0.8, b.teamId, 2);
        }
      } else {
        b.fuse -= dt;
        b.mesh.scale.setScalar(1 + 0.3 * Math.abs(Math.sin(b.fuse * 25)));
        if (b.fuse <= 0) {
          this.explode(b, game);
          this.give('bomb', b.mesh);
          this.bombs.splice(i, 1);
          continue;
        }
      }
      b.mesh.position.copy(b.pos);
    }
  }

  explode(b, game) {
    game.paint.splat(b.pos.x, b.pos.z, BOMB.radius, b.teamId, 10);
    for (const p of game.players) {
      if (!p.alive || p.teamId === b.teamId) continue;
      const d = Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z);
      if (d < BOMB.killRadius) p.hurt(BOMB.damageNear, b.owner, game);
      else if (d < BOMB.radius) p.hurt(BOMB.damageFar, b.owner, game);
    }
    this.blast(b.pos, b.teamId, BOMB.radius);
    this.burst(b.pos, b.teamId, 40, 10);
    game.audio.boom(b.owner.index);
  }
}
