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

// INT — standing forward, head down looking at book in both hands
const POSE_INT: Pose = {
  head:        { rot: [0.50, 0, 0] },              // head bent down looking at book
  neck:        { rot: [0.18, 0, 0] },
  torso:       { rot: [0.12, 0, 0] },              // slight forward lean
  l_upperarm:  { rot: [-1.45, 0, 0.15] },           // forward, almost horizontal
  l_forearm:   { rot: [-0.5, 0, 0] },              // bent up at elbow
  r_upperarm:  { rot: [-1.45, 0, -0.15] },
  r_forearm:   { rot: [-0.5, 0, 0] },
};

// STR — horizontal plank (push-up position)
const POSE_STR: Pose = {
  root:        { posOffset: [0, -0.35, 0], rot: [-1.55, 0, 0] }, // body rotates to horizontal
  head:        { rot: [-0.6, 0, 0] },                            // head lifts to look forward
  l_upperarm:  { rot: [1.55, 0, 0.18] },                          // arms perpendicular to body (supporting)
  r_upperarm:  { rot: [1.55, 0, -0.18] },
  // Legs stay extended (rest pose)
};

// DIS — standing with hands together at chest (prayer / anjali mudra)
const POSE_DIS: Pose = {
  head:        { rot: [-0.04, 0, 0] },              // very slight head up
  l_upperarm:  { rot: [-1.55, -0.05, 0.55] },        // forward + slightly inward
  l_forearm:   { rot: [-0.85, 0, -0.45] },           // bent so hand goes inward
  r_upperarm:  { rot: [-1.55, 0.05, -0.55] },
  r_forearm:   { rot: [-0.85, 0, 0.45] },
};

const POSES: Record<SceneMode, Pose> = {
  idle: POSE_IDLE,
  INT: POSE_INT,
  STR: POSE_STR,
  DIS: POSE_DIS,
};

// Human-proportioned rest positions (Vitruvian-ish, head ~1/8 of body)
const REST_POS: Record<PartName, [number, number, number]> = {
  root:        [0, 0, 0],
  torso:       [0, 0.85, 0],          // torso center higher
  neck:        [0, 0.42, 0],          // neck above torso
  head:        [0, 0.20, 0],
  l_upperarm:  [-0.30, 0.34, 0],      // shoulder higher
  l_forearm:   [0, -0.40, 0],         // longer upper arm
  l_hand:      [0, -0.38, 0],
  r_upperarm:  [0.30, 0.34, 0],
  r_forearm:   [0, -0.40, 0],
  r_hand:      [0, -0.38, 0],
  l_upperleg:  [-0.14, -0.62, 0],     // hips lower & narrower
  l_lowerleg:  [0, -0.52, 0],         // longer thigh
  l_foot:      [0, -0.50, 0.07],      // longer shin
  r_upperleg:  [0.14, -0.62, 0],
  r_lowerleg:  [0, -0.52, 0],
  r_foot:      [0, -0.50, 0.07],
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
        emissiveIntensity: 0.65,
        transparent: true,
        opacity: 0.95,
        roughness: 0.45,
        metalness: 0.25,
        depthWrite: true,
      }),
    [],
  );
  // Prop material — books/mats etc., slightly different look
  const propMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#e2e8f0",
        emissive: BASE_HEX,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.9,
        roughness: 0.6,
        metalness: 0.1,
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
      {/* Per-mode props */}
      {mode === "INT" && (
        // Book at chest height between the bent forearms
        <group position={[0, 0.55, 0.42]} rotation={[-0.5, 0, 0]}>
          <mesh material={propMat}>
            <boxGeometry args={[0.34, 0.04, 0.24]} />
          </mesh>
          {/* Page split line */}
          <mesh position={[0, 0.022, 0]}>
            <boxGeometry args={[0.005, 0.001, 0.22]} />
            <meshBasicMaterial color="#94a3b8" />
          </mesh>
        </group>
      )}
      {mode === "DIS" && (
        // Lotus mat at feet (figure is standing, mat is grounding)
        <group position={[0, -0.92, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} material={propMat}>
            <cylinderGeometry args={[0.55, 0.55, 0.04, 32]} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.022, 0]}>
            <ringGeometry args={[0.32, 0.36, 32]} />
            <meshBasicMaterial color="#c084fc" transparent opacity={0.7} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
        </group>
      )}
      {mode === "STR" && (
        // Floor below the horizontal plank
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.7, 0]}>
          <circleGeometry args={[1.4, 32]} />
          <meshStandardMaterial color="#0f172a" roughness={0.7} metalness={0.3} transparent opacity={0.55} />
        </mesh>
      )}

      <group ref={setRef("torso")} position={REST_POS.torso}>
        {/* Upper torso — V-shaped chest using rounded box (wider top, narrower bottom) */}
        <mesh scale={[1, 1, 0.65]} material={mat}>
          <sphereGeometry args={[0.28, 24, 20]} />
        </mesh>
        {/* Chest definition — slight inner sphere for pectoral suggestion */}
        <mesh position={[0, 0.05, 0.15]} scale={[1.1, 0.6, 0.5]} material={mat}>
          <sphereGeometry args={[0.18, 18, 14]} />
        </mesh>
        {/* Waist — slimmer connector */}
        <mesh position={[0, -0.28, 0]} scale={[0.85, 1, 0.7]} material={mat}>
          <sphereGeometry args={[0.18, 20, 16]} />
        </mesh>
        {/* Pelvis — rounded */}
        <mesh position={[0, -0.5, 0]} scale={[1, 0.55, 0.75]} material={mat}>
          <sphereGeometry args={[0.24, 22, 18]} />
        </mesh>

        {/* Neck → Head */}
        <group ref={setRef("neck")} position={REST_POS.neck}>
          <mesh scale={[1, 1, 1]} material={mat}>
            <capsuleGeometry args={[0.065, 0.10, 4, 12]} />
          </mesh>
          <group ref={setRef("head")} position={REST_POS.head}>
            {/* Slightly oval head (taller than wide) for human proportion */}
            <mesh scale={[1, 1.15, 1]} material={mat}>
              <sphereGeometry args={[0.13, 26, 22]} />
            </mesh>
            {/* Jaw suggestion */}
            <mesh position={[0, -0.04, 0.04]} scale={[0.85, 0.55, 0.85]} material={mat}>
              <sphereGeometry args={[0.11, 18, 14]} />
            </mesh>
          </group>
        </group>

        {/* Left arm chain — shoulder ball + upper + forearm + hand */}
        <group ref={setRef("l_upperarm")} position={REST_POS.l_upperarm}>
          {/* Shoulder ball */}
          <mesh material={mat}>
            <sphereGeometry args={[0.075, 16, 14]} />
          </mesh>
          {/* Upper arm */}
          <mesh position={[0, -0.20, 0]} material={mat}>
            <capsuleGeometry args={[0.055, 0.34, 4, 12]} />
          </mesh>
          <group ref={setRef("l_forearm")} position={REST_POS.l_forearm}>
            {/* Elbow joint */}
            <mesh material={mat}>
              <sphereGeometry args={[0.06, 14, 12]} />
            </mesh>
            {/* Forearm tapered */}
            <mesh position={[0, -0.20, 0]} material={mat}>
              <capsuleGeometry args={[0.05, 0.32, 4, 12]} />
            </mesh>
            <group ref={setRef("l_hand")} position={REST_POS.l_hand}>
              {/* Hand — flattened oval */}
              <mesh scale={[1, 1.3, 0.45]} material={mat}>
                <sphereGeometry args={[0.065, 14, 12]} />
              </mesh>
            </group>
          </group>
        </group>

        {/* Right arm chain */}
        <group ref={setRef("r_upperarm")} position={REST_POS.r_upperarm}>
          <mesh material={mat}>
            <sphereGeometry args={[0.075, 16, 14]} />
          </mesh>
          <mesh position={[0, -0.20, 0]} material={mat}>
            <capsuleGeometry args={[0.055, 0.34, 4, 12]} />
          </mesh>
          <group ref={setRef("r_forearm")} position={REST_POS.r_forearm}>
            <mesh material={mat}>
              <sphereGeometry args={[0.06, 14, 12]} />
            </mesh>
            <mesh position={[0, -0.20, 0]} material={mat}>
              <capsuleGeometry args={[0.05, 0.32, 4, 12]} />
            </mesh>
            <group ref={setRef("r_hand")} position={REST_POS.r_hand}>
              <mesh scale={[1, 1.3, 0.45]} material={mat}>
                <sphereGeometry args={[0.065, 14, 12]} />
              </mesh>
            </group>
          </group>
        </group>

        {/* Left leg chain */}
        <group ref={setRef("l_upperleg")} position={REST_POS.l_upperleg}>
          {/* Hip ball */}
          <mesh material={mat}>
            <sphereGeometry args={[0.10, 16, 14]} />
          </mesh>
          {/* Thigh */}
          <mesh position={[0, -0.28, 0]} material={mat}>
            <capsuleGeometry args={[0.085, 0.44, 4, 12]} />
          </mesh>
          <group ref={setRef("l_lowerleg")} position={REST_POS.l_lowerleg}>
            {/* Knee */}
            <mesh material={mat}>
              <sphereGeometry args={[0.075, 14, 12]} />
            </mesh>
            {/* Calf tapered */}
            <mesh position={[0, -0.27, 0]} material={mat}>
              <capsuleGeometry args={[0.07, 0.42, 4, 12]} />
            </mesh>
            <group ref={setRef("l_foot")} position={REST_POS.l_foot}>
              {/* Foot — flattened oval */}
              <mesh scale={[1, 0.55, 1.6]} position={[0, -0.02, 0.04]} material={mat}>
                <sphereGeometry args={[0.09, 16, 12]} />
              </mesh>
            </group>
          </group>
        </group>

        {/* Right leg chain */}
        <group ref={setRef("r_upperleg")} position={REST_POS.r_upperleg}>
          <mesh material={mat}>
            <sphereGeometry args={[0.10, 16, 14]} />
          </mesh>
          <mesh position={[0, -0.28, 0]} material={mat}>
            <capsuleGeometry args={[0.085, 0.44, 4, 12]} />
          </mesh>
          <group ref={setRef("r_lowerleg")} position={REST_POS.r_lowerleg}>
            <mesh material={mat}>
              <sphereGeometry args={[0.075, 14, 12]} />
            </mesh>
            <mesh position={[0, -0.27, 0]} material={mat}>
              <capsuleGeometry args={[0.07, 0.42, 4, 12]} />
            </mesh>
            <group ref={setRef("r_foot")} position={REST_POS.r_foot}>
              <mesh scale={[1, 0.55, 1.6]} position={[0, -0.02, 0.04]} material={mat}>
                <sphereGeometry args={[0.09, 16, 12]} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
