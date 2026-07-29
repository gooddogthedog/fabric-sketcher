import type { RenderColor, RenderTexture } from "./Renderer";

const MIN_TILE_SIZE = 16;
const MAX_TILE_SIZE = 128;

type TileContext = Pick<
  CanvasRenderingContext2D,
  | "arc"
  | "beginPath"
  | "fillRect"
  | "lineTo"
  | "moveTo"
  | "stroke"
  | "fillStyle"
  | "lineWidth"
  | "strokeStyle"
>;

type Point = readonly [x: number, y: number];
type Rotation = Readonly<{
  angle: number;
  center: number;
  cosine: number;
  sine: number;
}>;

export function textureCacheKey(
  color: RenderColor,
  texture: RenderTexture,
): string {
  return [
    "texture",
    color.map(cacheNumber).join(","),
    texture.kind,
    cacheNumber(texture.scale),
    cacheNumber(texture.strength),
    cacheNumber(texture.angle),
    cacheNumber(texture.scatter),
  ].join(":");
}

export function createTextureTile(
  document: Pick<Document, "createElement">,
  color: RenderColor,
  texture: RenderTexture,
): HTMLCanvasElement {
  const tile = document.createElement("canvas");
  const size = tileSize(texture.scale);
  tile.width = size;
  tile.height = size;

  const context = tile.getContext("2d");
  if (context === null) {
    throw new Error("Canvas2D texture tile context is unavailable");
  }

  const tileContext = context as TileContext;
  tileContext.fillStyle = colorString(color);
  tileContext.fillRect(0, 0, size, size);

  const rotation = rotationFor(size, texture.angle);
  switch (texture.kind) {
    case "graphite":
      drawGraphite(tileContext, size, texture, rotation);
      break;
    case "silk":
      drawSilk(tileContext, size, texture, rotation);
      break;
    case "denim":
      drawDenim(tileContext, size, texture, rotation);
      break;
    case "wool":
      drawWool(tileContext, size, texture, rotation);
      break;
    case "knit":
      drawKnit(tileContext, size, texture, rotation);
      break;
  }

  return tile;
}

function drawGraphite(
  context: TileContext,
  size: number,
  texture: RenderTexture,
  rotation: Rotation,
): void {
  const count = Math.max(
    3,
    Math.round(
      (size / 3) * (0.5 + scatter(texture)) * (0.5 + textureStrength(texture)),
    ),
  );
  context.fillStyle = shadow(textureStrength(texture));
  for (let index = 0; index < count; index += 1) {
    const point = rotatePoint(
      hash(index, 11) % size,
      hash(index, 29) % size,
      rotation,
    );
    context.fillRect(point[0], point[1], 1, 1);
  }
}

function drawSilk(
  context: TileContext,
  size: number,
  texture: RenderTexture,
  rotation: Rotation,
): void {
  const spacing = Math.max(3, Math.round(size / (3 + scatter(texture) * 6)));
  context.strokeStyle = highlight(textureStrength(texture));
  context.lineWidth = Math.max(1, Math.round(1 + textureStrength(texture) * 2));
  for (let offset = -size; offset <= size * 2; offset += spacing) {
    drawLine(
      context,
      rotatePoint(-size, offset, rotation),
      rotatePoint(size * 2, offset + Math.round(size / 5), rotation),
    );
  }
}

function drawDenim(
  context: TileContext,
  size: number,
  texture: RenderTexture,
  rotation: Rotation,
): void {
  const spacing = Math.max(3, Math.round(size / (4 + scatter(texture) * 8)));
  context.lineWidth = 1;
  context.strokeStyle = shadow(textureStrength(texture));
  for (let offset = -size; offset <= size * 2; offset += spacing) {
    drawLine(
      context,
      rotatePoint(-size, offset, rotation),
      rotatePoint(size * 2, offset + size * 3, rotation),
    );
  }
  context.strokeStyle = highlight(textureStrength(texture) * 0.8);
  for (let offset = -size; offset <= size * 2; offset += spacing) {
    drawLine(
      context,
      rotatePoint(-size, offset + size * 3, rotation),
      rotatePoint(size * 2, offset, rotation),
    );
  }
}

function drawWool(
  context: TileContext,
  size: number,
  texture: RenderTexture,
  rotation: Rotation,
): void {
  const clusters = Math.max(
    4,
    Math.round(
      (size / 5) *
        (1 + scatter(texture) * 4) *
        (0.5 + textureStrength(texture)),
    ),
  );
  context.lineWidth = Math.max(1, Math.round(1 + textureStrength(texture)));
  context.strokeStyle = highlight(textureStrength(texture));
  for (let index = 0; index < clusters; index += 1) {
    const x = hash(index, 17) % size;
    const y = hash(index, 43) % size;
    const length = 2 + (hash(index, 67) % Math.max(3, Math.round(size / 5)));
    drawLine(
      context,
      rotatePoint(x, y, rotation),
      rotatePoint(x + length, y + (index % 3) - 1, rotation),
    );
    drawLine(
      context,
      rotatePoint(x - 1, y + 2, rotation),
      rotatePoint(x + Math.max(1, length - 2), y + 3, rotation),
    );
  }
}

function drawKnit(
  context: TileContext,
  size: number,
  texture: RenderTexture,
  rotation: Rotation,
): void {
  const spacing = Math.max(4, Math.round(size / (3 + scatter(texture) * 5)));
  context.lineWidth = Math.max(1, Math.round(1 + textureStrength(texture)));
  context.strokeStyle = shadow(textureStrength(texture));
  for (let x = 0; x <= size; x += spacing) {
    drawLine(
      context,
      rotatePoint(x, -size, rotation),
      rotatePoint(x, size * 2, rotation),
    );
  }
  context.strokeStyle = highlight(textureStrength(texture));
  for (let x = Math.round(spacing / 2); x <= size; x += spacing) {
    const center = rotatePoint(x, Math.round(size / 2), rotation);
    context.beginPath();
    context.arc(
      center[0],
      center[1],
      Math.max(2, Math.round(spacing / 3)),
      rotation.angle,
      Math.PI + rotation.angle,
    );
    context.stroke();
  }
}

function drawLine(context: TileContext, start: Point, end: Point): void {
  context.beginPath();
  context.moveTo(start[0], start[1]);
  context.lineTo(end[0], end[1]);
  context.stroke();
}

function rotationFor(size: number, angle: number): Rotation {
  const radians = (finiteOrZero(angle) * Math.PI) / 180;
  return {
    angle: radians,
    center: size / 2,
    cosine: Math.cos(radians),
    sine: Math.sin(radians),
  };
}

function rotatePoint(x: number, y: number, rotation: Rotation): Point {
  const relativeX = x - rotation.center;
  const relativeY = y - rotation.center;
  return [
    Math.round(
      rotation.center + relativeX * rotation.cosine - relativeY * rotation.sine,
    ),
    Math.round(
      rotation.center + relativeX * rotation.sine + relativeY * rotation.cosine,
    ),
  ];
}

function tileSize(scale: number): number {
  return clamp(Math.round(finiteOrZero(scale)), MIN_TILE_SIZE, MAX_TILE_SIZE);
}

function colorString(color: RenderColor): string {
  return `rgb(${toByte(color[0])} ${toByte(color[1])} ${toByte(color[2])})`;
}

function shadow(value: number): string {
  return `rgb(0 0 0 / ${Math.min(0.7, 0.12 + clamp(value, 0, 1) * 0.58)})`;
}

function highlight(value: number): string {
  return `rgb(255 255 255 / ${Math.min(0.55, 0.08 + clamp(value, 0, 1) * 0.42)})`;
}

function textureStrength(texture: RenderTexture): number {
  return clamp(finiteOrZero(texture.strength), 0, 1);
}

function scatter(texture: RenderTexture): number {
  return clamp(finiteOrZero(texture.scatter), 0, 1);
}

function hash(index: number, salt: number): number {
  const value = Math.imul(index + 1, 1103515245) ^ Math.imul(salt, 12345);
  return (value >>> 0) % 2147483647;
}

function toByte(value: number): number {
  return Math.round(clamp(finiteOrZero(value), 0, 1) * 255);
}

function cacheNumber(value: number): string {
  return String(finiteOrZero(value));
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
