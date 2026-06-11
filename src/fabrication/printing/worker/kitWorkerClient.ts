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

export type KitRequestInput = {
  readonly rawSettings: RawPurifierSettings;
  readonly presetId: PrintVolumePresetId;
};

// Where a channel sends builds: post one request, get onResult called exactly
// once with its result. The shared worker is the normal backend; a synchronous
// on-thread build backs runtimes without Workers, and tests inject fakes.
export type KitBuildPort = {
  post(input: KitRequestInput, onResult: (result: KitBuildResult) => void): void;
};

// #######################################
// Shared Worker Port
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
    sharedWorker.onerror = (event) => {
      failAllPendingRequests(`kit worker crashed: ${event.message !== "" ? event.message : "unknown error"}`);
    };
    sharedWorker.onmessageerror = () => {
      failAllPendingRequests("kit worker response could not be deserialized");
    };
  }
  return sharedWorker;
}

// A worker-level error carries no requestId to route by, so it fails every
// pending request through its registered handler — the channels' applyResult,
// which settles their callers and returns them to idle. The dead worker is
// discarded; whatever posts next (a queued successor included) spawns a fresh
// one, which is the retry path.
function failAllPendingRequests(message: string): void {
  sharedWorker?.terminate();
  sharedWorker = null;
  const pendingHandlers = [...resultHandlerByRequestId.values()];
  resultHandlerByRequestId.clear();
  for (const handleResult of pendingHandlers) {
    handleResult({ type: "failed", message });
  }
}

const sharedWorkerPort: KitBuildPort = {
  post(input, onResult) {
    const requestId = nextRequestId;
    nextRequestId += 1;
    resultHandlerByRequestId.set(requestId, onResult);
    const message: KitWorkerRequest = { requestId, rawSettings: input.rawSettings, presetId: input.presetId };
    kitWorker().postMessage(message);
  },
};

// Graceful degradation when Workers are unavailable (SSR, bare test runtimes):
// the same sync core runs on the calling thread, whose Manifold kernel the app
// initializes at bootstrap. It is a port like any other, so the channel state
// machine stays the single code path for supersede/queue semantics.
const syncOnThreadPort: KitBuildPort = {
  post(input, onResult) {
    onResult(buildKitResult(input.rawSettings, input.presetId));
  },
};

function defaultKitBuildPort(): KitBuildPort {
  return typeof Worker === "undefined" ? syncOnThreadPort : sharedWorkerPort;
}

// #######################################
// Latest-Wins Channel
// #######################################

type SettleOutcome = (outcome: KitRequestOutcome) => void;

type QueuedRequest = {
  readonly input: KitRequestInput;
  readonly settle: SettleOutcome;
};

// The request the port is currently building. A superseded one already settled
// its caller; its slot remains so the eventual result can be dropped and used
// as the signal that the port is free for the queued successor.
type InFlightRequest =
  | { readonly type: "live"; readonly settle: SettleOutcome }
  | { readonly type: "superseded" };

// idle: nothing sent. busy: one request at the port plus at most one queued
// behind it — new requests replace the queued slot (latest wins), so a burst of
// edits costs at most the build in progress and one more.
type ChannelState =
  | { readonly type: "idle" }
  | { readonly type: "busy"; readonly inFlight: InFlightRequest; readonly queued: QueuedRequest | null };

export function createPrintKitChannel(port: KitBuildPort = defaultKitBuildPort()): PrintKitChannel {
  let state: ChannelState = { type: "idle" };

  function post(input: KitRequestInput, settle: SettleOutcome): void {
    state = { type: "busy", inFlight: { type: "live", settle }, queued: null };
    port.post(input, applyResult);
  }

  // Runs once per in-flight request when its result arrives: settle a live
  // caller (a superseded one was settled at supersede time, so its result is
  // dropped here), then start the queued successor if one is waiting. The
  // channel keeps at most one request at the port, so the result always
  // belongs to the current in-flight slot.
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
        inFlight: { type: "superseded" },
        queued: { input, settle: resolve },
      };
    });
  }

  return {
    request: (rawSettings, presetId) => request({ rawSettings, presetId }),
  };
}
