import { describe, expect, test } from "bun:test";
import { printBedFitForDimensions } from "@/fabrication/printing/printableKit";

describe("print bed fit modeling", () => {
  test("keeps the oversized axes instead of collapsing the result to false", () => {
    expect(
      printBedFitForDimensions(
        {
          width: 230,
          depth: 210,
          height: 260,
        },
        {
          type: "bounded",
          width: 220,
          depth: 220,
          height: 250,
        },
      ),
    ).toEqual({
      type: "oversized",
      oversizedAxes: [
        {
          axis: "width",
          required: 230,
          available: 220,
        },
        {
          axis: "height",
          required: 260,
          available: 250,
        },
      ],
    });
  });

  test("treats tiny floating point overage as fitting", () => {
    expect(
      printBedFitForDimensions(
        {
          width: 220.0005,
          depth: 220,
          height: 250,
        },
        {
          type: "bounded",
          width: 220,
          depth: 220,
          height: 250,
        },
      ),
    ).toEqual({ type: "fits" });
  });

  test("treats unbounded beds as fitting any footprint", () => {
    expect(
      printBedFitForDimensions(
        {
          width: 1000,
          depth: 1000,
          height: 1000,
        },
        {
          type: "unbounded",
        },
      ),
    ).toEqual({ type: "fits" });
  });
});
