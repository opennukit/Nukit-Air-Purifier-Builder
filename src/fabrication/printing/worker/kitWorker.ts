// Web Worker entry that builds print design kits off the main thread. It is a
// thin shell: kernel init once, then the same sync build core the tests cover
// (buildKitResult), one request per message.

import manifoldWasmUrl from "manifold-3d/manifold.wasm?url";
import { initManifoldKernel } from "@/fabrication/printing/modeling/manifoldKernel";
import { buildKitResult, type KitBuildResult } from "@/fabrication/printing/worker/kitBuild";
import type { KitWorkerRequest, KitWorkerResponse } from "@/fabrication/printing/worker/kitWorkerProtocol";

// The worker global, typed to exactly the surface this entry uses. The project
// compiles against the DOM lib, which types `self` as Window and lacks the
// worker's one-argument postMessage; this module-scoped declaration narrows it
// without pulling in the conflicting WebWorker lib.
type KitWorkerScope = {
  onmessage: ((event: MessageEvent<KitWorkerRequest>) => void) | null;
  postMessage(message: KitWorkerResponse): void;
};
declare const self: KitWorkerScope;

// This worker thread owns its own Manifold WASM instance — the main thread's
// kernel lives in a different heap and is invisible here.
const kernelReady = initManifoldKernel(() => manifoldWasmUrl);

self.onmessage = (event: MessageEvent<KitWorkerRequest>) => {
  void respond(event.data);
};

// Requests are answered in arrival order: every handler awaits the same kernel
// promise, so their continuations queue FIFO and each build runs synchronously
// to completion before the next starts.
async function respond(request: KitWorkerRequest): Promise<void> {
  const response: KitWorkerResponse = {
    requestId: request.requestId,
    result: await buildAfterKernelReady(request),
  };
  self.postMessage(response);
}

async function buildAfterKernelReady(request: KitWorkerRequest): Promise<KitBuildResult> {
  try {
    await kernelReady;
  } catch (error) {
    return {
      type: "failed",
      message: `kitWorker: Manifold kernel failed to initialize: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return buildKitResult(request.rawSettings, request.presetId);
}
