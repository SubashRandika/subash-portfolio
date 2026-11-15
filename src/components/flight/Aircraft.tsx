"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  AIRCRAFT_CENTRELINE_Y,
  AIRCRAFT_LIGHT_ANCHORS,
  AIRCRAFT_MATERIALS,
  AIRCRAFT_MODEL_URL,
  AIRCRAFT_NODES,
  type AircraftState,
  gearPose,
} from "@/flight/aircraft";

/** Wrapper groups the flight controller drives directly. */
export interface AircraftRig {
  /** World position and heading (rotation about Y). */
  root: THREE.Group;
  /** Pitch, about the main landing gear contact point. */
  pitch: THREE.Group;
  /** Roll, about the fuselage centreline. */
  roll: THREE.Group;
}

interface AircraftProps {
  /** Receives the rig once mounted. */
  rigRef?: RefObject<AircraftRig | null>;
  /** Live gear, throttle and light state. Read every frame, never re-rendered. */
  state: AircraftState;
  /** Draw the soft light glows. Disabled on the lowest graphics profile. */
  glows?: boolean;
  /** Stop time-based motion (fan spin, beacon flash). */
  still?: boolean;
}

const NAV_COLOR = new THREE.Color(0.55, 0.78, 1);
const BEACON_COLOR = new THREE.Color(1, 0.22, 0.16);
const LANDING_COLOR = new THREE.Color(1, 0.96, 0.88);

/** Soft radial falloff used for every light glow. */
function createGlowTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.18, "rgba(255,255,255,0.55)");
    gradient.addColorStop(0.45, "rgba(255,255,255,0.14)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The small SR-01 identification marking, drawn in the page title face. */
function createMarkingTexture(fontFamily: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#1b222d";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `400 74px ${fontFamily}`;
    ctx.fillText("SR-01", canvas.width / 2, canvas.height / 2 + 4);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

interface Glow {
  sprite: THREE.Sprite;
  kind: "nav" | "beacon" | "landing";
}

/** Scene-graph objects animated every frame. */
interface AnimatedParts {
  fanLeft: THREE.Object3D | null;
  fanRight: THREE.Object3D | null;
  gearNose: THREE.Object3D | null;
  gearMainLeft: THREE.Object3D | null;
  gearMainRight: THREE.Object3D | null;
  lightsBeacon: THREE.Object3D | null;
  lightsLanding: THREE.Object3D | null;
  glows: Glow[];
  fanAngle: number;
}

/** Applies gear, fan and light state to the scene graph for one frame. */
function animateParts(
  p: AnimatedParts,
  state: AircraftState,
  time: number,
  dt: number,
  still: boolean,
): void {
  // Landing gear
  const gear = gearPose(state.gear);
  if (p.gearNose) {
    p.gearNose.rotation.x = gear.noseRotationX;
    p.gearNose.visible = gear.visible;
  }
  if (p.gearMainLeft) {
    p.gearMainLeft.rotation.z = gear.mainLeftRotationZ;
    p.gearMainLeft.visible = gear.visible;
  }
  if (p.gearMainRight) {
    p.gearMainRight.rotation.z = gear.mainRightRotationZ;
    p.gearMainRight.visible = gear.visible;
  }

  // Fans
  if (!still) {
    p.fanAngle = (p.fanAngle + dt * (6 + state.throttle * 34)) % (Math.PI * 2);
    if (p.fanLeft) p.fanLeft.rotation.z = p.fanAngle;
    if (p.fanRight) p.fanRight.rotation.z = -p.fanAngle;
  }

  // Lights: beacons flash about once a second, landing lights follow state.
  const beaconOn = still ? 1 : time % 1.1 < 0.09 ? 1 : 0.04;
  if (p.lightsBeacon) p.lightsBeacon.visible = beaconOn > 0.5;
  if (p.lightsLanding) p.lightsLanding.visible = state.landingLights > 0.05;
  // Glows are bright against a dark sky and nearly invisible in daylight.
  const ambient = 0.14 + 0.86 * state.glow;
  for (const glow of p.glows) {
    const level =
      (glow.kind === "beacon" ? beaconOn : glow.kind === "landing" ? state.landingLights : 1) *
      ambient;
    glow.sprite.material.opacity = level;
    glow.sprite.visible = level > 0.02;
  }
}

/**
 * The SR-01 executive jet.
 *
 * This component only owns what belongs to the aircraft itself: materials,
 * landing gear, fans, lights and the marking. Where it is and which way it
 * points is decided by whoever holds the rig.
 */
export function Aircraft({ rigRef, state, glows = true, still = false }: AircraftProps) {
  const gltf = useGLTF(AIRCRAFT_MODEL_URL, false, true);
  const rootRef = useRef<THREE.Group>(null);
  const pitchRef = useRef<THREE.Group>(null);
  const rollRef = useRef<THREE.Group>(null);

  // One private copy of the model, so the cached GLTF is never mutated.
  const model = useMemo(() => {
    const scene = gltf.scene.clone(true);
    const materials = new Map<string, THREE.Material>();
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const source = object.material as THREE.Material;
      let material = materials.get(source.uuid);
      if (!material) {
        material = source.clone();
        materials.set(source.uuid, material);
        if (material instanceof THREE.MeshStandardMaterial) {
          material.envMapIntensity = 1;
          if (material.name === AIRCRAFT_MATERIALS.glass) {
            // Glass panels sit just above the skin; keep them from z-fighting
            // at long camera distances.
            material.polygonOffset = true;
            material.polygonOffsetFactor = -2;
            material.polygonOffsetUnits = -2;
          }
        }
      }
      object.material = material;
    });
    return { scene, materials: [...materials.values()] };
  }, [gltf]);

  // Handles to the parts animated every frame. They live in a ref because
  // they are mutable scene-graph objects, not render data.
  const parts = useRef<AnimatedParts | null>(null);

  useEffect(() => {
    const find = (name: string) => model.scene.getObjectByName(name) ?? null;
    const glowList: Glow[] = [];
    let glowTexture: THREE.Texture | null = null;

    if (glows) {
      glowTexture = createGlowTexture();
      const add = (anchorName: string, kind: Glow["kind"], color: THREE.Color, scale: number) => {
        const anchor = find(anchorName);
        if (!anchor) return;
        const material = new THREE.SpriteMaterial({
          map: glowTexture,
          color,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        });
        const sprite = new THREE.Sprite(material);
        sprite.scale.setScalar(scale);
        sprite.renderOrder = 10;
        anchor.add(sprite);
        glowList.push({ sprite, kind });
      };
      add(AIRCRAFT_LIGHT_ANCHORS.navLeft, "nav", NAV_COLOR, 1.1);
      add(AIRCRAFT_LIGHT_ANCHORS.navRight, "nav", NAV_COLOR, 1.1);
      add(AIRCRAFT_LIGHT_ANCHORS.tail, "nav", NAV_COLOR, 0.9);
      add(AIRCRAFT_LIGHT_ANCHORS.beaconTop, "beacon", BEACON_COLOR, 1.8);
      add(AIRCRAFT_LIGHT_ANCHORS.beaconBottom, "beacon", BEACON_COLOR, 1.8);
      add(AIRCRAFT_LIGHT_ANCHORS.landingLeft, "landing", LANDING_COLOR, 2.1);
      add(AIRCRAFT_LIGHT_ANCHORS.landingRight, "landing", LANDING_COLOR, 2.1);
    }

    parts.current = {
      fanLeft: find(AIRCRAFT_NODES.fanLeft),
      fanRight: find(AIRCRAFT_NODES.fanRight),
      gearNose: find(AIRCRAFT_NODES.gearNose),
      gearMainLeft: find(AIRCRAFT_NODES.gearMainLeft),
      gearMainRight: find(AIRCRAFT_NODES.gearMainRight),
      lightsBeacon: find(AIRCRAFT_NODES.lightsBeacon),
      lightsLanding: find(AIRCRAFT_NODES.lightsLanding),
      glows: glowList,
      fanAngle: 0,
    };

    return () => {
      parts.current = null;
      for (const glow of glowList) {
        glow.sprite.removeFromParent();
        glow.sprite.material.dispose();
      }
      glowTexture?.dispose();
    };
  }, [model, glows]);

  // SR-01 marking on both sides of the fin.
  useEffect(() => {
    const anchors = [
      model.scene.getObjectByName(AIRCRAFT_NODES.decalLeft),
      model.scene.getObjectByName(AIRCRAFT_NODES.decalRight),
    ];
    if (!anchors[0] || !anchors[1]) return;

    let disposed = false;
    const geometry = new THREE.PlaneGeometry(1.2, 0.3);
    const material = new THREE.MeshStandardMaterial({
      transparent: true,
      roughness: 0.5,
      metalness: 0.2,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      depthWrite: false,
    });
    const meshes: THREE.Mesh[] = [];

    const family =
      getComputedStyle(document.documentElement).getPropertyValue("--font-michroma").trim() ||
      "sans-serif";

    const apply = () => {
      if (disposed) return;
      material.map?.dispose();
      material.map = createMarkingTexture(family);
      material.needsUpdate = true;
    };
    apply();
    // Redraw once the title face has loaded, so the marking is not set in a
    // fallback font.
    void document.fonts?.load(`400 74px ${family}`).then(apply, () => undefined);

    anchors.forEach((anchor, index) => {
      if (!anchor) return;
      const mesh = new THREE.Mesh(geometry, material);
      // Face outward from the fin: +X on the left side, -X on the right.
      mesh.rotation.y = index === 0 ? Math.PI / 2 : -Math.PI / 2;
      anchor.add(mesh);
      meshes.push(mesh);
    });

    return () => {
      disposed = true;
      for (const mesh of meshes) mesh.removeFromParent();
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
    };
  }, [model]);

  // Hand the rig to the controller.
  useEffect(() => {
    if (!rigRef || !rootRef.current || !pitchRef.current || !rollRef.current) return;
    rigRef.current = { root: rootRef.current, pitch: pitchRef.current, roll: rollRef.current };
    return () => {
      rigRef.current = null;
    };
  }, [rigRef]);

  // Free the cloned materials.
  useEffect(() => {
    return () => {
      for (const material of model.materials) material.dispose();
    };
  }, [model]);

  useFrame((frame, delta) => {
    if (parts.current) {
      animateParts(parts.current, state, frame.clock.elapsedTime, Math.min(delta, 0.05), still);
    }
  });

  return (
    <group ref={rootRef}>
      <group ref={pitchRef}>
        <group ref={rollRef} position={[0, AIRCRAFT_CENTRELINE_Y, 0]}>
          <group position={[0, -AIRCRAFT_CENTRELINE_Y, 0]}>
            <primitive object={model.scene} />
          </group>
        </group>
      </group>
    </group>
  );
}

useGLTF.preload(AIRCRAFT_MODEL_URL, false, true);
