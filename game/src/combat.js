// VELVET BAY — combat. A pistol with a magazine and a reload, hitscan
// shots with a tracer and muzzle flash, a punch for close work, player
// health with out-of-combat regen, and the damage numbers the HUD shows.
// The muzzle flash is the game's only point light besides the sun: one
// short-lived light that costs nothing until a shot is fired.
import * as THREE from 'three';
import { CFG } from './config.js';

export class Combat {
  constructor(effects, audio) {
    this.effects = effects;
    this.audio = audio;
    this.ammo = CFG.pistolMag;
    this.reloadT = 0;
    this.health = CFG.playerHealth;
    this.lastDamageAt = 0;
    this.punchT = 0;
    this.muzzle = new THREE.PointLight(0xffc266, 0, 18);
  }

  attach(scene) {
    scene.add(this.muzzle);
  }

  startReload() {
    if (this.reloadT <= 0 && this.ammo < CFG.pistolMag) this.reloadT = 1.1;
  }

  update(dt) {
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.ammo = CFG.pistolMag;
    }
    if (this.punchT > 0) this.punchT -= dt;
    if (this.muzzle.intensity > 0) this.muzzle.intensity = Math.max(0, this.muzzle.intensity - dt * 60);
    if (this.health < CFG.playerHealth && performance.now() - this.lastDamageAt > 5000) {
      this.health = Math.min(CFG.playerHealth, this.health + 14 * dt);
    }
  }

  takeDamage(n) {
    this.health -= n;
    this.lastDamageAt = performance.now();
    return this.health <= 0;
  }

  healFull() {
    this.health = CFG.playerHealth;
  }

  canShoot() {
    return this.reloadT <= 0 && this.ammo > 0;
  }

  // Hitscan from the shooter's eye toward a world direction. Hits the
  // nearest pedestrian or police car inside a narrow cone and range.
  shoot(origin, dir, traffic, police) {
    if (!this.canShoot()) {
      if (this.ammo <= 0) this.startReload();
      return null;
    }
    this.ammo -= 1;
    this.audio.gunshot();
    const muzzlePos = origin.clone().addScaledVector(dir, 1.2);
    muzzlePos.y = Math.max(1.2, origin.y + 1.3);
    this.muzzle.position.copy(muzzlePos);
    this.muzzle.intensity = 5;
    let best = null;
    let bestD = CFG.pistolRange;
    let bestKind = null;
    for (const p of traffic.peds) {
      if (p.down) continue;
      const to = new THREE.Vector3(p.pos.x - origin.x, 1.2 - origin.y, p.pos.z - origin.z);
      const d = to.length();
      if (d > bestD) continue;
      to.normalize();
      if (to.dot(dir) < 0.90) continue;
      bestD = d;
      best = p;
      bestKind = 'ped';
    }
    for (const u of police.units) {
      const to = new THREE.Vector3(u.pos.x - origin.x, 1 - origin.y, u.pos.z - origin.z);
      const d = to.length();
      if (d > bestD) continue;
      to.normalize();
      if (to.dot(dir) < 0.88) continue;
      bestD = d;
      best = u;
      bestKind = 'police';
    }
    const end = origin.clone().addScaledVector(dir, best ? bestD : CFG.pistolRange);
    end.y = 1.2;
    this.effects.tracer(muzzlePos, end);
    if (bestKind === 'ped') {
      best.down = true;
      best.downT = 9999;
      best.mesh.visible = false;
      this.effects.burst(end, 0xcc3333, 10, 4, 3, 0.5);
    } else if (bestKind === 'police') {
      this.effects.sparks(end);
      this.effects.addShake(0.15);
    }
    return { kind: bestKind, target: best, dist: bestD };
  }

  punch(origin, dir, traffic, police) {
    if (this.punchT > 0) return null;
    this.punchT = 0.45;
    this.audio.punch();
    const range = CFG.punchRange;
    for (const p of traffic.peds) {
      if (p.down) continue;
      const d = Math.hypot(p.pos.x - origin.x, p.pos.z - origin.z);
      if (d < range) {
        p.down = true;
        p.downT = 6;
        p.mesh.visible = false;
        return { kind: 'ped', target: p };
      }
    }
    return null;
  }
}
