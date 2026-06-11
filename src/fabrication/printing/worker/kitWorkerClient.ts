// Client side of the kit worker: latest-wins request channels over one shared,
// lazily spawned worker. Each consumer (print-sheet plan, assembled tempest
// preview) owns its own channel, so their requests supersede within a channel
// but never across channels.

import type { RawPurifierSettings } from "@/domain/purifier/settingsModel";
import type { PrintableKit, PrintVolumePresetId } from "@/fabrication/printing/printableKit";
import { buildKitResult, type KitBuildResult } from "@/fabrication/printing/worker/kitBuild";
import type { KitWorkerRequest, KitWorkerResponse } from "@/fabrication/printing/worker/kitWorkerProtocol";

// How a kit request ends for its caller. "superseded" means a newer request on
// the same channel replaced it before its result landed; the caller simply
// ignores it (the newer request carries the answer).
export type KitRequestOutcome =
  | { readonly type: "built"; readonly kit: PrintableKit }
  | { readonly type: "failed"; readonly message: string }
  | { readonly type: "superseded" };

export type PrintKitChannel = {
  request(rawSettings: RawPurifierSettings, presetId: PrintVolumePresetId): Promise<KitRequestOutcome>;
};

// #######################################
// Shared Worker
// #######################################

let sharedWorker: Worker | null = null;
let nextRequestId = 1;
const resultHandlerByRequestId = new Map<number, (result: KitBuildResult) => void>();

function kitWorker(): Worker {
  if (sharedWorker === null) {
    sharedWorker = new Worker(new URL("./kitWorker.ts", import.meta.url), { type: "module" });
    sharedWorker.onmessage = (event: MessageEvent<KitWorkerResponse>) => {
      const handleResult = resultHandlerByRequestId.get(event.data.requestId);
      if (handleResult === undefined) {
        return;
      }
      resultHandlerByRequestId.delete(event.data.requestId);
      handleResult(event.data.result);
    };
  }
  return sharedWorker;
}

// #######################################
// Latest-Wins Channel
// #######################################

type SettleOutcome = (outcome: KitRequestOutcome) => void;

type KitRequestInput = {
  readonly rawSettings: RawPurifierSettings;
  readonly presetId: PrintVolumePresetId;
};

type QueuedRequest = {
  readonly input: KitRequestInput;
  readonly settle: SettleOutcome;
};

// The request the worker is currently building. A superseded one already
// settled its caller; the id remains so the response can be matched, dropped,
// and used as the signal that the worker is free for the queued successor.
type InFlightRequest =
  | { readonly type: "live"; readonly requestId: number; readonly settle: SettleOutcome }
  | { readonly type: "superseded"; readonly requestId: number };

// idle: nothing sent. busy: one request in the worker plus at most one queued
// behind it — new requests replace the queued slot (latest wins), so a burst of
// edits costs at most the build in progress and one more.
type ChannelState =
  | { readonly type: "idle" }
  | { readonly type: "busy"; readonly inFlight: InFlightRequest; readonly queued: QueuedRequest | null };

export function createPrintKitChannel(): PrintKitChannel {
  let state: ChannelState = { type: "idle" };

  function post(input: KitRequestInput, settle: SettleOutcome): void {
    const requestId = nextRequestId;
    nextRequestId += 1;
    resultHandlerByRequestId.set(requestId, applyResult);
    state = { type: "busy", inFlight: { type: "live", requestId, settle }, queued: null };
    const message: KitWorkerRequest = { requestId, rawSettings: input.rawSettings, presetId: input.presetId };
    kitWorker().postMessage(message);
  }

  // Runs once per in-flight request when its response arrives: settle a live
  // caller (a superseded one was settled at supersede time, so its result is
  // dropped here), then start the queued successor if one is waiting.
  function applyResult(result: KitBuildResult): void {
    if (state.type !== "busy") {
      return;
    }
    const { inFlight, queued } = state;
    if (inFlight.type === "live") {
      inFlight.settle(result);
    }
    if (queued === null) {
      state = { type: "idle" };
      return;
    }
    post(queued.input, queued.settle);
  }

  function request(input: KitRequestInput): Promise<KitRequestOutcome> {
    // Graceful degradation when Workers are unavailable (tests, SSR): the same
    // sync core runs on the calling thread, whose Manifold kernel the app
    // initializes at bootstrap.
    if (typeof Worker === "undefined") {
      return Promise.resolve(buildKitResult(input.rawSettings, input.presetId));
    }
    return new Promise((resolve) => {
      if (state.type === "idle") {
        post(input, resolve);
        return;
      }
      const { inFlight, queued } = state;
      if (queued !== null) {
        queued.settle({ type: "superseded" });
      }
      if (inFlight.type === "live") {
        inFlight.settle({ type: "superseded" });
      }
      state = {
        type: "busy",
        inFlight: { type: "superseded", requestId: inFlight.requestId },
        queued: { input, settle: resolve },
      };
    });
  }

  return {
    request: (rawSettings, presetId) => request({ rawSettings, presetId }),
  };
}
