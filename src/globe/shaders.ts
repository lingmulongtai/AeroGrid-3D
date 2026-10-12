// GLSL sources shared by the globe renderer. Every shader includes the
// logarithmic depth chunks because the scene spans metres to millions of km.

export const TILE_VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
varying vec3 vWorldPos;
void main() {
  vUv = uv;
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

export const SURFACE_FRAGMENT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D map;
uniform sampler2D nightMap;
uniform vec3 sunDirection;
uniform float lighting;
uniform float nightAmbient;
uniform float cityLights;
uniform float specularStrength;
uniform int recolor;
uniform float hasMap;
uniform vec3 flatColor;
uniform vec3 oceanColor;
uniform vec3 landColor;
uniform vec3 lineColor;
uniform float brightness;
varying vec2 vUv;
varying vec3 vWorldPos;

vec2 equirect(vec3 n) {
  float lon = atan(n.x, n.z);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  return vec2(lon / (2.0 * PI) + 0.5, 0.5 + lat / PI);
}

// Seam-free sampling of an equirectangular texture across the antimeridian.
vec3 sampleGlobal(sampler2D tex, vec3 n) {
  vec2 uv = equirect(n);
  vec2 uvAlt = vec2(fract(uv.x + 0.5) - 0.5, uv.y);
  vec2 dx = dFdx(uv);
  vec2 dy = dFdy(uv);
  vec2 dxAlt = dFdx(uvAlt);
  vec2 dyAlt = dFdy(uvAlt);
  if (abs(dx.x) > abs(dxAlt.x)) dx.x = dxAlt.x;
  if (abs(dy.x) > abs(dyAlt.x)) dy.x = dyAlt.x;
  return textureGrad(tex, uv, dx, dy).rgb;
}

vec3 navyRecolor(vec3 linearColor) {
  vec3 s = pow(max(linearColor, vec3(0.0)), vec3(1.0 / 2.2));
  float l = dot(s, vec3(0.299, 0.587, 0.114));
  float land = smoothstep(0.17, 0.215, l);
  float line = smoothstep(0.27, 0.62, l);
  return mix(mix(oceanColor, landColor, land), lineColor, line);
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vWorldPos);
  vec3 base = hasMap > 0.5 ? texture2D(map, vUv).rgb : flatColor;
  if (recolor == 1) base = navyRecolor(base);
  base *= brightness;

  float sunDot = dot(n, sunDirection);
  float day = smoothstep(-0.12, 0.22, sunDot);
  float shade = mix(nightAmbient, 1.0, day) * (0.82 + 0.18 * clamp(sunDot * 2.0, 0.0, 1.0));
  vec3 color = base * mix(1.0, shade, lighting);

  if (cityLights > 0.0) {
    vec3 lights = sampleGlobal(nightMap, n);
    lights = pow(lights, vec3(1.35)) * vec3(1.6, 1.25, 0.82);
    color += lights * (1.0 - day) * cityLights * lighting;
  }

  if (specularStrength > 0.0) {
    float water = smoothstep(0.004, 0.02, base.b - max(base.r, base.g) * 0.85) * (1.0 - smoothstep(0.05, 0.12, dot(base, vec3(0.333))));
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 halfDir = normalize(viewDir + sunDirection);
    float nh = max(dot(n, halfDir), 0.0);
    float spec = pow(nh, 900.0) * 1.1 + pow(nh, 90.0) * 0.045;
    color += vec3(1.0, 0.93, 0.82) * spec * water * day * specularStrength * lighting;
  }

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const ATMOSPHERE_VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWorldPos;
void main() {
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

// Single-scattering Rayleigh + Mie atmosphere with planetary shadowing.
// Output is premultiplied: rgb = in-scattered light, a = transmittance.
export const ATMOSPHERE_FRAGMENT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 sunDirection;
uniform float planetRadius;
uniform float atmosphereRadius;
uniform float sunIntensity;
uniform float strength;
uniform float groundHaze;
uniform int primarySteps;
uniform int lightSteps;
varying vec3 vWorldPos;

const vec3 RAYLEIGH = vec3(5.5e-3, 13.0e-3, 22.4e-3);
const float MIE = 21e-3;
const float RAYLEIGH_HEIGHT = 8.0;
const float MIE_HEIGHT = 1.2;
const float MIE_G = 0.758;

vec2 raySphere(vec3 origin, vec3 dir, float radius) {
  float b = dot(origin, dir);
  float c = dot(origin, origin) - radius * radius;
  float d = b * b - c;
  if (d < 0.0) return vec2(1e9, -1e9);
  float s = sqrt(d);
  return vec2(-b - s, -b + s);
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 origin = cameraPosition;
  vec3 dir = normalize(vWorldPos - cameraPosition);
  vec2 atmo = raySphere(origin, dir, atmosphereRadius);
  if (atmo.x > atmo.y || atmo.y < 0.0) discard;
  vec2 planet = raySphere(origin, dir, planetRadius);
  float start = max(atmo.x, 0.0);
  float end = atmo.y;
  if (planet.x < planet.y && planet.x > 0.0) end = min(end, planet.x);
  if (end <= start) discard;

  float stepSize = (end - start) / float(primarySteps);
  float mu = dot(dir, sunDirection);
  float rayleighPhase = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float g2 = MIE_G * MIE_G;
  float miePhase = 3.0 / (8.0 * PI) * ((1.0 - g2) * (mu * mu + 1.0)) /
    (pow(1.0 + g2 - 2.0 * mu * MIE_G, 1.5) * (2.0 + g2));

  vec3 totalRayleigh = vec3(0.0);
  vec3 totalMie = vec3(0.0);
  float depthRayleigh = 0.0;
  float depthMie = 0.0;

  for (int i = 0; i < 32; i++) {
    if (i >= primarySteps) break;
    vec3 samplePos = origin + dir * (start + (float(i) + 0.5) * stepSize);
    float height = length(samplePos) - planetRadius;
    float hr = exp(-height / RAYLEIGH_HEIGHT) * stepSize;
    float hm = exp(-height / MIE_HEIGHT) * stepSize;
    depthRayleigh += hr;
    depthMie += hm;

    vec2 shadow = raySphere(samplePos, sunDirection, planetRadius);
    if (shadow.x < shadow.y && shadow.x > 0.0) continue;

    float lightLength = raySphere(samplePos, sunDirection, atmosphereRadius).y;
    float lightStep = lightLength / float(lightSteps);
    float lightRayleigh = 0.0;
    float lightMie = 0.0;
    for (int j = 0; j < 16; j++) {
      if (j >= lightSteps) break;
      vec3 lightPos = samplePos + sunDirection * ((float(j) + 0.5) * lightStep);
      float lightHeight = max(length(lightPos) - planetRadius, 0.0);
      lightRayleigh += exp(-lightHeight / RAYLEIGH_HEIGHT) * lightStep;
      lightMie += exp(-lightHeight / MIE_HEIGHT) * lightStep;
    }
    vec3 attenuation = exp(-(MIE * (depthMie + lightMie) + RAYLEIGH * (depthRayleigh + lightRayleigh)));
    totalRayleigh += hr * attenuation;
    totalMie += hm * attenuation;
  }

  bool hitsGround = planet.x < planet.y && planet.x > 0.0;
  vec3 scatter = sunIntensity * (rayleighPhase * RAYLEIGH * totalRayleigh + miePhase * MIE * totalMie * (hitsGround ? 0.2 : 1.0));
  vec3 transmittance = exp(-(RAYLEIGH * depthRayleigh + MIE * depthMie));
  float haze = hitsGround ? groundHaze : 1.0;
  scatter = (1.0 - exp(-scatter)) * strength * haze;
  float alpha = mix(1.0, dot(transmittance, vec3(0.3333)), strength * haze);
  gl_FragColor = vec4(scatter, alpha);
}
`;

export const STAR_VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float size;
attribute vec3 starColor;
uniform float pixelRatio;
varying vec3 vColor;
void main() {
  vColor = starColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * pixelRatio;
  #include <logdepthbuf_vertex>
}
`;

export const STAR_FRAGMENT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float visibility;
varying vec3 vColor;
void main() {
  #include <logdepthbuf_fragment>
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 7.0);
  gl_FragColor = vec4(vColor * core * visibility, 1.0);
}
`;

export const MILKY_WAY_FRAGMENT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 galacticPole;
uniform vec3 galacticCenter;
uniform float visibility;
varying vec3 vDir;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.07; a *= 0.5; }
  return v;
}
void main() {
  #include <logdepthbuf_fragment>
  vec3 d = normalize(vDir);
  float b = asin(clamp(dot(d, galacticPole), -1.0, 1.0));
  float band = exp(-pow(b / 0.16, 2.0));
  float bulge = exp(-pow(acos(clamp(dot(d, galacticCenter), -1.0, 1.0)) / 0.45, 2.0));
  float clouds = fbm(d * 7.0);
  float dust = smoothstep(0.42, 0.75, fbm(d * 13.0 + 4.0)) * exp(-pow(b / 0.05, 2.0));
  float glow = (band * (0.35 + 0.9 * clouds) + bulge * 0.9) * (1.0 - dust * 0.75);
  vec3 tint = mix(vec3(0.55, 0.62, 0.85), vec3(0.95, 0.82, 0.62), bulge);
  gl_FragColor = vec4(tint * glow * 0.055 * visibility, 1.0);
}
`;

export const MILKY_WAY_VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;
