// Web Worker entry that builds print design kits off the main thread. It is a
// thin shell: kernel init once, then the same sync build core the tests cover
// (buildKitResult), one request per message.

import manifoldWasmUrl from "manifold-3d/manifold.wasm?url";
import { initManifoldKernel } from "@/fabrication/printing/modeling/manifoldKernel";
import { buildKitResult, type KitBuildResult } from "@/fabrication/printing/worker/kitBuild";
import {
  packKitBuildResult,
  type KitWorkerRequest,
  type KitWorkerResponse,
} from "@/fabrication/printing/worker/kitWorkerProtocol";

// The worker global, typed to exactly the surface this entry uses. The project
// compiles against the DOM lib, which types `self` as Window and lacks the
// worker's postMessage-with-transfer-list; this module-scoped declaration
// narrows it without pulling in the conflicting WebWorker lib.
type KitWorkerScope = {
  onmessage: ((event: MessageEvent<KitWorkerRequest>) => void) | null;
  postMessage(message: KitWorkerResponse, transfer: readonly ArrayBuffer[]): void;
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
// to completion before the next starts. The kit's meshes leave packed as typed
// arrays whose buffers ride the transfer list, so the main thread receives
// them without a per-vertex structured clone.
async function respond(request: KitWorkerRequest): Promise<void> {
  const buildResult = await buildAfterKernelReady(request);
  // Packing allocates one typed array per mesh; on a huge kit that can throw
  // (out of memory), and an exception escaping here would die as an unhandled
  // rejection the parent's onerror never sees, wedging the channel. Convert it
  // into an ordinary failed response instead.
  try {
    const { result, transfer } = packKitBuildResult(buildResult);
    const response: KitWorkerResponse = {
      requestId: request.requestId,
      result,
    };
    self.postMessage(response, transfer);
  } catch (error) {
    const response: KitWorkerResponse = {
      requestId: request.requestId,
      result: {
        type: "failed",
        message: `kitWorker: failed to pack or post the kit result: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
    self.postMessage(response, []);
  }
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
