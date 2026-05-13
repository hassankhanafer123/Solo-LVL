"use client";

import { Suspense, useState, useEffect, useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Line, Sparkles, Stars } from "@react-three/drei";
import * as THREE from "three";
import type { StatKind } from "@/lib/types";

export type SceneMode = "idle" | StatKind;

/* ============================================================
 * Human hologram — line-based wireframe figure with anatomical
 * detail layers that fade in based on the active scroll section.
 *
 * Layers:
 *   - Base wireframe: skull, body outline, limbs (always visible)
 *   - Face layer: eyes, nose, mouth, brain pattern (INT focus)
 *   - Muscle layer: pectorals, abs, biceps, quads (STR focus)
 *   - Spine layer: vertebral column, posture line (DIS focus)
 *   - Particle aura: glowing dust around the figure (always)
 *
 * Scroll → camera flies to the active body region. Active layer
 * lines brighten to the stat color; other layers dim/fade.
 * ============================================================ */

const STAT_HEX: Record<StatKind, string> = {
  INT: "#60a5fa",
  STR: "#fb7185",
  DIS: "#c084fc",
};
const BASE_COLOR = "#7dd3fc"; // sky-300, the idle hologram color

const CAMERA: Record<SceneMode, { pos: [number, number, number]; look: [number, number, number]; fov: number }> = {
  idle: { pos: [0, 0.6, 3.6], look: [0, 0.6, 0], fov: 40 },
  INT:  { pos: [0.4, 1.75, 1.4], look: [0, 1.75, 0], fov: 28 },
  STR:  { pos: [0, 1.1, 2.0], look: [0, 1.1, 0], fov: 36 },
  DIS:  { pos: [1.7, 0.9, 2.3], look: [0, 0.9, 0], fov: 36 },
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/* ============================================================
 * Anatomical landmarks (front view, head up, y=0 = hips)
 * ============================================================ */
const P = {
  // Skull
  top:     [0, 1.95, 0] as const,
  fhL:     [-0.18, 1.86, 0.10] as const,
  fhR:     [0.18, 1.86, 0.10] as const,
  eyeL:    [-0.09, 1.78, 0.20] as const,
  eyeR:    [0.09, 1.78, 0.20] as const,
  noseT:   [0, 1.74, 0.22] as const,
  noseB:   [0, 1.68, 0.22] as const,
  mouth:   [0, 1.62, 0.20] as const,
  jawL:    [-0.16, 1.6, 0.10] as const,
  jawR:    [0.16, 1.6, 0.10] as const,
  chin:    [0, 1.55, 0.16] as const,
  // Neck
  neckT:   [0, 1.50, 0] as const,
  neckB:   [0, 1.40, 0] as const,
  // Shoulders
  shdL:    [-0.34, 1.36, 0] as const,
  shdR:    [0.34, 1.36, 0] as const,
  // Sternum & ribs
  sterT:   [0, 1.32, 0.04] as const,
  sterB:   [0, 0.96, 0.04] as const,
  navel:   [0, 0.78, 0.06] as const,
  // Lats & waist
  latL:    [-0.30, 1.08, 0] as const,
  latR:    [0.30, 1.08, 0] as const,
  wstL:    [-0.22, 0.78, 0] as const,
  wstR:    [0.22, 0.78, 0] as const,
  // Hips
  hipL:    [-0.22, 0.65, 0] as const,
  hipR:    [0.22, 0.65, 0] as const,
  // Arms — natural slight bend, hands at hip level
  elbL:    [-0.40, 1.0, 0] as const,
  elbR:    [0.40, 1.0, 0] as const,
  wrsL:    [-0.43, 0.66, 0.03] as const,
  wrsR:    [0.43, 0.66, 0.03] as const,
  hndL:    [-0.43, 0.52, 0.05] as const,
  hndR:    [0.43, 0.52, 0.05] as const,
  // Legs
  kneL:    [-0.18, 0.15, 0] as const,
  kneR:    [0.18, 0.15, 0] as const,
  ankL:    [-0.16, -0.42, 0] as const,
  ankR:    [0.16, -0.42, 0] as const,
  toeL:    [-0.16, -0.50, 0.12] as const,
  toeR:    [0.16, -0.50, 0.12] as const,
};

type Pt = readonly [number, number, number];

/* Build a smooth curved polyline through points using a small bezier */
function smooth(points: Pt[]): Pt[] {
  // Just return the points unchanged for now — drei <Line> uses linear segments
  // which work fine for our needs at this scale.
  return points;
}

/* Eye ellipse points */
function ellipse(cx: number, cy: number, cz: number, rx: number, ry: number, segments = 18): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, cz]);
  }
  return pts;
}

/* ============================================================
 * Base wireframe — always visible
 * ============================================================ */
function BaseWireframe({ color, opacity }: { color: string; opacity: number }) {
  return (
    <group>
      {/* Skull outline — front view */}
      <Line points={smooth([P.top, P.fhL, P.jawL, P.chin, P.jawR, P.fhR, P.top])} color={color} lineWidth={1.4} transparent opacity={opacity} />
      {/* Eyes (subtle outlines) */}
      <Line points={ellipse(P.eyeL[0], P.eyeL[1], P.eyeL[2], 0.05, 0.022)} color={color} lineWidth={1} transparent opacity={opacity * 0.7} />
      <Line points={ellipse(P.eyeR[0], P.eyeR[1], P.eyeR[2], 0.05, 0.022)} color={color} lineWidth={1} transparent opacity={opacity * 0.7} />
      {/* Nose */}
      <Line points={[P.noseT, P.noseB]} color={color} lineWidth={1} transparent opacity={opacity * 0.6} />
      {/* Mouth */}
      <Line points={smooth([[-0.04, P.mouth[1], P.mouth[2]], [0.04, P.mouth[1], P.mouth[2]]])} color={color} lineWidth={1} transparent opacity={opacity * 0.6} />
      {/* Neck */}
      <Line points={[P.chin, P.neckT]} color={color} lineWidth={1} transparent opacity={opacity * 0.7} />
      <Line points={[P.neckT, P.neckB]} color={color} lineWidth={1.2} transparent opacity={opacity} />
      {/* Shoulders */}
      <Line points={[P.shdL, P.neckB, P.shdR]} color={color} lineWidth={1.4} transparent opacity={opacity} />
      {/* Body outline left */}
      <Line points={[P.shdL, P.latL, P.wstL, P.hipL]} color={color} lineWidth={1.4} transparent opacity={opacity} />
      {/* Body outline right */}
      <Line points={[P.shdR, P.latR, P.wstR, P.hipR]} color={color} lineWidth={1.4} transparent opacity={opacity} />
      {/* Hip line */}
      <Line points={[P.hipL, P.hipR]} color={color} lineWidth={1.2} transparent opacity={opacity * 0.7} />
      {/* Sternum */}
      <Line points={[P.neckB, P.sterT, P.sterB]} color={color} lineWidth={1} transparent opacity={opacity * 0.55} />
      {/* Left arm */}
      <Line points={[P.shdL, P.elbL, P.wrsL, P.hndL]} color={color} lineWidth={1.3} transparent opacity={opacity} />
      {/* Right arm */}
      <Line points={[P.shdR, P.elbR, P.wrsR, P.hndR]} color={color} lineWidth={1.3} transparent opacity={opacity} />
      {/* Left leg */}
      <Line points={[P.hipL, P.kneL, P.ankL, P.toeL]} color={color} lineWidth={1.5} transparent opacity={opacity} />
      {/* Right leg */}
      <Line points={[P.hipR, P.kneR, P.ankR, P.toeR]} color={color} lineWidth={1.5} transparent opacity={opacity} />
    </group>
  );
}

/* ============================================================
 * Face / brain detail — shown when INT focused
 * ============================================================ */
function FaceDetails({ visible, color }: { visible: number; color: string }) {
  if (visible < 0.02) return null;
  // Eye irises
  const irisL: Pt[] = ellipse(P.eyeL[0], P.eyeL[1], P.eyeL[2], 0.018, 0.018, 14);
  const irisR: Pt[] = ellipse(P.eyeR[0], P.eyeR[1], P.eyeR[2], 0.018, 0.018, 14);

  // Brain hemispheres inside skull
  const skullCenter = [0, 1.85, 0.0] as const;
  const brainL: Pt[] = [];
  const brainR: Pt[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = -Math.PI / 2 + (i / 24) * Math.PI;
    const r = 0.12 + Math.sin(a * 3) * 0.012;
    brainL.push([skullCenter[0] - 0.005 - Math.cos(a) * r, skullCenter[1] + Math.sin(a) * r, 0.1]);
    brainR.push([skullCenter[0] + 0.005 + Math.cos(a) * r, skullCenter[1] + Math.sin(a) * r, 0.1]);
  }

  // Synapse network — random small connections inside skull
  const synapses: Pt[][] = [
    [[-0.06, 1.92, 0.12], [0.04, 1.88, 0.1]],
    [[0.05, 1.94, 0.12], [-0.04, 1.84, 0.1]],
    [[-0.08, 1.85, 0.14], [0.07, 1.83, 0.12]],
    [[0, 1.95, 0.1], [-0.06, 1.82, 0.12]],
    [[0, 1.95, 0.1], [0.06, 1.82, 0.12]],
  ];

  return (
    <group>
      <Line points={irisL} color={color} lineWidth={2} transparent opacity={visible} />
      <Line points={irisR} color={color} lineWidth={2} transparent opacity={visible} />
      <Line points={brainL} color={color} lineWidth={1.2} transparent opacity={visible * 0.7} />
      <Line points={brainR} color={color} lineWidth={1.2} transparent opacity={visible * 0.7} />
      {/* Hemisphere divider */}
      <Line points={[[0, 1.95, 0.1], [0, 1.74, 0.12]]} color={color} lineWidth={0.8} transparent opacity={visible * 0.5} />
      {synapses.map((s, i) => (
        <Line key={i} points={s} color={color} lineWidth={1} transparent opacity={visible * 0.8} />
      ))}
      {/* Pupil glow points */}
      <mesh position={[P.eyeL[0], P.eyeL[1], P.eyeL[2] + 0.005]}>
        <sphereGeometry args={[0.012, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={visible} toneMapped={false} />
      </mesh>
      <mesh position={[P.eyeR[0], P.eyeR[1], P.eyeR[2] + 0.005]}>
        <sphereGeometry args={[0.012, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={visible} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ============================================================
 * Muscle detail — shown when STR focused
 * ============================================================ */
function MuscleDetails({ visible, color }: { visible: number; color: string }) {
  if (visible < 0.02) return null;

  // Pectoral V — neck base outward & down then back to sternum bottom
  const pecL: Pt[] = [P.neckB, [-0.18, 1.18, 0.06], [-0.22, 1.0, 0.06], P.sterB];
  const pecR: Pt[] = [P.neckB, [0.18, 1.18, 0.06], [0.22, 1.0, 0.06], P.sterB];

  // Bicep curve (left & right)
  const bicepL: Pt[] = [
    [P.shdL[0] + 0.02, P.shdL[1] - 0.04, 0.05],
    [-0.42, 1.18, 0.08],
    [P.elbL[0], P.elbL[1] + 0.02, 0.05],
  ];
  const bicepR: Pt[] = [
    [P.shdR[0] - 0.02, P.shdR[1] - 0.04, 0.05],
    [0.42, 1.18, 0.08],
    [P.elbR[0], P.elbR[1] + 0.02, 0.05],
  ];

  // Ab segments (3 horizontal lines)
  const abs: Pt[][] = [
    [[-0.10, 0.95, 0.06], [0.10, 0.95, 0.06]],
    [[-0.12, 0.85, 0.06], [0.12, 0.85, 0.06]],
    [[-0.10, 0.75, 0.06], [0.10, 0.75, 0.06]],
  ];
  // Vertical linea alba
  const linea: Pt[] = [[0, P.sterB[1], 0.07], [0, P.navel[1], 0.07]];

  // Quad lines on legs (front of thighs)
  const quadL: Pt[] = [[P.hipL[0] - 0.04, P.hipL[1] - 0.02, 0.06], [P.kneL[0] - 0.02, P.kneL[1] + 0.02, 0.06]];
  const quadR: Pt[] = [[P.hipR[0] + 0.04, P.hipR[1] - 0.02, 0.06], [P.kneR[0] + 0.02, P.kneR[1] + 0.02, 0.06]];

  // Calf curves
  const calfL: Pt[] = [[P.kneL[0] - 0.04, P.kneL[1] - 0.04, 0.04], [P.ankL[0] - 0.02, P.ankL[1] + 0.02, 0.04]];
  const calfR: Pt[] = [[P.kneR[0] + 0.04, P.kneR[1] - 0.04, 0.04], [P.ankR[0] + 0.02, P.ankR[1] + 0.02, 0.04]];

  return (
    <group>
      <Line points={pecL} color={color} lineWidth={1.5} transparent opacity={visible} />
      <Line points={pecR} color={color} lineWidth={1.5} transparent opacity={visible} />
      <Line points={bicepL} color={color} lineWidth={1.4} transparent opacity={visible} />
      <Line points={bicepR} color={color} lineWidth={1.4} transparent opacity={visible} />
      <Line points={linea} color={color} lineWidth={1.2} transparent opacity={visible * 0.85} />
      {abs.map((seg, i) => (
        <Line key={i} points={seg} color={color} lineWidth={1.2} transparent opacity={visible * 0.85} />
      ))}
      <Line points={quadL} color={color} lineWidth={1.4} transparent opacity={visible * 0.9} />
      <Line points={quadR} color={color} lineWidth={1.4} transparent opacity={visible * 0.9} />
      <Line points={calfL} color={color} lineWidth={1.2} transparent opacity={visible * 0.8} />
      <Line points={calfR} color={color} lineWidth={1.2} transparent opacity={visible * 0.8} />
    </group>
  );
}

/* ============================================================
 * Spine detail — shown when DIS focused
 * ============================================================ */
function SpineDetails({ visible, color }: { visible: number; color: string }) {
  if (visible < 0.02) return null;
  // Spine line from skull base to sacrum
  const spinePts: Pt[] = [];
  const vertCount = 18;
  for (let i = 0; i <= vertCount; i++) {
    const t = i / vertCount;
    const y = 1.45 - t * 0.85; // 1.45 → 0.60
    const z = -0.03 + Math.sin(t * Math.PI) * -0.05;
    spinePts.push([0, y, z]);
  }
  // Vertebra dots
  const verts: Pt[] = [];
  for (let i = 0; i < vertCount; i++) {
    const t = i / vertCount;
    const y = 1.42 - t * 0.82;
    const z = -0.04 + Math.sin(t * Math.PI) * -0.05;
    verts.push([0, y, z]);
  }
  // Posture line — vertical reference straight down from skull
  const plumb: Pt[] = [[0, 1.95, -0.05], [0, -0.45, -0.05]];
  // Pelvic basin (triangle)
  const pelvis: Pt[] = [[-0.22, 0.65, 0], [0.22, 0.65, 0], [0, 0.50, 0.05], [-0.22, 0.65, 0]];

  return (
    <group>
      <Line points={plumb} color={color} lineWidth={0.7} transparent opacity={visible * 0.4} dashed dashSize={0.04} gapSize={0.04} />
      <Line points={spinePts} color={color} lineWidth={2} transparent opacity={visible} />
      {verts.map((v, i) => (
        <mesh key={i} position={v as [number, number, number]}>
          <sphereGeometry args={[0.014, 8, 8]} />
          <meshBasicMaterial color={color} transparent opacity={visible * 0.9} toneMapped={false} />
        </mesh>
      ))}
      <Line points={pelvis} color={color} lineWidth={1.5} transparent opacity={visible * 0.9} />
    </group>
  );
}

/* ============================================================
 * Joint markers — small spheres at major joints, always visible
 * ============================================================ */
function Joints({ color, opacity }: { color: string; opacity: number }) {
  const joints: Pt[] = [P.shdL, P.shdR, P.elbL, P.elbR, P.wrsL, P.wrsR, P.hipL, P.hipR, P.kneL, P.kneR, P.ankL, P.ankR];
  return (
    <group>
      {joints.map((j, i) => (
        <mesh key={i} position={j as [number, number, number]}>
          <sphereGeometry args={[0.018, 10, 10]} />
          <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ============================================================
 * Particle aura — soft glow around figure
 * ============================================================ */
function Aura({ mode, count = 400 }: { mode: SceneMode; count?: number }) {
  const accent = mode === "idle" ? "#7dd3fc" : STAT_HEX[mode];
  return <Sparkles count={count} scale={[2, 3.5, 1.6]} size={1.6} speed={0.35} color={accent} opacity={0.55} position={[0, 0.7, 0]} />;
}

/* ============================================================
 * Hologram group with sway + pulse
 * ============================================================ */
function Hologram({ mode, pulseTrigger }: { mode: SceneMode; pulseTrigger: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const pulse = useRef(0);
  const lastPulse = useRef(pulseTrigger);

  // Determine how visible each detail layer should be (smoothly animated)
  const visibility = useRef({ face: 0, muscle: 0, spine: 0 });
  const targets = useMemo(() => {
    return {
      face: mode === "INT" ? 1 : 0,
      muscle: mode === "STR" ? 1 : 0,
      spine: mode === "DIS" ? 1 : 0,
    };
  }, [mode]);

  useFrame((state, delta) => {
    if (pulseTrigger !== lastPulse.current) {
      pulse.current = 1;
      lastPulse.current = pulseTrigger;
    }
    pulse.current = Math.max(0, pulse.current - delta * 1.6);

    // Smoothly animate layer visibility
    const lerpRate = Math.min(1, delta * 3);
    visibility.current.face = lerp(visibility.current.face, targets.face, lerpRate);
    visibility.current.muscle = lerp(visibility.current.muscle, targets.muscle, lerpRate);
    visibility.current.spine = lerp(visibility.current.spine, targets.spine, lerpRate);

    if (groupRef.current) {
      const t = state.clock.elapsedTime;
      groupRef.current.rotation.y = Math.sin(t * 0.3) * 0.06;
      groupRef.current.position.y = Math.sin(t * 0.5) * 0.02;
      const s = 1 + pulse.current * 0.04;
      groupRef.current.scale.setScalar(lerp(groupRef.current.scale.x, s, Math.min(1, delta * 8)));
    }
  });

  const accent = mode === "idle" ? BASE_COLOR : STAT_HEX[mode];
  // Base opacity dims slightly when a stat is active so detail layer pops
  const baseOpacity = mode === "idle" ? 0.9 : 0.55;

  return (
    <group ref={groupRef}>
      <BaseWireframe color={accent} opacity={baseOpacity} />
      <Joints color={accent} opacity={baseOpacity} />
      <FaceDetailsHolder vis={visibility} />
      <MuscleDetailsHolder vis={visibility} />
      <SpineDetailsHolder vis={visibility} />
    </group>
  );
}

/* Wrappers so visibility can be passed by ref (avoid re-renders) */
function FaceDetailsHolder({ vis }: { vis: { current: { face: number } } }) {
  const [v, setV] = useState(0);
  useFrame(() => {
    if (Math.abs(v - vis.current.face) > 0.02) setV(vis.current.face);
  });
  return <FaceDetails visible={v} color={STAT_HEX.INT} />;
}
function MuscleDetailsHolder({ vis }: { vis: { current: { muscle: number } } }) {
  const [v, setV] = useState(0);
  useFrame(() => {
    if (Math.abs(v - vis.current.muscle) > 0.02) setV(vis.current.muscle);
  });
  return <MuscleDetails visible={v} color={STAT_HEX.STR} />;
}
function SpineDetailsHolder({ vis }: { vis: { current: { spine: number } } }) {
  const [v, setV] = useState(0);
  useFrame(() => {
    if (Math.abs(v - vis.current.spine) > 0.02) setV(vis.current.spine);
  });
  return <SpineDetails visible={v} color={STAT_HEX.DIS} />;
}

/* ============================================================
 * Camera dolly
 * ============================================================ */
function CameraRig({ mode }: { mode: SceneMode }) {
  useFrame((state, delta) => {
    const target = CAMERA[mode];
    const cam = state.camera as THREE.PerspectiveCamera;
    cam.position.x = lerp(cam.position.x, target.pos[0], Math.min(1, delta * 1.4));
    cam.position.y = lerp(cam.position.y, target.pos[1], Math.min(1, delta * 1.4));
    cam.position.z = lerp(cam.position.z, target.pos[2], Math.min(1, delta * 1.4));
    cam.lookAt(target.look[0], target.look[1], target.look[2]);
    cam.fov = lerp(cam.fov, target.fov, Math.min(1, delta * 1.4));
    cam.updateProjectionMatrix();
  });
  return null;
}

/* ============================================================
 * Burst at active region
 * ============================================================ */
function Burst({ mode, burstStat, burstId }: { mode: SceneMode; burstStat: StatKind | null; burstId: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const t = useRef(0);
  const lastTrig = useRef(burstId);
  const anchor: [number, number, number] = useMemo(() => {
    const stat = burstStat ?? (mode !== "idle" ? mode : null);
    if (!stat) return [0, 1.0, 0];
    if (stat === "INT") return [0, 1.85, 0.1];
    if (stat === "STR") return [0, 1.15, 0.05];
    return [0, 1.0, 0];
  }, [burstStat, mode]);
  const color = burstStat ? STAT_HEX[burstStat] : mode !== "idle" ? STAT_HEX[mode] : "#60a5fa";

  useFrame((_, delta) => {
    if (burstId !== lastTrig.current) {
      t.current = 1;
      lastTrig.current = burstId;
    }
    t.current = Math.max(0, t.current - delta * 1.4);
    if (!groupRef.current) return;
    groupRef.current.children.forEach((child, i) => {
      const angle = (i / 14) * Math.PI * 2;
      const dist = (1 - t.current) * 0.7;
      child.position.x = anchor[0] + Math.cos(angle) * dist;
      child.position.y = anchor[1] + Math.sin(angle) * dist;
      child.position.z = anchor[2] + (Math.cos(angle * 2) - 0.5) * dist * 0.4;
      const m = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      if (m) m.opacity = t.current;
    });
  });

  return (
    <group ref={groupRef}>
      {Array.from({ length: 14 }).map((_, i) => (
        <mesh key={i} scale={0.04}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ============================================================
 * Scene wrapper
 * ============================================================ */
export function HeroScene({
  mode,
  burstStat,
  burstId,
  pulseTrigger,
  streak,
}: {
  mode: SceneMode;
  hoveredStat: StatKind | null;
  stats: Record<StatKind, number>;
  burstStat: StatKind | null;
  burstId: number;
  pulseTrigger: number;
  xpRatio: number;
  streak: number;
}) {
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    try {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2") || c.getContext("webgl");
      setSupported(!!gl);
    } catch {
      setSupported(false);
    }
  }, []);
  if (!supported) return null;

  const accent = mode === "idle" ? BASE_COLOR : STAT_HEX[mode];
  const sparkleCount = Math.min(220, 80 + streak * 2);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <Canvas camera={{ position: [0, 0.6, 3.6], fov: 40 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <color attach="background" args={["#020617"]} />
        <fog attach="fog" args={["#020617", 5, 14]} />

        <ambientLight intensity={0.6} />

        <Suspense fallback={null}>
          <Hologram mode={mode} pulseTrigger={pulseTrigger} />
          <Burst mode={mode} burstStat={burstStat} burstId={burstId} />
          <CameraRig mode={mode} />
          <Aura mode={mode} count={sparkleCount} />
          <Stars radius={60} depth={26} count={1800} factor={3.5} fade speed={0.6} />
        </Suspense>
      </Canvas>

      {/* Vignette */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 75% 65% at 50% 50%, transparent 0%, rgba(2,6,23,0.5) 70%, rgba(2,6,23,0.92) 100%)",
        }}
      />

      <div className="absolute left-4 bottom-4 flex items-center gap-1.5 rounded-full bg-slate-950/60 px-2.5 py-1 backdrop-blur">
        <span className="block h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: accent }} />
        <span className="font-mono text-[9px] tracking-[0.3em] uppercase text-slate-300">HOLOGRAM · LIVE</span>
      </div>
    </div>
  );
}
