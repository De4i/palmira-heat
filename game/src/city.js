// Palmira's city builder: lays the road grid, paints the ground (asphalt, lane dashes, sand,
// grass) onto one big canvas texture, then raises four districts — beachfront hotels on the
// west shore, downtown towers in the middle, pastel suburbs, and the marina with docks and
// boats in the south-east inlet. Also palms, streetlights, beach umbrellas and crates.
// Returns the building colliders the physics systems test against, plus a night hook the
// day cycle uses to switch the streetlights on.

import { GRID, PALETTE, blockCenter, roadCenter } from './config.js';

const WORLD_SIZE = 760; // ground plane edge, metres; city grid sits in the middle
const textureCache = new Map();
const geometryCache = new Map();

/** Unit box geometry, scaled per mesh — one allocation shared by every building and prop. */
function unitBox() {
  if (!geometryCache.has('box')) geometryCache.set('box', new THREE.BoxGeometry(1, 1, 1));
  return geometryCache.get('box');
}

/** A facade texture: flat pastel wall with a grid of windows, some lit. Cached per style. */
function facadeTexture(baseColor, floors, columns, rng) {
  const key = `${baseColor}-${floors}-${columns}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 128, 256);
  const winW = 128 / columns;
  const winH = 256 / floors;
  for (let f = 0; f < floors; f += 1) {
    for (let c = 0; c < columns; c += 1) {
      const lit = rng() < 0.24;
      ctx.fillStyle = lit ? '#ffe9a3' : 'rgba(23, 42, 66, 0.85)';
      ctx.fillRect(c * winW + winW * 0.22, f * winH + winH * 0.24, winW * 0.56, winH * 0.5);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  textureCache.set(key, texture);
  return texture;
}

function cssColor(hex) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/** Paints the whole ground plan: grass, roads with dashes and crosswalks, beach, promenade. */
function paintGroundTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const toPx = (world) => ((world + WORLD_SIZE / 2) / WORLD_SIZE) * size;
  const scale = size / WORLD_SIZE;

  ctx.fillStyle = cssColor(PALETTE.grass);
  ctx.fillRect(0, 0, size, size);

  // Beach sand along the west shore and a lighter apron around the marina inlet.
  ctx.fillStyle = cssColor(PALETTE.sand);
  ctx.fillRect(0, 0, toPx(-158), size);
  ctx.fillRect(toPx(168), toPx(30), size - toPx(168), size - toPx(30));

  // Roads: dark strips along every grid line, both directions.
  ctx.fillStyle = cssColor(PALETTE.road);
  for (let i = 0; i < GRID.blocksPerSide; i += 1) {
    const c = toPx(roadCenter(i));
    const w = GRID.roadWidth * scale;
    ctx.fillRect(c - w / 2, toPx(-GRID.halfExtent - 8), w, (GRID.halfExtent * 2 + 16) * scale);
    ctx.fillRect(toPx(-GRID.halfExtent - 8), c - w / 2, (GRID.halfExtent * 2 + 16) * scale, w);
  }
  // Shore road extension west to the promenade and east to the marina docks.
  ctx.fillRect(0, toPx(roadCenter(3)) - (GRID.roadWidth * scale) / 2, toPx(-GRID.halfExtent), GRID.roadWidth * scale);
  ctx.fillRect(toPx(GRID.halfExtent), toPx(roadCenter(5)) - (GRID.roadWidth * scale) / 2, size - toPx(GRID.halfExtent), GRID.roadWidth * scale);

  // Dashed centre lines.
  ctx.fillStyle = cssColor(PALETTE.roadLine);
  const dash = 4 * scale;
  for (let i = 0; i < GRID.blocksPerSide; i += 1) {
    const c = toPx(roadCenter(i));
    for (let p = -GRID.halfExtent; p < GRID.halfExtent; p += 9) {
      ctx.fillRect(c - 0.35 * scale, toPx(p), 0.7 * scale, dash);
      ctx.fillRect(toPx(p), c - 0.35 * scale, dash, 0.7 * scale);
    }
  }
  // Crosswalks at every intersection.
  ctx.fillStyle = 'rgba(255,248,236,0.85)';
  for (let i = 0; i < GRID.blocksPerSide; i += 1) {
    for (let j = 0; j < GRID.blocksPerSide; j += 1) {
      const cx = toPx(roadCenter(i));
      const cy = toPx(roadCenter(j));
      for (let s = -2; s <= 2; s += 1) {
        ctx.fillRect(cx - 6.4 * scale, cy + s * 2.4 * scale - 0.7 * scale, 2.6 * scale, 1.4 * scale);
        ctx.fillRect(cx + 3.8 * scale, cy + s * 2.4 * scale - 0.7 * scale, 2.6 * scale, 1.4 * scale);
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

/** One building: a box with a facade texture, a flat roof slab, and a collider entry. */
function addBuilding(parent, colliders, x, z, w, d, h, baseColor, rng, roofColor) {
  const floors = Math.max(2, Math.round(h / 3.2));
  const columns = Math.max(2, Math.round(w / 3.4));
  const material = new THREE.MeshLambertMaterial({
    map: facadeTexture(baseColor, floors, columns, rng),
    color: 0xffffff,
  });
  const mesh = new THREE.Mesh(unitBox(), material);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  const roof = new THREE.Mesh(
    unitBox(),
    new THREE.MeshLambertMaterial({ color: roofColor ?? PALETTE.roofs[Math.floor(rng() * PALETTE.roofs.length)] }),
  );
  roof.scale.set(w + 0.7, 0.6, d + 0.7);
  roof.position.set(x, h + 0.3, z);
  roof.castShadow = true;
  parent.add(roof);
  colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  return mesh;
}

/** A palm: tilted trunk segments and a crown of flat leaf planes. */
function addPalm(parent, x, z, rng) {
  const palm = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmTrunk });
  const lean = (rng() - 0.5) * 0.22;
  let px = 0;
  let py = 0;
  for (let s = 0; s < 4; s += 1) {
    const seg = new THREE.Mesh(unitBox(), trunkMat);
    seg.scale.set(0.42 - s * 0.05, 1.15, 0.42 - s * 0.05);
    px += lean * s * 0.5;
    py += 1.05;
    seg.position.set(px, py, 0);
    seg.rotation.z = lean;
    palm.add(seg);
  }
  const leafMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmLeaf, side: THREE.DoubleSide });
  for (let l = 0; l < 6; l += 1) {
    const leaf = new THREE.Mesh(unitBox(), leafMat);
    leaf.scale.set(3.4, 0.08, 0.8);
    const angle = (l / 6) * Math.PI * 2;
    leaf.position.set(px + Math.cos(angle) * 1.4, py + 0.75, Math.sin(angle) * 1.4);
    leaf.rotation.y = -angle;
    leaf.rotation.z = -0.5;
    palm.add(leaf);
  }
  palm.position.set(x, 0, z);
  palm.rotation.y = rng() * Math.PI * 2;
  parent.add(palm);
}

/** A streetlight: pole, arm and a head whose emissive material the night hook lights up. */
function addStreetlight(parent, lampHeads, x, z, rotationY) {
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x37474f });
  const group = new THREE.Group();
  const pole = new THREE.Mesh(unitBox(), poleMat);
  pole.scale.set(0.22, 5.6, 0.22);
  pole.position.y = 2.8;
  group.add(pole);
  const arm = new THREE.Mesh(unitBox(), poleMat);
  arm.scale.set(1.8, 0.18, 0.18);
  arm.position.set(0.8, 5.5, 0);
  group.add(arm);
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0x000000 });
  const head = new THREE.Mesh(unitBox(), headMat);
  head.scale.set(0.7, 0.22, 0.4);
  head.position.set(1.6, 5.42, 0);
  group.add(head);
  lampHeads.push(headMat);
  group.position.set(x, 0, z);
  group.rotation.y = rotationY;
  parent.add(group);
}

/** A simple boat for the marina: tapered hull, cabin block and a mast. */
function addBoat(parent, x, z, rotationY, hullColor) {
  const boat = new THREE.Group();
  const hull = new THREE.Mesh(unitBox(), new THREE.MeshLambertMaterial({ color: hullColor }));
  hull.scale.set(7.5, 1.5, 2.6);
  hull.position.y = 0.55;
  boat.add(hull);
  const bow = new THREE.Mesh(unitBox(), hull.material);
  bow.scale.set(2.2, 1.3, 1.7);
  bow.position.set(4.6, 0.5, 0);
  bow.rotation.y = Math.PI / 4;
  boat.add(bow);
  const cabin = new THREE.Mesh(unitBox(), new THREE.MeshLambertMaterial({ color: 0xf5f0e6 }));
  cabin.scale.set(2.6, 1.3, 1.9);
  cabin.position.set(-0.6, 1.9, 0);
  boat.add(cabin);
  const mast = new THREE.Mesh(unitBox(), new THREE.MeshLambertMaterial({ color: 0x8a6844 }));
  mast.scale.set(0.14, 5.4, 0.14);
  mast.position.set(1.6, 3.8, 0);
  boat.add(mast);
  boat.position.set(x, 0, z);
  boat.rotation.y = rotationY;
  parent.add(boat);
}

/** District of a block: 0 = beachfront, 1 = downtown, 2 = marina, 3 = suburb. */
function districtOf(col, row) {
  if (col === 0) return 0;
  if (col >= 4 && row >= 4) return 2;
  if (col >= 1 && col <= 3 && row >= 1 && row <= 4) return 1;
  return 3;
}

/**
 * Builds the whole city into `scene`. `rng` is the seeded generator so the skyline is the
 * same on every load for a given seed. Returns { colliders, setNightFactor }.
 */
export function buildPalmiraCity(scene, rng) {
  const city = new THREE.Group();
  scene.add(city);
  const colliders = [];
  const lampHeads = [];

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE),
    new THREE.MeshLambertMaterial({ map: paintGroundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  city.add(ground);

  // Ocean west and the marina inlet east: two calm planes over the painted shore.
  const oceanMat = new THREE.MeshLambertMaterial({ color: PALETTE.ocean, transparent: true, opacity: 0.92 });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(210, WORLD_SIZE), oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(-272, 0.04, 0);
  city.add(ocean);
  const inlet = new THREE.Mesh(new THREE.PlaneGeometry(190, 330), new THREE.MeshLambertMaterial({ color: PALETTE.oceanDeep, transparent: true, opacity: 0.94 }));
  inlet.rotation.x = -Math.PI / 2;
  inlet.position.set(272, 0.04, 195);
  city.add(inlet);

  // City blocks: a sidewalk slab, then buildings by district.
  const slabMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  for (let col = 0; col < GRID.blocksPerSide - 1; col += 1) {
    for (let row = 0; row < GRID.blocksPerSide - 1; row += 1) {
      const { x, z } = blockCenter(col, row);
      const slab = new THREE.Mesh(unitBox(), slabMat);
      slab.scale.set(GRID.blockSize + 2.5, 0.35, GRID.blockSize + 2.5);
      slab.position.set(x, 0.17, z);
      slab.receiveShadow = true;
      city.add(slab);

      const district = districtOf(col, row);
      const half = GRID.blockSize / 2;
      if (district === 1) {
        // Downtown: one or two towers.
        const tall = 20 + rng() * 26;
        addBuilding(city, colliders, x + (rng() - 0.5) * 4, z + (rng() - 0.5) * 4, 15 + rng() * 6, 15 + rng() * 6, tall,
          cssColor(PALETTE.buildings[Math.floor(rng() * PALETTE.buildings.length)]), rng);
        if (rng() < 0.55) {
          addBuilding(city, colliders, x - half + 8, z + half - 8, 10, 10, 10 + rng() * 10,
            cssColor(PALETTE.buildings[Math.floor(rng() * PALETTE.buildings.length)]), rng);
        }
      } else if (district === 0) {
        // Beachfront: two low, wide hotels/cafes facing the sea.
        addBuilding(city, colliders, x, z - half + 8.5, 26, 12, 7 + rng() * 4,
          cssColor(PALETTE.buildings[Math.floor(rng() * PALETTE.buildings.length)]), rng, 0xc96f4a);
        addBuilding(city, colliders, x, z + half - 8.5, 26, 12, 6 + rng() * 4,
          cssColor(PALETTE.buildings[Math.floor(rng() * PALETTE.buildings.length)]), rng, 0xc96f4a);
      } else if (district === 2) {
        // Marina: warehouses and a chandlery, long and low.
        addBuilding(city, colliders, x - 6, z, 18, 22, 6.5, '#b0bec5', rng, 0x546e7a);
        addBuilding(city, colliders, x + 11, z + 6, 10, 12, 5, '#ffe0b2', rng, 0x546e7a);
      } else {
        // Suburbs: four pastel houses with pitched-look roofs.
        const spots = [
          [-half + 8.5, -half + 8.5], [half - 8.5, -half + 8.5],
          [-half + 8.5, half - 8.5], [half - 8.5, half - 8.5],
        ];
        for (const [dx, dz] of spots) {
          addBuilding(city, colliders, x + dx, z + dz, 11, 11, 4.6 + rng() * 1.6,
            cssColor(PALETTE.buildings[Math.floor(rng() * PALETTE.buildings.length)]), rng);
        }
      }
    }
  }

  // Marina docks: three piers into the inlet with boats tied up.
  const dockMat = new THREE.MeshLambertMaterial({ color: 0x8a6844 });
  for (const dockZ of [96, 156, 216]) {
    const pier = new THREE.Mesh(unitBox(), dockMat);
    pier.scale.set(64, 1.1, 6);
    pier.position.set(204, 0.55, dockZ);
    city.add(pier);
    colliders.push({ minX: 172, maxX: 236, minZ: dockZ - 3, maxZ: dockZ + 3 });
    addBoat(city, 226, dockZ - 9, 0.12, PALETTE.carPaints[Math.floor(rng() * PALETTE.carPaints.length)]);
    addBoat(city, 214, dockZ + 10, -0.08, PALETTE.carPaints[Math.floor(rng() * PALETTE.carPaints.length)]);
  }

  // Beach dressing: umbrellas and a lifeguard hut on the sand.
  const umbrellaColors = [0xe63946, 0xffca3a, 0x2ec4b6, 0xf15bb5];
  for (let i = 0; i < 14; i += 1) {
    const ux = -196 + rng() * 26;
    const uz = -150 + rng() * 300;
    const pole = new THREE.Mesh(unitBox(), new THREE.MeshLambertMaterial({ color: 0xf5f0e6 }));
    pole.scale.set(0.12, 2.4, 0.12);
    pole.position.set(ux, 1.2, uz);
    city.add(pole);
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(2.1, 0.8, 8),
      new THREE.MeshLambertMaterial({ color: umbrellaColors[i % umbrellaColors.length] }),
    );
    shade.position.set(ux, 2.5, uz);
    shade.castShadow = true;
    city.add(shade);
  }
  addBuilding(city, colliders, -186, -60, 6, 5, 4.2, '#fff3e0', rng, 0xe63946);

  // Palms: a promenade row on the shore road, plus scattered sidewalk shade.
  for (let z = -156; z <= 156; z += 18) {
    addPalm(city, -158 + (rng() - 0.5) * 2, z, rng);
    addPalm(city, -134 + (rng() - 0.5) * 2, z + 9, rng);
  }
  for (let i = 0; i < 46; i += 1) {
    const col = Math.floor(rng() * (GRID.blocksPerSide - 1));
    const row = Math.floor(rng() * (GRID.blocksPerSide - 1));
    const { x, z } = blockCenter(col, row);
    addPalm(city, x + (rng() - 0.5) * (GRID.blockSize - 4), z + (rng() - 0.5) * (GRID.blockSize - 4), rng);
  }

  // Streetlights at intersections, arms pointing along the road.
  for (let i = 0; i < GRID.blocksPerSide; i += 1) {
    for (let j = 0; j < GRID.blocksPerSide; j += 1) {
      if ((i + j) % 2 === 0) continue;
      addStreetlight(city, lampHeads, roadCenter(i) + 6.4, roadCenter(j) + 6.4, Math.PI);
      addStreetlight(city, lampHeads, roadCenter(i) - 6.4, roadCenter(j) - 6.4, 0);
    }
  }

  // Crates and barrels around the marina blocks.
  const crateMat = new THREE.MeshLambertMaterial({ color: 0xb08968 });
  for (let i = 0; i < 16; i += 1) {
    const col = 4 + Math.floor(rng() * 2);
    const row = 4 + Math.floor(rng() * 2);
    const { x, z } = blockCenter(col, row);
    const crate = new THREE.Mesh(unitBox(), crateMat);
    const s = 1.1 + rng() * 0.7;
    crate.scale.set(s, s, s);
    crate.position.set(x + (rng() - 0.5) * 26, s / 2 + 0.35, z + (rng() - 0.5) * 26);
    crate.rotation.y = rng() * Math.PI;
    crate.castShadow = true;
    city.add(crate);
  }

  return {
    colliders,
    lampHeads,
    /** 0 = full day (lamps off), 1 = night (lamps glowing). */
    setNightFactor(factor) {
      for (const mat of lampHeads) mat.emissive.setRGB(factor * 1.0, factor * 0.85, factor * 0.45);
    },
  };
}

/** True when the circle at (x, z) with `radius` overlaps any collider AABB. */
export function collidesWithCity(colliders, x, z, radius) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx;
    const dz = z - nz;
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}

/** Pushes a circle at (x, z) out of any collider it overlaps; returns the corrected position. */
export function resolveCityCollision(colliders, position, radius) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(position.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(position.z, c.maxZ));
    let dx = position.x - nx;
    let dz = position.z - nz;
    const distSq = dx * dx + dz * dz;
    if (distSq >= radius * radius) continue;
    if (distSq < 1e-6) {
      // Centre inside the box: push out along the smallest penetration axis.
      const left = position.x - c.minX;
      const right = c.maxX - position.x;
      const top = position.z - c.minZ;
      const bottom = c.maxZ - position.z;
      const min = Math.min(left, right, top, bottom);
      if (min === left) position.x = c.minX - radius;
      else if (min === right) position.x = c.maxX + radius;
      else if (min === top) position.z = c.minZ - radius;
      else position.z = c.maxZ + radius;
      continue;
    }
    const dist = Math.sqrt(distSq);
    dx /= dist;
    dz /= dist;
    position.x = nx + dx * radius;
    position.z = nz + dz * radius;
  }
  return position;
}
