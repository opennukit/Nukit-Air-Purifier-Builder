export type ReferenceScale =
  | {
      type: "disabled";
    }
  | {
      type: "enabled";
      length: number;
    };
