import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  TorusGeometry,
} from "three";
import type { FanAppearance } from "@/domain/purifier/fans";
import type {
  FanCadPreviewAsset,
  FanCadPreviewMesh,
  FanPlacement,
  LoadedFanCadMesh,
  LoadedFanCadModel,
} from "@/rendering/three/preview/previewData";

// #######################################
// Fan Models
// #######################################

// Preview-only purchased-part fan visuals: the procedural fan (frame, shroud,
// rotor, blades) and the cached Noctua CAD preview asset it upgrades to.

// ##############################
// Fan Assembly
// ##############################

export function createFan({ axis, position, radius, facing, appearance }: FanPlacement & { appearance: FanAppearance }): Group {
  const fan = new Group();
  fan.position.copy(position);
  // +y is the fan's exhaust/back side; the rotation maps it onto the requested
  // axis and facing. "axis-negative" mirrors the mapping so the exhaust points
  // the other way along the same axis.
  const flip = facing === "axis-negative";
  if (axis === "x") {
    fan.rotation.z = flip ? Math.PI / 2 : -Math.PI / 2;
  } else if (axis === "z") {
    fan.rotation.x = flip ? -Math.PI / 2 : Math.PI / 2;
  } else if (flip) {
    fan.rotation.z = Math.PI;
  }

  if (appearance.previewCadModel?.type === "noctua-nf-a14-public-cad") {
    fan.add(createNoctuaCadFanCore(radius, appearance));
    return fan;
  }

  fan.add(createFanFrame(radius, appearance));
  fan.add(createFanShroud(radius, appearance));
  fan.add(createRearFanSupport(radius, appearance));

  const rotor = new Group();
  rotor.name = "fan-rotor";
  rotor.userData["fanRotor"] = true;
  addProceduralFanRotor(rotor, radius, appearance);
  fan.add(rotor);

  return fan;
}

function addProceduralFanRotor(rotor: Group, radius: number, appearance: FanAppearance): void {
  const hub = new Mesh(
    new CylinderGeometry(radius * 0.28, radius * 0.28, 0.047, 48),
    new MeshStandardMaterial({ color: appearance.hubColor, roughness: 0.45, metalness: 0.08 }),
  );
  rotor.add(hub);

  // Fan blades are opaque plastic; rendering them solid (not translucent) avoids
  // both the transparent-sort vanish and bright-background bleed-through at grazing angles.
  const bladeMaterial = new MeshStandardMaterial({
    color: appearance.bladeColor,
    roughness: 0.62,
    metalness: 0.04,
    side: DoubleSide,
  });
  for (let index = 0; index < 7; index += 1) {
    const blade = new Mesh(createBladeGeometry(radius), bladeMaterial);
    blade.rotation.y = (index / 7) * Math.PI * 2;
    blade.castShadow = true;
    rotor.add(blade);
  }
}

const fanCadModelCache = new Map<string, Promise<LoadedFanCadModel>>();

// ##############################
// CAD Fan Loading
// ##############################

// The bundled NF-A14 asset is 27 mm deep at its 140 mm nominal diameter and
// centered on the fan origin, so its loaded depth is the fan width times this
// ratio at any preview scale.
const noctuaCadPreviewDepthPerWidth = 27 / 140;

// The CAD silhouette is deeper than the procedural fallback fan. Reserving its
// final depth with an invisible envelope keeps bounds-driven placement (such
// as the tempest wall inset) correct before the asset loads asynchronously;
// Box3.setFromObject includes invisible meshes.
function createNoctuaCadDepthEnvelope(radius: number): Mesh {
  const width = radius * 2;
  const envelope = new Mesh(
    new BoxGeometry(width, width * noctuaCadPreviewDepthPerWidth, width),
    new MeshBasicMaterial(),
  );
  envelope.name = "noctua-cad-preview-depth-envelope";
  envelope.visible = false;
  return envelope;
}

function createNoctuaCadFanCore(radius: number, appearance: FanAppearance): Group {
  const core = new Group();
  core.name = "noctua-nf-a14-preview-cad";
  core.add(createNoctuaCadDepthEnvelope(radius));

  const fallbackStatic = new Group();
  fallbackStatic.add(createFanFrame(radius, appearance));
  fallbackStatic.add(createFanShroud(radius, appearance));
  fallbackStatic.add(createRearFanSupport(radius, appearance));

  const rotor = new Group();
  rotor.name = "fan-rotor";
  rotor.userData["fanRotor"] = true;
  const fallbackRotor = new Group();
  addProceduralFanRotor(fallbackRotor, radius, appearance);
  rotor.add(fallbackRotor);

  core.add(fallbackStatic, rotor);

  const cadModel = appearance.previewCadModel;
  if (cadModel === undefined) {
    return core;
  }

  void loadFanCadModel(cadModel.assetUrl, appearance)
    .then((model) => {
      if (core.userData["disposedPreviewObject"] === true) {
        return;
      }
      fallbackStatic.visible = false;
      fallbackRotor.visible = false;
      const scale = (radius * 2) / model.nominalDiameter;

      for (const part of model.meshes) {
        const mesh = new Mesh(
          part.geometry,
          new MeshStandardMaterial({
            color: part.color,
            roughness: part.isRotor ? 0.5 : 0.62,
            metalness: part.isRotor ? 0.05 : 0.08,
          }),
        );
        mesh.name = part.name;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData["sharedCadGeometry"] = true;
        mesh.scale.setScalar(scale);
        if (part.isRotor) {
          rotor.add(mesh);
        } else {
          core.add(mesh);
        }
      }
    })
    .catch(() => {
      if (core.userData["disposedPreviewObject"] === true) {
        return;
      }
      fallbackStatic.visible = true;
      fallbackRotor.visible = true;
    });

  return core;
}

async function loadFanCadModel(assetUrl: string, appearance: FanAppearance): Promise<LoadedFanCadModel> {
  const cached = fanCadModelCache.get(assetUrl);
  if (cached !== undefined) {
    return cached;
  }

  const promise = fetch(assetUrl)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`loadFanCadModel: Failed to load ${assetUrl}: ${response.status}`);
      }
      return parseFanCadPreviewAsset(await response.json());
    })
    .then((asset) => createLoadedFanCadModel(asset, appearance))
    .catch((error) => {
      fanCadModelCache.delete(assetUrl);
      throw error;
    });
  fanCadModelCache.set(assetUrl, promise);
  return promise;
}

function createLoadedFanCadModel(asset: FanCadPreviewAsset, appearance: FanAppearance): LoadedFanCadModel {
  if (asset.schema !== "filterboxbuilder-fan-cad-preview-v1" || asset.usage !== "preview-only-purchased-part-visual") {
    throw new Error("createLoadedFanCadModel: Unsupported fan CAD preview asset");
  }

  return {
    nominalDiameter: asset.nominalDiameter,
    meshes: asset.meshes.map((mesh) => createLoadedFanCadMesh(mesh, asset.bounds.center, appearance)),
  };
}

// ##############################
// CAD Asset Parsing
// ##############################

function parseFanCadPreviewAsset(input: unknown): FanCadPreviewAsset {
  const asset = expectRecord(input, "fan CAD preview asset");
  const schema = asset["schema"];
  const usage = asset["usage"];
  const unit = asset["unit"];
  if (schema !== "filterboxbuilder-fan-cad-preview-v1" || usage !== "preview-only-purchased-part-visual" || unit !== "millimeter") {
    throw new Error("parseFanCadPreviewAsset: Unsupported fan CAD preview asset");
  }

  const bounds = expectRecord(asset["bounds"], "fan CAD preview bounds");
  const meshes = asset["meshes"];
  if (!Array.isArray(meshes) || meshes.length === 0) {
    throw new Error("parseFanCadPreviewAsset: Expected at least one mesh");
  }

  return {
    schema,
    usage,
    unit,
    nominalDiameter: expectPositiveNumber(asset["nominalDiameter"], "nominalDiameter"),
    bounds: {
      center: expectNumberTuple(bounds["center"], 3, "bounds.center"),
    },
    meshes: meshes.map((mesh, index) => parseFanCadPreviewMesh(mesh, index)),
  };
}

function parseFanCadPreviewMesh(input: unknown, meshIndex: number): FanCadPreviewMesh {
  const mesh = expectRecord(input, `mesh ${meshIndex}`);
  const name = mesh["name"];
  if (typeof name !== "string" || name.trim() === "") {
    throw new Error(`parseFanCadPreviewMesh: Mesh ${meshIndex} is missing a name`);
  }

  const position = expectNumberArray(mesh["position"], `${name}.position`);
  if (position.length < 9 || position.length % 3 !== 0) {
    throw new Error(`parseFanCadPreviewMesh: ${name}.position must contain complete x/y/z coordinates`);
  }

  const index = expectNonNegativeIntegerArray(mesh["index"], `${name}.index`);
  if (index.length < 3 || index.length % 3 !== 0) {
    throw new Error(`parseFanCadPreviewMesh: ${name}.index must contain complete triangles`);
  }

  const vertexCount = position.length / 3;
  if (index.some((entry) => entry >= vertexCount)) {
    throw new Error(`parseFanCadPreviewMesh: ${name}.index references a missing vertex`);
  }

  const color = mesh["color"] === undefined ? undefined : expectUnitColor(mesh["color"], `${name}.color`);
  return color === undefined ? { name, position, index } : { name, color, position, index };
}

function expectRecord(input: unknown, label: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(`expectRecord: Expected ${label} to be an object`);
  }
  return input as Record<string, unknown>;
}

function expectPositiveNumber(input: unknown, label: string): number {
  if (typeof input !== "number" || !Number.isFinite(input) || input <= 0) {
    throw new Error(`expectPositiveNumber: Expected ${label} to be a positive number`);
  }
  return input;
}

function expectNumberArray(input: unknown, label: string): readonly number[] {
  if (!Array.isArray(input) || !input.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
    throw new Error(`expectNumberArray: Expected ${label} to contain only finite numbers`);
  }
  return input;
}

function expectNonNegativeIntegerArray(input: unknown, label: string): readonly number[] {
  if (!Array.isArray(input) || !input.every((entry) => Number.isSafeInteger(entry) && entry >= 0)) {
    throw new Error(`expectNonNegativeIntegerArray: Expected ${label} to contain only non-negative integer indexes`);
  }
  return input;
}

function expectNumberTuple(input: unknown, length: number, label: string): readonly [number, number, number] {
  const tuple = expectNumberArray(input, label);
  if (length !== 3 || tuple.length !== 3) {
    throw new Error(`expectNumberTuple: Expected ${label} to contain exactly three coordinates`);
  }
  const [x, y, z] = tuple;
  if (x === undefined || y === undefined || z === undefined) {
    throw new Error(`expectNumberTuple: Expected ${label} to contain exactly three coordinates`);
  }
  return [x, y, z];
}

function expectUnitColor(input: unknown, label: string): readonly [number, number, number] {
  const color = expectNumberTuple(input, 3, label);
  if (color.some((channel) => channel < 0 || channel > 1)) {
    throw new Error(`expectUnitColor: Expected ${label} channels to stay between 0 and 1`);
  }
  return color;
}

// ##############################
// CAD Mesh Conversion
// ##############################

function createLoadedFanCadMesh(
  mesh: FanCadPreviewMesh,
  center: readonly [number, number, number],
  appearance: FanAppearance,
): LoadedFanCadMesh {
  const positions: number[] = [];
  for (let index = 0; index < mesh.position.length; index += 3) {
    const { x: sourceX, y: sourceY, z: sourceZ } = fanCadVertexAt(mesh, index);
    positions.push(sourceX - center[0], sourceZ - center[2], sourceY - center[1]);
  }

  // Same Y↔Z reflection as the position map above reverses winding; swap each
  // triangle's last two indices back so glTF's CCW-outward faces stay outward
  // under FrontSide culling (otherwise the loaded fan renders inside-out).
  const windingFixedIndex: number[] = [];
  for (let triangle = 0; triangle < mesh.index.length; triangle += 3) {
    windingFixedIndex.push(mesh.index[triangle], mesh.index[triangle + 2], mesh.index[triangle + 1]);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(windingFixedIndex);
  geometry.computeVertexNormals();

  const isRotor = mesh.name.toLowerCase().includes("impeller");
  return {
    name: mesh.name,
    geometry,
    color: meshColor(mesh, isRotor, appearance),
    isRotor,
  };
}

function fanCadVertexAt(mesh: FanCadPreviewMesh, index: number): { readonly x: number; readonly y: number; readonly z: number } {
  const x = mesh.position[index];
  const y = mesh.position[index + 1];
  const z = mesh.position[index + 2];
  if (x === undefined || y === undefined || z === undefined) {
    throw new Error(`fanCadVertexAt: ${mesh.name} has an incomplete vertex coordinate`);
  }
  return { x, y, z };
}

function meshColor(mesh: FanCadPreviewMesh, isRotor: boolean, appearance: FanAppearance): number {
  if (mesh.color !== undefined) {
    const [red, green, blue] = mesh.color;
    return ((Math.round(red * 255) << 16) | (Math.round(green * 255) << 8) | Math.round(blue * 255)) >>> 0;
  }
  return isRotor ? appearance.bladeColor : appearance.hubColor;
}

// ##############################
// Procedural Fan Geometry
// ##############################

export function collectFanRotors(root: Object3D, rotors: Object3D[]): void {
  root.traverse((child) => {
    if (child.userData["fanRotor"] === true) {
      rotors.push(child);
    }
  });
}

function createFanFrame(radius: number, appearance: FanAppearance): Group {
  const frame = new Group();
  const size = proceduralFanFrameOuterSize(radius);
  const barWidth = radius * 0.26;
  const depth = 0.032;
  const material = new MeshStandardMaterial({ color: appearance.frameColor, roughness: 0.62, metalness: 0.08 });
  const accentMaterial = new MeshStandardMaterial({ color: appearance.accentColor, roughness: 0.5, metalness: 0.12 });

  const top = new Mesh(new BoxGeometry(size, depth, barWidth), material);
  top.position.z = size / 2 - barWidth / 2;
  const bottom = new Mesh(new BoxGeometry(size, depth, barWidth), material);
  bottom.position.z = -size / 2 + barWidth / 2;
  const left = new Mesh(new BoxGeometry(barWidth, depth, size), material);
  left.position.x = -size / 2 + barWidth / 2;
  const right = new Mesh(new BoxGeometry(barWidth, depth, size), material);
  right.position.x = size / 2 - barWidth / 2;

  frame.add(top, bottom, left, right);
  const cornerOffset = size / 2 - barWidth / 2;
  for (const x of [-cornerOffset, cornerOffset]) {
    for (const z of [-cornerOffset, cornerOffset]) {
      const accent = new Mesh(new CylinderGeometry(radius * 0.075, radius * 0.075, depth * 1.2, 24), accentMaterial);
      accent.position.set(x, -0.002, z);
      frame.add(accent);
    }
  }
  return frame;
}

export function proceduralFanFrameOuterSize(radius: number): number {
  return radius * 2;
}

function createFanShroud(radius: number, appearance: FanAppearance): Group {
  const shroud = new Group();
  const material = new MeshStandardMaterial({ color: appearance.ringColor, roughness: 0.58, metalness: 0.12 });
  const shadowDisk = new Mesh(
    new CircleGeometry(radius * 0.9, 72),
    new MeshBasicMaterial({ color: appearance.ringColor, transparent: true, opacity: 0.24, side: DoubleSide }),
  );
  shadowDisk.rotation.x = Math.PI / 2;
  shadowDisk.position.y = -0.018;
  shroud.add(shadowDisk);

  const ring = new Mesh(new TorusGeometry(radius * 0.86, radius * 0.045, 12, 80), material);
  ring.rotation.x = Math.PI / 2;
  ring.castShadow = true;
  shroud.add(ring);

  return shroud;
}

function createRearFanSupport(radius: number, appearance: FanAppearance): Group {
  const support = new Group();
  const material = new MeshStandardMaterial({ color: appearance.frameColor, roughness: 0.6, metalness: 0.1 });
  const rearY = 0.034;
  const strutLength = radius * 0.72;
  const strutWidth = radius * 0.07;
  const strutDepth = 0.024;
  const strutDistance = radius * 0.52;

  for (const angle of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    const strut = new Mesh(new BoxGeometry(strutWidth, strutDepth, strutLength), material);
    strut.position.set(Math.cos(angle) * strutDistance, rearY, Math.sin(angle) * strutDistance);
    strut.rotation.y = Math.PI / 2 - angle;
    strut.castShadow = true;
    support.add(strut);
  }

  const motorCup = new Mesh(new CylinderGeometry(radius * 0.23, radius * 0.23, strutDepth * 1.15, 40), material);
  motorCup.position.y = rearY + 0.002;
  motorCup.castShadow = true;
  support.add(motorCup);
  return support;
}

function createBladeGeometry(radius: number): BufferGeometry {
  const radialSegments = 9;
  const chordSegments = 3;
  const innerRadius = radius * 0.24;
  const outerRadius = radius * 0.84;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex += 1) {
    const radialProgress = radialIndex / radialSegments;
    const bladeRadius = innerRadius + (outerRadius - innerRadius) * radialProgress;
    const sweepAngle = -0.48 + radialProgress * 0.82;
    const halfChordAngle = radiusToChordAngle(radius, radialProgress);

    for (let chordIndex = 0; chordIndex <= chordSegments; chordIndex += 1) {
      const chordProgress = chordIndex / chordSegments;
      const chordSide = chordProgress * 2 - 1;
      const angle = sweepAngle + chordSide * halfChordAngle;
      const pitch = chordSide * radius * (0.07 - radialProgress * 0.026);
      const camber = Math.sin(radialProgress * Math.PI) * radius * 0.026;
      positions.push(Math.cos(angle) * bladeRadius, pitch + camber, Math.sin(angle) * bladeRadius);
    }
  }

  const rowSize = chordSegments + 1;
  for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
    for (let chordIndex = 0; chordIndex < chordSegments; chordIndex += 1) {
      const a = radialIndex * rowSize + chordIndex;
      const b = a + 1;
      const c = a + rowSize;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function radiusToChordAngle(radius: number, radialProgress: number): number {
  return (0.34 - radialProgress * 0.16) * Math.max(0.74, Math.min(1.25, radius / 0.26));
}
