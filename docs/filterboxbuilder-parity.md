# FilterBoxBuilder Parity

This project is not trying to clone every upstream control as a flat form. The goal is useful parity: import old shared URLs, keep the fabrication knobs that affect real output, and put rarely used tuning behind an Advanced tab.

## Kept As First-Path Controls

- Print design selection for generated Nukit, generated printable variants, and curated static references.
- Measured rectangular filter dimensions (no stock-size presets; users measure their actual filter).
- Fan size (120/140/custom diameter) and a visual fan color; no fan product presets or purchase links.
- Filter count and wall fan-bank counts for the generated Nukit box.
- Material thickness, screw-hole diameter, rim, kerf/fit allowance, labels, and reference scale.
- Preview controls that do not change fabrication geometry, such as media/fan visibility, dimensions, banana scale, labels, rotation, and camera preset.

## Kept Behind Advanced

Advanced joint tuning remains useful when a builder is matching a specific sheet material, laser kerf, printer, glue gap, or slot tolerance.

- `fingerWidthMultiplier`
- `fingerSpaceMultiplier`
- `fingerPlayMultiplier`
- `fingerHoleWidthMultiplier`
- `fingerHoleOffsetMultiplier`
- `dovetailSizeMultiplier`
- `dovetailDepthMultiplier`
- `dovetailTaper`

Defaults reproduce the existing generated geometry. Changing these settings intentionally changes slot counts, slot width/offset, and dovetail profiles.

## Legacy URL Import

The decoder accepts canonical app parameters and useful FilterBoxBuilder aliases:

- `x`, `y`, `filter_height`
- `fan_diameter`
- `split_frames`
- `fans_left`, `fans_right`, `fans_top`, `fans_bottom`
- `thickness`, `burn`, `screw_holes`, `reference`
- `FingerJoint_finger`, `FingerJoint_space`, `FingerJoint_play`, `FingerJoint_width`, `FingerJoint_edge_width`
- `DoveTail_size`, `DoveTail_depth`, `DoveTail_angle`

When a URL is re-shared, the app emits canonical parameter names only.

## Removed Or Intentionally Hidden

The app does not expose every low-level upstream option on the main path. That is deliberate:

- Fixed static Printables references are not made parametric. Their source dimensions, licenses, and files stay authoritative.
- Advanced joint settings are hidden for static references because those files are not generated from the current geometry model.
- Historical workflow tabs such as `fit`, `cutting`, `fabrication`, and `export` are migrated to the current tab model instead of kept as separate UX concepts.
- Controls that duplicate measured inputs without changing generated output were removed; source/license metadata stays on curated static references only.

The story for users is: start with the safe generated path, open Advanced only when material/cutter/printer tolerances require it, and treat fixed external models as fixed source references.
