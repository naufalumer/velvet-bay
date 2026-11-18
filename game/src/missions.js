// VELVET BAY — the story. Five missions, chained, each with its own
// objective, marker, timer and cash reward. Rae Vega, wheelman trying to
// go straight, gets pulled back for one last job in Velvet Bay. Style
// points earned on the road pay out with each mission: the multiplier is
// the reward for driving like the city is watching.
//
// Shape of the code: every mission is one row in MISSION_DEFS — a list
// of phases, each phase naming where its marker points and what moves
// the story on. update() is a generic driver over that table, so adding
// a mission means adding a row, never touching the driver.
import * as THREE from 'three';
import { CFG, MISSION_NAMES, MISSION_BRIEFS } from './config.js';

const NEAR = {
  pickup: 6,
  arrive: 9,
  checkpoint: 10,
  escape: 10,
};

function markerMeshes() {
  const group = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff2e88, transparent: true, opacity: 0.75 });
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.25, 24), ringMat);
  ring.position.y = 0.15;
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xff2e88, transparent: true, opacity: 0.28 });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 40, 8), beamMat);
  beam.position.y = 20;
  group.add(ring, beam);
  return { group, ring, beam };
}

// One row per mission. A phase has:
//   target(ctx, m) — where the marker points, or null for no marker;
//   text — the objective line the HUD shows;
//   advance(ctx, m) — returns the next phase name, 'complete', or null;
//   onEnter(ctx, m) — runs once when the phase starts (timers, heat).
const MISSION_DEFS = [
  {
    phases: [
      {
        id: 'steal',
        target: () => null,
        text: 'Steal a car — walk up to one and press E',
        advance: (ctx) => (ctx.inCar ? 'drive' : null),
      },
      {
        id: 'drive',
        target: (ctx, m) => m.city.garage,
        text: 'Drive to the garage',
        advance: (ctx, m) => (ctx.inCar && near(ctx, m.city.garage, NEAR.arrive) ? 'complete' : null),
      },
    ],
  },
  {
    phases: [
      {
        id: 'pickup',
        target: (ctx, m) => m.packageAt,
        text: 'Pick up the package',
        advance: (ctx, m) => (near(ctx, m.packageAt, NEAR.pickup) ? 'deliver' : null),
        onEnter: null,
      },
      {
        id: 'deliver',
        target: (ctx, m) => m.deliverAt,
        text: 'Deliver the package across town',
        advance: (ctx, m) => {
          if (near(ctx, m.deliverAt, NEAR.arrive)) return 'complete';
          return m.timer <= 0 ? 'fail' : null;
        },
        onEnter: (ctx, m) => {
          m.timer = CFG.packageTimer;
          ctx.police.addCrime(1, ctx.playerPos);
        },
      },
    ],
  },
  {
    phases: [
      {
        id: 'reach3',
        target: () => null,
        text: 'Reach 3 wanted stars — cause some chaos',
        advance: (ctx) => (ctx.stars >= 3 ? 'cooloff' : null),
      },
      {
        id: 'cooloff',
        target: () => null,
        text: 'Lose the heat — break line of sight',
        advance: (ctx) => (ctx.stars === 0 ? 'complete' : null),
      },
    ],
  },
  {
    phases: [
      {
        id: 'drive',
        target: (ctx, m) => m.checkpoints[m.checkpoint],
        text: (ctx, m) => 'Hit checkpoint ' + (m.checkpoint + 1) + ' of 3',
        advance: (ctx, m) => {
          if (near(ctx, m.checkpoints[m.checkpoint], NEAR.checkpoint)) {
            m.checkpoint += 1;
            if (m.checkpoint >= m.checkpoints.length) return 'complete';
            m._placeMarker();
          }
          return m.timer <= 0 ? 'fail' : null;
        },
        onEnter: (ctx, m) => {
          if (m.timer === 0) m.timer = CFG.getawayTimer;
        },
      },
    ],
  },
  {
    phases: [
      {
        id: 'cash',
        target: (ctx, m) => m.cashAt,
        text: 'Grab the cash at the drop',
        advance: (ctx, m) => (near(ctx, m.cashAt, NEAR.pickup) ? 'escape' : null),
        onEnter: null,
      },
      {
        id: 'escape',
        target: (ctx, m) => m.city.safehouse,
        text: 'Escape the 4-star pursuit — reach the safehouse',
        advance: (ctx, m) => (near(ctx, m.city.safehouse, NEAR.escape) ? 'complete' : null),
        onEnter: (ctx, m) => {
          ctx.police.setStars(4);
        },
      },
    ],
  },
];

const FAIL_LINES = {
  1: 'The package was late.',
  3: 'Out of time on the getaway.',
};

function near(ctx, target, radius) {
  const p = ctx.playerPos;
  return Math.hypot(p.x - target.x, p.z - target.z) < radius;
}

export class Missions {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.index = 0;
    this.phase = MISSION_DEFS[0].phases[0].id;
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
    this.marker = markerMeshes();
    scene.add(this.marker.group);
    this._placeMarker();
  }

  _def() {
    return MISSION_DEFS[this.index];
  }

  _phaseDef() {
    return this._def().phases.find((p) => p.id === this.phase);
  }

  _placeMarker() {
    const p = this.markerPos();
    this.marker.group.visible = p !== null;
    if (p) this.marker.group.position.set(p.x, 0, p.z);
  }

  markerPos() {
    if (this.done) return null;
    const target = this._phaseDef().target;
    return target(this._phaseCtx, this);
  }

  objective() {
    if (this.done) return 'Story complete — free roam. Enjoy Velvet Bay.';
    const text = this._phaseDef().text;
    return typeof text === 'function' ? text(this._phaseCtx, this) : text;
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

  _setPhase(id, ctx) {
    this.phase = id;
    this._phaseCtx = ctx;
    const def = this._phaseDef();
    if (def.onEnter) def.onEnter(ctx, this);
    this._placeMarker();
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
    this.checkpoint = 0;
    this.timer = 0;
    this.dusk = this.index >= 3;
    if (this.index >= MISSION_DEFS.length) {
      this.done = true;
      this.marker.group.visible = false;
      ctx.onStoryComplete();
      return;
    }
    this._setPhase(MISSION_DEFS[this.index].phases[0].id, ctx);
    this.startIntro();
  }

  _fail(ctx, reason) {
    this.failT = 2.5;
    ctx.onMissionFailed(this.index, reason);
    // Restart the same mission from its start.
    this.checkpoint = 0;
    this.timer = 0;
    this._setPhase(MISSION_DEFS[this.index].phases[0].id, ctx);
  }

  update(dt, ctx) {
    if (this.done) return;
    this._phaseCtx = ctx;
    if (this.introT > 0) this.introT -= dt;
    if (this.failT > 0) {
      this.failT -= dt;
      return;
    }
    const def = this._phaseDef();
    // Timed phases tick down here; the phase itself decides the timeout.
    if (this.timer > 0) this.timer -= dt;
    const next = def.advance(ctx, this);
    if (next === 'complete') {
      this._complete(ctx);
    } else if (next === 'fail') {
      this._fail(ctx, FAIL_LINES[this.index] || 'Mission failed.');
    } else if (next) {
      this._setPhase(next, ctx);
    }
    // Marker pulse.
    const s = 1 + Math.sin(performance.now() / 300) * 0.08;
    this.marker.ring.scale.set(s, 1, s);
  }
}
