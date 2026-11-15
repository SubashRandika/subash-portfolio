"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { type FlightFrame, flightFrame } from "@/flight/frame";

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// The shadow is the aircraft's plan-view silhouette as a distance field:
// fuselage, wings, stabiliser and engines. It is cheap, needs no shadow map,
// and softens and fades as the aircraft climbs.
const fragmentShader = /* glsl */ `
  uniform vec2 uOrigin;
  uniform vec2 uForward;
  uniform float uAltitude;
  uniform float uStrength;
  varying vec3 vWorld;

  float taperedSegment(vec2 p, vec2 a, vec2 b, float ra, float rb) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - mix(ra, rb, h);
  }

  void main() {
    vec2 d = vWorld.xz - uOrigin;
    // Aircraft frame: y toward the nose, x toward the left wing.
    vec2 left = vec2(uForward.y, -uForward.x);
    vec2 p = vec2(abs(dot(d, left)), dot(d, uForward));

    float body = taperedSegment(p, vec2(0.0, -9.4), vec2(0.0, 10.1), 0.9, 1.05);
    float wing = taperedSegment(p, vec2(0.8, 0.5), vec2(10.0, -3.5), 2.0, 0.5);
    float tail = taperedSegment(p, vec2(0.0, -9.6), vec2(3.7, -11.0), 0.85, 0.38);
    float engine = taperedSegment(p, vec2(2.08, -3.7), vec2(2.08, -7.3), 0.62, 0.5);
    float shape = min(min(body, wing), min(tail, engine));

    float blur = 0.45 + uAltitude * 0.5;
    float alpha = (1.0 - smoothstep(-blur, blur, shape)) * uStrength;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
  }
`;

interface ShadowUniforms {
  [uniform: string]: THREE.IUniform;
  uOrigin: THREE.IUniform<THREE.Vector2>;
  uForward: THREE.IUniform<THREE.Vector2>;
  uAltitude: THREE.IUniform<number>;
  uStrength: THREE.IUniform<number>;
}

/** Height above the ground at which the contact shadow has fully faded. */
const FADE_ALTITUDE = 30;

function updateShadow(mesh: THREE.Mesh, uniforms: ShadowUniforms, frame: FlightFrame): void {
  const { pose } = frame;
  const fade = 1 - Math.min(1, pose.y / FADE_ALTITUDE);
  mesh.visible = fade > 0.01;
  if (!mesh.visible) return;
  mesh.position.set(pose.x, 0, pose.z);
  uniforms.uOrigin.value.set(pose.x, pose.z);
  uniforms.uForward.value.set(Math.sin(pose.yaw), Math.cos(pose.yaw));
  uniforms.uAltitude.value = pose.y;
  uniforms.uStrength.value = 0.62 * fade * fade;
}

/** Soft contact shadow under the aircraft while it is on or near the runway. */
export function AircraftShadow() {
  const meshRef = useRef<THREE.Mesh>(null);
  const uniformsRef = useRef<ShadowUniforms | null>(null);

  const built = useMemo(() => {
    const uniforms: ShadowUniforms = {
      uOrigin: { value: new THREE.Vector2() },
      uForward: { value: new THREE.Vector2(0, -1) },
      uAltitude: { value: 0 },
      uStrength: { value: 0.6 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -16,
    });
    return { uniforms, material };
  }, []);

  useEffect(() => {
    uniformsRef.current = built.uniforms;
    return () => {
      uniformsRef.current = null;
      built.material.dispose();
    };
  }, [built]);

  useFrame(() => {
    if (meshRef.current && uniformsRef.current) {
      updateShadow(meshRef.current, uniformsRef.current, flightFrame);
    }
  });

  return (
    <mesh ref={meshRef} rotation-x={-Math.PI / 2} material={built.material} renderOrder={-8}>
      <planeGeometry args={[70, 70]} />
    </mesh>
  );
}
