"use client";

import { Suspense, useRef, useState, useEffect, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Sparkles, Stars, Edges } from "@react-three/drei";
import * as THREE from "three";
import type { StatKind } from "@/lib/types";

export type SceneMode = "idle" | StatKind;

/* ============================================================
 * <HeroScene /> — full-bleed live 3D background.
 *
 * Renders a stylized holographic humanoid figure floating in space.
 * The camera flies between body parts based on `mode`:
 *
 *   idle → wide shot of the full figure
 *   INT  → camera focuses on the head (brain)
 *   PER  → ultra-close zoom on the face/eyes
 *   VIT  → mid-shot on chest/heart
 *   STR  → broader shot on chest + arms
 *   AGI  → focus on the legs
 *
 * The active body region's mesh receives an emissive override in the
 * stat color. Burst particles fire from that region on `burstId` change.
 * The whole figure briefly scales on `pulseTrigger`.
 * ============================================================ */

const STAT_PARTS: Record<StatKind, string[]> = {
  STR: ["torso", "l_upperarm", "r_upperarm"],
  VIT: ["torso"],
  AGI: ["l_thigh", "r_thigh", "l_shin", "r_shin", "l_foot", "r_foot"],
  INT: ["head"],
  PER: ["head"],
};

const STAT_HEX: Record<StatKind, string> = {
  STR: "#f43f5e",
  VIT: "#10b981",
  AGI: "#f59e0b",
  INT: "#3b82f6",
  PER: "#a855f7",
};

const STAT_GLOW: Record<StatKind, string> = {
  STR: "#fb7185",
  VIT: "#34d399",
  AGI: "#fbbf24",
  INT: "#60a5fa",
  PER: "#c084fc",
};

const BURST_ANCHOR: Record<StatKind, [number, number, number]> = {
  STR: [0, 0.7, 0],     // chest
  VIT: [0, 0.85, 0],    // heart
  AGI: [0, -1.0, 0],    // legs midpoint
  INT: [0, 1.55, 0],    // head
  PER: [0, 1.55, 0],    // face
};

const CAMERA: Record<SceneMode, { pos: [number, number, number]; look: [number, number, number]; fov: number }> = {
  idle: { pos: [0, 0.3, 4.5], look: [0, 0.3, 0], fov: 38 },
  INT:  { pos: [0.2, 1.55, 1.4], look: [0, 1.55, 0], fov: 30 },
  PER:  { pos: [0, 1.55, 0.85], look: [0, 1.55, 0], fov: 26 },
  VIT:  { pos: [0, 0.85, 1.3], look: [0, 0.85, 0], fov: 32 },
  STR:  { pos: [0, 0.7, 1.8], look: [0, 0.6, 0], fov: 38 },
  AGI:  { pos: [0.4, -1.0, 1.6], look: [0, -1.0, 0], fov: 38 },
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/* ---------- Single body part mesh ---------- */
function Part({
  name,
  geometry,
  position,
  rotation,
  active,
  pulseStat,
}: {
  name: string;
  geometry: React.ReactElement;
  position: [number, number, number];
  rotation?: [number, number, number];
  active: SceneMode;
  pulseStat: StatKind | null;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);

  // Determine if this part is highlighted
  const highlightStat: StatKind | null = useMemo(() => {
    if (active === "idle") return null;
    return (STAT_PARTS[active] as string[]).includes(name) ? (active as StatKind) : null;
  }, [active, name]);

  // Pulse (e.g., VIT heartbeat-like)
  useFrame((state) => {
    if (!matRef.current) return;
    const baseColor = "#1e293b";
    const baseEmissive = "#0f172a";
    if (highlightStat) {
      matRef.current.emissive.set(STAT_HEX[highlightStat]);
      const beat = highlightStat === "VIT" ? 0.4 + Math.sin(state.clock.elapsedTime * 4) * 0.4 : 0;
      matRef.current.emissiveIntensity = lerp(matRef.current.emissiveIntensity, 1.5 + beat, 0.12);
      matRef.current.color.set(STAT_HEX[highlightStat]);
    } else {
      matRef.current.emissive.set(baseEmissive);
      matRef.current.emissiveIntensity = lerp(matRef.current.emissiveIntensity, 0.25, 0.12);
      matRef.current.color.set(baseColor);
    }
  });

  return (
    <mesh ref={meshRef} name={name} position={position} rotation={rotation}>
      {geometry}
      <meshStandardMaterial
        ref={matRef}
        color="#1e293b"
        emissive="#0f172a"
        emissiveIntensity={0.25}
        roughness={0.4}
        metalness={0.7}
        transparent
        opacity={0.88}
      />
      <Edges color={highlightStat ? STAT_GLOW[highlightStat] : "#60a5fa"} lineWidth={1} threshold={20} />
    </mesh>
  );
}

/* ---------- Humanoid figure ---------- */
function Humanoid({ mode, pulseTrigger }: { mode: SceneMode; pulseTrigger: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const pulse = useRef(0);
  const lastPulse = useRef(pulseTrigger);

  useFrame((state, delta) => {
    if (pulseTrigger !== lastPulse.current) {
      pulse.current = 1;
      lastPulse.current = pulseTrigger;
    }
    pulse.current = Math.max(0, pulse.current - delta * 2);

    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.rotation.y = Math.sin(t * 0.4) * 0.06;
    groupRef.current.position.y = Math.sin(t * 0.6) * 0.04;
    const targetScale = 1 + pulse.current * 0.06;
    groupRef.current.scale.setScalar(lerp(groupRef.current.scale.x, targetScale, Math.min(1, delta * 8)));
  });

  return (
    <group ref={groupRef}>
      {/* Head */}
      <Part name="head" geometry={<sphereGeometry args={[0.32, 24, 24]} />} position={[0, 1.55, 0]} active={mode} pulseStat={null} />
      {/* Neck */}
      <Part name="neck" geometry={<cylinderGeometry args={[0.12, 0.12, 0.18, 12]} />} position={[0, 1.15, 0]} active={mode} pulseStat={null} />

      {/* Torso */}
      <Part name="torso" geometry={<boxGeometry args={[0.95, 1.0, 0.45]} />} position={[0, 0.55, 0]} active={mode} pulseStat={null} />
      {/* Hips */}
      <Part name="hips" geometry={<boxGeometry args={[0.75, 0.2, 0.42]} />} position={[0, -0.05, 0]} active={mode} pulseStat={null} />

      {/* Shoulders (decorative) */}
      <Part name="l_shoulder" geometry={<sphereGeometry args={[0.15, 16, 16]} />} position={[-0.55, 0.95, 0]} active={mode} pulseStat={null} />
      <Part name="r_shoulder" geometry={<sphereGeometry args={[0.15, 16, 16]} />} position={[0.55, 0.95, 0]} active={mode} pulseStat={null} />

      {/* Upper arms */}
      <Part name="l_upperarm" geometry={<cylinderGeometry args={[0.13, 0.13, 0.55, 12]} />} position={[-0.6, 0.55, 0]} rotation={[0, 0, 0.08]} active={mode} pulseStat={null} />
      <Part name="r_upperarm" geometry={<cylinderGeometry args={[0.13, 0.13, 0.55, 12]} />} position={[0.6, 0.55, 0]} rotation={[0, 0, -0.08]} active={mode} pulseStat={null} />

      {/* Forearms */}
      <Part name="l_forearm" geometry={<cylinderGeometry args={[0.11, 0.11, 0.55, 12]} />} position={[-0.6, -0.05, 0]} active={mode} pulseStat={null} />
      <Part name="r_forearm" geometry={<cylinderGeometry args={[0.11, 0.11, 0.55, 12]} />} position={[0.6, -0.05, 0]} active={mode} pulseStat={null} />

      {/* Hands */}
      <Part name="l_hand" geometry={<sphereGeometry args={[0.13, 16, 16]} />} position={[-0.6, -0.4, 0]} active={mode} pulseStat={null} />
      <Part name="r_hand" geometry={<sphereGeometry args={[0.13, 16, 16]} />} position={[0.6, -0.4, 0]} active={mode} pulseStat={null} />

      {/* Hip joints */}
      <Part name="l_hip" geometry={<sphereGeometry args={[0.16, 16, 16]} />} position={[-0.2, -0.15, 0]} active={mode} pulseStat={null} />
      <Part name="r_hip" geometry={<sphereGeometry args={[0.16, 16, 16]} />} position={[0.2, -0.15, 0]} active={mode} pulseStat={null} />

      {/* Thighs */}
      <Part name="l_thigh" geometry={<cylinderGeometry args={[0.18, 0.18, 0.7, 12]} />} position={[-0.2, -0.6, 0]} active={mode} pulseStat={null} />
      <Part name="r_thigh" geometry={<cylinderGeometry args={[0.18, 0.18, 0.7, 12]} />} position={[0.2, -0.6, 0]} active={mode} pulseStat={null} />

      {/* Knees */}
      <Part name="l_knee" geometry={<sphereGeometry args={[0.14, 16, 16]} />} position={[-0.2, -1.0, 0]} active={mode} pulseStat={null} />
      <Part name="r_knee" geometry={<sphereGeometry args={[0.14, 16, 16]} />} position={[0.2, -1.0, 0]} active={mode} pulseStat={null} />

      {/* Shins */}
      <Part name="l_shin" geometry={<cylinderGeometry args={[0.15, 0.15, 0.7, 12]} />} position={[-0.2, -1.4, 0]} active={mode} pulseStat={null} />
      <Part name="r_shin" geometry={<cylinderGeometry args={[0.15, 0.15, 0.7, 12]} />} position={[0.2, -1.4, 0]} active={mode} pulseStat={null} />

      {/* Feet */}
      <Part name="l_foot" geometry={<boxGeometry args={[0.2, 0.12, 0.3]} />} position={[-0.2, -1.85, 0.08]} active={mode} pulseStat={null} />
      <Part name="r_foot" geometry={<boxGeometry args={[0.2, 0.12, 0.3]} />} position={[0.2, -1.85, 0.08]} active={mode} pulseStat={null} />
    </group>
  );
}

/* ---------- Burst particles at active body region ---------- */
function Burst({ mode, burstStat, burstId }: { mode: SceneMode; burstStat: StatKind | null; burstId: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const t = useRef(0);
  const lastTrig = useRef(burstId);
  const anchor = burstStat ? BURST_ANCHOR[burstStat] : (mode !== "idle" ? BURST_ANCHOR[mode] : [0, 0, 0]);
  const color = burstStat ? STAT_GLOW[burstStat] : (mode !== "idle" ? STAT_GLOW[mode] : "#60a5fa");

  useFrame((_, delta) => {
    if (burstId !== lastTrig.current) {
      t.current = 1;
      lastTrig.current = burstId;
    }
    t.current = Math.max(0, t.current - delta * 1.4);

    if (!groupRef.current) return;
    groupRef.current.children.forEach((child, i) => {
      const angle = (i / 12) * Math.PI * 2;
      const dist = (1 - t.current) * 0.9;
      child.position.x = anchor[0] + Math.cos(angle) * dist;
      child.position.y = anchor[1] + Math.sin(angle) * dist;
      child.position.z = anchor[2] + (Math.cos(angle * 2) - 0.5) * dist * 0.4;
      const m = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      if (m) m.opacity = t.current;
    });
  });

  return (
    <group ref={groupRef}>
      {Array.from({ length: 12 }).map((_, i) => (
        <mesh key={i} scale={0.06}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ---------- Camera rig ---------- */
function CameraRig({ mode }: { mode: SceneMode }) {
  useFrame((state, delta) => {
    const target = CAMERA[mode];
    const cam = state.camera as THREE.PerspectiveCamera;
    cam.position.x = lerp(cam.position.x, target.pos[0], Math.min(1, delta * 1.6));
    cam.position.y = lerp(cam.position.y, target.pos[1], Math.min(1, delta * 1.6));
    cam.position.z = lerp(cam.position.z, target.pos[2], Math.min(1, delta * 1.6));
    cam.lookAt(target.look[0], target.look[1], target.look[2]);
    cam.fov = lerp(cam.fov, target.fov, Math.min(1, delta * 1.6));
    cam.updateProjectionMatrix();
  });
  return null;
}

/* ---------- Scene wrapper ---------- */
export function HeroScene({
  mode,
  hoveredStat,
  stats,
  burstStat,
  burstId,
  pulseTrigger,
  xpRatio,
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

  // Hovered stat acts as a soft preview of focus (without moving camera)
  const accent = mode === "idle" ? "#60a5fa" : STAT_GLOW[mode];
  const sparkleCount = Math.min(180, 40 + streak * 2);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <Canvas camera={{ position: [0, 0.3, 4.5], fov: 38 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <color attach="background" args={["#020617"]} />
        <fog attach="fog" args={["#020617", 7, 16]} />

        <ambientLight intensity={0.4} />
        <pointLight position={[5, 5, 5]} intensity={1.8} color={accent} />
        <pointLight position={[-5, -5, -5]} intensity={0.8} color="#a855f7" />
        <directionalLight position={[0, 5, 2]} intensity={0.5} />

        <Suspense fallback={null}>
          <Humanoid mode={mode} pulseTrigger={pulseTrigger} />
          <Burst mode={mode} burstStat={burstStat} burstId={burstId} />
          <CameraRig mode={mode} />

          <Sparkles count={sparkleCount} scale={[14, 8, 10]} size={2.2} speed={0.32} color={accent} opacity={0.5} />
          <Stars radius={60} depth={26} count={1600} factor={3.5} fade speed={0.6} />
          <Environment preset="night" />
        </Suspense>
      </Canvas>

      {/* Vignette — keep content legible at the edges */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 65% 55% at 50% 50%, transparent 0%, rgba(2,6,23,0.55) 70%, rgba(2,6,23,0.92) 100%)",
        }}
      />

      {/* LIVE chip */}
      <div className="absolute left-4 bottom-4 flex items-center gap-1.5 rounded-full bg-slate-950/60 px-2.5 py-1 backdrop-blur">
        <span className="block h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: accent }} />
        <span className="font-mono text-[9px] tracking-[0.3em] uppercase text-slate-300">LIVE · WebGL</span>
      </div>
    </div>
  );
}
