// VELVET BAY — traffic and pedestrians. Cars loop the road grid on fixed
// lanes with simple spacing, pedestrians walk the sidewalks and run from
// chaos (gunfire, a speeding car, a crash) nearby. The style system asks
// here for near misses: a fast pass within a few metres of a traffic car.
import * as THREE from 'three';
import { CFG, PALETTE } from './config.js';
import { mulberry32, range, pick, pickInt } from './rng.js';
import { makeCarMesh } from './vehicles.js';
import { makePersonMesh } from './player.js';

function roadLane(rng, roads) {
  // A lane is one road line, offset to the right side of the road.
  if (rng() < 0.5) {
    return { vertical: true, line: pick(rng, roads), dir: rng() < 0.5 ? 1 : -1, off: 3.5 };
  }
  return { vertical: false, line: pick(rng, roads), dir: rng() < 0.5 ? 1 : -1, off: 3.5 };
}

export class Traffic {
  constructor(scene, city, seed) {
    this.scene = scene;
    this.city = city;
    this.rng = mulberry32(seed + 77);
    this.cars = [];
    this.peds = [];
    this.chaosAt = null;
    this.chaosPos = new THREE.Vector3();
    this._spawnCars();
    this._spawnPeds();
  }

  _spawnCars() {
    for (let i = 0; i < CFG.trafficCount; i++) {
      const lane = roadLane(this.rng, this.city.roadXs);
      const color = pick(this.rng, PALETTE.car);
      const mesh = makeCarMesh(color, false);
      const s = range(this.rng, -CFG.cityHalf, CFG.cityHalf);
      const pos = lane.vertical
        ? new THREE.Vector3(lane.line + lane.off, 0, s)
        : new THREE.Vector3(s, 0, lane.line + lane.off);
      mesh.position.copy(pos);
      const angle = lane.vertical ? (lane.dir > 0 ? 0 : Math.PI) : (lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      mesh.rotation.y = angle;
      this.scene.add(mesh);
      this.cars.push({
        mesh, lane, pos: mesh.position, angle,
        speed: range(this.rng, 7, CFG.trafficSpeed),
        color, taken: false,
      });
    }
  }

  _spawnPeds() {
    const shirts = [0xff2e88, 0x22d3ee, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xe67e22, 0xecf0f1, 0x8e44ad];
    for (let i = 0; i < CFG.pedCount; i++) {
      const shirt = pick(this.rng, shirts);
      const mesh = makePersonMesh(shirt, 0x1e2430, 0xd9a066);
      mesh.scale.setScalar(range(this.rng, 0.92, 1.08));
      const vertical = this.rng() < 0.5;
      const line = pick(this.rng, vertical ? this.city.roadXs : this.city.roadZs);
      const s = range(this.rng, -CFG.cityHalf, CFG.cityHalf);
      const off = (this.rng() < 0.5 ? -1 : 1) * (CFG.roadWidth / 2 + 2.5);
      const pos = vertical
        ? new THREE.Vector3(line + off, 0, s)
        : new THREE.Vector3(s, 0, line + off);
      mesh.position.copy(pos);
      this.scene.add(mesh);
      this.peds.push({
        mesh, pos: mesh.position, vertical, line, off,
        dir: this.rng() < 0.5 ? 1 : -1,
        speed: range(this.rng, 1.1, CFG.pedSpeed),
        phase: Math.random() * 6,
        fleeing: false,
        down: false,
        downT: 0,
      });
    }
  }

  setChaos(pos) {
    this.chaosAt = performance.now();
    this.chaosPos.copy(pos);
  }

  nearestCar(pos, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const c of this.cars) {
      if (c.taken) continue;
      const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  // True once per pass: the player's car just threaded past a traffic car
  // at speed, close enough to count as a near miss for the style system.
  nearMiss(pos, speed, minSpeed, maxDist) {
    if (Math.abs(speed) < minSpeed) return false;
    for (const c of this.cars) {
      if (c.taken) continue;
      const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z);
      if (d < maxDist && d > 2.6) {
        c._nearMissAt = performance.now();
        return true;
      }
    }
    return false;
  }

  update(dt, playerPos, playerSpeed) {
    // Traffic cars follow their lane; slow down for the car ahead.
    for (const c of this.cars) {
      if (c.taken) continue;
      let target = c.speed;
      for (const o of this.cars) {
        if (o === c || o.taken) continue;
        if (o.lane !== c.lane) continue;
        const along = c.lane.vertical ? (o.pos.z - c.pos.z) * c.lane.dir : (o.pos.x - c.pos.x) * c.lane.dir;
        const side = c.lane.vertical ? Math.abs(o.pos.x - c.pos.x) : Math.abs(o.pos.z - c.pos.z);
        if (along > 0 && along < 12 && side < 4) target = 0;
      }
      // Player's car ahead on the same lane also blocks.
      if (playerSpeed !== null) {
        const along = c.lane.vertical ? (playerPos.z - c.pos.z) * c.lane.dir : (playerPos.x - c.pos.x) * c.lane.dir;
        const side = c.lane.vertical ? Math.abs(playerPos.x - c.pos.x) : Math.abs(playerPos.z - c.pos.z);
        if (along > 0 && along < 11 && side < 4) target = 0;
      }
      const cur = target === 0 ? 0 : c.speed;
      const step = cur * dt;
      if (c.lane.vertical) c.pos.z += c.lane.dir * step;
      else c.pos.x += c.lane.dir * step;
      const lim = CFG.cityHalf + 10;
      if (c.lane.vertical && (c.pos.z > lim || c.pos.z < -lim)) {
        c.pos.z = -c.lane.dir * lim;
      }
      if (!c.lane.vertical && (c.pos.x > lim || c.pos.x < -lim)) {
        c.pos.x = -c.lane.dir * lim;
      }
      c.mesh.rotation.y = c.angle;
      for (const w of c.mesh.userData.wheels) w.rotation.x += step * 2;
    }

    // Pedestrians walk, and flee chaos.
    const chaosFresh = this.chaosAt !== null && performance.now() - this.chaosAt < 5000;
    for (const p of this.peds) {
      if (p.down) {
        p.downT -= dt;
        if (p.downT <= 0) {
          p.down = false;
          p.mesh.visible = true;
          p.mesh.position.y = 0;
        }
        continue;
      }
      let speed = p.speed;
      let dirX = 0;
      let dirZ = 0;
      const dChaos = chaosFresh ? Math.hypot(p.pos.x - this.chaosPos.x, p.pos.z - this.chaosPos.z) : 999;
      const dPlayer = Math.hypot(p.pos.x - playerPos.x, p.pos.z - playerPos.z);
      const scared = (chaosFresh && dChaos < 26) || (playerSpeed > 12 && dPlayer < 8);
      if (scared) {
        p.fleeing = true;
        speed = CFG.pedFleeSpeed;
        const dx = p.pos.x - playerPos.x;
        const dz = p.pos.z - playerPos.z;
        const d = Math.hypot(dx, dz) || 1;
        dirX = dx / d;
        dirZ = dz / d;
      } else {
        p.fleeing = false;
        if (p.vertical) dirZ = p.dir;
        else dirX = p.dir;
      }
      p.pos.x += dirX * speed * dt;
      p.pos.z += dirZ * speed * dt;
      const lim = CFG.cityHalf + 8;
      if (p.pos.x > lim || p.pos.x < -lim || p.pos.z > lim || p.pos.z < -lim) {
        p.dir *= -1;
        p.pos.x = Math.max(-lim, Math.min(lim, p.pos.x));
        p.pos.z = Math.max(-lim, Math.min(lim, p.pos.z));
      }
      if (dirX !== 0 || dirZ !== 0) {
        p.mesh.rotation.y = Math.atan2(dirX, dirZ);
        p.phase += dt * (scared ? 13 : 8);
        const swing = Math.sin(p.phase) * 0.5;
        p.mesh.userData.legs[0].rotation.x = swing;
        p.mesh.userData.legs[1].rotation.x = -swing;
      }
    }
  }

  knockDown(pos, radius) {
    let hit = null;
    for (const p of this.peds) {
      if (p.down) continue;
      const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
      if (d < radius) {
        p.down = true;
        p.downT = 6;
        p.mesh.visible = false;
        hit = p;
      }
    }
    return hit;
  }
}
