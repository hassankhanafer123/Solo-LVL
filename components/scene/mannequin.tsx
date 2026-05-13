"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { StatKind } from "@/lib/types";

export type SceneMode = "idle" | StatKind;

/* ============================================================
 * Low-poly 3D mannequin — hand-built from primitives.
 * Hierarchy: root → torso → (neck → head), (l/r arm chain), (l/r leg chain)
 * Each part is a group with a ref. Per-mode poses set position+rotation
 * on those groups; smooth lerp every frame.
 * ============================================================ */

const STAT_HEX: Record<StatKind, string> = {
  INT: "#60a5fa",
  STR: "#fb7185",
  DIS: "#c084fc",
};
const BASE_HEX = "#7dd3fc";

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

type Transform = { rot?: [number, number, number]; posOffset?: [number, number, number] };
type PartName =
  | "root"
  | "torso"
  | "neck" | "head"
  | "l_upperarm" | "l_forearm" | "l_hand"
  | "r_upperarm" | "r_forearm" | "r_hand"
  | "l_upperleg" | "l_lowerleg" | "l_foot"
  | "r_upperleg" | "r_lowerleg" | "r_foot";

type Pose = Partial<Record<PartName, Transform>>;

const POSE_IDLE: Pose = {};

const POSE_INT: Pose = {
  root:        { posOffset: [0, -0.55, 0] },
  head:        { rot: [0.55, 0, 0] },
  neck:        { rot: [0.15, 0, 0] },
  torso:       { rot: [0.18, 0, 0] },
  l_upperarm:  { rot: [-1.1, 0, 0.2] },
  l_forearm:   { rot: [-0.7, 0, 0] },
  r_upperarm:  { rot: [-1.1, 0, -0.2] },
  r_forearm:   { rot: [-0.7, 0, 0] },
  l_upperleg:  { rot: [-1.4, 0.55, 0], posOffset: [-0.04, 0.05, 0.12] },
  l_lowerleg:  { rot: [-1.6, 0, -0.4] },
  r_upperleg:  { rot: [-1.4, -0.55, 0], posOffset: [0.04, 0.05, 0.12] },
  r_lowerleg:  { rot: [-1.6, 0, 0.4] },
};

const POSE_STR: Pose = {
  root:        { posOffset: [0, -0.45, 0], rot: [-1.45, 0, 0] },
  head:        { rot: [-0.4, 0, 0] },
  l_upperarm:  { rot: [1.55, 0, 0.15] },
  r_upperarm:  { rot: [1.55, 0, -0.15] },
};

const POSE_DIS: Pose = {
  root:        { posOffset: [0, -0.5, 0] },
  head:        { rot: [-0.05, 0, 0] },
  l_upperarm:  { rot: [-1.0, -0.3, 0.35] },
  l_forearm:   { rot: [-1.0, 0, -0.55] },
  r_upperarm:  { rot: [-1.0, 0.3, -0.35] },
  r_forearm:   { rot: [-1.0, 0, 0.55] },
  l_upperleg:  { rot: [-1.5, 0.7, 0], posOffset: [-0.02, 0.03, 0.14] },
  l_lowerleg:  { rot: [-1.7, 0, -0.5] },
  r_upperleg:  { rot: [-1.5, -0.7, 0], posOffset: [0.02, 0.03, 0.14] },
  r_lowerleg:  { rot: [-1.7, 0, 0.5] },
};

const POSES: Record<SceneMode, Pose> = {
  idle: POSE_IDLE,
  INT: POSE_INT,
  STR: POSE_STR,
  DIS: POSE_DIS,
};

// Rest positions per part (idle base, in local space of parent)
const REST_POS: Record<PartName, [number, number, number]> = {
  root:        [0, 0, 0],
  torso:       [0, 0.7, 0],
  neck:        [0, 0.35, 0],
  head:        [0, 0.22, 0],
  l_upperarm:  [-0.27, 0.22, 0],
  l_forearm:   [0, -0.38, 0],
  l_hand:      [0, -0.38, 0],
  r_upperarm:  [0.27, 0.22, 0],
  r_forearm:   [0, -0.38, 0],
  r_hand:      [0, -0.38, 0],
  l_upperleg:  [-0.12, -0.5, 0],
  l_lowerleg:  [0, -0.46, 0],
  l_foot:      [0, -0.46, 0.06],
  r_upperleg:  [0.12, -0.5, 0],
  r_lowerleg:  [0, -0.46, 0],
  r_foot:      [0, -0.46, 0.06],
};

export function Mannequin({ mode, pulseTrigger }: { mode: SceneMode; pulseTrigger: number }) {
  const partsRef = useRef<Record<string, THREE.Group | null>>({});
  const pulse = useRef(0);
  const lastPulse = useRef(pulseTrigger);

  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: BASE_HEX,
        emissive: BASE_HEX,
        emissiveIntensity: 1.6,
        transparent: true,
        opacity: 0.82,
        roughness: 0.3,
        metalness: 0.1,
        depthWrite: true,
      }),
    [],
  );

  const setRef = (name: PartName) => (g: THREE.Group | null) => {
    partsRef.current[name] = g;
  };

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;

    // Color
    const accent = mode === "idle" ? BASE_HEX : STAT_HEX[mode];
    mat.color.lerp(new THREE.Color(accent), Math.min(1, delta * 2.5));
    mat.emissive.lerp(new THREE.Color(accent), Math.min(1, delta * 2.5));

    // Pulse
    if (pulseTrigger !== lastPulse.current) {
      pulse.current = 1;
      lastPulse.current = pulseTrigger;
    }
    pulse.current = Math.max(0, pulse.current - delta * 2);

    const pose = POSES[mode];
    const lerpRate = Math.min(1, delta * 3.5);

    // Apply pose lerp on each part
    for (const name of Object.keys(REST_POS) as PartName[]) {
      const g = partsRef.current[name];
      if (!g) continue;
      const target = pose[name];
      const rest = REST_POS[name];
      const targetPos: [number, number, number] = target?.posOffset
        ? [rest[0] + target.posOffset[0], rest[1] + target.posOffset[1], rest[2] + target.posOffset[2]]
        : rest;
      const targetRot: [number, number, number] = target?.rot ?? [0, 0, 0];

      g.position.x = lerp(g.position.x, targetPos[0], lerpRate);
      g.position.y = lerp(g.position.y, targetPos[1], lerpRate);
      g.position.z = lerp(g.position.z, targetPos[2], lerpRate);
      g.rotation.x = lerp(g.rotation.x, targetRot[0], lerpRate);
      g.rotation.y = lerp(g.rotation.y, targetRot[1], lerpRate);
      g.rotation.z = lerp(g.rotation.z, targetRot[2], lerpRate);
    }

    // Per-mode ongoing motion on the ROOT
    const root = partsRef.current.root;
    if (root) {
      let dy = 0;
      let dsx = 0;
      if (mode === "idle") {
        dy = Math.sin(t * 0.6) * 0.01;
        dsx = Math.sin(t * 0.9) * 0.008;
        root.rotation.y = Math.sin(t * 0.3) * 0.04;
      } else if (mode === "INT") {
        dy = Math.sin(t * 0.9) * 0.015;
        const head = partsRef.current.head;
        if (head) head.rotation.y = Math.sin(t * 0.7) * 0.1;
      } else if (mode === "STR") {
        // Push-up rep — body bounces along its (rotated) Y axis = world Z roughly
        // For visual simplicity we modulate world Y on the root.
        dy = Math.sin(t * 2.6) * 0.08;
      } else if (mode === "DIS") {
        dsx = Math.sin(t * 0.55) * 0.018;
      }
      const baseY = pose.root?.posOffset?.[1] ?? 0;
      root.position.y = lerp(root.position.y, baseY + dy, 0.5);
      const sTarget = 1 + dsx + pulse.current * 0.05;
      root.scale.setScalar(lerp(root.scale.x, sTarget, Math.min(1, delta * 6)));
    }
  });

  return (
    <group ref={setRef("root")} position={REST_POS.root}>
      <group ref={setRef("torso")} position={REST_POS.torso}>
        {/* Torso mesh */}
        <mesh material={mat}>
          <boxGeometry args={[0.42, 0.6, 0.24]} />
        </mesh>
        {/* Pelvis mesh */}
        <mesh position={[0, -0.4, 0]} material={mat}>
          <boxGeometry args={[0.36, 0.18, 0.24]} />
        </mesh>

        {/* Neck → Head */}
        <group ref={setRef("neck")} position={REST_POS.neck}>
          <mesh material={mat}>
            <cylinderGeometry args={[0.07, 0.07, 0.12, 12]} />
          </mesh>
          <group ref={setRef("head")} position={[0, 0.18, 0]}>
            <mesh material={mat}>
              <sphereGeometry args={[0.13, 22, 18]} />
            </mesh>
          </group>
        </group>

        {/* Left arm chain */}
        <group ref={setRef("l_upperarm")} position={REST_POS.l_upperarm}>
          <mesh position={[0, -0.18, 0]} material={mat}>
            <capsuleGeometry args={[0.07, 0.3, 4, 12]} />
          </mesh>
          <group ref={setRef("l_forearm")} position={REST_POS.l_forearm}>
            <mesh position={[0, -0.18, 0]} material={mat}>
              <capsuleGeometry args={[0.06, 0.3, 4, 12]} />
            </mesh>
            <group ref={setRef("l_hand")} position={REST_POS.l_hand}>
              <mesh material={mat}>
                <sphereGeometry args={[0.08, 14, 12]} />
              </mesh>
            </group>
          </group>
        </group>

        {/* Right arm chain */}
        <group ref={setRef("r_upperarm")} position={REST_POS.r_upperarm}>
          <mesh position={[0, -0.18, 0]} material={mat}>
            <capsuleGeometry args={[0.07, 0.3, 4, 12]} />
          </mesh>
          <group ref={setRef("r_forearm")} position={REST_POS.r_forearm}>
            <mesh position={[0, -0.18, 0]} material={mat}>
              <capsuleGeometry args={[0.06, 0.3, 4, 12]} />
            </mesh>
            <group ref={setRef("r_hand")} position={REST_POS.r_hand}>
              <mesh material={mat}>
                <sphereGeometry args={[0.08, 14, 12]} />
              </mesh>
            </group>
          </group>
        </group>

        {/* Left leg chain */}
        <group ref={setRef("l_upperleg")} position={REST_POS.l_upperleg}>
          <mesh position={[0, -0.22, 0]} material={mat}>
            <capsuleGeometry args={[0.09, 0.36, 4, 12]} />
          </mesh>
          <group ref={setRef("l_lowerleg")} position={REST_POS.l_lowerleg}>
            <mesh position={[0, -0.22, 0]} material={mat}>
              <capsuleGeometry args={[0.07, 0.36, 4, 12]} />
            </mesh>
            <group ref={setRef("l_foot")} position={REST_POS.l_foot}>
              <mesh material={mat}>
                <boxGeometry args={[0.12, 0.06, 0.2]} />
              </mesh>
            </group>
          </group>
        </group>

        {/* Right leg chain */}
        <group ref={setRef("r_upperleg")} position={REST_POS.r_upperleg}>
          <mesh position={[0, -0.22, 0]} material={mat}>
            <capsuleGeometry args={[0.09, 0.36, 4, 12]} />
          </mesh>
          <group ref={setRef("r_lowerleg")} position={REST_POS.r_lowerleg}>
            <mesh position={[0, -0.22, 0]} material={mat}>
              <capsuleGeometry args={[0.07, 0.36, 4, 12]} />
            </mesh>
            <group ref={setRef("r_foot")} position={REST_POS.r_foot}>
              <mesh material={mat}>
                <boxGeometry args={[0.12, 0.06, 0.2]} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
