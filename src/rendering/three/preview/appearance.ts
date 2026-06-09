import { ACESFilmicToneMapping, AmbientLight, DirectionalLight, Object3D } from "three";
import type { ToneMapping } from "three";

// #######################################
// Appearance Lab (temporary surface/lighting experiment)
// #######################################
// A throwaway set of material + lighting "looks" to flip between in a floating
// selector and pick the nicest surface. Once chosen, drop the rest and inline the
// winner. Each preset drives the printed-part material, the lighting rig, an
// optional IBL environment, and tone mapping.

type PrintedSurfaceSpec = {
  readonly kind: "standard" | "physical";
  readonly normals: "flat" | "creased";
  readonly roughness: number;
  readonly metalness: number;
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  readonly envMapIntensity?: number;
};

type AppearancePreset = {
  readonly id: string;
  readonly label: string;
  readonly surface: PrintedSurfaceSpec;
  readonly environment: "room" | "none";
  readonly toneMapping: ToneMapping;
  readonly exposure: number;
  readonly lights: () => Object3D[];
};

function directionalLight(intensity: number, position: readonly [number, number, number], color = 0xffffff): DirectionalLight {
  const light = new DirectionalLight(color, intensity);
  light.position.set(position[0], position[1], position[2]);
  return light;
}

export const APPEARANCE_PRESETS: readonly AppearancePreset[] = [
  {
    id: "studio",
    label: "Studio matte",
    // The product look: a matte creased-normal surface, a dominant world-fixed key
    // (which casts the floor shadow), a soft opposing fill, a uniform ambient, and a
    // faint IBL accent. The key being clearly directional is intentional — its cast
    // shadow on the floor is the cue that the box is fixed and the camera orbits it.
    surface: { kind: "standard", normals: "creased", roughness: 0.68, metalness: 0, envMapIntensity: 0.3 },
    environment: "room",
    toneMapping: ACESFilmicToneMapping,
    exposure: 0.72,
    lights: () => [
      new AmbientLight(0xffffff, 0.35),
      directionalLight(1.15, [3, 4.5, 2.5]),
      directionalLight(0.4, [-2.5, 2, -3.2], 0xeef2ff),
    ],
  },
];

export const DEFAULT_APPEARANCE_PRESET_ID = "studio";
// Smooth shading within faces but crisp at dihedral angles >= this, so box edges
// and chamfers stay sharp while grills and rounded corners read smooth.
export const CREASE_ANGLE_RADIANS = (40 * Math.PI) / 180;

let activeSurface: PrintedSurfaceSpec = APPEARANCE_PRESETS[0].surface;

export function activeAppearance(): PrintedSurfaceSpec {
  return activeSurface;
}

export function setActiveAppearance(surface: PrintedSurfaceSpec): void {
  activeSurface = surface;
}
