"use client";

import { Suspense, useState, useEffect, useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sparkles, Stars } from "@react-three/drei";
import * as THREE from "three";
import type { StatKind } from "@/lib/types";
import { Mannequin } from "./mannequin";

export type SceneMode = "idle" | StatKind;

/**
 * Atmospheric 3D background only — stars, sparkles, ambient glow orb.
 * The actual figure is rendered as animated SVG (components/figures/task-figures.tsx)
 * on a higher z-index layer.
 */

const STAT_COLOR: Record<StatKind, string> = {
  INT: "#60a5fa",
  STR: "#fb7185",
  DIS: "#c084fc",
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function CameraRig({ target }: { target: { pos: [number, number, number]; look: [number, number, number]; fov: number } }) {
  useFrame((state, delta) => {
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

function AmbientOrb({ mode, pulseTrigger }: { mode: SceneMode; pulseTrigger: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const pulse = useRef(0);
  const lastPulse = useRef(pulseTrigger);
  const targetColor = mode === "idle" ? "#3b82f6" : STAT_COLOR[mode];

  useFrame((state, delta) => {
    if (pulseTrigger !== lastPulse.current) {
      pulse.current = 1;
      lastPulse.current = pulseTrigger;
    }
    pulse.current = Math.max(0, pulse.current - delta * 1.6);

    if (ref.current) {
      ref.current.rotation.y += delta * 0.06;
      ref.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.25) * 0.15;
      const s = 2.8 + pulse.current * 0.6;
      ref.current.scale.setScalar(s);
    }
    if (matRef.current) {
      const c = new THREE.Color(targetColor);
      matRef.current.color.lerp(c, Math.min(1, delta * 1.8));
      matRef.current.opacity = 0.1 + pulse.current * 0.18;
    }
  });

  return (
    <mesh ref={ref} position={[0, 0, -3.5]}>
      <sphereGeometry args={[1, 32, 32]} />
      <meshBasicMaterial ref={matRef} color={targetColor} transparent opacity={0.1} />
    </mesh>
  );
}

/* ---------- Burst at active region ---------- */
function Burst({ mode, burstStat, burstId }: { mode: SceneMode; burstStat: StatKind | null; burstId: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const t = useRef(0);
  const lastTrig = useRef(burstId);
  const color = burstStat ? STAT_COLOR[burstStat] : mode !== "idle" ? STAT_COLOR[mode] : "#60a5fa";

  useFrame((_, delta) => {
    if (burstId !== lastTrig.current) {
      t.current = 1;
      lastTrig.current = burstId;
    }
    t.current = Math.max(0, t.current - delta * 1.4);
    if (!groupRef.current) return;
    groupRef.current.children.forEach((child, i) => {
      const angle = (i / 14) * Math.PI * 2;
      const dist = (1 - t.current) * 1.0;
      child.position.x = Math.cos(angle) * dist;
      child.position.y = 0.5 + Math.sin(angle) * dist;
      child.position.z = (Math.cos(angle * 2) - 0.5) * dist * 0.4;
      const m = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      if (m) m.opacity = t.current;
    });
  });

  return (
    <group ref={groupRef}>
      {Array.from({ length: 14 }).map((_, i) => (
        <mesh key={i} scale={0.05}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

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

  const accent = mode === "idle" ? "#60a5fa" : STAT_COLOR[mode];
  const sparkleCount = Math.min(260, 100 + streak * 3);

  // Camera framing per mode — frames the mannequin properly even when it goes horizontal
  const CAM: Record<SceneMode, { pos: [number, number, number]; look: [number, number, number]; fov: number }> = {
    idle: { pos: [0, 0.3, 3.4], look: [0, 0.3, 0], fov: 42 },
    INT:  { pos: [0, 0.2, 2.6], look: [0, 0.2, 0], fov: 40 },
    STR:  { pos: [0, 0.4, 2.5], look: [0, -0.2, 0], fov: 50 }, // wider + look slightly down so the plank fits
    DIS:  { pos: [0, 0.2, 2.6], look: [0, 0.0, 0], fov: 44 },
  };
  const cam = CAM[mode];

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <Canvas camera={{ position: cam.pos, fov: cam.fov }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <color attach="background" args={["#020617"]} />
        <fog attach="fog" args={["#020617", 4, 18]} />

        <ambientLight intensity={0.5} />
        <pointLight position={[2, 3, 3]} intensity={1.4} color={accent} />
        <pointLight position={[-2, 2, 1]} intensity={0.7} color="#a855f7" />
        <pointLight position={[0, 2, -3]} intensity={1.2} color={accent} />

        <Suspense fallback={null}>
          <Mannequin mode={mode} pulseTrigger={pulseTrigger} />
          <AmbientOrb mode={mode} pulseTrigger={pulseTrigger} />
          <Burst mode={mode} burstStat={burstStat} burstId={burstId} />
          <CameraRig target={cam} />
          <Sparkles count={sparkleCount} scale={[6, 5, 5]} size={1.8} speed={0.35} color={accent} opacity={0.55} position={[0, 0.4, 0]} />
          <Stars radius={70} depth={30} count={2200} factor={3.5} fade speed={0.6} />
        </Suspense>
      </Canvas>

      {/* Vignette */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 75% 65% at 50% 50%, transparent 0%, rgba(2,6,23,0.45) 70%, rgba(2,6,23,0.9) 100%)",
        }}
      />

      <div className="absolute left-4 bottom-4 flex items-center gap-1.5 rounded-full bg-slate-950/60 px-2.5 py-1 backdrop-blur">
        <span className="block h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: accent }} />
        <span className="font-mono text-[9px] tracking-[0.3em] uppercase text-slate-300">LIVE</span>
      </div>
    </div>
  );
}
