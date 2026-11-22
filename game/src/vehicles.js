// Cars: low-poly models built from boxes (body, cabin, wheels, lights — a lightbar and
// two-tone paint for police), an arcade driving model (accelerate, brake, steer, handbrake,
// drag) and the steal interaction that hands a parked or traffic car over to the player.

import { CAR, PALETTE, WANTED } from './config.js';
import { resolveCityCollision } from './city.js';

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const wheelGeometry = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
wheelGeometry.rotateZ(Math.PI / 2); // axle along X, so mesh.rotation.x spins the wheel
const paintMaterials = new Map();
const darkGlass = new THREE.MeshLambertMaterial({ color: 0x17263b });
const tyreMaterial = new THREE.MeshLambertMaterial({ color: 0x15181d });
const chromeMaterial = new THREE.MeshLambertMaterial({ color: 0xd7dde3 });

function paintMaterial(color) {
  if (!paintMaterials.has(color)) {
    paintMaterials.set(color, new THREE.MeshLambertMaterial({ color }));
  }
  return paintMaterials.get(color);
}

function addBox(parent, material, sx, sy, sz, x, y, z) {
  const mesh = new THREE.Mesh(boxGeometry, material);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

/**
 * Builds a car model facing +X. Police cars get the Palmira PD two-tone paint and a
 * red/blue lightbar whose materials police.js flashes. Returns the group; wheels and
 * lightbar materials are stashed in userData for animation.
 */
export function buildCarMesh(paintColor, { police = false } = {}) {
  const car = new THREE.Group();
  const paint = paintMaterial(police ? PALETTE.policePaint : paintColor);
  // Lower body and a slightly tapered cabin. The nose points along +Z.
  addBox(car, paint, CAR.width, 0.62, CAR.length, 0, 0.55, 0);
  addBox(car, paint, CAR.width * 0.86, 0.55, CAR.length * 0.52, 0, 1.12, -0.25);
  // Glass band inset into the cabin.
  addBox(car, darkGlass, CAR.width * 0.88, 0.42, CAR.length * 0.46, 0, 1.14, -0.25);
  if (police) {
    addBox(car, paintMaterial(PALETTE.policeAccent), CAR.width * 0.88, 0.1, CAR.length * 0.54, 0, 1.44, -0.25);
    addBox(car, paintMaterial(PALETTE.policeAccent), CAR.width + 0.04, 0.5, 0.9, 0, 0.56, 0.3);
  }
  // Hood scoop / spoiler hints keep the silhouette readable at thumbnail size.
  addBox(car, paint, 1.2, 0.12, 0.7, 0, 0.92, 1.7);
  addBox(car, paint, CAR.width * 0.9, 0.1, 0.28, 0, 1.0, -2.05);
  // Lights: pale headlights, red tails.
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff6c9, emissive: 0x444422 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xd90429, emissive: 0x440000 });
  addBox(car, headMat, 0.42, 0.18, 0.1, 0.55, 0.62, CAR.length / 2 + 0.02);
  addBox(car, headMat, 0.42, 0.18, 0.1, -0.55, 0.62, CAR.length / 2 + 0.02);
  addBox(car, tailMat, 0.42, 0.16, 0.1, 0.55, 0.66, -CAR.length / 2 - 0.02);
  addBox(car, tailMat, 0.42, 0.16, 0.1, -0.55, 0.66, -CAR.length / 2 - 0.02);
  addBox(car, chromeMaterial, CAR.width * 0.94, 0.16, CAR.length * 0.96, 0, 0.22, 0);

  // Each wheel rides in a steer group; the front pair (z > 0) turns with the steering.
  const wheels = [];
  const wheelPositions = [
    [0.95, 1.45, true], [-0.95, 1.45, true], [0.95, -1.45, false], [-0.95, -1.45, false],
  ];
  for (const [wx, wz, front] of wheelPositions) {
    const steerGroup = new THREE.Group();
    steerGroup.position.set(wx, 0.42, wz);
    const wheel = new THREE.Mesh(wheelGeometry, tyreMaterial);
    wheel.castShadow = true;
    steerGroup.add(wheel);
    car.add(steerGroup);
    wheels.push({ steerGroup, wheel, front });
  }
  car.userData.wheels = wheels;

  if (police) {
    const barGroup = new THREE.Group();
    const redMat = new THREE.MeshLambertMaterial({ color: 0xff2244, emissive: 0x881122 });
    const blueMat = new THREE.MeshLambertMaterial({ color: 0x2277ff, emissive: 0x112288 });
    const red = addBox(barGroup, redMat, 0.55, 0.22, 0.5, 0.3, 0, 0);
    const blue = addBox(barGroup, blueMat, 0.55, 0.22, 0.5, -0.3, 0, 0);
    red.castShadow = false;
    blue.castShadow = false;
    barGroup.position.set(0, 1.62, -0.25);
    car.add(barGroup);
    car.userData.lightbar = { redMat, blueMat };
  }
  return car;
}

/**
 * One car in the world: a mesh plus arcade physics state. Traffic, police and the player
 * all drive Cars; `kind` says who owns it ('traffic' | 'police' | 'player' | 'parked' | 'mission').
 */
export class Car {
  constructor(scene, paintColor, x, z, heading, { police = false, kind = 'traffic' } = {}) {
    this.mesh = buildCarMesh(paintColor, { police });
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.heading = heading;
    this.speed = 0;
    this.kind = kind;
    this.police = police;
    this.health = 100;
    this.disabled = false;
    this.steerVisual = 0;
  }

  get position() {
    return this.mesh.position;
  }

  /** Unit forward vector for the current heading. */
  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  /**
   * Advances the arcade driving model one step. input = { throttle -1..1, steer -1..1,
   * handbrake }. Returns 'crash' when a building stopped the car hard, else null.
   */
  drive(dt, input, colliders, topSpeedScale = 1) {
    if (this.disabled) {
      this.speed = 0;
      return null;
    }
    const maxSpeed = CAR.maxSpeed * topSpeedScale * (this.police ? CAR.policeSpeedBonus : 1);
    if (input.throttle > 0) {
      this.speed += CAR.accel * input.throttle * dt * (1 - Math.max(0, this.speed) / (maxSpeed * 1.25));
    } else if (input.throttle < 0) {
      if (this.speed > 0.5) this.speed -= CAR.brake * dt;
      else this.speed = Math.max(-CAR.maxReverse, this.speed + CAR.accel * input.throttle * dt);
    }
    this.speed -= this.speed * CAR.drag * dt * (input.handbrake ? 2.6 : 1);
    if (input.handbrake) this.speed -= Math.sign(this.speed) * 12 * dt;
    if (Math.abs(this.speed) < 0.04 && input.throttle === 0) this.speed = 0;

    const speedRatio = Math.min(1, Math.abs(this.speed) / 9);
    if (input.steer !== 0 && this.speed !== 0) {
      this.heading -= input.steer * CAR.turnRate * speedRatio * dt * Math.sign(this.speed);
    }
    this.steerVisual = input.steer;

    const before = { x: this.position.x, z: this.position.z };
    const fwd = this.forward();
    this.position.x += fwd.x * this.speed * dt;
    this.position.z += fwd.z * this.speed * dt;
    // Keep cars inside the world apron.
    this.position.x = Math.max(-352, Math.min(352, this.position.x));
    this.position.z = Math.max(-352, Math.min(352, this.position.z));

    const resolved = resolveCityCollision(colliders, { x: this.position.x, z: this.position.z }, 1.7);
    let crashed = null;
    if (Math.abs(resolved.x - this.position.x) > 0.01 || Math.abs(resolved.z - this.position.z) > 0.01) {
      if (Math.abs(this.speed) > 7) crashed = 'crash';
      this.speed *= 0.35;
    }
    this.position.x = resolved.x;
    this.position.z = resolved.z;
    void before;

    this.mesh.rotation.y = this.heading;
    // Wheel spin and front-wheel steer for life.
    const spin = (this.speed * dt) / 0.42;
    for (const part of this.mesh.userData.wheels) {
      part.wheel.rotation.x += spin;
      if (part.front) part.steerGroup.rotation.y = -this.steerVisual * 0.45;
    }
    return crashed;
  }

  /** Simple circle collision between two cars; pushes both apart and scrubs speed. */
  static collidePair(a, b) {
    const dx = b.position.x - a.position.x;
    const dz = b.position.z - a.position.z;
    const distSq = dx * dx + dz * dz;
    const minDist = 3.1;
    if (distSq >= minDist * minDist || distSq < 1e-6) return 0;
    const dist = Math.sqrt(distSq);
    const push = (minDist - dist) / 2;
    const nx = dx / dist;
    const nz = dz / dist;
    a.position.x -= nx * push;
    a.position.z -= nz * push;
    b.position.x += nx * push;
    b.position.z += nz * push;
    const impact = Math.abs(a.speed - b.speed);
    a.speed *= 0.55;
    b.speed *= 0.55;
    return impact;
  }
}

/**
 * Hands a car to the player: ejects it from traffic duty, parks the player's state in it,
 * and — if a pedestrian or a cop is close enough to see it happen — raises the wanted heat.
 * Returns true when the theft was witnessed.
 */
export function stealCar(game, car) {
  car.kind = 'player';
  car.speed = 0;
  let witnessed = false;
  for (const ped of game.pedestrians.citizens) {
    if (ped.state !== 'down' && ped.position.distanceTo(car.position) < 16) witnessed = true;
  }
  if (game.police.nearestCopDistance(car.position) < 26) witnessed = true;
  if (witnessed) {
    game.addHeat(WANTED.heatCarTheft, car.position);
    game.audio.playHonk();
  }
  return witnessed;
}
