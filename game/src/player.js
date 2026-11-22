// Rico, the player character: third-person on-foot movement with a walk/run cycle, car
// entry and exit (including theft, via vehicles.stealCar), health and damage. While he is
// in a car, this class forwards the driving input to the car and Rico's mesh rides along
// hidden inside it.

import { PLAYER, SPAWN } from './config.js';
import { resolveCityCollision } from './city.js';
import { animatePerson, buildPerson } from './pedestrians.js';
import { stealCar } from './vehicles.js';

export class Player {
  constructor(scene) {
    this.mesh = buildPerson({ shirt: 0xf5f0e6, pants: 0x2b2d42, skin: 0xc68642, hat: 0xe63946 });
    scene.add(this.mesh);
    this.car = null;
    this.health = PLAYER.maxHealth;
    this.heading = SPAWN.heading;
    this.walkPhase = 0;
    this.speedNow = 0;
    this.timeSinceDamage = 99;
    this.resetToSpawn();
  }

  get position() {
    return this.mesh.position;
  }

  /** Back to the beachfront spawn, on foot, full health, no car. */
  resetToSpawn() {
    if (this.car) this.exitCar(true);
    this.mesh.visible = true;
    this.mesh.position.set(SPAWN.x, 0, SPAWN.z);
    this.heading = SPAWN.heading;
    this.health = PLAYER.maxHealth;
    this.speedNow = 0;
  }

  /** The nearest car Rico could get into (any unoccupied car within reach), or null. */
  nearestEnterableCar(game) {
    let best = null;
    let bestDist = 3.4;
    for (const car of game.allCars) {
      if (car === this.car || car.kind === 'police' || car.disabled) continue;
      const dist = car.position.distanceTo(this.position);
      if (dist < bestDist) {
        bestDist = dist;
        best = car;
      }
    }
    return best;
  }

  /** Gets into `car`. Traffic cars are stolen (their system releases them first). */
  enterCar(game, car) {
    if (car.kind === 'traffic' || car.kind === 'parked') {
      const wasTraffic = car.kind === 'traffic';
      game.traffic.release(car);
      stealCar(game, car);
      if (wasTraffic) game.hud.toast('CAR STOLEN', 1.4);
    } else {
      car.kind = 'player';
    }
    this.car = car;
    this.mesh.visible = false;
    game.audio.init();
  }

  /** Gets out, stepping to the car's left side. Silent when forced (respawn). */
  exitCar(silent = false) {
    if (!this.car) return;
    const car = this.car;
    car.kind = car.police ? 'police' : 'parked';
    const sideX = Math.cos(car.heading);
    const sideZ = -Math.sin(car.heading);
    this.mesh.position.set(car.position.x + sideX * 2.2, 0, car.position.z + sideZ * 2.2);
    this.heading = car.heading;
    this.mesh.visible = true;
    this.car = null;
    void silent;
  }

  damage(amount, game) {
    if (game.state !== 'playing') return;
    this.health -= amount;
    this.timeSinceDamage = 0;
    game.hud.damageFlash();
    if (this.health <= 0) {
      this.health = 0;
      game.onWasted();
    }
  }

  heal(amount) {
    this.health = Math.min(PLAYER.maxHealth, this.health + amount);
  }

  /**
   * One frame on foot. input = { forward -1..1, strafe -1..1, run } in camera space;
   * cameraYaw is the camera's heading so movement follows the view.
   */
  updateOnFoot(dt, game, input, cameraYaw) {
    this.timeSinceDamage += dt;
    if (this.timeSinceDamage > 6 && this.health > 0) this.heal(dt * 1.6);

    const moving = input.forward !== 0 || input.strafe !== 0;
    const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    this.speedNow = moving ? speed : 0;
    if (moving) {
      // Camera-space wish direction: forward F = (sin, cos), right R = (-cos, sin).
      const sin = Math.sin(cameraYaw);
      const cos = Math.cos(cameraYaw);
      let wx = sin * input.forward - cos * input.strafe;
      let wz = cos * input.forward + sin * input.strafe;
      const len = Math.hypot(wx, wz) || 1;
      wx /= len;
      wz /= len;
      const targetHeading = Math.atan2(wx, wz);
      let turn = targetHeading - this.heading;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      this.heading += Math.max(-11 * dt, Math.min(11 * dt, turn));
      this.position.x += wx * speed * dt;
      this.position.z += wz * speed * dt;
      this.walkPhase += dt * speed * 1.9;
    }
    const resolved = resolveCityCollision(game.city.colliders, { x: this.position.x, z: this.position.z }, PLAYER.radius);
    this.position.x = Math.max(-356, Math.min(356, resolved.x));
    this.position.z = Math.max(-356, Math.min(356, resolved.z));
    this.mesh.rotation.y = this.heading;
    animatePerson(this.mesh, this.walkPhase, input.run ? 1 : 0);
    if (!moving) animatePerson(this.mesh, 0, 0);
  }

  /** While driving, Rico's hidden mesh tracks the car so exit and minimap logic stay sane. */
  updateInCar(dt) {
    if (!this.car) return;
    this.mesh.position.copy(this.car.position);
    this.heading = this.car.heading;
    this.timeSinceDamage += dt;
    void dt;
  }
}
