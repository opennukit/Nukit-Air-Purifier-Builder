// On touch screens, a full-width preview canvas near the top of a long page
// would otherwise capture every vertical drag and trap page scrolling.

import { TOUCH } from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// On coarse-pointer devices, a single finger scrolls the page past the canvas
// and two fingers orbit/zoom the model. Mouse and trackpad behavior is
// unchanged. OrbitControls sets touch-action "none" on the canvas when it
// connects, so this must run after construction.
export function reserveSingleFingerForPageScroll(controls: OrbitControls): void {
  const canvas = controls.domElement;
  if (canvas === null || !window.matchMedia("(pointer: coarse)").matches) {
    return;
  }
  controls.touches = { ONE: null, TWO: TOUCH.DOLLY_ROTATE };
  canvas.style.touchAction = "pan-y";
}
