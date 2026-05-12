"use client";

import { Suspense, useState, useEffect, useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations, Sparkles, Stars, Environment } from "@react-three/drei";
import * as THREE from "three";
import type { StatKind } from "@/lib/types";

useGLTF.preload("/models/soldier.glb");

export type SceneMode = "idle" | StatKind;

const STAT_COLOR: Record<StatKind, string> = {
  INT: "#60a5fa",
  STR: "#fb7185",
  DIS: "#c084fc",
};

const STAT_EMISSIVE: Record<StatKind, string> = {
  INT: "#1e3a8a",
  STR: "#7f1d1d",
  DIS: "#581c87",
};

// Camera positions per scroll section. Soldier model is ~2u tall, root at y=0.
const CAMERA: Record<SceneMode, { pos: [number, number, number]; look: [number, number, number]; fov: number }> = {
  idle: { pos: [0, 1.1, 3.4], look: [0, 1.1, 0], fov: 38 },     // wide full body
  INT:  { pos: [0.6, 1.85, 1.4], look: [0, 1.85, 0], fov: 28 }, // head close-up
  STR:  { pos: [0, 1.35, 2.0], look: [0, 1.2, 0], fov: 36 },    // torso + arms
  DIS:  { pos: [1.8, 1.0, 2.4], look: [0, 1.0, 0], fov: 38 },   // angled side view
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/* ---------- The character ---------- */
function Character({ mode, pulseTrigger }: { mode: SceneMode; pulseTrigger: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF("/models/soldier.glb");
  const { actions, names } = useAnimations(animations, groupRef);
  const pulse = useRef(0);
  const lastPulse = useRef(pulseTrigger);

  // Play idle animation
  useEffect(() => {
    const idleName = names.find((n) => n.toLowerCase().includes("idle")) ?? names[0];
    if (idleName && actions[idleName]) {
      actions[idleName].reset().fadeIn(0.4).play();
    }
    return () => {
      Object.values(actions).forEach((a) => a?.fadeOut(0.3));
    };
  }, [actions, names]);

  // Tint character materials based on active stat
  useEffect(() => {
    const targetColor = new THREE.Color(mode === "idle" ? "#ffffff" : STAT_COLOR[mode]);
    const targetEmissive = new THREE.Color(mode === "idle" ? "#000000" : STAT_EMISSIVE[mode]);
    const intensity = mode === "idle" ? 0 : 0.35;
    scene.traverse((child) => {
      const m = (child as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && "emissive" in m) {
        m.emissive = targetEmissive;
        m.emissiveIntensity = intensity;
      }
    });
  }, [mode, scene]);

  // Optimize: enable shadow casting on character meshes
  useEffect(() => {
    scene.traverse((child) => {
      const c = child as THREE.Mesh;
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
  }, [scene]);

  // Pulse on XP gain
  useFrame((_, delta) => {
    if (pulseTrigger !== lastPulse.current) {
      pulse.current = 1;
      lastPulse.current = pulseTrigger;
    }
    pulse.current = Math.max(0, pulse.current - delta * 2);
    if (groupRef.current) {
      const s = 1 + pulse.current * 0.04;
      groupRef.current.scale.setScalar(lerp(groupRef.current.scale.x, s, Math.min(1, delta * 8)));
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <primitive object={scene} />
    </group>
  );
}

/* ---------- Camera rig ---------- */
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

/* ---------- Floor (subtle reflection plane) ---------- */
function Floor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
      <circleGeometry args={[3, 64]} />
      <meshStandardMaterial color="#0f172a" roughness={0.7} metalness={0.4} />
    </mesh>
  );
}

/* ---------- Burst particles ---------- */
function Burst({ mode, burstStat, burstId }: { mode: SceneMode; burstStat: StatKind | null; burstId: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const t = useRef(0);
  const lastTrig = useRef(burstId);
  const anchor: [number, number, number] = useMemo(() => {
    const stat = burstStat ?? (mode !== "idle" ? mode : null);
    if (!stat) return [0, 1.2, 0];
    return stat === "INT" ? [0, 1.85, 0] : stat === "STR" ? [0, 1.2, 0] : [0, 1.0, 0];
  }, [burstStat, mode]);
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
        <mesh key={i} scale={0.06}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ---------- Scene wrapper ---------- */
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
  const sparkleCount = Math.min(220, 80 + streak * 2);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <Canvas
        camera={{ position: [0, 1.1, 3.4], fov: 38 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        shadows
      >
        <color attach="background" args={["#020617"]} />
        <fog attach="fog" args={["#020617", 5, 16]} />

        <ambientLight intensity={0.35} />
        {/* Key light tinted by active stat */}
        <pointLight position={[3, 4, 3]} intensity={2.4} color={accent} castShadow />
        {/* Fill light from opposite side */}
        <pointLight position={[-3, 2, 1]} intensity={1.0} color="#a855f7" />
        <directionalLight position={[0, 5, 2]} intensity={0.6} />
        {/* Rim light from behind for silhouette */}
        <pointLight position={[0, 2, -3]} intensity={1.4} color={accent} />

        <Suspense fallback={null}>
          <Character mode={mode} pulseTrigger={pulseTrigger} />
          <Floor />
          <Burst mode={mode} burstStat={burstStat} burstId={burstId} />
          <CameraRig mode={mode} />

          <Sparkles count={sparkleCount} scale={[12, 8, 10]} size={2.2} speed={0.32} color={accent} opacity={0.55} />
          <Stars radius={60} depth={26} count={1600} factor={3.5} fade speed={0.6} />
          <Environment preset="night" />
        </Suspense>
      </Canvas>

      {/* Vignette */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 50%, transparent 0%, rgba(2,6,23,0.5) 70%, rgba(2,6,23,0.92) 100%)",
        }}
      />

      <div className="absolute left-4 bottom-4 flex items-center gap-1.5 rounded-full bg-slate-950/60 px-2.5 py-1 backdrop-blur">
        <span className="block h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: accent }} />
        <span className="font-mono text-[9px] tracking-[0.3em] uppercase text-slate-300">LIVE · 3D</span>
      </div>
    </div>
  );
}
