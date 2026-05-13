"use client";

import { Suspense, useState, useEffect, useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sparkles, Stars } from "@react-three/drei";
import * as THREE from "three";
import type { StatKind } from "@/lib/types";

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

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <Canvas camera={{ position: [0, 0, 5], fov: 50 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <color attach="background" args={["#020617"]} />
        <fog attach="fog" args={["#020617", 4, 18]} />

        <ambientLight intensity={0.5} />

        <Suspense fallback={null}>
          <AmbientOrb mode={mode} pulseTrigger={pulseTrigger} />
          <Burst mode={mode} burstStat={burstStat} burstId={burstId} />
          <Sparkles count={sparkleCount} scale={[18, 12, 14]} size={2.6} speed={0.36} color={accent} opacity={0.55} />
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
