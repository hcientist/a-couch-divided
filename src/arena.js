import * as THREE from 'three';
import { ARENA_SIZE, HALF, OBSTACLES, SPAWNS, TEAMS } from './config.js';

const SKY = 0x8fd3ff;

export function buildArena(scene, paint) {
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 60, 160);

  scene.add(new THREE.HemisphereLight(0xe4f4ff, 0x433a52, 1.3));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(18, 40, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 120 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE),
    new THREE.MeshStandardMaterial({ map: paint.texture, roughness: 0.5, metalness: 0.05 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(ARENA_SIZE + 2, 6, ARENA_SIZE + 2),
    new THREE.MeshStandardMaterial({ color: 0x2b3040, roughness: 0.8 }),
  );
  base.position.y = -3.01;
  scene.add(base);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(800, 800),
    new THREE.MeshStandardMaterial({ color: 0x19bfcc, roughness: 0.15, metalness: 0.1 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -4;
  scene.add(water);

  const top = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.7 });
  const side = new THREE.MeshStandardMaterial({ color: 0xc9d1df, roughness: 0.7 });
  const edge = new THREE.LineBasicMaterial({ color: 0x1d2030 });
  const block = (x, z, w, d, h) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, [side, side, top, side, side, side]);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edge));
    scene.add(mesh);
  };
  for (const o of OBSTACLES) block(o.x, o.z, o.w, o.d, o.h);
  block(0, -HALF - 0.5, ARENA_SIZE + 2, 1, 1.2);
  block(0, HALF + 0.5, ARENA_SIZE + 2, 1, 1.2);
  block(-HALF - 0.5, 0, 1, ARENA_SIZE, 1.2);
  block(HALF + 0.5, 0, 1, ARENA_SIZE, 1.2);

  SPAWNS.forEach((s, i) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 1.9, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.x, 0.02, s.z);
    scene.add(ring);
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 6, 12),
      new THREE.MeshBasicMaterial({ color: TEAMS[i].hex, transparent: true, opacity: 0.35 }),
    );
    beacon.position.set(s.x - Math.sign(s.x) * 3.5, 3, s.z);
    scene.add(beacon);
  });
}

export function obstacleAt(obstacles, x, z, y, pad = 0) {
  for (const o of obstacles) {
    if (y < o.h && x > o.minX - pad && x < o.maxX + pad && z > o.minZ - pad && z < o.maxZ + pad) return o;
  }
  return null;
}

export function collideCircle(p, r, obstacles) {
  for (const o of obstacles) {
    const cx = Math.min(Math.max(p.x, o.minX), o.maxX);
    const cz = Math.min(Math.max(p.z, o.minZ), o.maxZ);
    const dx = p.x - cx;
    const dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      p.x = cx + (dx / d) * r;
      p.z = cz + (dz / d) * r;
    } else {
      const pushes = [
        [p.x - o.minX, () => (p.x = o.minX - r)],
        [o.maxX - p.x, () => (p.x = o.maxX + r)],
        [p.z - o.minZ, () => (p.z = o.minZ - r)],
        [o.maxZ - p.z, () => (p.z = o.maxZ + r)],
      ];
      pushes.sort((a, b) => a[0] - b[0])[0][1]();
    }
  }
  const lim = HALF - r;
  p.x = Math.min(Math.max(p.x, -lim), lim);
  p.z = Math.min(Math.max(p.z, -lim), lim);
}
