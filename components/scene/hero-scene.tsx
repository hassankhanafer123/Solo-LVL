"use client";

import { Suspense, useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { MeshDistortMaterial, Float, Environment, Sparkles, Stars } from "@react-three/drei";
import * as THREE from "three";
import type { StatKind } from "@/lib/types";

export type SceneMode = "idle" | StatKind;

/**
 * Real WebGL hero scene. A central deforming icosahedron, surrounded by
 * orbiting energy nodes, drifting sparkles, and a star field. The scene
 * morphs continuously between states — color, distortion amount,
 * rotation speed, and orbit pattern all transition smoothly when the
 * user switches sections.
 */

const MODES: Record<
  SceneMode,
  { color: string; emissive: string; distort: number; speed: number; ringColor: string }
> = {
  idle: { color: "#3b82f6", emissive: "#1d4ed8", distort: 0.32, speed: 1.4, ringColor: "#60a5fa" },
  STR: { color: "#f43f5e", emissive: "#9f1239", distort: 0.55, speed: 2.4, ringColor: "#fb7185" },
  VIT: { color: "#10b981", emissive: "#065f46", distort: 0.42, speed: 1.8, ringColor: "#34d399" },
  AGI: { color: "#f59e0b", emissive: "#92400e", distort: 0.6, speed: 3.0, ringColor: "#fbbf24" },
  INT: { color: "#3b82f6", emissive: "#1e3a8a", distort: 0.28, speed: 1.0, ringColor: "#60a5fa" },
  PER: { color: "#a855f7", emissive: "#6b21a8", distort: 0.5, speed: 2.0, ringColor: "#c084fc" },
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/* ---------- Central morphing core ---------- */
function Core({ mode }: { mode: SceneMode }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<any>(null);
  const target = MODES[mode];
  const cur = useRef({ distort: target.distort, speed: target.speed });
  const color = useRef(new THREE.Color(target.color));
  const emissive = useRef(new THREE.Color(target.emissive));
  const targetColor = useMemo(() => new THREE.Color(target.color), [mode]);
  const targetEmissive = useMemo(() => new THREE.Color(target.emissive), [mode]);

  useFrame((state, delta) => {
    cur.current.distort = lerp(cur.current.distort, target.distort, Math.min(1, delta * 2.5));
    cur.current.speed = lerp(cur.current.speed, target.speed, Math.min(1, delta * 2.5));
    color.current.lerp(targetColor, Math.min(1, delta * 2.5));
    emissive.current.lerp(targetEmissive, Math.min(1, delta * 2.5));

    if (matRef.current) {
      matRef.current.distort = cur.current.distort;
      matRef.current.speed = cur.current.speed;
      matRef.current.color = color.current;
      matRef.current.emissive = emissive.current;
    }
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.25 * cur.current.speed;
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.4) * 0.15;
    }
  });

  return (
    <Float speed={1.4} rotationIntensity={0.4} floatIntensity={0.5}>
      <mesh ref={meshRef} scale={1.2}>
        <icosahedronGeometry args={[1, 12]} />
        <MeshDistortMaterial
          ref={matRef}
          color={target.color}
          emissive={target.emissive}
          emissiveIntensity={0.6}
          roughness={0.15}
          metalness={0.55}
          distort={target.distort}
          speed={target.speed}
        />
      </mesh>
    </Float>
  );
}

/* ---------- Orbiting energy nodes ---------- */
function Orbits({ mode }: { mode: SceneMode }) {
  const target = MODES[mode];
  const groupA = useRef<THREE.Group>(null);
  const groupB = useRef<THREE.Group>(null);
  const groupC = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    const s = target.speed;
    if (groupA.current) groupA.current.rotation.y += delta * 0.4 * s;
    if (groupB.current) {
      groupB.current.rotation.x += delta * 0.3 * s;
      groupB.current.rotation.z += delta * 0.15 * s;
    }
    if (groupC.current) {
      groupC.current.rotation.z += delta * 0.5 * s;
      groupC.current.rotation.y -= delta * 0.2 * s;
    }
  });

  const nodeMat = (
    <meshStandardMaterial
      color={target.ringColor}
      emissive={target.ringColor}
      emissiveIntensity={1.4}
      toneMapped={false}
    />
  );

  return (
    <>
      {/* Orbit ring A */}
      <group ref={groupA}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.1, 0.012, 8, 96]} />
          <meshBasicMaterial color={target.ringColor} transparent opacity={0.35} />
        </mesh>
        <mesh position={[2.1, 0, 0]} scale={0.06}>
          <sphereGeometry args={[1, 16, 16]} />
          {nodeMat}
        </mesh>
        <mesh position={[-2.1, 0, 0]} scale={0.04}>
          <sphereGeometry args={[1, 16, 16]} />
          {nodeMat}
        </mesh>
      </group>
      {/* Orbit ring B */}
      <group ref={groupB} rotation={[Math.PI / 3, 0, Math.PI / 6]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.6, 0.008, 8, 96]} />
          <meshBasicMaterial color={target.ringColor} transparent opacity={0.22} />
        </mesh>
        <mesh position={[2.6, 0, 0]} scale={0.05}>
          <sphereGeometry args={[1, 16, 16]} />
          {nodeMat}
        </mesh>
      </group>
      {/* Orbit ring C */}
      <group ref={groupC} rotation={[Math.PI / 5, Math.PI / 4, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[3.0, 0.006, 8, 96]} />
          <meshBasicMaterial color={target.ringColor} transparent opacity={0.16} />
        </mesh>
        <mesh position={[3.0, 0, 0]} scale={0.04}>
          <sphereGeometry args={[1, 16, 16]} />
          {nodeMat}
        </mesh>
      </group>
    </>
  );
}

/* ---------- Background pulse rings (flat) ---------- */
function PulseRing({ mode }: { mode: SceneMode }) {
  const ringRef = useRef<THREE.Mesh>(null);
  const target = MODES[mode];
  useFrame((state) => {
    const t = (state.clock.elapsedTime * 0.5) % 1;
    if (ringRef.current) {
      const s = 1.5 + t * 2.5;
      ringRef.current.scale.set(s, s, s);
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (1 - t) * 0.3;
    }
  });
  return (
    <mesh ref={ringRef} position={[0, 0, -1]}>
      <ringGeometry args={[1, 1.04, 64]} />
      <meshBasicMaterial color={target.ringColor} transparent opacity={0.2} side={THREE.DoubleSide} />
    </mesh>
  );
}

/* ---------- Scene wrapper ---------- */
export function HeroScene({ mode, height = 520 }: { mode: SceneMode; height?: number }) {
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

  if (!supported) {
    return (
      <div
        className="grid place-items-center rounded-3xl border border-white/10 bg-slate-950/50"
        style={{ height }}
      >
        <p className="text-slate-500 text-sm">WebGL not supported.</p>
      </div>
    );
  }

  const sparkleColor = MODES[mode].ringColor;

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/40 to-slate-950"
      style={{ height }}
    >
      <Canvas
        camera={{ position: [0, 0, 5.5], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <color attach="background" args={["#020617"]} />
        <fog attach="fog" args={["#020617", 6, 14]} />

        <ambientLight intensity={0.4} />
        <pointLight position={[5, 5, 5]} intensity={2} color={MODES[mode].color} />
        <pointLight position={[-5, -5, -5]} intensity={1} color={MODES[mode].ringColor} />
        <directionalLight position={[0, 5, 2]} intensity={0.6} />

        <Suspense fallback={null}>
          <Core mode={mode} />
          <Orbits mode={mode} />
          <PulseRing mode={mode} />
          <Sparkles count={80} scale={6} size={3} speed={0.4} color={sparkleColor} opacity={0.6} />
          <Stars radius={50} depth={20} count={1200} factor={3} fade speed={0.6} />
          <Environment preset="night" />
        </Suspense>
      </Canvas>

      {/* Corner brackets */}
      <Bracket pos="tl" />
      <Bracket pos="tr" />
      <Bracket pos="bl" />
      <Bracket pos="br" />

      {/* Scan line sweep */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 h-px"
        style={{
          top: "50%",
          background: `linear-gradient(90deg, transparent, ${MODES[mode].ringColor}80, transparent)`,
          animation: "scan 5s linear infinite",
        }}
      />
      <style>{`@keyframes scan { 0% { top: -2%; } 100% { top: 102%; } }`}</style>
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
