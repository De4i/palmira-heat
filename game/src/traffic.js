// Traffic: civilian cars that cruise the road grid — each follows lane waypoints from
// intersection to intersection (straight on most of the time, turning at some corners),
// brakes for the car ahead or a pedestrian in the road, and honks when blocked. A few
// parked cars line the streets as stealable spares. When the player steals a traffic car
// it simply leaves the fleet; a fresh one spawns at the city edge later.

import { CAR, GRID, PALETTE, roadCenter } from './config.js';
import { Car } from './vehicles.js';

const TRAFFIC_COUNT = 13;
const PARKED_COUNT = 9;
const LANE_OFFSET = 3.1;

/** World position of intersection (i, j). */
function intersection(i, j) {
  return { x: roadCenter(i), z: roadCenter(j) };
}

/** Lane-correct waypoint: the target intersection shifted to the right-hand lane. */
function lanePoint(fromI, fromJ, toI, toJ) {
  const target = intersection(toI, toJ);
  const dx = Math.sign(toI - fromI);
  const dz = Math.sign(toJ - fromJ);
  // Right-hand side of travel direction (dx, dz) is (-dz, dx) in Palmira's heading frame.
  return { x: target.x + -dz * LANE_OFFSET, z: target.z + dx * LANE_OFFSET };
}

export class TrafficSystem {
  constructor(scene, rng, colliders) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = colliders;
    this.drivers = []; // { car, atI, atJ, toI, toJ, honkTimer }
    this.parked = [];
    this.respawnTimer = 6;

    for (let n = 0; n < TRAFFIC_COUNT; n += 1) this.spawnDriver(true);
    // Parked cars nosed along road edges, ready to steal.
    for (let n = 0; n < PARKED_COUNT; n += 1) {
      const vertical = rng() < 0.5;
      const roadIndex = 1 + Math.floor(rng() * (GRID.blocksPerSide - 2));
      const along = (rng() * 2 - 1) * (GRID.halfExtent - 30);
      const side = (rng() < 0.5 ? -1 : 1) * (GRID.roadWidth / 2 - 1.6);
      const paint = PALETTE.carPaints[Math.floor(rng() * PALETTE.carPaints.length)];
      let car;
      if (vertical) {
        car = new Car(scene, paint, roadCenter(roadIndex) + side, along, side > 0 ? Math.PI : 0, { kind: 'parked' });
      } else {
        car = new Car(scene, paint, along, roadCenter(roadIndex) + side, side > 0 ? -Math.PI / 2 : Math.PI / 2, { kind: 'parked' });
      }
      this.parked.push(car);
    }
  }

  /** All cars this system owns (traffic + parked) — main.js merges these into game.allCars. */
  get cars() {
    return [...this.drivers.map((d) => d.car), ...this.parked];
  }

  spawnDriver(anywhere = false) {
    const rng = this.rng;
    const i = anywhere ? Math.floor(rng() * GRID.blocksPerSide) : (rng() < 0.5 ? 0 : GRID.blocksPerSide - 1);
    const j = Math.floor(rng() * GRID.blocksPerSide);
    // Pick a first hop: a neighbouring intersection.
    const options = [];
    if (i > 0) options.push([i - 1, j]);
    if (i < GRID.blocksPerSide - 1) options.push([i + 1, j]);
    if (j > 0) options.push([i, j - 1]);
    if (j < GRID.blocksPerSide - 1) options.push([i, j + 1]);
    const [ti, tj] = options[Math.floor(rng() * options.length)];
    // Start at intersection (i, j), already in the right-hand lane for the first hop.
    const stepI = Math.sign(ti - i);
    const stepJ = Math.sign(tj - j);
    const base = intersection(i, j);
    const start = { x: base.x + -stepJ * LANE_OFFSET, z: base.z + stepI * LANE_OFFSET };
    const paint = PALETTE.carPaints[Math.floor(rng() * PALETTE.carPaints.length)];
    const car = new Car(this.scene, paint, start.x, start.z, headingBetween(i, j, ti, tj), { kind: 'traffic' });
    this.drivers.push({ car, atI: i, atJ: j, toI: ti, toJ: tj, honkTimer: 0 });
    return car;
  }

  /** Removes a car from traffic duty (the player stole it, or it was wrecked). */
  release(car) {
    const index = this.drivers.findIndex((d) => d.car === car);
    if (index !== -1) this.drivers.splice(index, 1);
    const parkedIndex = this.parked.indexOf(car);
    if (parkedIndex !== -1) this.parked.splice(parkedIndex, 1);
  }

  update(dt, game) {
    // Top the fleet back up after thefts.
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) {
      this.respawnTimer = 5;
      if (this.drivers.length < TRAFFIC_COUNT) this.spawnDriver(false);
    }

    for (const driver of this.drivers) {
      const { car } = driver;
      if (car.disabled) continue;
      const target = lanePoint(driver.atI, driver.atJ, driver.toI, driver.toJ);
      const dx = target.x - car.position.x;
      const dz = target.z - car.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 5) {
        // Arrived: choose the next hop, biased to go straight.
        const arrivedI = driver.toI;
        const arrivedJ = driver.toJ;
        const stepI = Math.sign(arrivedI - driver.atI);
        const stepJ = Math.sign(arrivedJ - driver.atJ);
        const choices = [];
        const straight = [arrivedI + stepI, arrivedJ + stepJ];
        if (inGrid(straight)) { choices.push(straight, straight, straight); }
        const left = [arrivedI + stepJ, arrivedJ - stepI];
        const right = [arrivedI - stepJ, arrivedJ + stepI];
        if (inGrid(left)) choices.push(left);
        if (inGrid(right)) choices.push(right);
        if (choices.length === 0) choices.push([driver.atI, driver.atJ]); // dead end: U-turn
        const [ni, nj] = choices[Math.floor(this.rng() * choices.length)];
        driver.atI = arrivedI;
        driver.atJ = arrivedJ;
        driver.toI = ni;
        driver.toJ = nj;
        continue;
      }

      const desired = Math.atan2(dx, dz);
      let turn = desired - car.heading;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, turn * 1.6));

      // Brake for anything slow or stopped ahead, and for peds in the road.
      let throttle = 0.55;
      const fwd = car.forward();
      for (const other of game.allCars) {
        if (other === car) continue;
        const ox = other.position.x - car.position.x;
        const oz = other.position.z - car.position.z;
        const ahead = ox * fwd.x + oz * fwd.z;
        const side = Math.abs(ox * fwd.z - oz * fwd.x);
        if (ahead > 0 && ahead < 8.5 && side < 1.9) { throttle = -0.4; break; }
      }
      if (throttle > 0) {
        for (const ped of game.pedestrians.citizens) {
          if (ped.state === 'down') continue;
          const ox = ped.position.x - car.position.x;
          const oz = ped.position.z - car.position.z;
          const ahead = ox * fwd.x + oz * fwd.z;
          const side = Math.abs(ox * fwd.z - oz * fwd.x);
          if (ahead > 0 && ahead < 7 && side < 2.2) { throttle = -0.4; break; }
        }
      }
      if (throttle < 0 && car.speed > 2) {
        driver.honkTimer -= dt;
        if (driver.honkTimer <= 0) {
          driver.honkTimer = 1.4 + this.rng() * 1.5;
          game.audio.playHonk(0.25);
        }
      }
      const speedScale = Math.min(1, CAR.trafficSpeed / CAR.maxSpeed);
      void speedScale;
      car.drive(dt, { throttle: car.speed > CAR.trafficSpeed ? -0.3 : throttle, steer, handbrake: false }, this.colliders, CAR.trafficSpeed / CAR.maxSpeed);
    }
  }
}

function inGrid([i, j]) {
  return i >= 0 && i < GRID.blocksPerSide && j >= 0 && j < GRID.blocksPerSide;
}

function headingBetween(i, j, ti, tj) {
  return Math.atan2(ti - i, tj - j);
}
