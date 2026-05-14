"use client";

import { useRef, useMemo, useEffect, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useFBX } from "@react-three/drei";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import type { StatKind } from "@/lib/types";

export type SceneMode = "idle" | StatKind;

/* ============================================================
 * Mixamo-driven 3D character.
 *
 * Four FBX files in /public/models/ each contain a rigged
 * humanoid mesh + a baked animation:
 *   idle.fbx → Idle (standing, used for hero + summary sections)
 *   int.fbx  → Thinking (hand to chin, contemplating)
 *   str.fbx  → Idle To Push Up (drops into a push-up)
 *   dis.fbx  → Sitting Idle (meditative cross-legged sit)
 *
 * We swap which FBX is rendered based on the active scene mode.
 * Each character keeps its own animation mixer playing its built-in clip.
 * A custom MeshStandardMaterial overrides Mixamo's default skin to give
 * the holographic translucent look that matches the rest of the scene.
 * ============================================================ */

useFBX.preload("/models/idle.fbx");
useFBX.preload("/models/int.fbx");
useFBX.preload("/models/str.fbx");
useFBX.preload("/models/dis.fbx");

const STAT_HEX: Record<StatKind, string> = {
  INT: "#60a5fa",
  STR: "#fb7185",
  DIS: "#c084fc",
};
const BASE_HEX = "#7dd3fc";

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

interface CharacterClipProps {
  url: string;
  visible: boolean;
  color: string;
  timeScale?: number;
  /** [start, end] as fractions of total clip duration (0-1). Crops the clip so only this range loops. */
  loopFraction?: [number, number];
}

function CharacterClip({ url, visible, color, timeScale = 1, loopFraction }: CharacterClipProps) {
  const fbx = useFBX(url);
  const groupRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const matRef = useRef<THREE.MeshStandardMaterial | null>(null);

  // Clone the rig so each clip has its own skeleton
  const character = useMemo(() => {
    const cloned = SkeletonUtils.clone(fbx) as THREE.Group;
    // Reset transforms baked by Mixamo (they include scale + Y offset)
    cloned.position.set(0, 0, 0);
    cloned.rotation.set(0, 0, 0);
    return cloned;
  }, [fbx]);

  // Replace every material on the cloned mesh with our holographic one,
  // and wire up the animation mixer to play whatever clip is embedded.
  useEffect(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: 0.9,
      roughness: 0.35,
      metalness: 0.15,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    matRef.current = mat;

    character.traverse((child) => {
      const m = child as THREE.Mesh;
      if (m.isMesh) {
        m.material = mat;
        m.castShadow = false;
        m.receiveShadow = false;
        m.frustumCulled = false;
      }
    });

    // Animation mixer — play the embedded clip on loop.
    // If loopFraction is provided, crop to that portion of the clip duration so
    // only the rep cycle loops (e.g. push-up reps without replaying the get-down intro).
    const animations = (fbx.animations ?? []) as THREE.AnimationClip[];
    if (animations.length > 0) {
      const baseClip = animations[0]!;
      const fps = 30;
      const totalFrames = Math.max(2, Math.round(baseClip.duration * fps));
      let clip = baseClip;
      if (loopFraction) {
        const startFrame = Math.max(0, Math.min(totalFrames - 2, Math.floor(totalFrames * loopFraction[0])));
        const endFrame = Math.max(startFrame + 1, Math.min(totalFrames, Math.ceil(totalFrames * loopFraction[1])));
        clip = THREE.AnimationUtils.subclip(baseClip, baseClip.name + "_loop", startFrame, endFrame, fps);
      }
      const mixer = new THREE.AnimationMixer(character);
      const action = mixer.clipAction(clip);
      action.reset().setLoop(THREE.LoopRepeat, Infinity).play();
      action.timeScale = timeScale;
      mixerRef.current = mixer;
      if (process.env.NODE_ENV !== "production") {
        console.log(`[mannequin] ${url} clip="${baseClip.name}" duration=${baseClip.duration.toFixed(2)}s frames≈${totalFrames}${loopFraction ? ` → crop ${loopFraction[0]}–${loopFraction[1]}` : ""}`);
      }
    }
    return () => {
      mixerRef.current?.stopAllAction();
      mixerRef.current = null;
    };
  }, [character, fbx.animations, color, loopFraction, timeScale, url]);

  // Tint emissive each frame so it lerps when stat color changes
  useFrame((_, delta) => {
    if (mixerRef.current) mixerRef.current.update(delta);
    if (matRef.current) {
      const target = new THREE.Color(color);
      matRef.current.color.lerp(target, Math.min(1, delta * 2.5));
      matRef.current.emissive.lerp(target, Math.min(1, delta * 2.5));
    }
    if (groupRef.current) {
      groupRef.current.visible = visible;
    }
  });

  // Mixamo FBX is in centimeters; scale ~0.012 → ~2m tall. Mixamo characters face +Z
  // already, so no Y rotation needed for the camera (which sits at +Z) to see the front.
  return (
    <group ref={groupRef} scale={0.012} rotation={[0, 0, 0]} position={[0, -0.9, 0]}>
      <primitive object={character} />
    </group>
  );
}

export function Mannequin({ mode, pulseTrigger }: { mode: SceneMode; pulseTrigger: number }) {
  const rootRef = useRef<THREE.Group>(null);
  const pulse = useRef(0);
  const lastPulse = useRef(pulseTrigger);

  const color = mode === "idle" ? BASE_HEX : STAT_HEX[mode];

  useFrame((_, delta) => {
    if (pulseTrigger !== lastPulse.current) {
      pulse.current = 1;
      lastPulse.current = pulseTrigger;
    }
    pulse.current = Math.max(0, pulse.current - delta * 2);

    if (rootRef.current) {
      const s = 1 + pulse.current * 0.04;
      rootRef.current.scale.setScalar(lerp(rootRef.current.scale.x, s, Math.min(1, delta * 6)));
    }
  });

  return (
    <group ref={rootRef}>
      <CharacterClip url="/models/idle.fbx" visible={mode === "idle"} color={color} timeScale={0.9} />
      {/* INT thinking: full clip plays — Mixamo "Thinking" is already a clean loop, just slow it */}
      <CharacterClip url="/models/int.fbx" visible={mode === "INT"} color={color} timeScale={0.5} />
      {/* STR push-up: skip the get-down intro (first ~50%), loop only the rep portion */}
      <CharacterClip url="/models/str.fbx" visible={mode === "STR"} color={color} timeScale={1.0} loopFraction={[0.5, 1.0]} />
      <CharacterClip url="/models/dis.fbx" visible={mode === "DIS"} color={color} timeScale={0.6} />
    </group>
  );
}
