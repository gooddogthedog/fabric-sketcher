export const STROKE_VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in float a_alpha;

uniform mat3 u_viewport;
uniform vec2 u_resolution;

out float v_alpha;
out vec2 v_document_position;

void main() {
  vec2 viewportPosition = (u_viewport * vec3(a_position, 1.0)).xy;
  vec2 clipPosition = viewportPosition / u_resolution * vec2(2.0, -2.0)
    + vec2(-1.0, 1.0);
  gl_Position = vec4(clipPosition, 0.0, 1.0);
  v_alpha = a_alpha;
  v_document_position = a_position;
}
`;

export const STROKE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec4 u_color;
uniform int u_texture_kind;
uniform float u_texture_scale;
uniform float u_texture_strength;
uniform float u_texture_angle;
uniform float u_texture_scatter;

in float v_alpha;
in vec2 v_document_position;
out vec4 outputColor;

float hash21(vec2 point) {
  vec3 hashed = fract(vec3(point.xyx) * 0.1031);
  hashed += dot(hashed, hashed.yzx + 33.33);
  return fract((hashed.x + hashed.y) * hashed.z);
}

float valueNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 offset = fract(point);
  vec2 blend = offset * offset * (3.0 - 2.0 * offset);
  float bottom = mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), blend.x);
  float top = mix(
    hash21(cell + vec2(0.0, 1.0)),
    hash21(cell + vec2(1.0, 1.0)),
    blend.x
  );
  return mix(bottom, top, blend.y);
}

float graphiteCoverage(vec2 point) {
  float fineGrain = valueNoise(point * 96.0);
  float sparseLoss = smoothstep(
    0.055,
    0.11,
    hash21(floor(point * 180.0))
  );
  return clamp(mix(0.48, 1.0, fineGrain) * mix(0.7, 1.0, sparseLoss), 0.0, 1.0);
}

float silkCoverage(vec2 point) {
  float sheen = 0.5 + 0.5 * sin(point.x * 42.0 + sin(point.y * 3.0));
  float breakup = valueNoise(point * vec2(14.0, 38.0));
  return clamp(0.72 + sheen * 0.2 + (breakup - 0.5) * 0.12, 0.0, 1.0);
}

float denimCoverage(vec2 point) {
  float warp = abs(fract((point.x + point.y) * 18.0) - 0.5);
  float weft = abs(fract((point.x - point.y) * 14.0) - 0.5);
  float threads = max(
    1.0 - smoothstep(0.06, 0.23, warp),
    1.0 - smoothstep(0.05, 0.2, weft)
  );
  float indigoGap = smoothstep(0.16, 0.62, valueNoise(point * 11.0));
  return clamp(0.46 + threads * 0.42 + indigoGap * 0.1, 0.0, 1.0);
}

float woolCoverage(vec2 point) {
  float clusters = valueNoise(point * 13.0) * 0.6
    + valueNoise(point * 31.0) * 0.4;
  vec2 fiberCell = floor(point * vec2(38.0, 8.0));
  float fiberSeed = hash21(fiberCell);
  float fiber = smoothstep(0.92 - u_texture_scatter * 0.28, 0.98, fiberSeed)
    * (1.0 - smoothstep(0.04, 0.18, abs(fract(point.y * 8.0) - 0.5)));
  return clamp(0.5 + clusters * 0.38 + fiber * 0.12, 0.0, 1.0);
}

float knitCoverage(vec2 point) {
  float column = fract(point.x * 12.0);
  float alternating = mod(floor(point.x * 12.0), 2.0);
  float rib = 1.0 - smoothstep(0.12, 0.46, abs(column - 0.5));
  vec2 loopPoint = vec2(
    (column - 0.5) * 2.0,
    fract(point.y * 7.0 + alternating * 0.5) * 2.0 - 1.0
  );
  float loop = 1.0 - smoothstep(0.48, 0.82, length(loopPoint));
  return clamp(0.5 + rib * 0.3 + loop * 0.18, 0.0, 1.0);
}

float materialCoverage(vec2 point) {
  if (u_texture_kind == 0) {
    return graphiteCoverage(point);
  }
  if (u_texture_kind == 1) {
    return silkCoverage(point);
  }
  if (u_texture_kind == 2) {
    return denimCoverage(point);
  }
  if (u_texture_kind == 3) {
    return woolCoverage(point);
  }
  return knitCoverage(point);
}

void main() {
  float cosine = cos(u_texture_angle);
  float sine = sin(u_texture_angle);
  vec2 rotated = mat2(cosine, -sine, sine, cosine)
    * v_document_position;
  float textureCoverage = materialCoverage(
    rotated / max(u_texture_scale, 0.001)
  );
  float coverage = mix(
    1.0,
    textureCoverage,
    clamp(u_texture_strength, 0.0, 1.0)
  );
  float effectiveAlpha = clamp(v_alpha * coverage, 0.0, 1.0) * u_color.a;
  outputColor = vec4(u_color.rgb * effectiveAlpha, effectiveAlpha);
}
`;
