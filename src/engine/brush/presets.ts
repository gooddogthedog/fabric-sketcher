import type {
  BrushPresetId,
  BrushSnapshot,
  BrushTextureKind,
  BrushTextureSnapshot,
} from "../../domain/document/types";

type BrushPreset = Readonly<BrushSnapshot & { name: string }>;

export const DEFAULT_BRUSH_ID: BrushPresetId = "studio-pencil-v1";

export const BRUSH_PRESETS = Object.freeze([
  preset(
    "studio-pencil-v1",
    "Pencil",
    "#262421",
    0.78,
    16,
    1,
    0.65,
    0.4,
    texture("graphite", 18, 0.34, 0, 0.18),
  ),
  preset(
    "silk-v1",
    "Silk",
    "#8F3E4B",
    0.46,
    48,
    0.55,
    0.42,
    0.2,
    texture("silk", 84, 0.3, -12, 0.06),
  ),
  preset(
    "denim-v1",
    "Denim",
    "#294F68",
    0.74,
    42,
    0.72,
    0.28,
    0.16,
    texture("denim", 38, 0.62, 42, 0.12),
  ),
  preset(
    "wool-v1",
    "Wool",
    "#8A5547",
    0.62,
    52,
    0.62,
    0.34,
    0.3,
    texture("wool", 26, 0.58, 8, 0.72),
  ),
  preset(
    "knit-v1",
    "Knit",
    "#625D55",
    0.66,
    56,
    0.58,
    0.3,
    0.18,
    texture("knit", 62, 0.54, 0, 0.16),
  ),
] as const);

const snapshots: Readonly<Record<BrushPresetId, BrushSnapshot>> = Object.freeze(
  Object.fromEntries(
    BRUSH_PRESETS.map((brush) => [brush.id, snapshot(brush)]),
  ) as Record<BrushPresetId, BrushSnapshot>,
);

export function getBrushPreset(id: BrushPresetId): BrushSnapshot {
  return snapshots[id];
}

export function isBrushPresetId(value: unknown): value is BrushPresetId {
  return typeof value === "string" && Object.hasOwn(snapshots, value);
}

function preset(
  id: BrushPresetId,
  name: string,
  color: `#${string}`,
  opacity: number,
  size: number,
  pressureSize: number,
  pressureOpacity: number,
  tiltShape: number,
  texture: BrushTextureSnapshot,
): BrushPreset {
  return Object.freeze({
    id,
    name,
    color,
    opacity,
    size,
    pressureSize,
    pressureOpacity,
    tiltShape,
    texture,
  });
}

function texture(
  kind: BrushTextureKind,
  scale: number,
  strength: number,
  angle: number,
  scatter: number,
): BrushTextureSnapshot {
  return Object.freeze({ kind, scale, strength, angle, scatter });
}

function snapshot(brush: BrushPreset): BrushSnapshot {
  return Object.freeze({
    id: brush.id,
    color: brush.color,
    opacity: brush.opacity,
    size: brush.size,
    pressureSize: brush.pressureSize,
    pressureOpacity: brush.pressureOpacity,
    tiltShape: brush.tiltShape,
    texture: Object.freeze({ ...brush.texture }),
  });
}
