import type { FoundationAsset } from "./types";

export type FoundationAssetHealth = Readonly<{
  assetId: string;
  assetVersion: number;
  status: "available" | "unavailable";
}>;

export type FoundationAssetVerificationOptions = Readonly<{
  fetcher?: typeof fetch;
  reload?: boolean;
  signal?: AbortSignal;
}>;

export async function verifyBundledFoundationAsset(
  asset: FoundationAsset,
  options: FoundationAssetVerificationOptions = {},
): Promise<boolean> {
  const location = globalThis.location;
  if (!location) {
    return false;
  }

  const source = new URL(asset.sourceUrl, location.href);
  if (
    source.origin !== location.origin ||
    !source.pathname.startsWith("/foundations/")
  ) {
    return false;
  }

  const fetcher = options.fetcher ?? globalThis.fetch;
  if (!fetcher) {
    return false;
  }

  try {
    const response = await fetcher(source.href, {
      cache: options.reload ? "reload" : "default",
      credentials: "same-origin",
      signal: options.signal,
    });
    if (!response.ok || !isBundledResponse(response, source)) {
      return false;
    }

    const parsed = new DOMParser().parseFromString(
      await response.text(),
      "image/svg+xml",
    );
    if (
      parsed.querySelector("parsererror") ||
      parsed.documentElement.localName !== "svg"
    ) {
      return false;
    }

    return asset.groups.every(
      (group) => parsed.getElementById(group.symbolId) !== null,
    );
  } catch {
    return false;
  }
}

export function foundationAssetHealthMatches(
  health: FoundationAssetHealth | null | undefined,
  asset: FoundationAsset,
): boolean {
  return health?.assetId === asset.id && health.assetVersion === asset.version;
}

function isBundledResponse(response: Response, requested: URL): boolean {
  if (!response.url) {
    return true;
  }

  const finalUrl = new URL(response.url, requested);
  return (
    finalUrl.origin === requested.origin &&
    finalUrl.pathname.startsWith("/foundations/")
  );
}
