// VELVET BAY — the story. Five missions, chained, each with its own
// objective, marker, timer and cash reward. Rae Vega, wheelman trying to
// go straight, gets pulled back for one last job in Velvet Bay. Style
// points earned on the road pay out with each mission: the multiplier is
// the reward for driving like the city is watching.
import * as THREE from 'three';
import { CFG, MISSION_NAMES, MISSION_BRIEFS } from './config.js';

export class Missions {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.index = 0;
    this.phase = 'steal';
    this.timer = 0;
    this.done = false;
    this.completed = 0;
    this.dusk = false;
    this.introT = 0;
    this.failT = 0;
    this.checkpoint = 0;
    this.checkpoints = [
      { x: -150, z: -150 },
      { x: 150, z: -50 },
      { x: 0, z: 150 },
    ];
    this.packageAt = { x: 150, z: -125 };
    this.deliverAt = { x: -175, z: 150 };
    this.cashAt = { x: -100, z: 100 };
    this.marker = this._makeMarker();
    scene.add(this.marker.group);
    this._placeMarker();
  }

  _makeMarker() {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 4, 0.25, 24),
      new THREE.MeshBasicMaterial({ color: 0xff2e88, transparent: true, opacity: 0.75 }),
    );
    ring.position.y = 0.15;
    group.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 40, 8),
      new THREE.MeshBasicMaterial({ color: 0xff2e88, transparent: true, opacity: 0.28 }),
    );
    beam.position.y = 20;
    group.add(beam);
    return { group, ring, beam };
  }

  _placeMarker() {
    const p = this.markerPos();
    if (!p) {
      this.marker.group.visible = false;
      return;
    }
    this.marker.group.visible = true;
    this.marker.group.position.set(p.x, 0, p.z);
  }

  markerPos() {
    switch (this.index) {
      case 0: return this.phase === 'steal' ? null : this.city.garage;
      case 1: return this.phase === 'pickup' ? this.packageAt : this.deliverAt;
      case 2: return null;
      case 3: return this.checkpoints[this.checkpoint];
      case 4: return this.phase === 'cash' ? this.cashAt : this.city.safehouse;
      default: return null;
    }
  }

  objective() {
    if (this.done) return 'Story complete — free roam. Enjoy Velvet Bay.';
    switch (this.index) {
      case 0:
        return this.phase === 'steal'
          ? 'Steal a car — walk up to one and press E'
          : 'Drive to the garage';
      case 1:
        return this.phase === 'pickup'
          ? 'Pick up the package'
          : 'Deliver the package across town';
      case 2:
        return this.phase === 'reach3'
          ? 'Reach 3 wanted stars — cause some chaos'
          : 'Lose the heat — break line of sight';
      case 3:
        return 'Hit checkpoint ' + (this.checkpoint + 1) + ' of 3';
      case 4:
        return this.phase === 'cash'
          ? 'Grab the cash at the drop'
          : 'Escape the 4-star pursuit — reach the safehouse';
      default:
        return '';
    }
  }

  name() {
    return this.done ? 'Story Complete' : MISSION_NAMES[this.index];
  }

  brief() {
    return this.done ? 'Rae is free. Velvet Bay is yours.' : MISSION_BRIEFS[this.index];
  }

  startIntro() {
    this.introT = 3.5;
  }

  _complete(ctx) {
    // Style pays out with the mission: points x multiplier, capped.
    const styleBonus = Math.floor((ctx.stylePoints || 0) * Math.min(CFG.styleMaxMult, ctx.styleMult || 1));
    const reward = CFG.missionRewards[this.index] + styleBonus;
    ctx.cash += reward;
    this.completed += 1;
    ctx.audio.missionDone();
    ctx.onMissionComplete(this.index, reward, styleBonus);
    this.index += 1;
    this.phase = this.index === 0 ? 'steal' : this.index === 1 ? 'pickup' : this.index === 2 ? 'reach3' : this.index === 3 ? 'drive' : 'cash';
    this.checkpoint = 0;
    this.timer = 0;
    this.dusk = this.index >= 3;
    if (this.index >= 5) {
      this.done = true;
      this.marker.group.visible = false;
      ctx.onStoryComplete();
      return;
    }
    this._placeMarker();
    this.startIntro();
  }

  _fail(ctx, reason) {
    this.failT = 2.5;
    ctx.onMissionFailed(this.index, reason);
    // Restart the same mission from its start.
    this.phase = this.index === 0 ? 'steal' : this.index === 1 ? 'pickup' : this.index === 2 ? 'reach3' : this.index === 3 ? 'drive' : 'cash';
    this.checkpoint = 0;
    this.timer = 0;
    this._placeMarker();
  }

  update(dt, ctx) {
    if (this.done) return;
    if (this.introT > 0) this.introT -= dt;
    if (this.failT > 0) {
      this.failT -= dt;
      return;
    }
    const p = ctx.playerPos;
    const dist = (t) => Math.hypot(p.x - t.x, p.z - t.z);
    switch (this.index) {
      case 0:
        if (this.phase === 'steal' && ctx.inCar) {
          this.phase = 'drive';
          this._placeMarker();
        } else if (this.phase === 'drive' && ctx.inCar && dist(this.city.garage) < 9) {
          this._complete(ctx);
        }
        break;
      case 1:
        if (this.phase === 'pickup' && dist(this.packageAt) < 6) {
          this.phase = 'deliver';
          this.timer = CFG.packageTimer;
          ctx.police.addCrime(1, p);
          this._placeMarker();
        } else if (this.phase === 'deliver') {
          this.timer -= dt;
          if (dist(this.deliverAt) < 9) {
            this._complete(ctx);
          } else if (this.timer <= 0) {
            this._fail(ctx, 'The package was late.');
          }
        }
        break;
      case 2:
        if (this.phase === 'reach3' && ctx.stars >= 3) {
          this.phase = 'cooloff';
        } else if (this.phase === 'cooloff' && ctx.stars === 0) {
          this._complete(ctx);
        }
        break;
      case 3:
        if (this.timer === 0) this.timer = CFG.getawayTimer;
        this.timer -= dt;
        if (dist(this.checkpoints[this.checkpoint]) < 10) {
          this.checkpoint += 1;
          if (this.checkpoint >= this.checkpoints.length) {
            this._complete(ctx);
            break;
          }
          this._placeMarker();
        } else if (this.timer <= 0) {
          this._fail(ctx, 'Out of time on the getaway.');
        }
        break;
      case 4:
        if (this.phase === 'cash' && dist(this.cashAt) < 6) {
          this.phase = 'escape';
          ctx.police.setStars(4);
          this._placeMarker();
        } else if (this.phase === 'escape' && dist(this.city.safehouse) < 10) {
          this._complete(ctx);
        }
        break;
      default:
        break;
    }
    // Marker pulse.
    const s = 1 + Math.sin(performance.now() / 300) * 0.08;
    this.marker.ring.scale.set(s, 1, s);
  }
}
