"use client";

import { Suspense, useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { MeshDistortMaterial, Float, Environment, Sparkles, Stars } from "@react-three/drei";
import * as THREE from "three";
import type { StatKind } from "@/lib/types";

export type SceneMode = "idle" | StatKind;

/* ============================================================
 * Live data-driven 3D scene.
 *
 *   - Central icosahedron = the player (core). Its size scales with XP
 *     toward the next level. Its emissive intensity pulses on XP gain.
 *   - 5 satellites orbit the core, one per stat. Each is a distinct
 *     geometry colored by its stat. Their scale is driven by the stat
 *     value. The active stat's satellite is also enlarged and brought
 *     closer to camera.
 *   - On quest completion, a burst of particles erupts from that stat's
 *     satellite (driven by an incrementing `burstId` prop).
 *   - The camera smoothly orbits to focus on the active stat (or pulls
 *     back to a wide shot when mode is "idle").
 *   - Streak count drives ambient sparkle density.
 *
 * The scene is therefore a live readout of the user's state, not a
 * decorative loop.
 * ============================================================ */

type StatStyle = {
  color: string;
  emissive: string;
  ringColor: string;
  angle: number;            // radians around the y-axis at rest
};

const STATS: Record<StatKind, StatStyle> = {
  STR: { color: "#f43f5e", emissive: "#9f1239", ringColor: "#fb7185", angle: (Math.PI * 2 * 0) / 5 - Math.PI / 2 },
  VIT: { color: "#10b981", emissive: "#065f46", ringColor: "#34d399", angle: (Math.PI * 2 * 1) / 5 - Math.PI / 2 },
  AGI: { color: "#f59e0b", emissive: "#92400e", ringColor: "#fbbf24", angle: (Math.PI * 2 * 2) / 5 - Math.PI / 2 },
  INT: { color: "#3b82f6", emissive: "#1e3a8a", ringColor: "#60a5fa", angle: (Math.PI * 2 * 3) / 5 - Math.PI / 2 },
  PER: { color: "#a855f7", emissive: "#6b21a8", ringColor: "#c084fc", angle: (Math.PI * 2 * 4) / 5 - Math.PI / 2 },
};

const ORBIT_RADIUS = 2.3;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/* ---------- Core ---------- */
function Core({
  xpRatio,
  pulseTrigger,
}: {
  xpRatio: number; // 0..1 (progress to next level)
  pulseTrigger: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<any>(null);
  const pulse = useRef(0);
  const lastTrig = useRef(pulseTrigger);

  useFrame((state, delta) => {
    if (pulseTrigger !== lastTrig.current) {
      pulse.current = 1;
      lastTrig.current = pulseTrigger;
    }
    pulse.current = Math.max(0, pulse.current - delta * 2);

    if (meshRef.current) {
      const target = 0.85 + xpRatio * 0.35 + pulse.current * 0.35;
      meshRef.current.scale.setScalar(lerp(meshRef.current.scale.x, target, Math.min(1, delta * 6)));
      meshRef.current.rotation.y += delta * 0.2;
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.4) * 0.15;
    }
    if (matRef.current) {
      matRef.current.emissiveIntensity = 0.6 + pulse.current * 1.6;
      matRef.current.distort = 0.32 + pulse.current * 0.3;
    }
  });

  return (
    <Float speed={1} rotationIntensity={0.3} floatIntensity={0.4}>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[1, 8]} />
        <MeshDistortMaterial
          ref={matRef}
          color="#1e3a8a"
          emissive="#3b82f6"
          emissiveIntensity={0.6}
          roughness={0.18}
          metalness={0.6}
          distort={0.32}
          speed={1.6}
        />
      </mesh>
    </Float>
  );
}

/* ---------- A single stat satellite ---------- */
function Satellite({
  stat,
  value,        // 1..60+ approx
  active,       // currently focused
  hovered,      // hovered via UI
  burstId,      // increments to trigger burst
}: {
  stat: StatKind;
  value: number;
  active: boolean;
  hovered: boolean;
  burstId: number;
}) {
  const style = STATS[stat];
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const burstGroup = useRef<THREE.Group>(null);
  const burstTime = useRef(0);
  const lastTrig = useRef(burstId);

  useFrame((state, delta) => {
    // Orbit position
    const t = state.clock.elapsedTime * 0.12 + style.angle;
    if (group.current) {
      const r = ORBIT_RADIUS + (active ? -0.4 : 0);
      group.current.position.x = Math.cos(t) * r;
      group.current.position.z = Math.sin(t) * r;
      group.current.position.y = Math.sin(state.clock.elapsedTime * 0.6 + style.angle) * 0.15;
    }
    if (mesh.current) {
      mesh.current.rotation.x += delta * (active ? 1.5 : 0.6);
      mesh.current.rotation.y += delta * (active ? 1.2 : 0.4);
      const sBase = 0.16 + (value / 60) * 0.18;
      const sTarget = sBase * (active ? 1.6 : hovered ? 1.3 : 1);
      mesh.current.scale.setScalar(lerp(mesh.current.scale.x, sTarget, Math.min(1, delta * 6)));
    }
    if (ring.current) {
      ring.current.rotation.z += delta * 0.6;
      const mat = ring.current.material as THREE.MeshBasicMaterial;
      mat.opacity = lerp(mat.opacity ?? 0, active ? 0.7 : hovered ? 0.5 : 0.25, Math.min(1, delta * 6));
    }

    // Burst
    if (burstId !== lastTrig.current) {
      burstTime.current = 1;
      lastTrig.current = burstId;
    }
    burstTime.current = Math.max(0, burstTime.current - delta * 1.4);
    if (burstGroup.current) {
      const op = burstTime.current;
      burstGroup.current.children.forEach((c, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const dist = (1 - burstTime.current) * 0.9;
        c.position.x = Math.cos(angle) * dist;
        c.position.y = Math.sin(angle) * dist;
        c.position.z = (Math.cos(angle * 2) - 0.5) * dist * 0.5;
        const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
        if (m) m.opacity = op;
      });
    }
  });

  // Pick geometry per stat
  const geometry = useMemo(() => {
    switch (stat) {
      case "STR":
        return <boxGeometry args={[1, 1, 1]} />;
      case "VIT":
        return <torusKnotGeometry args={[0.7, 0.22, 80, 14]} />;
      case "AGI":
        return <tetrahedronGeometry args={[1, 0]} />;
      case "INT":
        return <octahedronGeometry args={[1, 0]} />;
      case "PER":
        return <torusGeometry args={[0.8, 0.18, 16, 64]} />;
    }
  }, [stat]);

  return (
    <group ref={group}>
      {/* Halo ring around satellite */}
      <mesh ref={ring}>
        <ringGeometry args={[0.35, 0.42, 32]} />
        <meshBasicMaterial
          color={style.ringColor}
          transparent
          opacity={0.25}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Satellite mesh */}
      <mesh ref={mesh}>
        {geometry}
        <meshStandardMaterial
          color={style.color}
          emissive={style.emissive}
          emissiveIntensity={active ? 1.6 : hovered ? 1.2 : 0.7}
          roughness={0.3}
          metalness={0.6}
          toneMapped={false}
        />
      </mesh>

      {/* Burst particles */}
      <group ref={burstGroup}>
        {Array.from({ length: 12 }).map((_, i) => (
          <mesh key={i} scale={0.06}>
            <sphereGeometry args={[1, 8, 8]} />
            <meshBasicMaterial
              color={style.ringColor}
              transparent
              opacity={0}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/* ---------- Energy stream from a focused satellite to the core ---------- */
function ActiveBeam({ mode }: { mode: SceneMode }) {
  const ref = useRef<THREE.Mesh>(null);
  const targetOpacity = mode === "idle" ? 0 : 0.5;
  useFrame((state, delta) => {
    if (!ref.current) return;
    const mat = ref.current.material as THREE.MeshBasicMaterial;
    mat.opacity = lerp(mat.opacity ?? 0, targetOpacity, Math.min(1, delta * 4));
    if (mode !== "idle") {
      const a = STATS[mode].angle + state.clock.elapsedTime * 0.12;
      const x = Math.cos(a) * ORBIT_RADIUS;
      const z = Math.sin(a) * ORBIT_RADIUS;
      ref.current.position.set(x / 2, 0, z / 2);
      ref.current.lookAt(0, 0, 0);
      ref.current.rotateX(Math.PI / 2);
      ref.current.scale.set(0.04, Math.sqrt(x * x + z * z), 0.04);
      const color = new THREE.Color(STATS[mode].ringColor);
      mat.color = color;
    }
  });
  return (
    <mesh ref={ref}>
      <cylinderGeometry args={[1, 1, 1, 8, 1]} />
      <meshBasicMaterial color="#60a5fa" transparent opacity={0} toneMapped={false} />
    </mesh>
  );
}

/* ---------- Camera dolly ---------- */
function CameraRig({ mode }: { mode: SceneMode }) {
  useFrame((state, delta) => {
    let tx = 0, ty = 0.4, tz = 5.5;
    if (mode !== "idle") {
      const a = STATS[mode].angle + state.clock.elapsedTime * 0.12;
      tx = Math.cos(a) * 2.2;
      tz = 4.2 + Math.sin(a) * 0.4;
      ty = 0.5;
    }
    state.camera.position.x = lerp(state.camera.position.x, tx, Math.min(1, delta * 1.8));
    state.camera.position.y = lerp(state.camera.position.y, ty, Math.min(1, delta * 1.8));
    state.camera.position.z = lerp(state.camera.position.z, tz, Math.min(1, delta * 1.8));
    state.camera.lookAt(0, 0, 0);
  });
  return null;
}

/* ---------- Scene wrapper — full-bleed background ---------- */
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
  xpRatio: number; // 0..1
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

  const accent = mode === "idle" ? "#60a5fa" : STATS[mode].ringColor;
  const sparkleCount = Math.min(180, 40 + streak * 2);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <Canvas camera={{ position: [0, 0.4, 5.5], fov: 45 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <color attach="background" args={["#020617"]} />
        <fog attach="fog" args={["#020617", 7, 16]} />

        <ambientLight intensity={0.4} />
        <pointLight position={[5, 5, 5]} intensity={1.8} color={accent} />
        <pointLight position={[-5, -5, -5]} intensity={0.8} color="#a855f7" />
        <directionalLight position={[0, 5, 2]} intensity={0.5} />

        <Suspense fallback={null}>
          <Core xpRatio={xpRatio} pulseTrigger={pulseTrigger} />

          {(Object.keys(STATS) as StatKind[]).map((s) => (
            <Satellite
              key={s}
              stat={s}
              value={stats[s]}
              active={mode === s}
              hovered={hoveredStat === s}
              burstId={burstStat === s ? burstId : 0}
            />
          ))}

          <ActiveBeam mode={mode} />
          <CameraRig mode={mode} />

          <Sparkles count={sparkleCount} scale={[14, 8, 10]} size={2.2} speed={0.32} color={accent} opacity={0.5} />
          <Stars radius={60} depth={26} count={1600} factor={3.5} fade speed={0.6} />
          <Environment preset="night" />
        </Suspense>
      </Canvas>

      {/* Subtle vignette so content stays legible at the edges */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, transparent 0%, rgba(2,6,23,0.55) 75%, rgba(2,6,23,0.9) 100%)",
        }}
      />

      {/* Live status corner */}
      <div className="absolute left-4 bottom-4 flex items-center gap-1.5 rounded-full bg-slate-950/60 px-2.5 py-1 backdrop-blur">
        <span className="block h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: accent }} />
        <span className="font-mono text-[9px] tracking-[0.3em] uppercase text-slate-300">LIVE · WebGL</span>
      </div>
    </div>
  );
}

function Bracket({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const pmap = {
    tl: "left-3 top-3 border-l-2 border-t-2",
    tr: "right-3 top-3 border-r-2 border-t-2",
    bl: "left-3 bottom-3 border-l-2 border-b-2",
    br: "right-3 bottom-3 border-r-2 border-b-2",
  };
  return <div className={`pointer-events-none absolute ${pmap[pos]} h-5 w-5 border-white/15`} />;
}
