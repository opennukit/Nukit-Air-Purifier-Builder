// #######################################
// Laser Output Settings
// #######################################

export type ReferenceScale =
  | {
      type: "disabled";
    }
  | {
      type: "enabled";
      length: number;
    };

// #######################################
// Joint Settings
// #######################################

export type FingerJointSettings = {
  widthMultiplier: number;
  spaceMultiplier: number;
  playMultiplier: number;
  holeWidthMultiplier: number;
  holeOffsetMultiplier: number;
};

export type DovetailJointSettings = {
  sizeMultiplier: number;
  depthMultiplier: number;
  taper: number;
};

export type CutJointSettings = {
  finger: FingerJointSettings;
  dovetail: DovetailJointSettings;
};

export const defaultCutJointSettings: CutJointSettings = {
  finger: {
    widthMultiplier: 2,
    spaceMultiplier: 2,
    playMultiplier: 0,
    holeWidthMultiplier: 1,
    holeOffsetMultiplier: 1.5,
  },
  dovetail: {
    sizeMultiplier: 2,
    depthMultiplier: 1,
    taper: 50,
  },
};
