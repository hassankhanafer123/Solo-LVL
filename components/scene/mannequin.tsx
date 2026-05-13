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
}

function CharacterClip({ url, visible, color }: CharacterClipProps) {
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

    // Animation mixer — play the embedded clip on loop
    const animations = (fbx.animations ?? []) as THREE.AnimationClip[];
    if (animations.length > 0) {
      const mixer = new THREE.AnimationMixer(character);
      const action = mixer.clipAction(animations[0]!);
      action.reset().setLoop(THREE.LoopRepeat, Infinity).play();
      mixerRef.current = mixer;
    }
    return () => {
      mixerRef.current?.stopAllAction();
      mixerRef.current = null;
    };
  }, [character, fbx.animations, color]);

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

  // Mixamo FBX comes in centimeters; scale 0.01 puts the figure at ~1.8m tall.
  // Rotate 180° around Y so the character faces the camera (Mixamo's default is +Z forward).
  return (
    <group ref={groupRef} scale={0.012} rotation={[0, Math.PI, 0]} position={[0, -0.9, 0]}>
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
      <CharacterClip url="/models/idle.fbx" visible={mode === "idle"} color={color} />
      <CharacterClip url="/models/int.fbx" visible={mode === "INT"} color={color} />
      <CharacterClip url="/models/str.fbx" visible={mode === "STR"} color={color} />
      <CharacterClip url="/models/dis.fbx" visible={mode === "DIS"} color={color} />
    </group>
  );
}
