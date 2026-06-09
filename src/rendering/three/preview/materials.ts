import {
  CanvasTexture,
  DoubleSide,
  LineBasicMaterial,
  Material,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
} from "three";
import { activeAppearance } from "@/rendering/three/preview/appearance";
import { burnColor, filterColor, woodColor } from "@/rendering/three/preview/previewData";

// #######################################
// Materials and Textures
// #######################################

// The preview's shared material/texture factories: wood, printed-part, filter
// media, cut-mark, and backdrop/shadow canvas textures.

export function createCutMarkMaterial(opacity: number): Material {
  return new MeshBasicMaterial({
    color: burnColor,
    transparent: true,
    opacity,
    side: DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

export function createWoodMaterial(): Material {
  return new MeshStandardMaterial({
    color: woodColor,
    map: createWoodTexture(),
    roughness: 0.72,
    metalness: 0.02,
  });
}

type PrintedPartMaterialOptions = {
  readonly color: number;
  readonly roughness: number;
  readonly metalness: number;
};

export function createPrintedPartMaterial(options: PrintedPartMaterialOptions): MeshStandardMaterial {
  // Driven by the active appearance preset (Appearance Lab) rather than the
  // per-part roughness/metalness, so every printed surface shares one look.
  const surface = activeAppearance();
  const base = {
    color: options.color,
    roughness: surface.roughness,
    metalness: surface.metalness,
    flatShading: surface.normals === "flat",
    envMapIntensity: surface.envMapIntensity ?? 1,
  };
  if (surface.kind === "physical") {
    return new MeshPhysicalMaterial({
      ...base,
      clearcoat: surface.clearcoat ?? 0,
      clearcoatRoughness: surface.clearcoatRoughness ?? 0,
    });
  }
  return new MeshStandardMaterial(base);
}

export function createFilterMediaMaterial(opacity: number): Material {
  return new MeshPhysicalMaterial({
    color: filterColor,
    map: createFilterTexture(),
    roughness: 0.52,
    transparent: true,
    opacity,
    side: DoubleSide,
    depthWrite: false,
  });
}

export function createPrintedPartEdgeMaterial(partColor: number, opacity: number): LineBasicMaterial {
  return new LineBasicMaterial({
    color: relativeLuminance(partColor) < 0.42 ? 0x9fb6aa : 0x1c2722,
    transparent: true,
    opacity,
    depthWrite: false,
  });
}

export function createFilterMediaEdgeMaterial(opacity: number): LineBasicMaterial {
  return new LineBasicMaterial({
    color: 0x6d7d68,
    transparent: true,
    opacity,
    depthWrite: false,
  });
}

function relativeLuminance(color: number): number {
  const red = ((color >> 16) & 0xff) / 255;
  const green = ((color >> 8) & 0xff) / 255;
  const blue = (color & 0xff) / 255;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function createWoodTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("createWoodTexture: Could not create canvas context");
  }

  context.fillStyle = "#c7965a";
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 4) {
    const alpha = y % 16 === 0 ? 0.12 : 0.055;
    context.strokeStyle = `rgba(68, 42, 19, ${alpha})`;
    context.beginPath();
    context.moveTo(0, y + Math.sin(y * 0.17) * 1.8);
    context.lineTo(canvas.width, y + Math.cos(y * 0.11) * 1.6);
    context.stroke();
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function createFilterTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("createFilterTexture: Could not create canvas context");
  }

  context.fillStyle = "#eef1e6";
  context.fillRect(0, 0, canvas.width, canvas.height);
  // A faint fine grid (horizontal + vertical cross lines) reads as filter mesh —
  // visible enough to feel like a filter, light enough not to overpower the housing.
  context.strokeStyle = "rgba(108, 119, 110, 0.13)";
  context.lineWidth = 1;
  for (let y = 0; y < canvas.height; y += 6) {
    context.beginPath();
    context.moveTo(0, y + 0.5);
    context.lineTo(canvas.width, y + 0.5);
    context.stroke();
  }
  for (let x = 0; x < canvas.width; x += 6) {
    context.beginPath();
    context.moveTo(x + 0.5, 0);
    context.lineTo(x + 0.5, canvas.height);
    context.stroke();
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function createStudioBackdropTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("createStudioBackdropTexture: Could not create canvas context");
  }
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#f1efe9");
  gradient.addColorStop(1, "#ddd9d0");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

// A soft round contact shadow — fake but cheap, and reads cleanly on the light
// backdrop where a real cast shadow would be fussy to tune.
export function createGroundShadowTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("createGroundShadowTexture: Could not create canvas context");
  }
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(28, 32, 30, 0.30)");
  gradient.addColorStop(0.55, "rgba(28, 32, 30, 0.13)");
  gradient.addColorStop(1, "rgba(28, 32, 30, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

