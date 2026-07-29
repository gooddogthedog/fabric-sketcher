// @ts-expect-error -- Vitest executes under Node; the app build intentionally
// omits Node types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PROJECT_DIRECTORY = (
  globalThis as typeof globalThis & {
    process: { cwd(): string };
  }
).process.cwd();

const ASSETS = [
  {
    fileName: "neutral-figure-front-v1.svg",
    dressForm: false,
  },
  {
    fileName: "dress-form-front-v1.svg",
    dressForm: true,
  },
] as const;

describe("foundation SVG assets", () => {
  for (const asset of ASSETS) {
    it(`${asset.fileName} exposes clean semantic vector landmarks`, () => {
      const source = readFileSync(
        `${PROJECT_DIRECTORY}/public/foundations/${asset.fileName}`,
        "utf8",
      );
      const svg = new DOMParser().parseFromString(
        source,
        "image/svg+xml",
      ).documentElement;

      expect(svg.nodeName).toBe("svg");
      expect(svg.getAttribute("viewBox")).toBe("0 0 2480 3508");
      expect(svg.querySelector("parsererror")).toBeNull();
      expect(svg.querySelector("image, script, style")).toBeNull();
      expect(svg.querySelector("[href^='http'], [href^='//']")).toBeNull();
      for (const id of [
        "foundation-outline",
        "foundation-center",
        "foundation-levels",
        "foundation-construction",
      ]) {
        expect(svg.querySelector(`symbol#${id}`)).not.toBeNull();
      }
      for (const id of [
        "landmark-body-contour",
        "landmark-center-front",
        "landmark-shoulder",
        "landmark-bust",
        "landmark-waist",
        "landmark-hip",
        "landmark-armhole",
      ]) {
        expect(svg.querySelector(`#${id}`)).not.toBeNull();
      }
      expect(
        svg.querySelectorAll("path, line, polyline, ellipse").length,
      ).toBeGreaterThan(12);

      if (asset.dressForm) {
        expect(svg.querySelector("#landmark-princess-line")).not.toBeNull();
        expect(svg.querySelector("#landmark-side-seam")).not.toBeNull();
      }
    });
  }
});
