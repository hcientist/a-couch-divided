import * as THREE from 'three';
import { TEAMS, SPAWNS, MOVE, SHOT, BOMB, RESPAWN_SECONDS } from './config.js';
import { collideCircle } from './arena.js';

export const RADIUS = 0.45;
export const MAX_HP = 100;
export const MAX_INK = 100;

export class Player {
  constructor(index, scene) {
    this.index = index;
    this.team = TEAMS[index];
    this.teamId = this.team.id;
    this.spawn = SPAWNS[index];
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.kid = buildKid(this.team);
    this.inkFill = this.kid.userData.inkFill;
    this.squidModel = buildSquid(this.team);
    this.ripple = buildRipple(this.team, index);
    this.root = new THREE.Group();
    this.root.add(this.kid, this.squidModel, this.ripple);
    scene.add(this.root);
    this.kills = 0;
    this.deaths = 0;
    this.reset();
  }

  reset() {
    this.pos.set(this.spawn.x, 0, this.spawn.z);
    this.vel.set(0, 0, 0);
    this.yaw = this.spawn.yaw;
    this.pitch = 0;
    this.hp = MAX_HP;
    this.ink = MAX_INK;
    this.alive = true;
    this.respawnIn = 0;
    this.fireCd = 0;
    this.bombCd = 0;
    this.sinceHit = 99;
    this.sinceFire = 99;
    this.squid = false;
    this.submerged = false;
    this.invuln = 0;
    this.walkPhase = 0;
    this.splashT = 0;
    this.root.visible = true;
  }

  update(dt, input, game) {
    if (!this.alive) {
      this.respawnIn -= dt;
      if (this.respawnIn <= 0) {
        this.reset();
        this.invuln = 2;
        game.fx.burst(this.pos.clone().setY(1), this.teamId, 20, 6);
      }
      return;
    }
    const { paint, fx, audio } = game;
    this.invuln = Math.max(0, this.invuln - dt);
    this.fireCd -= dt;
    this.bombCd -= dt;
    this.sinceHit += dt;
    this.sinceFire += dt;

    this.yaw -= input.turn * dt;
    this.pitch = Math.min(0.6, Math.max(-0.5, this.pitch + input.pitch * dt));

    const firing = input.fire;
    this.squid = input.squid && !firing;
    const under = paint.ownerAt(this.pos.x, this.pos.z);
    const onOwn = under === this.teamId;
    const onEnemy = under !== 0 && !onOwn;
    this.submerged = this.squid && onOwn;

    let speed;
    if (this.squid) speed = this.submerged ? MOVE.swim : MOVE.squidDry;
    else if (onEnemy) speed = MOVE.enemyInk;
    else speed = firing ? MOVE.walkFiring : MOVE.walk;

    // forward = (sin yaw, cos yaw), right = (-cos yaw, sin yaw)
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    let mx = s * input.move - c * input.strafe;
    let mz = c * input.move + s * input.strafe;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    const k = Math.min(1, dt * (this.squid ? 8 : 12));
    this.vel.x += (mx * speed - this.vel.x) * k;
    this.vel.z += (mz * speed - this.vel.z) * k;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    collideCircle(this.pos, RADIUS, game.obstacles);

    if (this.submerged) this.ink = Math.min(MAX_INK, this.ink + 42 * dt);
    else if (this.sinceFire > 0.6) this.ink = Math.min(MAX_INK, this.ink + (this.squid ? 10 : 5) * dt);

    if (onEnemy && this.invuln <= 0 && this.hp > 40) {
      this.hp = Math.max(40, this.hp - 12 * dt);
      this.sinceHit = 0;
    } else if (this.sinceHit > 1.2) {
      this.hp = Math.min(MAX_HP, this.hp + (this.submerged ? 60 : 20) * dt);
    }

    if (firing && this.fireCd <= 0) {
      if (this.ink >= SHOT.inkCost) {
        this.fireCd = SHOT.cooldown;
        this.ink -= SHOT.inkCost;
        this.sinceFire = 0;
        fx.shoot(this);
        audio.shoot(this.index);
      } else {
        this.fireCd = 0.3;
        audio.dry(this.index);
        game.hud.toast(this.index, 'Out of ink! Swim to refill', 1.2);
      }
    }
    if (input.bomb && !this.squid && this.bombCd <= 0) {
      if (this.ink >= BOMB.inkCost) {
        this.bombCd = BOMB.cooldown;
        this.ink -= BOMB.inkCost;
        this.sinceFire = 0;
        fx.throwBomb(this);
        audio.toss(this.index);
      } else {
        game.hud.toast(this.index, 'Not enough ink for a bomb', 1.2);
      }
    }

    if (this.submerged && Math.hypot(this.vel.x, this.vel.z) > 3) {
      this.splashT -= dt;
      if (this.splashT <= 0) {
        this.splashT = 0.1;
        fx.burst(new THREE.Vector3(this.pos.x, 0.1, this.pos.z), this.teamId, 2, 2.5);
      }
    }

    this.animate(dt);
  }

  hurt(amount, attacker, game) {
    if (!this.alive || this.invuln > 0) return;
    this.hp -= amount;
    this.sinceHit = 0;
    game.hud.hit(this.index);
    if (this.hp <= 0) this.die(attacker, game);
  }

  die(attacker, game) {
    this.alive = false;
    this.respawnIn = RESPAWN_SECONDS;
    this.deaths++;
    this.root.visible = false;
    if (attacker) attacker.kills++;
    const inkTeam = attacker ? attacker.teamId : 3 - this.teamId;
    game.paint.splat(this.pos.x, this.pos.z, 2.6, inkTeam, 8);
    game.fx.burst(this.pos.clone().setY(0.9), inkTeam, 40, 9);
    game.onSplat(this, attacker);
  }

  animate(dt) {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    const blink = this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0;
    this.kid.visible = !this.squid && !blink;
    this.squidModel.visible = this.squid && !this.submerged && !blink;
    this.ripple.visible = this.submerged;
    this.inkFill.scale.y = Math.max(0.02, this.ink / MAX_INK);
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.walkPhase += speed * dt * 2.4;
    this.kid.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.07 * Math.min(1, speed / 4);
    this.squidModel.position.y = Math.abs(Math.sin(this.walkPhase * 1.3)) * 0.25 * Math.min(1, speed / 2);
    this.ripple.scale.setScalar((1 + 0.15 * Math.sin(performance.now() / 120)) * (1 + speed / 14));
  }
}

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...opts });

function adder(group) {
  return (geo, material, x, y, z) => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
}

// Models face +z; local -x is the player's right hand.
function buildKid(team) {
  const g = new THREE.Group();
  const add = adder(g);
  const ink = mat(team.hex, { roughness: 0.25, emissive: team.hex, emissiveIntensity: 0.1 });
  const suit = mat(0x262a36);
  const skin = mat(0xf0c39c);
  const dark = mat(0x16161c, { roughness: 0.3 });
  const white = mat(0xffffff, { roughness: 0.3 });

  for (const sx of [-0.14, 0.14]) {
    add(new THREE.CapsuleGeometry(0.1, 0.32, 4, 8), suit, sx, 0.3, 0);
    add(new THREE.SphereGeometry(0.13, 12, 8), ink, sx, 0.08, 0.05).scale.set(1, 0.6, 1.4);
  }
  add(new THREE.CapsuleGeometry(0.26, 0.3, 6, 12), suit, 0, 0.85, 0);
  add(new THREE.TorusGeometry(0.2, 0.05, 8, 20), ink, 0, 1.12, 0).rotation.x = Math.PI / 2;
  add(new THREE.CapsuleGeometry(0.08, 0.32, 4, 8), suit, 0.33, 0.85, 0.05).rotation.z = 0.25;
  add(new THREE.CapsuleGeometry(0.08, 0.32, 4, 8), suit, -0.3, 0.95, 0.2).rotation.x = Math.PI * 0.45;

  add(new THREE.SphereGeometry(0.3, 20, 16), skin, 0, 1.45, 0);
  add(new THREE.BoxGeometry(0.5, 0.12, 0.12), dark, 0, 1.47, 0.22);
  for (const sx of [-0.1, 0.1]) {
    add(new THREE.SphereGeometry(0.065, 10, 8), white, sx, 1.47, 0.28);
    add(new THREE.SphereGeometry(0.035, 8, 6), dark, sx, 1.47, 0.335);
  }
  add(new THREE.SphereGeometry(0.33, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), ink, 0, 1.47, -0.02).rotation.x = -0.35;
  for (const sx of [-0.2, 0.2]) {
    add(new THREE.CapsuleGeometry(0.08, 0.4, 4, 8), ink, sx, 1.2, -0.18).rotation.x = 0.35;
  }

  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.48, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, roughness: 0.1 }),
  );
  glass.position.set(0, 0.95, -0.33);
  g.add(glass);
  const inkFill = add(new THREE.CylinderGeometry(0.13, 0.13, 0.44, 16).translate(0, 0.22, 0), ink, 0, 0.73, -0.33);
  add(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 16), dark, 0, 1.2, -0.33);
  add(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 16), dark, 0, 0.7, -0.33);

  add(new THREE.BoxGeometry(0.12, 0.14, 0.5), dark, -0.32, 0.95, 0.42);
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 10), ink, -0.32, 0.97, 0.72).rotation.x = Math.PI / 2;
  add(new THREE.SphereGeometry(0.07, 10, 8), ink, -0.32, 1.06, 0.32);

  g.userData.inkFill = inkFill;
  return g;
}

function buildSquid(team) {
  const g = new THREE.Group();
  const add = adder(g);
  const ink = mat(team.hex, { roughness: 0.2, emissive: team.hex, emissiveIntensity: 0.12 });
  const white = mat(0xffffff, { roughness: 0.3 });
  const dark = mat(0x16161c, { roughness: 0.3 });

  add(new THREE.SphereGeometry(0.32, 20, 14), ink, 0, 0.3, -0.05).scale.set(0.85, 0.7, 1.3);
  add(new THREE.BoxGeometry(0.5, 0.08, 0.5), ink, 0, 0.38, 0.3).rotation.y = Math.PI / 4;
  for (const sx of [-0.13, 0.13]) {
    add(new THREE.SphereGeometry(0.09, 10, 8), white, sx, 0.47, 0.1);
    add(new THREE.SphereGeometry(0.045, 8, 6), dark, sx, 0.49, 0.17);
  }
  for (const sx of [-0.15, -0.05, 0.05, 0.15]) {
    add(new THREE.CapsuleGeometry(0.05, 0.28, 4, 6), ink, sx, 0.18, -0.48).rotation.x = Math.PI / 2;
  }
  return g;
}

// Only the owning player's camera renders this (layer 1 + index), so a submerged squid is
// visible to its owner and hidden from the opponent's half of the screen.
function buildRipple(team, index) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.5, 28),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  ring.layers.set(1 + index);
  return ring;
}
