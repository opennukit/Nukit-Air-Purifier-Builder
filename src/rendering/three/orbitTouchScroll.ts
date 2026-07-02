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
  if (canvas instanceof HTMLElement) {
    showHintOnSingleFingerOrbitAttempt(canvas);
  }
}

// A deliberate sideways one-finger drag is an orbit attempt, not a scroll:
// vertical drags scroll the page (so the finger visibly did something), but a
// horizontal drag does nothing at all and reads as broken. Surface the
// two-finger gesture instead of leaving the user guessing.
const orbitAttemptMinimumDragPx = 16;
const hintVisibleMs = 2200;

function showHintOnSingleFingerOrbitAttempt(canvas: HTMLElement): void {
  const host = canvas.parentElement;
  if (host === null) {
    return;
  }
  const hint = document.createElement("div");
  hint.className = "touch-orbit-hint";
  hint.textContent = "Use two fingers to rotate and zoom";
  hint.setAttribute("aria-hidden", "true");
  host.append(hint);

  let hideTimer = 0;
  let start: { x: number; y: number } | null = null;

  canvas.addEventListener(
    "touchstart",
    (event) => {
      start = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
    },
    { passive: true },
  );
  canvas.addEventListener(
    "touchmove",
    (event) => {
      if (start === null || event.touches.length !== 1) {
        // A second finger landed: the user found the gesture — stop hinting.
        start = null;
        hint.classList.remove("touch-orbit-hint-visible");
        return;
      }
      const dx = event.touches[0].clientX - start.x;
      const dy = event.touches[0].clientY - start.y;
      if (Math.abs(dx) < orbitAttemptMinimumDragPx || Math.abs(dx) <= Math.abs(dy)) {
        return;
      }
      hint.classList.add("touch-orbit-hint-visible");
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => hint.classList.remove("touch-orbit-hint-visible"), hintVisibleMs);
    },
    { passive: true },
  );
}
