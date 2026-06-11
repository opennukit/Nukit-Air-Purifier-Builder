import { describe, expect, test } from "bun:test";
import { serializePurifierDraft } from "@/domain/purifier/airPurifier";
import { decodePurifierDraftSettings } from "@/domain/purifier/settingsCodec";
import type { RawPurifierSettings } from "@/domain/purifier/settingsModel";
import type { KitBuildResult } from "@/fabrication/printing/worker/kitBuild";
import {
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

  test("a synchronous port settles the caller within the same request", async () => {
    const syncPort: KitBuildPort = {
      post: (_input, onResult) => onResult(buildFailure("sync")),
    };
    const channel = createPrintKitChannel(syncPort);
    expect(await channel.request(settings, "bed-220")).toEqual({ type: "failed", message: "sync" });
    expect(await channel.request(settings, "bed-220")).toEqual({ type: "failed", message: "sync" });
  });
});
