// The Palmira PD: a heat-based wanted system (heat → 1–5 stars), patrol cars that spawn at
// the city edge and chase with predictive steering, roadblocks from 3 stars, a spotlight
// helicopter from 4 stars, and the bust rule — stay slow next to a cop for too long and
// you are nicked. Break every cop's line of sight (distance-based) and the heat cools.

import { GRID, PALETTE, WANTED, roadCenter } from './config.js';
import { Car } from './vehicles.js';

const COP_COUNTS = [0, 2, 3, 4, 5, 6]; // index = stars

/** A road intersection near `pos`, at least `minDist` away, chosen with the seeded rng. */
function spawnIntersection(pos, minDist, rng) {
  let best = null;
  let bestScore = -1;
  for (let tries = 0; tries < 12; tries += 1) {
    const i = Math.floor(rng() * GRID.blocksPerSide);
    const j = Math.floor(rng() * GRID.blocksPerSide);
    const x = roadCenter(i);
    const z = roadCenter(j);
    const dist = Math.hypot(x - pos.x, z - pos.z);
    if (dist < minDist) continue;
    const score = dist + rng() * 30;
    if (score > bestScore) {
      bestScore = score;
      best = { x, z };
    }
  }
  return best ?? { x: roadCenter(0), z: roadCenter(0) };
}

/** Builds the patrol helicopter: slab body, tail boom, spinning rotors, spotlight cone. */
function buildHelicopter() {
  const heli = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: PALETTE.policePaint });
  const accentMat = new THREE.MeshLambertMaterial({ color: PALETTE.policeAccent });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const add = (mat, sx, sy, sz, x, y, z) => {
    const m = new THREE.Mesh(box, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    heli.add(m);
    return m;
  };
  add(bodyMat, 2.2, 1.7, 4.6, 0, 0, 0);
  add(accentMat, 2.24, 0.5, 2.2, 0, -0.2, 0.6);
  add(bodyMat, 0.5, 0.5, 4.4, 0, 0.25, -4.2); // tail boom
  add(accentMat, 0.16, 1.1, 0.7, 0, 0.5, -6.3); // tail fin
  add(bodyMat, 3.4, 0.14, 0.5, 0, -1.15, 0); // skids bar
  const rotor = add(new THREE.MeshLambertMaterial({ color: 0x222831 }), 10.5, 0.08, 0.55, 0, 1.15, 0);
  const tailRotor = add(new THREE.MeshLambertMaterial({ color: 0x222831 }), 0.12, 1.7, 0.3, 0.32, 0.5, -6.3);
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xfff6b0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide,
  });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(7.5, 26, 20, 1, true), coneMat);
  cone.position.set(0, -13.8, 0);
  heli.add(cone);
  heli.userData.rotor = rotor;
  heli.userData.tailRotor = tailRotor;
  return heli;
}

export class PoliceSystem {
  constructor(scene, rng, colliders) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = colliders;
    this.heat = 0;
    this.stars = 0;
    this.cops = []; // { car }
    this.roadblocks = []; // { cars: [Car, Car], anchor }
    this.hideTimer = 0;
    this.bustTimer = 0;
    this.seenNow = false;
    this.heli = null;
    this.heliAngle = 0;
    this.flashTime = 0;
  }

  addHeat(amount) {
    this.heat = Math.min(WANTED.heatPerStar * WANTED.maxStars, this.heat + amount);
    this.stars = Math.min(WANTED.maxStars, Math.ceil(this.heat / WANTED.heatPerStar));
  }

  /** Instantly sets the wanted level (mission scripts use this to force a chase). */
  setStars(stars) {
    this.stars = Math.max(0, Math.min(WANTED.maxStars, stars));
    this.heat = this.stars * WANTED.heatPerStar - 1;
    if (this.stars === 0) this.heat = 0;
  }

  clearHeat() {
    this.heat = 0;
    this.stars = 0;
    this.hideTimer = 0;
    this.bustTimer = 0;
  }

  nearestCopDistance(pos) {
    let best = Infinity;
    for (const cop of this.cops) {
      best = Math.min(best, cop.car.position.distanceTo(pos));
    }
    for (const block of this.roadblocks) {
      for (const car of block.cars) best = Math.min(best, car.position.distanceTo(pos));
    }
    return best;
  }

  spawnCop(playerPos) {
    const spot = spawnIntersection(playerPos, 62, this.rng);
    const car = new Car(this.scene, PALETTE.policePaint, spot.x, spot.z, this.rng() * Math.PI * 2, { police: true, kind: 'police' });
    this.cops.push({ car });
    return car;
  }

  removeCop(index) {
    const [cop] = this.cops.splice(index, 1);
    this.scene.remove(cop.car.mesh);
  }

  ensureRoadblock(playerPos, playerHeading) {
    if (this.roadblocks.length >= 2) return;
    // Across the road ~58 m ahead of the player.
    const ahead = {
      x: playerPos.x + Math.sin(playerHeading) * 58,
      z: playerPos.z + Math.cos(playerHeading) * 58,
    };
    // Snap to the nearest road centre line.
    let nearestX = roadCenter(0);
    let nearestZ = roadCenter(0);
    let bestX = Infinity;
    let bestZ = Infinity;
    for (let i = 0; i < GRID.blocksPerSide; i += 1) {
      if (Math.abs(roadCenter(i) - ahead.x) < bestX) { bestX = Math.abs(roadCenter(i) - ahead.x); nearestX = roadCenter(i); }
      if (Math.abs(roadCenter(i) - ahead.z) < bestZ) { bestZ = Math.abs(roadCenter(i) - ahead.z); nearestZ = roadCenter(i); }
    }
    const alongX = bestX < bestZ;
    const cars = [];
    for (const offset of [-3.4, 3.4]) {
      const x = alongX ? nearestX + offset : nearestX;
      const z = alongX ? nearestZ : nearestZ + offset;
      const heading = alongX ? Math.PI / 2 : 0;
      const car = new Car(this.scene, PALETTE.policePaint, x, z, heading + 0.35, { police: true, kind: 'police' });
      car.disabled = false;
      cars.push(car);
    }
    this.roadblocks.push({ cars, anchor: { x: nearestX, z: nearestZ } });
  }

  clearRoadblocks() {
    for (const block of this.roadblocks) {
      for (const car of block.cars) this.scene.remove(car.mesh);
    }
    this.roadblocks = [];
  }

  ensureHelicopter() {
    if (this.heli) return;
    this.heli = buildHelicopter();
    this.scene.add(this.heli);
  }

  removeHelicopter() {
    if (!this.heli) return;
    this.scene.remove(this.heli);
    this.heli = null;
  }

  /**
   * The frame update: heat bookkeeping, cop fleet management, chase steering, roadblocks,
   * helicopter, lightbar flashing and the bust rule. Calls game.onBusted when Rico is caught.
   */
  update(dt, game) {
    const player = game.player;
    const playerPos = player.car ? player.car.position : player.position;
    const playerSpeed = player.car ? Math.abs(player.car.speed) : player.speedNow;
    this.flashTime += dt;

    // Who can see Rico right now? (The helicopter does not pin him by itself — it only
    // slows the cooling, below, so a 5-star escape stays possible but hard.)
    const sightRange = 58;
    this.seenNow = this.nearestCopDistance(playerPos) < sightRange;
    if (this.seenNow) {
      this.hideTimer = 0;
    } else {
      this.hideTimer += dt;
      if (this.hideTimer > WANTED.hideSecondsNeeded && this.heat > 0) {
        const coolScale = this.heli ? 0.35 : 1;
        this.heat = Math.max(0, this.heat - WANTED.coolRate * coolScale * dt);
        this.stars = this.heat <= 0 ? 0 : Math.min(WANTED.maxStars, Math.ceil(this.heat / WANTED.heatPerStar));
      }
    }

    // Fleet size follows the stars.
    const wanted = COP_COUNTS[this.stars];
    if (this.stars === 0) {
      // Cops give up and leave one by one.
      if (this.cops.length > 0 && this.rng() < dt * 0.8) this.removeCop(this.cops.length - 1);
      this.clearRoadblocks();
      this.removeHelicopter();
    } else {
      while (this.cops.length < wanted) this.spawnCop(playerPos);
      while (this.cops.length > wanted + 2) this.removeCop(0);
      if (this.stars >= WANTED.roadblockStars) {
        const heading = player.car ? player.car.heading : player.heading;
        this.ensureRoadblock(playerPos, heading);
      } else {
        this.clearRoadblocks();
      }
      if (this.stars >= WANTED.helicopterStars) this.ensureHelicopter();
      else this.removeHelicopter();
    }

    // Roadblocks dissolve once the player is far past them.
    for (let i = this.roadblocks.length - 1; i >= 0; i -= 1) {
      const block = this.roadblocks[i];
      if (Math.hypot(block.anchor.x - playerPos.x, block.anchor.z - playerPos.z) > 95) {
        for (const car of block.cars) this.scene.remove(car.mesh);
        this.roadblocks.splice(i, 1);
      }
    }

    // Chase steering: aim at a point just ahead of the target's motion.
    for (let i = this.cops.length - 1; i >= 0; i -= 1) {
      const cop = this.cops[i];
      const car = cop.car;
      if (car.disabled) continue;
      const dist = car.position.distanceTo(playerPos);
      if (dist > 190 && this.stars > 0) {
        // Rubber-band: a cop that lost the trail entirely rejoins near the action.
        const spot = spawnIntersection(playerPos, 66, this.rng);
        car.position.set(spot.x, 0, spot.z);
        car.speed = 0;
        continue;
      }
      const lead = player.car ? Math.min(1.2, dist / 30) : 0.3;
      const fwdX = player.car ? Math.sin(player.car.heading) * player.car.speed : Math.sin(player.heading) * player.speedNow;
      const fwdZ = player.car ? Math.cos(player.car.heading) * player.car.speed : Math.cos(player.heading) * player.speedNow;
      const aimX = playerPos.x + fwdX * lead * 0.4;
      const aimZ = playerPos.z + fwdZ * lead * 0.4;
      const desired = Math.atan2(aimX - car.position.x, aimZ - car.position.z);
      let turn = desired - car.heading;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, turn * 1.7));
      // Don't plough into a stationary on-foot player: pull up short and make the arrest.
      let throttle = 1;
      if (!player.car && dist < 5.5) throttle = car.speed > 1 ? -0.7 : 0;
      car.drive(dt, { throttle, steer, handbrake: Math.abs(turn) > 2.2 }, this.colliders, 1.0);
      // Lightbar strobe.
      if (car.mesh.userData.lightbar) {
        const phase = Math.sin(this.flashTime * 11 + i * 1.7) > 0;
        car.mesh.userData.lightbar.redMat.emissive.setHex(phase ? 0xff2244 : 0x330000);
        car.mesh.userData.lightbar.blueMat.emissive.setHex(phase ? 0x330000 : 0x2277ff);
      }
    }

    // Helicopter: circles the player high up, spotlight cone pinned on him.
    if (this.heli) {
      this.heliAngle += dt * 0.45;
      const radius = 15;
      const hx = playerPos.x + Math.cos(this.heliAngle) * radius;
      const hz = playerPos.z + Math.sin(this.heliAngle) * radius;
      this.heli.position.set(hx, 27, hz);
      this.heli.rotation.y = -this.heliAngle;
      this.heli.userData.rotor.rotation.y += dt * 28;
      this.heli.userData.tailRotor.rotation.x += dt * 32;
    }

    // The bust rule: slow or on foot + a cop right there + time = arrested.
    const copNear = this.nearestCopDistance(playerPos) < 6.5;
    if (this.stars > 0 && copNear && playerSpeed < 2.2) {
      this.bustTimer += dt;
      if (this.bustTimer > WANTED.bustSeconds) {
        this.bustTimer = 0;
        game.onBusted();
      }
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 1.6);
    }
  }
}
