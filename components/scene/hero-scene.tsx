"use client";

import { Suspense, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Sparkles, Stars } from "@react-three/drei";
import * as THREE from "three";
import type { StatKind } from "@/lib/types";

export type SceneMode = "idle" | StatKind;

/**
 * Atmospheric 3D background. NO humanoid figure — primitive-built humans
 * never look right. The figure is now rendered as detailed SVG anatomy
 * (see `components/anatomy-figure.tsx`). This file is just stars,
 * sparkles, and a colored ambient orb that shifts hue per active stat.
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
    pulse.current = Math.max(0, pulse.current - delta * 1.4);

    if (ref.current) {
      ref.current.rotation.y += delta * 0.08;
      ref.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.3) * 0.2;
      const s = 2.4 + pulse.current * 0.6;
      ref.current.scale.setScalar(s);
    }
    if (matRef.current) {
      const c = new THREE.Color(targetColor);
      matRef.current.color.lerp(c, Math.min(1, delta * 1.8));
      matRef.current.opacity = 0.12 + pulse.current * 0.15;
    }
  });

  return (
    <mesh ref={ref} position={[0, 0, -3]}>
      <sphereGeometry args={[1, 32, 32]} />
      <meshBasicMaterial ref={matRef} color={targetColor} transparent opacity={0.12} />
    </mesh>
  );
}

function Particles({ mode, streak }: { mode: SceneMode; streak: number }) {
  const color = mode === "idle" ? "#60a5fa" : STAT_COLOR[mode];
  const count = Math.min(220, 80 + streak * 3);
  return <Sparkles count={count} scale={[16, 10, 12]} size={2.4} speed={0.32} color={color} opacity={0.55} />;
}

export function HeroScene({
  mode,
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

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <Canvas camera={{ position: [0, 0, 5], fov: 50 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <color attach="background" args={["#020617"]} />
        <fog attach="fog" args={["#020617", 4, 18]} />

        <ambientLight intensity={0.4} />
        <pointLight position={[5, 5, 5]} intensity={1.4} color={accent} />
        <pointLight position={[-5, -5, -5]} intensity={0.7} color="#a855f7" />

        <Suspense fallback={null}>
          <AmbientOrb mode={mode} pulseTrigger={pulseTrigger} />
          <Particles mode={mode} streak={streak} />
          <Stars radius={60} depth={26} count={1800} factor={3.5} fade speed={0.6} />
        </Suspense>
      </Canvas>

      {/* Vignette so SVG figure sits on top with breathing room */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 50%, transparent 0%, rgba(2,6,23,0.4) 70%, rgba(2,6,23,0.9) 100%)",
        }}
      />

      <div className="absolute left-4 bottom-4 flex items-center gap-1.5 rounded-full bg-slate-950/60 px-2.5 py-1 backdrop-blur">
        <span className="block h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: accent }} />
        <span className="font-mono text-[9px] tracking-[0.3em] uppercase text-slate-300">LIVE</span>
      </div>
    </div>
  );
}
