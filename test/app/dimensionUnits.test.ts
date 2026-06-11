import { describe, expect, test } from "bun:test";
import {
  dimensionInputStep,
  displayValueToMillimeters,
  millimetersToDisplayValue,
} from "@/app/controls/dimensionUnits";

describe("Dimension display units", () => {
  test("renders millimeter values unchanged in mm mode", () => {
    expect(millimetersToDisplayValue(622.3, "mm")).toBe(622.3);
    expect(displayValueToMillimeters(622.3, "mm")).toBe(622.3);
  });

  test("rounds inch display values to two decimals", () => {
    expect(millimetersToDisplayValue(622.3, "in")).toBe(24.5);
    expect(millimetersToDisplayValue(44.45, "in")).toBe(1.75);
  });

  test("stores typed inch values as millimeters", () => {
    expect(displayValueToMillimeters(2, "in")).toBe(50.8);
    expect(displayValueToMillimeters(24.5, "in")).toBe(622.3);
  });

  test("switches the input step with the unit", () => {
    expect(dimensionInputStep("1", "mm")).toBe("1");
    expect(dimensionInputStep("1", "in")).toBe("0.01");
  });
});
