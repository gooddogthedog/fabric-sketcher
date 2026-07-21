export const STROKE_VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in float a_alpha;

uniform mat3 u_viewport;
uniform vec2 u_resolution;

out float v_alpha;

void main() {
  vec2 viewportPosition = (u_viewport * vec3(a_position, 1.0)).xy;
  vec2 clipPosition = viewportPosition / u_resolution * vec2(2.0, -2.0)
    + vec2(-1.0, 1.0);
  gl_Position = vec4(clipPosition, 0.0, 1.0);
  v_alpha = a_alpha;
}
`;

export const STROKE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec4 u_color;

in float v_alpha;
out vec4 outputColor;

void main() {
  float effectiveAlpha = clamp(v_alpha, 0.0, 1.0) * u_color.a;
  outputColor = vec4(u_color.rgb * effectiveAlpha, effectiveAlpha);
}
`;
