import { describe, expect, test } from "bun:test";
import { serializePurifierDraft } from "@/domain/purifier/airPurifier";
import { decodePurifierDraftSettings } from "@/domain/purifier/settingsCodec";
import type { RawPurifierSettings } from "@/domain/purifier/settingsModel";
import type { KitBuildResult } from "@/fabrication/printing/worker/kitBuild";
import {
  createDedupingPort,
  createPrintKitChannel,
  type KitBuildPort,
  type KitRequestInput,
} from "@/fabrication/printing/worker/kitWorkerClient";

const settings: RawPurifierSettings = serializePurifierDraft(decodePurifierDraftSettings(""));

type PostedRequest = {
  readonly input: KitRequestInput;
  readonly respond: (result: KitBuildResult) => void;
};

// A port the test drives by hand: posts pile up until the test responds.
function createManualPort(): { port: KitBuildPort; posted: PostedRequest[] } {
  const posted: PostedRequest[] = [];
  return {
    posted,
    port: { post: (input, onResult) => posted.push({ input, respond: onResult }) },
  };
}

// Builds need a live Manifold kernel, so the manual port answers every request
// with a failure; distinct messages identify which build settled which caller.
function buildFailure(message: string): KitBuildResult {
  return { type: "failed", message };
}

describe("createPrintKitChannel", () => {
  test("a lone request settles with its build result and returns the channel to idle", async () => {
    const { port, posted } = createManualPort();
    const channel = createPrintKitChannel(port);

    const first = channel.request(settings, "bed-220");
    expect(posted.length).toBe(1);
    posted[0].respond(buildFailure("first"));
    expect(await first).toEqual({ type: "failed", message: "first" });

    const second = channel.request(settings, "bed-220");
    expect(posted.length).toBe(2);
    posted[1].respond(buildFailure("second"));
    expect(await second).toEqual({ type: "failed", message: "second" });
  });

  test("a newer request supersedes the in-flight one and queues until the port frees up", async () => {
    const { port, posted } = createManualPort();
    const channel = createPrintKitChannel(port);

    const first = channel.request(settings, "bed-220");
    const second = channel.request(settings, "bed-180");
    expect(await first).toEqual({ type: "superseded" });
    expect(posted.length).toBe(1);

    posted[0].respond(buildFailure("stale"));
    expect(posted.length).toBe(2);
    expect(posted[1].input.presetId).toBe("bed-180");

    posted[1].respond(buildFailure("fresh"));
    expect(await second).toEqual({ type: "failed", message: "fresh" });
  });

  test("a burst of requests settles every superseded caller and builds only the newest", async () => {
    const { port, posted } = createManualPort();
    const channel = createPrintKitChannel(port);

    const first = channel.request(settings, "bed-220");
    const second = channel.request(settings, "bed-180");
    const third = channel.request(settings, "bed-300");
    expect(await first).toEqual({ type: "superseded" });
    expect(await second).toEqual({ type: "superseded" });

    posted[0].respond(buildFailure("stale"));
    expect(posted.length).toBe(2);
    expect(posted[1].input.presetId).toBe("bed-300");

    posted[1].respond(buildFailure("newest"));
    expect(await third).toEqual({ type: "failed", message: "newest" });
  });

  test("a result for a superseded in-flight request is dropped, not delivered to the queued caller", async () => {
    const { port, posted } = createManualPort();
    const channel = createPrintKitChannel(port);

    void channel.request(settings, "bed-220");
    const queued = channel.request(settings, "bed-180");

    posted[0].respond(buildFailure("stale"));
    posted[1].respond(buildFailure("fresh"));
    expect(await queued).toEqual({ type: "failed", message: "fresh" });
  });

  test("geometry-identical requests from different channels share one underlying build", async () => {
    const { port, posted } = createManualPort();
    const dedupingPort = createDedupingPort(port);
    const sheetChannel = createPrintKitChannel(dedupingPort);
    const assembledChannel = createPrintKitChannel(dedupingPort);

    // Preview-only differences must not defeat the dedupe.
    const sheetRequest = sheetChannel.request(settings, "bed-220");
    const assembledRequest = assembledChannel.request({ ...settings, showFans: !settings.showFans }, "bed-220");
    expect(posted.length).toBe(1);

    posted[0].respond(buildFailure("shared"));
    expect(await sheetRequest).toEqual({ type: "failed", message: "shared" });
    expect(await assembledRequest).toEqual({ type: "failed", message: "shared" });

    // The build settled, so the next identical request starts fresh.
    const retry = sheetChannel.request(settings, "bed-220");
    expect(posted.length).toBe(2);
    posted[1].respond(buildFailure("fresh"));
    expect(await retry).toEqual({ type: "failed", message: "fresh" });
  });

  test("geometry-distinct requests do not share builds", () => {
    const { port, posted } = createManualPort();
    const dedupingPort = createDedupingPort(port);
    const first = createPrintKitChannel(dedupingPort);
    const second = createPrintKitChannel(dedupingPort);

    void first.request(settings, "bed-220");
    void second.request(settings, "bed-180");
    expect(posted.length).toBe(2);
  });

  // Mirrors failAllPendingRequests after a worker crash: every request the
  // port is holding fails in one batch with the same message, and whatever a
  // channel reposts goes to a fresh backend (here: back into the same manual
  // port) — the retry path.
  test("a worker-level failure settles every pending channel and reposts queued successors", async () => {
    const { port, posted } = createManualPort();
    const dedupingPort = createDedupingPort(port);
    const sheetChannel = createPrintKitChannel(dedupingPort);
    const assembledChannel = createPrintKitChannel(dedupingPort);

    const staleSheetRequest = sheetChannel.request(settings, "bed-220");
    const queuedSheetRequest = sheetChannel.request(settings, "bed-180");
    const assembledRequest = assembledChannel.request(settings, "bed-300");
    expect(await staleSheetRequest).toEqual({ type: "superseded" });
    expect(posted.length).toBe(2);

    // The crash: fail everything pending in one batch. Reposts triggered by
    // the failures land back in `posted` after the splice.
    for (const pending of posted.splice(0)) {
      pending.respond(buildFailure("kit worker crashed: boom"));
    }

    expect(await assembledRequest).toEqual({ type: "failed", message: "kit worker crashed: boom" });

    // The sheet channel's superseded in-flight request dropped its failure and
    // freed the port for the queued successor, which retries on the fresh
    // backend instead of failing.
    expect(posted.length).toBe(1);
    expect(posted[0].input.presetId).toBe("bed-180");
    posted[0].respond(buildFailure("fresh"));
    expect(await queuedSheetRequest).toEqual({ type: "failed", message: "fresh" });

    // Both channels are idle again and accept new work.
    void sheetChannel.request(settings, "bed-220");
    void assembledChannel.request(settings, "bed-300");
    expect(posted.length).toBe(3);
  });

  test("a synchronous port settles the caller within the same request", async () => {
    const syncPort: KitBuildPort = {
      post: (_input, onResult) => onResult(buildFailure("sync")),
    };
    const channel = createPrintKitChannel(syncPort);
    expect(await channel.request(settings, "bed-220")).toEqual({ type: "failed", message: "sync" });
    expect(await channel.request(settings, "bed-220")).toEqual({ type: "failed", message: "sync" });
  });
});
