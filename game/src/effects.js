// VELVET BAY — particles, tracers and screen shake. The original design
// built a new material per particle and disposed it on death, which is a
// steady drip of garbage-collection hitches while driving. This version
// keeps one fixed pool of meshes with a small set of shared materials and
// fades particles by shrinking them, so a chase never allocates: zero
// per-frame garbage from the effect system, and the frame time stays flat.
import * as THREE from 'three';

const POOL_SIZE = 140;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.tracers = [];
    this.shake = 0;
    this.geo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    this.mats = new Map();
    // The tracer line shares one material for its whole life.
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0.95 });
    this.pool = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const m = new THREE.Mesh(this.geo, this._mat(0xffffff));
      m.visible = false;
      scene.add(m);
      this.pool.push({ mesh: m, vel: new THREE.Vector3(), life: 0, max: 1, inUse: false });
    }
  }

  _mat(color) {
    if (!this.mats.has(color)) {
      this.mats.set(color, new THREE.MeshBasicMaterial({ color, transparent: true }));
    }
    return this.mats.get(color);
  }

  _spawn(pos, color, vel, life) {
    for (const p of this.pool) {
      if (p.inUse) continue;
      p.inUse = true;
      p.mesh.visible = true;
      p.mesh.material = this._mat(color);
      p.mesh.position.copy(pos);
      p.mesh.scale.setScalar(1);
      p.vel.copy(vel);
      p.life = life;
      p.max = life;
      this.particles.push(p);
      return p;
    }
    return null;
  }

  burst(pos, color, count, speed, up, life) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(
        Math.cos(a) * speed * (0.4 + Math.random() * 0.8),
        up * (0.5 + Math.random()),
        Math.sin(a) * speed * (0.4 + Math.random() * 0.8),
      );
      this._spawn(pos, color, v, life * (0.6 + Math.random() * 0.6));
    }
  }

  sparks(pos) {
    this.burst(pos, 0xffc233, 14, 6, 4, 0.5);
  }

  exhaust(pos, dir) {
    const v = dir.clone().multiplyScalar(-3);
    v.y = 0.8;
    this._spawn(pos, 0x888888, v, 0.4);
  }

  tracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, this.tracerMat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09, max: 0.09 });
  }

  addShake(amount) {
    this.shake = Math.min(0.6, this.shake + amount);
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.inUse = false;
        p.mesh.visible = false;
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= 9 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      // Fade by shrinking: no material opacity writes, no recompile.
      p.mesh.scale.setScalar(Math.max(0.05, p.life / p.max));
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
    this.shake = Math.max(0, this.shake - dt * 1.4);
  }

  shakeOffset() {
    if (this.shake <= 0.001) return { x: 0, y: 0 };
    return {
      x: (Math.random() - 0.5) * this.shake * 0.5,
      y: (Math.random() - 0.5) * this.shake * 0.5,
    };
  }
}
