import { Box3, BufferGeometry, Vector3 } from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import type { StaticPrintPreviewAsset } from "@/resources/static-print-references/references";

export type StaticStlAssetOrientation = "source" | "print";

export type LoadedStaticPrintAsset = {
  readonly asset: StaticPrintPreviewAsset;
  readonly geometry: BufferGeometry;
  readonly footprintWidth: number;
  readonly footprintDepth: number;
  readonly height: number;
};

export type LoadedStaticPrintAssembly = {
  readonly assets: readonly LoadedStaticPrintAsset[];
  readonly footprintWidth: number;
  readonly footprintDepth: number;
  readonly height: number;
};

type AxisName = "x" | "y" | "z";

type StaticPrintBounds = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

type StaticPrintOrientationRotation = {
  readonly axis: AxisName;
  readonly radians: number;
};

type StaticPrintOrientationCandidate = {
  readonly id: string;
  readonly footprintWidthAxis: AxisName;
  readonly footprintDepthAxis: AxisName;
  readonly heightAxis: AxisName;
  readonly rotations: readonly StaticPrintOrientationRotation[];
};

export type StaticPrintOrientationChoice = {
  readonly id: string;
  readonly footprintWidth: number;
  readonly footprintDepth: number;
  readonly height: number;
};

const staticStlGeometryCache = new Map<string, Promise<BufferGeometry>>();

const staticPrintOrientationCandidates = [
  {
    id: "source-z-up",
    footprintWidthAxis: "x",
    footprintDepthAxis: "y",
    heightAxis: "z",
    rotations: [],
  },
  {
    id: "source-z-up-swapped",
    footprintWidthAxis: "y",
    footprintDepthAxis: "x",
    heightAxis: "z",
    rotations: [{ axis: "z", radians: Math.PI / 2 }],
  },
  {
    id: "source-y-up",
    footprintWidthAxis: "x",
    footprintDepthAxis: "z",
    heightAxis: "y",
    rotations: [{ axis: "x", radians: Math.PI / 2 }],
  },
  {
    id: "source-y-up-swapped",
    footprintWidthAxis: "z",
    footprintDepthAxis: "x",
    heightAxis: "y",
    rotations: [
      { axis: "x", radians: Math.PI / 2 },
      { axis: "z", radians: Math.PI / 2 },
    ],
  },
  {
    id: "source-x-up",
    footprintWidthAxis: "z",
    footprintDepthAxis: "y",
    heightAxis: "x",
    rotations: [{ axis: "y", radians: Math.PI / 2 }],
  },
  {
    id: "source-x-up-swapped",
    footprintWidthAxis: "y",
    footprintDepthAxis: "z",
    heightAxis: "x",
    rotations: [
      { axis: "y", radians: Math.PI / 2 },
      { axis: "z", radians: Math.PI / 2 },
    ],
  },
] as const satisfies readonly StaticPrintOrientationCandidate[];

export async function loadStaticPrintAssets(
  assets: readonly StaticPrintPreviewAsset[],
  orientation: StaticStlAssetOrientation = "source",
): Promise<readonly LoadedStaticPrintAsset[]> {
  const loadedAssets = await Promise.all(
    assets.map(async (asset) => {
      try {
        return await loadStaticPrintAsset(asset, orientation);
      } catch (error) {
        console.warn(`loadStaticPrintAssets: Skipping ${asset.name}`, error);
        return null;
      }
    }),
  );
  return loadedAssets.filter((asset): asset is LoadedStaticPrintAsset => asset !== null);
}

export function chooseStaticPrintOrientationForSize(size: StaticPrintBounds): StaticPrintOrientationChoice {
  const choices = staticPrintOrientationCandidates.map((candidate) => ({
    id: candidate.id,
    footprintWidth: axisSize(size, candidate.footprintWidthAxis),
    footprintDepth: axisSize(size, candidate.footprintDepthAxis),
    height: axisSize(size, candidate.heightAxis),
  }));

  return choices.reduce((bestChoice, choice) =>
    staticPrintOrientationScore(choice) < staticPrintOrientationScore(bestChoice) ? choice : bestChoice,
  );
}

export async function loadStaticPrintAssemblyAssets(
  assets: readonly StaticPrintPreviewAsset[],
): Promise<LoadedStaticPrintAssembly> {
  const loadedRawAssets = await Promise.all(
    assets.map(async (asset) => {
      try {
        return {
          asset,
          geometry: (await loadStaticStlGeometry(asset.assetUrl)).clone(),
        };
      } catch (error) {
        console.warn(`loadStaticPrintAssemblyAssets: Skipping ${asset.name}`, error);
        return null;
      }
    }),
  );
  const loadedAssets = loadedRawAssets.filter(
    (entry): entry is { readonly asset: StaticPrintPreviewAsset; readonly geometry: BufferGeometry } => entry !== null,
  );
  const assemblyBounds = new Box3();
  for (const entry of loadedAssets) {
    assemblyBounds.union(geometryBounds(entry.geometry));
  }
  if (assemblyBounds.isEmpty()) {
    return {
      assets: [],
      footprintWidth: 0,
      footprintDepth: 0,
      height: 0,
    };
  }

  const center = assemblyBounds.getCenter(new Vector3());
  const assemblySize = assemblyBounds.getSize(new Vector3());
  return {
    assets: loadedAssets.map((entry) => {
      entry.geometry.translate(-center.x, -center.y, -assemblyBounds.min.z);
      const size = geometryBounds(entry.geometry).getSize(new Vector3());
      return {
        asset: entry.asset,
        geometry: entry.geometry,
        footprintWidth: size.x,
        footprintDepth: size.y,
        height: size.z,
      };
    }),
    footprintWidth: assemblySize.x,
    footprintDepth: assemblySize.y,
    height: assemblySize.z,
  };
}

async function loadStaticPrintAsset(
  asset: StaticPrintPreviewAsset,
  orientation: StaticStlAssetOrientation,
): Promise<LoadedStaticPrintAsset> {
  const geometry = (await loadStaticStlGeometry(asset.assetUrl)).clone();
  if (orientation === "print") {
    orientGeometryForStaticPrintPlate(geometry, asset);
  }
  const size = normalizeGeometryForPreview(geometry);
  return {
    asset,
    geometry,
    footprintWidth: size.x,
    footprintDepth: size.y,
    height: size.z,
  };
}

function orientGeometryForStaticPrintPlate(geometry: BufferGeometry, asset: StaticPrintPreviewAsset): void {
  const sourceSize = geometryBounds(geometry).getSize(new Vector3());
  const orientation = chooseStaticPrintOrientationForSize({
    x: sourceSize.x,
    y: sourceSize.y,
    z: sourceSize.z,
  });
  const candidate = requiredStaticPrintOrientationCandidate(orientation.id);
  for (const rotation of candidate.rotations) {
    rotateGeometry(geometry, rotation);
  }
  if (asset.printPlateOrientation.type === "source-bed-side" && asset.printPlateOrientation.bedSide === "source-max-z") {
    geometry.rotateX(Math.PI);
  }
}

function normalizeGeometryForPreview(geometry: BufferGeometry): Vector3 {
  const bounds = geometryBounds(geometry);
  const center = bounds.getCenter(new Vector3());
  geometry.translate(-center.x, -center.y, -bounds.min.z);
  return geometryBounds(geometry).getSize(new Vector3());
}

function geometryBounds(geometry: BufferGeometry): Box3 {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (bounds === null) {
    throw new Error("geometryBounds: STL geometry does not have bounds");
  }
  return bounds;
}

function requiredStaticPrintOrientationCandidate(id: string): StaticPrintOrientationCandidate {
  const candidate = staticPrintOrientationCandidates.find((entry) => entry.id === id);
  if (candidate === undefined) {
    throw new Error(`requiredStaticPrintOrientationCandidate: Missing orientation ${id}`);
  }
  return candidate;
}

function rotateGeometry(geometry: BufferGeometry, rotation: StaticPrintOrientationRotation): void {
  if (rotation.axis === "x") {
    geometry.rotateX(rotation.radians);
    return;
  }
  if (rotation.axis === "y") {
    geometry.rotateY(rotation.radians);
    return;
  }
  geometry.rotateZ(rotation.radians);
}

function axisSize(size: StaticPrintBounds, axis: AxisName): number {
  if (axis === "x") {
    return size.x;
  }
  if (axis === "y") {
    return size.y;
  }
  return size.z;
}

function staticPrintOrientationScore(choice: StaticPrintOrientationChoice): number {
  const longestFootprintSide = Math.max(choice.footprintWidth, choice.footprintDepth);
  const footprintArea = choice.footprintWidth * choice.footprintDepth;
  return choice.height * 1_000_000 + longestFootprintSide * 100 + footprintArea * 0.001;
}

function loadStaticStlGeometry(assetUrl: string): Promise<BufferGeometry> {
  const cached = staticStlGeometryCache.get(assetUrl);
  if (cached !== undefined) {
    return cached;
  }
  const loader = new STLLoader();
  const promise = loader.loadAsync(assetUrl).then((geometry) => {
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    return geometry;
  });
  staticStlGeometryCache.set(assetUrl, promise);
  return promise;
}
