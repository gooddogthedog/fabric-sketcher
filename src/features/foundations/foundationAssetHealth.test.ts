import { describe, expect, it, vi } from "vitest";
import { verifyBundledFoundationAsset } from "./foundationAssetHealth";
import { getFoundationAssets } from "./foundationCatalog";
import type { FoundationAsset } from "./types";

const asset = getFoundationAssets()[0];

function response(
  body: string,
  options: Readonly<{ ok?: boolean; url?: string }> = {},
): Response {
  return {
    ok: options.ok ?? true,
    url:
      options.url ??
      "http://localhost:3000/foundations/neutral-figure-front-v1.svg",
    text: async () => body,
  } as Response;
}

function validSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg">
    <symbol id="foundation-outline" />
    <symbol id="foundation-center" />
    <symbol id="foundation-levels" />
    <symbol id="foundation-construction" />
  </svg>`;
}

describe("bundled Foundation asset health", () => {
  it.each([
    ["missing response", response("", { ok: false })],
    ["corrupt SVG", response("<html>not an svg</html>")],
    [
      "incomplete semantic SVG",
      response(
        `<svg xmlns="http://www.w3.org/2000/svg"><symbol id="foundation-outline" /></svg>`,
      ),
    ],
  ])("rejects a %s for a catalog asset", async (_case, failedResponse) => {
    const fetcher = vi.fn<typeof fetch>(async () => failedResponse);

    await expect(
      verifyBundledFoundationAsset(asset, { fetcher }),
    ).resolves.toBe(false);
  });

  it("accepts the complete same-origin bundled SVG", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response(validSvg()));

    await expect(
      verifyBundledFoundationAsset(asset, { fetcher }),
    ).resolves.toBe(true);
  });

  it("never requests a remote asset URL", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const remoteAsset: FoundationAsset = {
      ...asset,
      sourceUrl: "https://example.com/foundation.svg",
    };

    await expect(
      verifyBundledFoundationAsset(remoteAsset, { fetcher }),
    ).resolves.toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
