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

// boxes.py defaults. FingerJointSettings: finger=2, space=2, play=0, width=1,
// edge_width=1 (holeOffsetMultiplier maps to FingerJoint_edge_width; cut geometry
// adds the +thickness/2 itself). DoveTailSettings as the AirPurifier generator
// overrides them: size=2, depth=1, angle=50 (radius keeps its 0.2 default).
export const defaultCutJointSettings: CutJointSettings = {
  finger: {
    widthMultiplier: 2,
    spaceMultiplier: 2,
    playMultiplier: 0,
    holeWidthMultiplier: 1,
    holeOffsetMultiplier: 1,
  },
  dovetail: {
    sizeMultiplier: 2,
    depthMultiplier: 1,
    taper: 50,
  },
};
