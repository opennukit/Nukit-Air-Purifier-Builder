export const staticPrintReferenceIds = [
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

export type StaticPrintReferenceLocalAvailability =
  | {
      readonly type: "available";
    }
  | {
      readonly type: "unavailable";
      readonly note: string;
    };

export type StaticPrintReferenceCapabilities = {
  readonly localPrintPlatePreview: StaticPrintReferenceLocalAvailability;
  readonly localAssembledPreview: StaticPrintReferenceLocalAvailability;
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

export type StaticPrintSourceBedSide =
  | "source-min-x"
  | "source-max-x"
  | "source-min-y"
  | "source-max-y"
  | "source-min-z"
  | "source-max-z";

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
  readonly capabilities: StaticPrintReferenceCapabilities;
  readonly previewMaxDimensionMm: number;
  readonly assembledPreviewOrientation?: "source" | "source-side-fans" | "source-fans-up" | "fan-panel-up";
  readonly assembledPreview?: StaticPrintAssembledPreview;
  readonly printEstimate?: StaticPrintEstimate;
  readonly platePreviewAssets: readonly StaticPrintPreviewAsset[];
  readonly previewAssets: readonly StaticPrintPreviewAsset[];
};

export const staticPrintReferences: Record<StaticPrintReferenceId, StaticPrintReference> = {
  "static-modular-20x20-reference": {
    printablesId: "610219",
    sourceUrl: "https://www.printables.com/model/610219-modular-20x20-air-filter",
    fileSummary: "5 source 3MF files on Printables",
    attribution: "Phil Tomlinson on Printables",
    usePolicy: {
      type: "external-only",
      note: "CC-BY-NC-SA reference. We link out instead of bundling it because the product may become commercial.",
    },
    capabilities: {
      localPrintPlatePreview: {
        type: "unavailable",
        note: "Files are not mirrored locally.",
      },
      localAssembledPreview: {
        type: "unavailable",
        note: "Files are not mirrored locally.",
      },
    },
    previewMaxDimensionMm: 620,
    platePreviewAssets: [],
    previewAssets: [],
  },
};

export function staticPrintReferenceHasPlatePreview(reference: StaticPrintReference | undefined): boolean {
  return reference?.capabilities.localPrintPlatePreview.type === "available" && reference.platePreviewAssets.length > 0;
}

export function staticPrintReferenceHasAssembledPreview(reference: StaticPrintReference | undefined): boolean {
  return reference?.capabilities.localAssembledPreview.type === "available" && reference.assembledPreview !== undefined;
}
