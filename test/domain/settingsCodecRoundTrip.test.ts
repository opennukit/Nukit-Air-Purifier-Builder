import { describe, expect, test } from "bun:test";
import { decodeSettings, encodeSettings } from "@/domain/purifier/settingsCodec";

const get = (query: string, key: string) => new URLSearchParams(encodeSettings(decodeSettings(query))).get(key);

describe("settings URL round-trip for room and cost fields", () => {
  test("room size and baseline ACH survive encode then decode", () => {
    const decoded = decodeSettings("roomWidth=3.5&roomLength=4.25&roomHeight=2.4&baselineAch=0.7");
    const again = decodeSettings(encodeSettings(decoded));
    expect(again.roomWidth).toBe(3.5);
    expect(again.roomLength).toBe(4.25);
    expect(again.roomHeight).toBe(2.4);
    expect(again.baselineAch).toBe(0.7);
  });

  test("the four fields are actually written to the encoded URL", () => {
    expect(get("roomWidth=3.5", "roomWidth")).toBe("3.5");
    expect(get("roomLength=4.25", "roomLength")).toBe("4.25");
    expect(get("roomHeight=2.4", "roomHeight")).toBe("2.4");
    expect(get("baselineAch=0.7", "baselineAch")).toBe("0.7");
  });

  test("finer-than-two-decimal values round-trip without drifting", () => {
    // The default electricity price 0.1765 was truncated to 0.18 under 2-decimal
    // encoding; 4-decimal encoding preserves it.
    const again = decodeSettings(encodeSettings(decodeSettings("electricityPrice=0.1765")));
    expect(again.electricityPrice).toBe(0.1765);
    expect(get("electricityPrice=0.1765", "electricityPrice")).toBe("0.1765");
  });
});
