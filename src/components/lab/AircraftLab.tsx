"use client";

import { Environment, Lightformer } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";
import { Aircraft } from "@/components/flight/Aircraft";
import { createAircraftState } from "@/flight/aircraft";

type View = "front34" | "rear34" | "side" | "top" | "front" | "low" | "detail" | "nose";

interface ViewPreset {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

const VIEWS: Record<View, ViewPreset> = {
  front34: { position: [-19, 6.5, 24], target: [0, 2.6, 0.5], fov: 32 },
  rear34: { position: [15, 5.5, -27], target: [0, 2.8, -1], fov: 32 },
  side: { position: [44, 3.2, 0.4], target: [0, 3, 0.4], fov: 28 },
  top: { position: [0, 52, 0.4], target: [0, 0, 0.4], fov: 28 },
  front: { position: [0, 3.2, 42], target: [0, 2.8, 0], fov: 28 },
  low: { position: [-9.5, 1.3, -23], target: [0, 2.6, 1], fov: 34 },
  detail: { position: [-7.5, 4.2, 15.5], target: [0, 2.4, 7.5], fov: 30 },
  nose: { position: [-7.2, 1.1, 8.8], target: [0, 1.5, 8.8], fov: 30 },
};

/** Simple outdoor-like surroundings so the paint has something to reflect. */
function StudioEnvironment() {
  const sky = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            float h = vDir.y;
            vec3 zenith = vec3(0.16, 0.36, 0.72);
            vec3 horizon = vec3(0.82, 0.88, 0.94);
            vec3 ground = vec3(0.2, 0.2, 0.19);
            vec3 col = h > 0.0
              ? mix(horizon, zenith, pow(h, 0.55))
              : mix(horizon * 0.6, ground, pow(-h, 0.35));
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    [],
  );
  useEffect(() => () => sky.dispose(), [sky]);

  return (
    <Environment resolution={256} frames={1}>
      <mesh scale={200} material={sky}>
        <sphereGeometry args={[1, 32, 16]} />
      </mesh>
      <Lightformer form="circle" intensity={14} position={[60, 80, 40]} scale={18} target={[0, 0, 0]} />
      <Lightformer
        form="rect"
        intensity={1.2}
        position={[-70, 20, -30]}
        scale={[60, 30, 1]}
        target={[0, 0, 0]}
      />
    </Environment>
  );
}

interface AircraftLabProps {
  view: string;
  gear: number;
}

/** Fixed-camera inspection views of the aircraft model. Internal tool. */
export function AircraftLab({ view, gear }: AircraftLabProps) {
  const viewName: View = view in VIEWS ? (view as View) : "front34";
  const preset = VIEWS[viewName];
  const state = useMemo(() => {
    const s = createAircraftState();
    s.gear = gear;
    return s;
  }, [gear]);

  return (
    <Canvas
      // A new view remounts the canvas so the camera starts from its preset.
      key={viewName}
      shadows
      dpr={[1, 2]}
      camera={{
        fov: preset.fov,
        near: 0.5,
        far: 600,
        position: preset.position,
        up: viewName === "top" ? [0, 0, -1] : [0, 1, 0],
      }}
      gl={{ antialias: true }}
      onCreated={({ gl, camera }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1;
        camera.lookAt(...preset.target);
      }}
    >
      <color attach="background" args={["#93a6ba"]} />
      <StudioEnvironment />
      <directionalLight
        position={[30, 45, 22]}
        intensity={2.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-far={120}
        shadow-bias={-0.0004}
      />
      <Suspense fallback={null}>
        <group
          onUpdate={(group) => {
            group.traverse((object) => {
              if (object instanceof THREE.Mesh) {
                object.castShadow = true;
                object.receiveShadow = true;
              }
            });
          }}
        >
          <Aircraft state={state} />
        </group>
      </Suspense>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#6f7780" roughness={0.95} />
      </mesh>
    </Canvas>
  );
}
