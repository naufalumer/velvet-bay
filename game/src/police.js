// VELVET BAY — the wanted system and the Velvet Bay PD. Stars rise with
// crimes, police cars spawn at the city edge and chase, ram and box the
// player in; heat decays once every unit loses sight of the player. At
// higher stars more units arrive and roadblocks appear.
import * as THREE from 'three';
import { CFG } from './config.js';
import { mulberry32, range } from './rng.js';
import { DriveCar } from './vehicles.js';

export class Police {
  constructor(scene, city, seed) {
    this.scene = scene;
    this.city = city;
    this.rng = mulberry32(seed + 913);
    this.stars = 0;
    this.units = [];
    this.lastCrimeAt = 0;
    this.lastSeenAt = 0;
    this.decayT = 0;
    this.spawnT = 0;
    this.roadblock = [];
    this.roadblockT = 0;
  }

  wantedCount() {
    return [0, 1, 2, 3, 5, 7][this.stars];
  }

  addCrime(n, pos) {
    const before = this.stars;
    this.stars = Math.min(CFG.maxStars, this.stars + n);
    this.lastCrimeAt = performance.now();
    this.lastSeenAt = performance.now();
    if (this.stars > before) this.spawnT = 0;
    return this.stars;
  }

  setStars(n) {
    this.stars = Math.max(0, Math.min(CFG.maxStars, n));
    this.lastSeenAt = performance.now();
  }

  clear() {
    this.stars = 0;
    this._removeUnits();
  }

  _removeUnits() {
    for (const u of this.units) this.scene.remove(u.mesh);
    this.units = [];
    for (const r of this.roadblock) this.scene.remove(r.mesh);
    this.roadblock = [];
  }

  _spawnUnit(playerPos) {
    const angle = this.rng() * Math.PI * 2;
    const dist = range(this.rng, 60, 90);
    const x = Math.max(-CFG.cityHalf, Math.min(CFG.cityHalf, playerPos.x + Math.cos(angle) * dist));
    const z = Math.max(-CFG.cityHalf, Math.min(CFG.cityHalf, playerPos.z + Math.sin(angle) * dist));
    return this.spawnAt(x, z);
  }

  // Spawn one unit at an exact spot (used by screenshot staging).
  spawnAt(x, z) {
    const car = new DriveCar(this.scene, 0xf5f5f5, x, z, 0, true);
    this.units.push(car);
    return car;
  }

  _spawnRoadblock(playerPos, playerAngle) {
    if (this.stars < 3 || this.roadblock.length > 0) return;
    const fx = Math.sin(playerAngle);
    const fz = Math.cos(playerAngle);
    const bx = playerPos.x + fx * 55;
    const bz = playerPos.z + fz * 55;
    for (const side of [-1, 1]) {
      const car = new DriveCar(this.scene, 0xf5f5f5, bx - fz * side * 4, bz + fx * side * 4, playerAngle + Math.PI / 2, true);
      car.speed = 0;
      this.roadblock.push(car);
    }
    this.roadblockT = 25;
  }

  update(dt, playerPos, playerCar, playerSpeed, inCar) {
    const now = performance.now();
    const want = this.wantedCount();
    this.spawnT -= dt;
    if (this.stars > 0 && this.units.length < want && this.spawnT <= 0) {
      this._spawnUnit(playerPos);
      this.spawnT = 1.2;
    }
    while (this.units.length > want) {
      const u = this.units.pop();
      this.scene.remove(u.mesh);
    }

    let nearest = 999;
    for (const u of this.units) {
      const dx = playerPos.x - u.pos.x;
      const dz = playerPos.z - u.pos.z;
      const d = Math.hypot(dx, dz);
      nearest = Math.min(nearest, d);
      const targetAngle = Math.atan2(dx, dz);
      let diff = targetAngle - u.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 1.6));
      const throttle = d > 6 ? 1 : 0.4;
      u.drive(dt, throttle, steer, false, this.city.colliders);
      if (d < 5.5) {
        u.speed = Math.min(u.speed, 6);
      }
    }

    // Roadblocks at 3+ stars, ahead of the player's heading.
    if (this.stars >= 3 && inCar) {
      this.roadblockT -= dt;
      if (this.roadblockT <= 0) {
        this._spawnRoadblock(playerPos, playerCar ? playerCar.angle : 0);
        this.roadblockT = 30;
      }
    } else if (this.roadblock.length > 0 && this.stars < 3) {
      for (const r of this.roadblock) this.scene.remove(r.mesh);
      this.roadblock = [];
    }

    // Heat decay: no unit close for a while, and no recent crime.
    if (this.stars > 0 && nearest > 55 && now - this.lastCrimeAt > CFG.heatDecayDelay * 1000) {
      this.decayT += dt;
      if (this.decayT > CFG.heatDecayInterval) {
        this.stars -= 1;
        this.decayT = 0;
        this.lastSeenAt = now;
      }
    } else {
      this.decayT = 0;
    }
    if (nearest < 55) this.lastSeenAt = now;

    // Busted check: boxed in at high wanted while barely moving.
    let busted = false;
    if (this.stars >= 4 && playerSpeed < 1.5 && nearest < 4.5) {
      this._boxT = (this._boxT || 0) + dt;
      if (this._boxT > 3) busted = true;
    } else {
      this._boxT = 0;
    }
    return { nearest, busted };
  }

  // Damage the player when a unit rams them; returns true on a fresh ram.
  ramCheck(playerPos, radius) {
    for (const u of this.units) {
      const d = Math.hypot(u.pos.x - playerPos.x, u.pos.z - playerPos.z);
      if (d < radius + 2.2 && Math.abs(u.speed) > 4) {
        return u;
      }
    }
    return null;
  }
}
