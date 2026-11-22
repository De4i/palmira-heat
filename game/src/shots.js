// Deterministic screenshot scenes behind ?shot=cover|drive|chase|mission&seed=<n>.
// Each stages the REAL game (same systems, same city the player gets), runs the simulation
// forward with a scripted input for a fixed number of steps, and frames a camera. Because
// the world is seeded and the steps are fixed, the same seed always gives the same frame.

import { Car } from './vehicles.js';

const FIXED_DT = 1 / 30;

/** Moves a few traffic drivers onto given [x, z, heading, speed] spots near the action. */
function seedTrafficNear(game, x, z, customSpots = null) {
  const spots = customSpots ?? [
    [x - 14, z + 3, Math.PI / 2, 6], [x + 18, z - 3, -Math.PI / 2, 6], [x + 3, z - 20, 0, 6],
  ];
  game.traffic.drivers.slice(0, spots.length).forEach((driver, i) => {
    const [sx, sz, heading, speed] = spots[i];
    driver.car.position.set(sx, 0, sz);
    driver.car.heading = heading;
    driver.car.speed = speed;
  });
}

/** Gives the player a fresh car of `paint` at (x, z) and puts him in the driver's seat. */
function givePlayerCar(game, paint, x, z, heading) {
  const car = new Car(game.scene, paint, x, z, heading, { kind: 'parked' });
  game.player.enterCar(game, car);
  // The staged theft may have been "witnessed": wipe the heat and its toast so the
  // scene starts from the exact state the scene script intends.
  game.police.clearHeat();
  game.hud.clearToast();
  return car;
}

const SCENES = {
  // On foot downtown: HUD, minimap, mission banner and marker all live.
  cover(game) {
    game.missions.missionIndex = 1;
    game.missions.state = 'active';
    game.missions.stepIndex = 0;
    game.missions.beginStep(game);
    game.player.mesh.position.set(-56, 0, 14);
    game.player.heading = 2.5;
    seedTrafficNear(game, -48, 0);
    return {
      steps: 70,
      input() {
        return { forward: 1, strafe: 0, run: false };
      },
      placeCamera(g) {
        const p = g.player.position;
        g.shotCamera = { pos: { x: p.x - 6.5, y: 3.1, z: p.z + 9.5 }, look: { x: p.x + 6, y: 1.5, z: p.z - 6 } };
      },
    };
  },

  // Driving in traffic along the central east-west road: a lead car in the same lane,
  // far enough ahead not to be rear-ended, and an oncoming car in the far lane.
  drive(game) {
    const car = givePlayerCar(game, 0xe63946, -33, 3.1, Math.PI / 2);
    car.speed = 15;
    seedTrafficNear(game, 0, 0, [
      [8, 3.1, Math.PI / 2, 10],
      [52, -3.1, -Math.PI / 2, 9],
    ]);
    return {
      steps: 66,
      input() {
        return { throttle: 0.75, steer: 0, handbrake: false };
      },
      placeCamera(g) {
        const c = g.player.car;
        const fx = Math.sin(c.heading);
        const fz = Math.cos(c.heading);
        g.shotCamera = {
          pos: { x: c.position.x - fx * 11.5 - fz * -2.6, y: 3.8, z: c.position.z - fz * 11.5 + fx * -2.6 },
          look: { x: c.position.x + fx * 14, y: 1.2, z: c.position.z + fz * 14 },
        };
      },
    };
  },

  // Five-star chase: Rico in the blue sedan, three cruisers in a pursuit wedge right
  // behind and beside him, roadblocks across the road ahead, the helicopter overhead.
  // The formation flies in convoy (matched speeds, few fixed steps) and the camera is
  // locked to the player car, so the frame reads as a chase at any step it lands on.
  chase(game) {
    const car = givePlayerCar(game, 0x1982c4, -52, 51.1, Math.PI / 2);
    car.speed = 16;
    game.police.setStars(5);
    // Pursuit wedge in the lanes behind/beside the player car, all aimed down the road:
    // one cruiser tailgating in the same lane, one on the rear quarter, one pulling
    // alongside in the next lane. The chase AI steers them at the player, so starting
    // them behind him keeps their headings (and the formation) stable for the shot.
    const tail = game.police.spawnCop(car.position);
    tail.position.set(-59, 0, 51.1);
    tail.heading = Math.PI / 2;
    tail.speed = 16.5;
    const rear = game.police.spawnCop(car.position);
    rear.position.set(-58, 0, 44.9);
    rear.heading = Math.PI / 2;
    rear.speed = 16.5;
    const flank = game.police.spawnCop(car.position);
    flank.position.set(-50.5, 0, 44.9);
    flank.heading = Math.PI / 2;
    flank.speed = 16.5;
    // A roadblock across the player's road, far enough ahead to read over the chase.
    // (The police system adds its own second block by the next intersection on step one,
    // because this staged one already counts toward its cap of two.)
    const blockCars = [];
    for (const z of [44.9, 51.1]) {
      const blockCar = new Car(game.scene, 0x1d3557, 40, z, 0.35, { police: true, kind: 'police' });
      blockCars.push(blockCar);
    }
    game.police.roadblocks.push({ cars: blockCars, anchor: { x: 40, z: 48 } });
    game.police.ensureHelicopter();
    // Keep the frame clean: send every traffic driver to the far north road and move
    // pedestrians out of the chase corridor, so nothing civilian wanders into the shot
    // (a strolling pedestrian in the foreground read as "the player on foot" before).
    game.traffic.drivers.forEach((driver, i) => {
      driver.car.position.set(-160 + i * 22, 0, -140.9);
      driver.car.heading = Math.PI / 2;
      driver.car.speed = 8;
      driver.atI = 0;
      driver.atJ = 0;
      driver.toI = 1;
      driver.toJ = 0;
    });
    for (const ped of game.pedestrians.citizens) {
      if (ped.position.x > -95 && ped.position.x < 60 && ped.position.z > 15 && ped.position.z < 85) {
        ped.position.set(-320, 0, 260);
        ped.target = { x: -310, z: 260 };
      }
    }
    return {
      steps: 30,
      input() {
        return { throttle: 0.7, steer: 0, handbrake: false };
      },
      placeCamera(g) {
        // The banner has to fit the scene: an escape objective, not the next story job.
        // (placeCamera runs after the mission system's own banner update each frame,
        // so this is the text the captured frame shows.)
        g.hud.setObjective('Lose the Palmira PD!');
        const c = g.player.car;
        const fx = Math.sin(c.heading);
        const fz = Math.cos(c.heading);
        g.shotCamera = {
          pos: { x: c.position.x - fx * 19.5 - fz * 2.8, y: 6.6, z: c.position.z - fz * 19.5 + fx * 2.8 },
          look: { x: c.position.x + fx * 14, y: 1.3, z: c.position.z + fz * 14 },
        };
      },
    };
  },

  // A mission in progress: the Marina Heist cash pickup, marker, prop and radio dialogue.
  mission(game) {
    game.missions.missionIndex = 5;
    game.missions.state = 'active';
    game.missions.stepIndex = 0;
    game.missions.beginStep(game);
    game.player.mesh.position.set(47, 0, 47);
    game.player.heading = Math.atan2(56 - 47, 56 - 47);
    game.hud.showDialogue('MARISOL VEGA', 'The bag is by the warehouse door, Rico. Walk in and take it.', 30);
    seedTrafficNear(game, 48, 60);
    return {
      steps: 46,
      input() {
        return { forward: 1, strafe: 0, run: false };
      },
      placeCamera(g) {
        const p = g.player.position;
        g.shotCamera = { pos: { x: p.x - 8.5, y: 3.6, z: p.z - 8.5 }, look: { x: 58, y: 1.6, z: 58 } };
      },
    };
  },
};

/**
 * Stages the named scene in a freshly built game and returns its controller:
 * { steps, input(stepIndex) -> per-frame input, placeCamera(game) }.
 * Unknown names fall back to the cover scene.
 */
export function stageShot(name, game) {
  const scene = SCENES[name] ?? SCENES.cover;
  return scene(game);
}

export { FIXED_DT };
