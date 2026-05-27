export const staticPrintReferenceIds = [
  "static-cr-16x20-140",
  "static-cr-14x20-base",
  "static-modular-20x20-reference",
] as const;

export type StaticPrintReferenceId = (typeof staticPrintReferenceIds)[number];

export type StaticPrintReferenceUsePolicy =
  | {
      readonly type: "redistributable";
      readonly note: string;
    }
  | {
      readonly type: "external-only";
      readonly note: string;
    };

export type StaticPrintPreviewAsset = {
  readonly name: string;
  readonly assetUrl: string;
  readonly fileSizeBytes: number;
  readonly printPlateOrientation: StaticPrintPlateOrientation;
};

export type StaticPrintPlateOrientation =
  | {
      readonly type: "auto";
    }
  | {
      readonly type: "source-bed-side";
      readonly bedSide: StaticPrintSourceBedSide;
    };

export type StaticPrintSourceBedSide = "source-min-z" | "source-max-z";

export type NonEmptyStaticPrintPreviewAssets = readonly [StaticPrintPreviewAsset, ...StaticPrintPreviewAsset[]];

export type StaticPrintAssembledPreview =
  | {
      readonly type: "single-source-asset";
      readonly asset: StaticPrintPreviewAsset;
    }
  | {
      readonly type: "source-part-set";
      readonly assets: NonEmptyStaticPrintPreviewAssets;
    };

export type StaticPrintEstimate = {
  readonly method: "geometry-estimate";
  readonly selectedPrintablePartCount: number;
  readonly solidVolumeCm3: number;
  readonly estimatedPlasticVolumeCm3: number;
  readonly estimatedFilamentKilograms: number;
  readonly recommendedSpoolCount: number;
  readonly filamentCostUsdPerKilogram: number;
  readonly printTimeHours: {
    readonly min: number;
    readonly max: number;
  };
  readonly assumptions: {
    readonly infillPercent: number;
    readonly wallThicknessMm: number;
    readonly material: "PLA or PETG";
    readonly nozzleMm: number;
    readonly layerHeightMm: number;
  };
  readonly note: string;
};

export type StaticPrintReference = {
  readonly printablesId: string;
  readonly sourceUrl: string;
  readonly fileSummary: string;
  readonly attribution: string;
  readonly usePolicy: StaticPrintReferenceUsePolicy;
  readonly previewMaxDimensionMm: number;
  readonly assembledPreviewOrientation?: "source" | "source-side-fans" | "source-fans-up" | "fan-panel-up";
  readonly assembledPreview?: StaticPrintAssembledPreview;
  readonly printEstimate?: StaticPrintEstimate;
  readonly platePreviewAssets: readonly StaticPrintPreviewAsset[];
  readonly previewAssets: readonly StaticPrintPreviewAsset[];
};

const curatedAssetBaseUrl = "/vendor/static-print-references/printables";

function stlAsset(
  printablesId: string,
  name: string,
  fileSizeBytes: number,
  printPlateBedSide?: StaticPrintSourceBedSide,
): StaticPrintPreviewAsset {
  return {
    name,
    assetUrl: `${curatedAssetBaseUrl}/${printablesId}/${encodeURIComponent(name)}`,
    fileSizeBytes,
    printPlateOrientation:
      printPlateBedSide === undefined
        ? { type: "auto" }
        : {
            type: "source-bed-side",
            bedSide: printPlateBedSide,
          },
  };
}

const staticCr16x20Assets = [
  stlAsset("1251061", "PC-Corsi-Rosenthal-16x20-140mm-top-panel-a-v1.stl", 657484),
  stlAsset("1251061", "PC-Corsi-Rosenthal-16x20-140mm-top-panel-b-v1.stl", 610684),
  stlAsset("1251061", "PC-Corsi-Rosenthal-16x20-140mm-panel-bottom-a-v1.stl", 621484),
  stlAsset("1251061", "PC-Corsi-Rosenthal-16x20-140mm-panel-bottom-b-v1.stl", 574684),
  stlAsset("1251061", "PC-Corsi-Rosenthal-16x20-140mm-front-panel-ends-a-v1.stl", 1287684),
  stlAsset("1251061", "PC-Corsi-Rosenthal-16x20-140mm-front-panel-middle-v1.stl", 2493584),
  stlAsset("1251061", "PC-Corsi-Rosenthal-16x20-140mm-front-panel-ends-b-v1.stl", 1086784),
  stlAsset("1251061", "PC-Corsi-Rosenthal-16x20-140mm-Bracket-Rear-Top-v1.stl", 223584),
  stlAsset("1251061", "PC-Corsi-Rosenthal-16x20-140mm-Bracket-Front-Bottom-v1.stl", 183384),
  stlAsset("1251061", "PC-Corsi-Rosenthal-16x20-140mm-Bracket-Rear-Bottom-v1.stl", 142584),
  stlAsset("1251061", "PC-Corsi-Rosenthal-16x20-140mm-Bracket-Front-Top-v1.stl", 207284),
  stlAsset("1251061", "PC-Corsi-Rosenthal-16x20-140mm-Bracket-Panel-Seams-Cover-v1.stl", 76284),
  stlAsset("1251061", "PC-Corsi-Rosenthal-16x20-140mm-nut.stl", 425384),
  stlAsset("1251061", "PC-Corsi-Rosenthal-16x20-140mm-rear-panel-b-v1.stl", 1147684),
  stlAsset("1251061", "PC-Corsi-Rosenthal-16x20-140mm-rear-panel-a-v1.stl", 1200084),
] as const;

const staticCr14x20AssembledAsset = stlAsset(
  "955827",
  "0 Air filter fan housing for filtrete 14x20x1 inch filters (Corsi-Rosenthal box).stl",
  9686884,
);

const staticCr14x20PlateAssets = [
  stlAsset("955827", "1 filter housing fan mounts top power side.stl", 1113684, "source-min-z"),
  stlAsset("955827", "2 filter housing fan mounts top power side.stl", 1084084, "source-min-z"),
  stlAsset("955827", "3.1 filter housing power side upper very tight.stl", 950684, "source-max-z"),
  stlAsset("955827", "3.2 filter housing power side upper less tight.stl", 919684, "source-max-z"),
  stlAsset("955827", "4.1 filter housing power side lower very tight.stl", 844884, "source-max-z"),
  stlAsset("955827", "4.2 filter housing power side lower less tight.stl", 844484, "source-max-z"),
  stlAsset("955827", "5 filter housing bottom power base.stl", 907284, "source-min-z"),
  stlAsset("955827", "6 filter housing bottom not power base.stl", 844484, "source-min-z"),
  stlAsset("955827", "7.1 filter housing no power side lower very tight.stl", 940584, "source-max-z"),
  stlAsset("955827", "7.2 filter housing no power side lower less tight.stl", 916184, "source-max-z"),
  stlAsset("955827", "8.1 filter housing no power side upper very tight.stl", 844884, "source-max-z"),
  stlAsset("955827", "8.2 filter housing no power side upper less tight.stl", 844484, "source-max-z"),
  stlAsset("955827", "90 filter housing corner no power up.stl", 166184, "source-max-z"),
  stlAsset("955827", "91 filter housing corner guard power up.stl", 166184, "source-max-z"),
  stlAsset("955827", "92 filter housing corner guard power base.stl", 166184, "source-max-z"),
  stlAsset("955827", "93 filter housing corner guard no power base.stl", 166184, "source-max-z"),
  stlAsset("955827", "94 filter housing nut.stl", 355084, "source-max-z"),
  stlAsset("955827", "95-and-96 filter housing test screw 1 of 2 and 2 of 2.stl", 996784, "source-max-z"),
  stlAsset("955827", "xxxx 97 filter housing corner guard only if filter fits bad (janky)).stl", 134284, "source-max-z"),
] as const;

const staticCr14x20AssembledPlateAssetNames = new Set([
  "1 filter housing fan mounts top power side.stl",
  "2 filter housing fan mounts top power side.stl",
  "3.2 filter housing power side upper less tight.stl",
  "4.2 filter housing power side lower less tight.stl",
  "5 filter housing bottom power base.stl",
  "6 filter housing bottom not power base.stl",
  "7.2 filter housing no power side lower less tight.stl",
  "8.2 filter housing no power side upper less tight.stl",
  "90 filter housing corner no power up.stl",
  "91 filter housing corner guard power up.stl",
  "92 filter housing corner guard power base.stl",
  "93 filter housing corner guard no power base.stl",
]);

const staticCr14x20AssembledPlateAssets = nonEmptyStaticPrintPreviewAssets(
  "static-cr-14x20-base assembled preview",
  staticCr14x20PlateAssets.filter((asset) => staticCr14x20AssembledPlateAssetNames.has(asset.name)),
);

export const staticPrintReferences: Record<StaticPrintReferenceId, StaticPrintReference> = {
  "static-cr-16x20-140": {
    printablesId: "1251061",
    sourceUrl:
      "https://www.printables.com/model/1251061-corsi-rosenthal-air-filter-140mm-pc-fans-16x20x1-f",
    fileSummary: "15 STL parts plus source 3MF and Fusion archive on Printables",
    attribution: "neurocean on Printables",
    usePolicy: {
      type: "redistributable",
      note: "CC-BY files mirrored locally for preview with attribution.",
    },
    previewMaxDimensionMm: 560,
    platePreviewAssets: staticCr16x20Assets,
    previewAssets: staticCr16x20Assets,
  },
  "static-cr-14x20-base": {
    printablesId: "955827",
    sourceUrl: "https://www.printables.com/model/955827-air-filterpurifier-based-on-the-corsi-rosenthal-bo",
    fileSummary: "20 STL parts plus STEP source on Printables",
    attribution: "Safetydave1 on Printables",
    usePolicy: {
      type: "redistributable",
      note: "CC-BY files mirrored locally for preview with attribution.",
    },
    previewMaxDimensionMm: 540,
    assembledPreviewOrientation: "source-fans-up",
    assembledPreview: {
      type: "source-part-set",
      assets: staticCr14x20AssembledPlateAssets,
    },
    printEstimate: {
      method: "geometry-estimate",
      selectedPrintablePartCount: 12,
      solidVolumeCm3: 1612,
      estimatedPlasticVolumeCm3: 802,
      estimatedFilamentKilograms: 1,
      recommendedSpoolCount: 2,
      filamentCostUsdPerKilogram: 23,
      printTimeHours: {
        min: 50,
        max: 65,
      },
      assumptions: {
        infillPercent: 15,
        wallThicknessMm: 1.2,
        material: "PLA or PETG",
        nozzleMm: 0.4,
        layerHeightMm: 0.2,
      },
      note: "Estimated from the 12 selected printable STL parts. Exact weight and time require slicing with the user's printer and material profile.",
    },
    platePreviewAssets: staticCr14x20PlateAssets,
    previewAssets: [staticCr14x20AssembledAsset, ...staticCr14x20PlateAssets],
  },
  "static-modular-20x20-reference": {
    printablesId: "610219",
    sourceUrl: "https://www.printables.com/model/610219-modular-20x20-air-filter",
    fileSummary: "5 source 3MF files on Printables",
    attribution: "Phil Tomlinson on Printables",
    usePolicy: {
      type: "external-only",
      note: "CC-BY-NC-SA reference. We link out instead of bundling it because the product may become commercial.",
    },
    previewMaxDimensionMm: 620,
    platePreviewAssets: [],
    previewAssets: [],
  },
};

export function staticPrintReferenceHasPlatePreview(reference: StaticPrintReference | undefined): boolean {
  return (reference?.platePreviewAssets.length ?? 0) > 0;
}

function nonEmptyStaticPrintPreviewAssets(
  context: string,
  assets: readonly StaticPrintPreviewAsset[],
): NonEmptyStaticPrintPreviewAssets {
  const [first, ...rest] = assets;
  if (first === undefined) {
    throw new Error(`nonEmptyStaticPrintPreviewAssets: ${context} has no assets`);
  }
  return [first, ...rest];
}
