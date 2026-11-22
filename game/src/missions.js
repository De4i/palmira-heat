// The story: eight jobs for Marisol Vega's beachfront crew, chained from her café spot on
// the promenade. A small step engine runs each job — go places (on foot or in a car), pick
// things up, stop a fleeing courier, beat a checkpoint clock, shake forced heat, and clear
// turf corners of thugs. A glowing marker pillar + minimap blip always show the way, and
// short dialogue lines bookend every job.

import { WANTED, roadCenter } from './config.js';
import { Car } from './vehicles.js';
import { Thug } from './combat.js';
import { buildPerson } from './pedestrians.js';

export const GIVER = { x: -136, z: -18, name: 'MARISOL VEGA' };

export const MISSIONS = [
  {
    title: 'First Wheels',
    intro: [
      ['MARISOL VEGA', 'Rico! You actually made it off that boat.'],
      ['MARISOL VEGA', 'Rule one of my crew: a wheelman needs wheels. Take any car you like — Palmira is full of generous owners.'],
    ],
    steps: [
      { type: 'enterCar', label: 'Steal a car (walk up to one, press E)' },
      { type: 'goto', x: 222, z: 96, inCar: true, label: 'Drive to the marina pier' },
    ],
    outro: [['MARISOL VEGA', 'Smooth rolling. The marina boys saw you arrive — that is reputation.']],
    cash: 150, rep: 10,
  },
  {
    title: 'Package Run',
    intro: [
      ['MARISOL VEGA', 'A package is waiting downtown, by the towers. Collect it on foot, quiet as you can.'],
      ['MARISOL VEGA', 'Then bring it to the beach house, west shore. If the PD smells it — do not stop.'],
    ],
    steps: [
      { type: 'pickup', x: -43, z: -43, effect: 'package', label: 'Pick up the package downtown' },
      { type: 'goto', x: -150, z: 62, label: 'Deliver it to the beach house' },
    ],
    outro: [['MARISOL VEGA', 'Clean work. Take this pistol — from now on, you work armed.']],
    cash: 300, rep: 15,
  },
  {
    title: 'Courier Takedown',
    intro: [
      ['MARISOL VEGA', 'A Harbor Kings courier is running MY route in a yellow coupe.'],
      ['MARISOL VEGA', 'Stop that car, Rico. Ram it, shoot it — just stop it.'],
    ],
    steps: [
      { type: 'chase', label: 'Stop the yellow courier coupe' },
    ],
    outro: [['MARISOL VEGA', 'Ha! The Kings will think twice about my route now.']],
    cash: 400, rep: 20,
  },
  {
    title: 'Checkpoint Sprint',
    intro: [
      ['MARISOL VEGA', 'Buyers are asking if you are actually fast. Six flags across town, one clock.'],
      ['MARISOL VEGA', 'Eighty-five seconds. Show them what Palmira already knows.'],
    ],
    steps: [
      {
        type: 'checkpoints', time: 85, label: 'Hit every checkpoint before the clock dies',
        points: [[-96, -96], [0, -144], [96, -96], [144, 0], [48, 96], [-96, 144]],
      },
    ],
    outro: [['MARISOL VEGA', 'Fast AND alive. The buyers are impressed — so am I.']],
    cash: 350, rep: 15,
  },
  {
    title: 'Cool Off',
    intro: [
      ['MARISOL VEGA', 'Tonight the PD are watching the crew. I need their eyes somewhere else.'],
      ['MARISOL VEGA', 'Stir up some heat, lead them on a dance, then vanish to the old garage up north-east.'],
    ],
    steps: [
      { type: 'escape', x: 102, z: -138, stars: 3, label: 'Reach the hideout garage, then lose the heat' },
    ],
    outro: [['MARISOL VEGA', 'Gone like sea mist. You are wasted sitting in traffic, you know.']],
    cash: 500, rep: 25,
  },
  {
    title: 'Marina Heist',
    intro: [
      ['MARISOL VEGA', 'The marina warehouse holds the weekend take. Cash, one bag, no lock worth the name.'],
      ['MARISOL VEGA', 'Walk in, take the bag, and bring it home to me. Fast.'],
    ],
    steps: [
      { type: 'pickup', x: 56, z: 56, effect: 'cash', label: 'Grab the cash bag at the marina warehouse' },
      { type: 'goto', x: GIVER.x, z: GIVER.z, label: 'Bring the bag back to Marisol' },
    ],
    outro: [['MARISOL VEGA', 'The whole weekend take... you just made this crew, Rico.']],
    cash: 800, rep: 30,
  },
  {
    title: 'Turf Reclaim',
    intro: [
      ['MARISOL VEGA', 'Harbor Kings are leaning on three of our corners.'],
      ['MARISOL VEGA', 'Clear them out. Fists or iron — I do not care which, just finish it.'],
    ],
    steps: [
      { type: 'fight', x: -90, z: 102, count: 2, label: 'Clear the south-west corner' },
      { type: 'fight', x: 102, z: -42, count: 2, label: 'Clear the east corner' },
      { type: 'fight', x: 6, z: -138, count: 3, label: 'Clear the north corner' },
    ],
    outro: [['MARISOL VEGA', 'Every corner flies our colours again. Palmira is ours tonight.']],
    cash: 700, rep: 30,
  },
  {
    title: 'Palmira Finale',
    intro: [
      ['MARISOL VEGA', 'One last run, Rico. Pick me up and get us to the far marina pier.'],
      ['MARISOL VEGA', 'Every badge in Palmira will try to stop us. Drive like the boat is leaving.'],
    ],
    steps: [
      { type: 'goto', x: GIVER.x, z: GIVER.z, inCar: true, effect: 'finalePickup', label: 'Pick up Marisol — in a car' },
      { type: 'goto', x: 226, z: 216, inCar: true, label: 'Reach the far pier — do not get caught' },
    ],
    outro: [['MARISOL VEGA', 'We made it. Palmira Heat has a new legend — and his name is Rico Alvarez.']],
    cash: 1500, rep: 60,
  },
];

/** The pulsing gold pillar that marks the current objective in the world. */
function buildMarker() {
  const group = new THREE.Group();
  const cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 2.6, 30, 18, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffca3a, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  cylinder.position.y = 15;
  group.add(cylinder);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.6, 0.22, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe27a }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.4;
  group.add(ring);
  group.userData.ring = ring;
  return group;
}

export class MissionSystem {
  constructor(scene, rng) {
    this.rng = rng;
    this.missionIndex = 0; // next mission to run
    this.state = 'idle'; // idle (at giver) | active | done
    this.stepIndex = 0;
    this.dialogueQueue = [];
    this.target = null;
    this.marker = buildMarker();
    scene.add(this.marker);
    this.propMesh = null;
    this.chaseCar = null;
    this.checkpointIndex = 0;
    this.checkpointTimer = 0;
    this.escapePhase = 'go'; // go -> hide
    this.fightSpawned = false;
    this.time = 0;

    // Marisol herself, waiting at the café.
    this.giverMesh = buildPerson({ shirt: 0xf15bb5, pants: 0xfff8ec, skin: 0x8d5524, hat: 0xffca3a });
    this.giverMesh.position.set(GIVER.x, 0, GIVER.z);
    this.giverMesh.rotation.y = -Math.PI / 2;
    scene.add(this.giverMesh);
  }

  get currentMission() {
    return this.state === 'active' ? MISSIONS[this.missionIndex] : null;
  }

  /** Restores story progress from a save (cash/rep live on the game object). */
  restore(missionIndex) {
    this.missionIndex = Math.min(missionIndex, MISSIONS.length);
    if (this.missionIndex >= MISSIONS.length) this.state = 'done';
  }

  queueDialogue(lines) {
    for (const [name, text] of lines) this.dialogueQueue.push({ name, text });
  }

  /** Starts the next mission (intro dialogue + first step). */
  startMission(game) {
    const mission = MISSIONS[this.missionIndex];
    if (!mission) return;
    this.state = 'active';
    this.stepIndex = 0;
    this.queueDialogue(mission.intro);
    game.hud.toast(`JOB: ${mission.title.toUpperCase()}`, 3);
    this.beginStep(game);
  }

  /** Sets up per-step state: markers, props, chase car, thugs, timers, forced heat. */
  beginStep(game) {
    const step = this.currentMission?.steps[this.stepIndex];
    this.chaseCar = null;
    this.checkpointIndex = 0;
    this.escapePhase = 'go';
    this.fightSpawned = false;
    if (this.propMesh) {
      game.scene.remove(this.propMesh);
      this.propMesh = null;
    }
    if (!step) return;

    if (step.type === 'pickup') {
      const isCash = step.effect === 'cash';
      this.propMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.6, 0.5),
        new THREE.MeshLambertMaterial({ color: isCash ? 0x2f9e44 : 0xb08968 }),
      );
      this.propMesh.position.set(step.x, 0.6, step.z);
      game.scene.add(this.propMesh);
    }
    if (step.type === 'chase') {
      // main.js folds missions.chaseCar into game.allCars every frame while it is set.
      this.chaseCar = new Car(game.scene, 0xf1fa8c, 24, -48, Math.PI / 2, { kind: 'mission' });
      this.chaseWaypoint = null;
    }
    if (step.type === 'checkpoints') {
      this.checkpointTimer = step.time;
    }
    if (step.type === 'escape') {
      game.police.setStars(step.stars);
    }
    if (step.type === 'fight') {
      for (let i = 0; i < step.count; i += 1) {
        const thug = new Thug(game.scene, step.x + (this.rng() - 0.5) * 7, step.z + (this.rng() - 0.5) * 7, this.rng);
        game.combat.thugs.push(thug);
      }
      this.fightSpawned = true;
    }
  }

  /** Applies a step's arrival effect (alarms, pickups, the finale's forced heat). */
  applyEffect(game, step) {
    if (step.effect === 'package') {
      game.hud.toast('PACKAGE SECURED — MOVE!', 2.2);
      game.police.setStars(2);
      game.audio.playCash();
    } else if (step.effect === 'cash') {
      game.hud.toast('CASH BAG TAKEN — GO GO GO!', 2.2);
      game.police.setStars(3);
      game.audio.playCash();
    } else if (step.effect === 'finalePickup') {
      this.giverMesh.visible = false;
      game.police.setStars(WANTED.helicopterStars);
      this.queueDialogue([['MARISOL VEGA', 'I am in! DRIVE, Rico, DRIVE!']]);
    }
  }

  completeStep(game) {
    const mission = this.currentMission;
    this.stepIndex += 1;
    if (this.stepIndex < mission.steps.length) {
      this.beginStep(game);
      return;
    }
    // Mission complete: pay out, save, celebrate.
    game.cash += mission.cash;
    game.rep += mission.rep;
    game.audio.playJingle();
    game.audio.playCash();
    game.hud.toast(`JOB COMPLETE  +$${mission.cash}`, 3.2);
    this.queueDialogue(mission.outro);
    if (this.missionIndex === 1) game.unlockPistol();
    this.missionIndex += 1;
    this.state = this.missionIndex >= MISSIONS.length ? 'done' : 'idle';
    this.giverMesh.visible = true;
    game.saveProgress();
    if (this.state === 'done') game.onStoryComplete();
  }

  /** Restarts the current mission from its first step (after a bust or a wreck). */
  restartCurrentMission(game) {
    if (this.state !== 'active') return;
    game.combat.clearThugs(game.scene);
    if (this.chaseCar) {
      game.scene.remove(this.chaseCar.mesh);
      this.chaseCar = null;
    }
    this.stepIndex = 0;
    this.beginStep(game);
  }

  /** True when the player's focus (Rico or his car) is within `radius` of (x, z). */
  focusNear(game, x, z, radius) {
    const focus = game.player.car ?? game.player;
    return Math.hypot(focus.position.x - x, focus.position.z - z) < radius;
  }

  update(dt, game) {
    this.time += dt;
    // Dialogue drip-feed.
    if (this.dialogueQueue.length > 0 && game.hud.dialogueTimer <= 0) {
      const line = this.dialogueQueue.shift();
      game.hud.showDialogue(line.name, line.text, 3.4);
    }

    if (this.state === 'idle') {
      this.target = { x: GIVER.x, z: GIVER.z };
      const mission = MISSIONS[this.missionIndex];
      game.hud.setObjective(mission ? `Meet Marisol at the beachfront café — next job: ${mission.title}` : null);
      if (mission && this.focusNear(game, GIVER.x, GIVER.z, 4) && !game.player.car) {
        this.startMission(game);
      }
    } else if (this.state === 'done') {
      this.target = null;
      game.hud.setObjective('Palmira is yours — free roam. The PD still remembers you.');
    } else {
      const step = this.currentMission.steps[this.stepIndex];
      this.updateStep(dt, game, step);
    }

    // Marker placement + pulse.
    if (this.target) {
      this.marker.visible = true;
      this.marker.position.set(this.target.x, 0, this.target.z);
      const pulse = 1 + Math.sin(this.time * 4) * 0.12;
      this.marker.userData.ring.scale.set(pulse, pulse, 1);
    } else {
      this.marker.visible = false;
    }
    if (this.propMesh) this.propMesh.rotation.y += dt * 1.8;
  }

  updateStep(dt, game, step) {
    const player = game.player;
    switch (step.type) {
      case 'enterCar': {
        this.target = null;
        game.hud.setObjective(step.label);
        if (player.car) this.completeStep(game);
        break;
      }
      case 'goto': {
        this.target = { x: step.x, z: step.z };
        let label = step.label;
        const dist = Math.hypot((player.car?.position.x ?? player.position.x) - step.x, (player.car?.position.z ?? player.position.z) - step.z);
        label += ` — ${Math.round(dist)} m`;
        game.hud.setObjective(label);
        const modeOk = step.inCar === undefined || (step.inCar ? Boolean(player.car) : !player.car);
        if (modeOk && this.focusNear(game, step.x, step.z, step.inCar ? 7.5 : 3.4)) {
          this.applyEffect(game, step);
          this.completeStep(game);
        }
        break;
      }
      case 'pickup': {
        this.target = { x: step.x, z: step.z };
        game.hud.setObjective(step.label);
        if (!player.car && this.focusNear(game, step.x, step.z, 2.8)) {
          this.applyEffect(game, step);
          this.completeStep(game);
        }
        break;
      }
      case 'chase': {
        const targetCar = this.chaseCar;
        if (!targetCar) { this.completeStep(game); break; }
        this.target = { x: targetCar.position.x, z: targetCar.position.z };
        game.hud.setObjective(`${step.label} — target health ${Math.max(0, Math.ceil(targetCar.health))}%`);
        this.driveChaseCar(dt, game, targetCar);
        if (targetCar.disabled || targetCar.health <= 0) {
          targetCar.disabled = true;
          game.hud.toast('COURIER STOPPED!', 2.4);
          // The wreck stays in the world (and in game.allCars) as scenery; the step
          // pointer moves on, so driveChaseCar is never called for it again.
          this.completeStep(game);
        }
        break;
      }
      case 'checkpoints': {
        const point = step.points[this.checkpointIndex];
        if (!point) { this.completeStep(game); break; }
        this.target = { x: point[0], z: point[1] };
        this.checkpointTimer -= dt;
        game.hud.setObjective(`${step.label} — flag ${this.checkpointIndex + 1}/${step.points.length} — ${Math.max(0, Math.ceil(this.checkpointTimer))}s`);
        if (this.checkpointTimer <= 0) {
          game.hud.toast('TOO SLOW — RUN IT AGAIN', 2.4);
          this.checkpointIndex = 0;
          this.checkpointTimer = step.time;
        } else if (player.car && this.focusNear(game, point[0], point[1], 8)) {
          this.checkpointIndex += 1;
          game.audio.playCash();
          if (this.checkpointIndex >= step.points.length) this.completeStep(game);
        }
        break;
      }
      case 'escape': {
        this.target = { x: step.x, z: step.z };
        if (this.escapePhase === 'go') {
          game.hud.setObjective(`${step.label} (get to the garage)`);
          if (this.focusNear(game, step.x, step.z, 8)) this.escapePhase = 'hide';
        } else {
          game.hud.setObjective('Now lose the heat — break line of sight and stay hidden');
          this.target = null;
          if (game.police.stars === 0) this.completeStep(game);
        }
        break;
      }
      case 'fight': {
        this.target = { x: step.x, z: step.z };
        const remaining = game.combat.thugs.filter((t) => !t.down).length;
        game.hud.setObjective(`${step.label} — ${remaining} still standing`);
        if (this.fightSpawned && remaining === 0) this.completeStep(game);
        break;
      }
      default:
        break;
    }
  }

  /** The courier's driving: traffic-style waypoint cruising, faster, always away. */
  driveChaseCar(dt, game, car) {
    if (!this.chaseWaypoint || Math.hypot(this.chaseWaypoint.x - car.position.x, this.chaseWaypoint.z - car.position.z) < 6) {
      // Pick the intersection that maximises distance from the player.
      let best = null;
      let bestDist = -1;
      for (let tries = 0; tries < 8; tries += 1) {
        const i = Math.floor(this.rng() * 7);
        const j = Math.floor(this.rng() * 7);
        const x = roadCenter(i);
        const z = roadCenter(j);
        const d = Math.hypot(x - game.player.position.x, z - game.player.position.z);
        if (d > bestDist) { bestDist = d; best = { x, z }; }
      }
      this.chaseWaypoint = best;
    }
    const wp = this.chaseWaypoint;
    const desired = Math.atan2(wp.x - car.position.x, wp.z - car.position.z);
    let turn = desired - car.heading;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, turn * 1.6));
    car.drive(dt, { throttle: 0.85, steer, handbrake: false }, game.city.colliders, 0.52);
  }
}
