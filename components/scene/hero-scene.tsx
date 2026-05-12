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
 * An anatomical skeleton (skull / spine / ribcage / limbs / pelvis)
 * floating in space. Scroll-driven camera focuses on the body region
 * that maps to each stat:
 *
 *   idle → wide shot of full skeleton
 *   INT  → close on the skull (brain)
 *   STR  → mid-shot on ribcage + arms + legs (the working frame)
 *   DIS  → angled side view emphasising the spine (the backbone)
 *
 * Bones use an ivory bone material; active regions get a stat-color
 * emissive override + subtle flicker. Non-gendered build, neutral
 * proportions.
 * ============================================================ */

const STAT_PARTS: Record<StatKind, string[]> = {
  INT: ["skull"],
  STR: [
    "rib1", "rib2", "rib3", "rib4", "rib5", "sternum",
    "l_humerus", "r_humerus", "l_ulna", "r_ulna", "l_radius", "r_radius",
    "l_hand", "r_hand",
    "l_femur", "r_femur", "l_tibia", "r_tibia", "l_fibula", "r_fibula",
    "l_foot", "r_foot",
    "l_shoulder", "r_shoulder", "l_elbow", "r_elbow", "l_wrist", "r_wrist",
    "l_knee", "r_knee", "l_ankle", "r_ankle",
  ],
  DIS: [
    "c_spine_1", "c_spine_2", "c_spine_3",
    "t_spine_1", "t_spine_2", "t_spine_3", "t_spine_4", "t_spine_5",
    "l_spine_1", "l_spine_2", "l_spine_3",
    "pelvis_l", "pelvis_r", "sacrum",
  ],
};

const STAT_HEX: Record<StatKind, string> = {
  INT: "#3b82f6",
  STR: "#f43f5e",
  DIS: "#a855f7",
};

const STAT_GLOW: Record<StatKind, string> = {
  INT: "#60a5fa",
  STR: "#fb7185",
  DIS: "#c084fc",
};

const BURST_ANCHOR: Record<StatKind, [number, number, number]> = {
  INT: [0, 1.55, 0],
  STR: [0, 0.6, 0],
  DIS: [0, 0.4, 0],
};

const CAMERA: Record<SceneMode, { pos: [number, number, number]; look: [number, number, number]; fov: number }> = {
  idle: { pos: [0, 0.1, 4.5], look: [0, 0.1, 0], fov: 38 },
  INT:  { pos: [0.3, 1.55, 1.3], look: [0, 1.55, 0], fov: 28 },
  STR:  { pos: [0, 0.55, 2.4], look: [0, 0.4, 0], fov: 38 },
  DIS:  { pos: [1.8, 0.4, 2.4], look: [0, 0.4, 0], fov: 36 },  // angled side view emphasising spine
};

const BONE_COLOR = "#e8e0d0";       // ivory bone
const BONE_EMISSIVE = "#3a3326";    // warm shadow
const EDGE_COLOR = "#cbd5e1";

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/* ---------- Bone primitive ---------- */
function Bone({
  name,
  geometry,
  position,
  rotation,
  scale,
  active,
}: {
  name: string;
  geometry: React.ReactElement;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number] | number;
  active: SceneMode;
}) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);

  const highlightStat: StatKind | null = useMemo(() => {
    if (active === "idle") return null;
    return STAT_PARTS[active].includes(name) ? (active as StatKind) : null;
  }, [active, name]);

  useFrame((state) => {
    if (!matRef.current) return;
    if (highlightStat) {
      const flicker =
        highlightStat === "INT"
          ? Math.sin(state.clock.elapsedTime * 3.2 + name.length) * 0.25
          : highlightStat === "DIS"
            ? 0.2 + Math.sin(state.clock.elapsedTime * 1.1) * 0.25
            : Math.sin(state.clock.elapsedTime * 2 + name.length * 0.3) * 0.15;
      matRef.current.emissive.set(STAT_HEX[highlightStat]);
      matRef.current.emissiveIntensity = lerp(matRef.current.emissiveIntensity, 1.6 + flicker, 0.12);
      matRef.current.color.set(STAT_HEX[highlightStat]);
    } else {
      matRef.current.emissive.set(BONE_EMISSIVE);
      matRef.current.emissiveIntensity = lerp(matRef.current.emissiveIntensity, 0.25, 0.12);
      matRef.current.color.set(BONE_COLOR);
    }
  });

  return (
    <mesh name={name} position={position} rotation={rotation} scale={scale}>
      {geometry}
      <meshStandardMaterial
        ref={matRef}
        color={BONE_COLOR}
        emissive={BONE_EMISSIVE}
        emissiveIntensity={0.25}
        roughness={0.55}
        metalness={0.15}
      />
      <Edges color={highlightStat ? STAT_GLOW[highlightStat] : EDGE_COLOR} lineWidth={1} threshold={20} />
    </mesh>
  );
}

/* ---------- Skeleton ---------- */
function Skeleton({ mode, pulseTrigger }: { mode: SceneMode; pulseTrigger: number }) {
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
    groupRef.current.rotation.y = Math.sin(t * 0.35) * 0.06;
    groupRef.current.position.y = Math.sin(t * 0.55) * 0.04;
    const target = 1 + pulse.current * 0.06;
    groupRef.current.scale.setScalar(lerp(groupRef.current.scale.x, target, Math.min(1, delta * 8)));
  });

  // Geometries reused
  const vertGeo = <cylinderGeometry args={[0.08, 0.08, 0.12, 10]} />;
  const ribGeo = (r: number) => <torusGeometry args={[r, 0.022, 8, 36, Math.PI * 1.1]} />;

  return (
    <group ref={groupRef}>
      {/* ===== Skull ===== */}
      <Bone name="skull" geometry={<sphereGeometry args={[0.3, 24, 24]} />} position={[0, 1.55, 0]} active={mode} />
      {/* Jaw */}
      <Bone name="jaw" geometry={<sphereGeometry args={[0.18, 16, 16]} />} position={[0, 1.36, 0.05]} scale={[1, 0.55, 0.9]} active={mode} />
      {/* Eye sockets */}
      <Bone name="l_eye" geometry={<sphereGeometry args={[0.05, 10, 10]} />} position={[-0.1, 1.58, 0.26]} active={mode} />
      <Bone name="r_eye" geometry={<sphereGeometry args={[0.05, 10, 10]} />} position={[0.1, 1.58, 0.26]} active={mode} />

      {/* ===== Cervical spine (neck) — 3 vertebrae ===== */}
      <Bone name="c_spine_1" geometry={vertGeo} position={[0, 1.20, 0]} active={mode} />
      <Bone name="c_spine_2" geometry={vertGeo} position={[0, 1.07, 0]} active={mode} />
      <Bone name="c_spine_3" geometry={vertGeo} position={[0, 0.95, 0]} active={mode} />

      {/* ===== Thoracic spine — 5 vertebrae (behind ribcage) ===== */}
      <Bone name="t_spine_1" geometry={vertGeo} position={[0, 0.82, -0.05]} active={mode} />
      <Bone name="t_spine_2" geometry={vertGeo} position={[0, 0.70, -0.07]} active={mode} />
      <Bone name="t_spine_3" geometry={vertGeo} position={[0, 0.58, -0.08]} active={mode} />
      <Bone name="t_spine_4" geometry={vertGeo} position={[0, 0.46, -0.07]} active={mode} />
      <Bone name="t_spine_5" geometry={vertGeo} position={[0, 0.34, -0.05]} active={mode} />

      {/* ===== Lumbar spine — 3 vertebrae ===== */}
      <Bone name="l_spine_1" geometry={vertGeo} position={[0, 0.20, 0]} active={mode} />
      <Bone name="l_spine_2" geometry={vertGeo} position={[0, 0.08, 0]} active={mode} />
      <Bone name="l_spine_3" geometry={vertGeo} position={[0, -0.04, 0]} active={mode} />

      {/* ===== Ribcage — 5 rib pairs as toroidal arcs ===== */}
      {[
        { name: "rib1", y: 0.82, r: 0.35 },
        { name: "rib2", y: 0.70, r: 0.40 },
        { name: "rib3", y: 0.58, r: 0.42 },
        { name: "rib4", y: 0.46, r: 0.40 },
        { name: "rib5", y: 0.34, r: 0.34 },
      ].map((r) => (
        <Bone
          key={r.name}
          name={r.name}
          geometry={ribGeo(r.r)}
          position={[0, r.y, 0]}
          rotation={[Math.PI / 2, Math.PI * 1.45, 0]}
          active={mode}
        />
      ))}

      {/* Sternum (front-center vertical strap) */}
      <Bone
        name="sternum"
        geometry={<boxGeometry args={[0.07, 0.55, 0.04]} />}
        position={[0, 0.55, 0.34]}
        active={mode}
      />

      {/* ===== Clavicles ===== */}
      <Bone
        name="l_clavicle"
        geometry={<cylinderGeometry args={[0.04, 0.04, 0.42, 8]} />}
        position={[-0.27, 0.92, 0.16]}
        rotation={[0, 0, Math.PI / 2 - 0.15]}
        active={mode}
      />
      <Bone
        name="r_clavicle"
        geometry={<cylinderGeometry args={[0.04, 0.04, 0.42, 8]} />}
        position={[0.27, 0.92, 0.16]}
        rotation={[0, 0, Math.PI / 2 + 0.15]}
        active={mode}
      />

      {/* ===== Shoulder joints ===== */}
      <Bone name="l_shoulder" geometry={<sphereGeometry args={[0.09, 14, 14]} />} position={[-0.48, 0.88, 0]} active={mode} />
      <Bone name="r_shoulder" geometry={<sphereGeometry args={[0.09, 14, 14]} />} position={[0.48, 0.88, 0]} active={mode} />

      {/* ===== Humerus (upper arm) ===== */}
      <Bone name="l_humerus" geometry={<cylinderGeometry args={[0.055, 0.05, 0.55, 12]} />} position={[-0.52, 0.55, 0]} rotation={[0, 0, 0.06]} active={mode} />
      <Bone name="r_humerus" geometry={<cylinderGeometry args={[0.055, 0.05, 0.55, 12]} />} position={[0.52, 0.55, 0]} rotation={[0, 0, -0.06]} active={mode} />

      {/* Elbow joints */}
      <Bone name="l_elbow" geometry={<sphereGeometry args={[0.06, 12, 12]} />} position={[-0.55, 0.25, 0]} active={mode} />
      <Bone name="r_elbow" geometry={<sphereGeometry args={[0.06, 12, 12]} />} position={[0.55, 0.25, 0]} active={mode} />

      {/* Ulna & Radius — two parallel forearm bones */}
      <Bone name="l_ulna" geometry={<cylinderGeometry args={[0.04, 0.04, 0.52, 10]} />} position={[-0.58, -0.04, 0.018]} active={mode} />
      <Bone name="l_radius" geometry={<cylinderGeometry args={[0.038, 0.038, 0.52, 10]} />} position={[-0.52, -0.04, -0.018]} active={mode} />
      <Bone name="r_ulna" geometry={<cylinderGeometry args={[0.04, 0.04, 0.52, 10]} />} position={[0.58, -0.04, 0.018]} active={mode} />
      <Bone name="r_radius" geometry={<cylinderGeometry args={[0.038, 0.038, 0.52, 10]} />} position={[0.52, -0.04, -0.018]} active={mode} />

      {/* Wrists + hands */}
      <Bone name="l_wrist" geometry={<sphereGeometry args={[0.05, 12, 12]} />} position={[-0.55, -0.33, 0]} active={mode} />
      <Bone name="r_wrist" geometry={<sphereGeometry args={[0.05, 12, 12]} />} position={[0.55, -0.33, 0]} active={mode} />
      <Bone name="l_hand" geometry={<boxGeometry args={[0.13, 0.18, 0.04]} />} position={[-0.55, -0.46, 0]} active={mode} />
      <Bone name="r_hand" geometry={<boxGeometry args={[0.13, 0.18, 0.04]} />} position={[0.55, -0.46, 0]} active={mode} />

      {/* ===== Pelvis — two iliac wings + sacrum ===== */}
      <Bone
        name="pelvis_l"
        geometry={<torusGeometry args={[0.18, 0.05, 8, 24, Math.PI * 0.9]} />}
        position={[-0.18, -0.18, 0]}
        rotation={[Math.PI / 2, 0, Math.PI / 2]}
        active={mode}
      />
      <Bone
        name="pelvis_r"
        geometry={<torusGeometry args={[0.18, 0.05, 8, 24, Math.PI * 0.9]} />}
        position={[0.18, -0.18, 0]}
        rotation={[Math.PI / 2, 0, -Math.PI / 2]}
        active={mode}
      />
      <Bone
        name="sacrum"
        geometry={<boxGeometry args={[0.14, 0.18, 0.07]} />}
        position={[0, -0.17, -0.02]}
        active={mode}
      />

      {/* Hip joints */}
      <Bone name="l_hip" geometry={<sphereGeometry args={[0.08, 14, 14]} />} position={[-0.22, -0.32, 0]} active={mode} />
      <Bone name="r_hip" geometry={<sphereGeometry args={[0.08, 14, 14]} />} position={[0.22, -0.32, 0]} active={mode} />

      {/* ===== Femurs ===== */}
      <Bone name="l_femur" geometry={<cylinderGeometry args={[0.06, 0.05, 0.75, 12]} />} position={[-0.2, -0.72, 0]} active={mode} />
      <Bone name="r_femur" geometry={<cylinderGeometry args={[0.06, 0.05, 0.75, 12]} />} position={[0.2, -0.72, 0]} active={mode} />

      {/* Knees */}
      <Bone name="l_knee" geometry={<sphereGeometry args={[0.07, 14, 14]} />} position={[-0.2, -1.12, 0]} active={mode} />
      <Bone name="r_knee" geometry={<sphereGeometry args={[0.07, 14, 14]} />} position={[0.2, -1.12, 0]} active={mode} />

      {/* Tibia + Fibula */}
      <Bone name="l_tibia" geometry={<cylinderGeometry args={[0.05, 0.04, 0.75, 12]} />} position={[-0.19, -1.52, 0.01]} active={mode} />
      <Bone name="l_fibula" geometry={<cylinderGeometry args={[0.032, 0.032, 0.73, 10]} />} position={[-0.24, -1.52, 0]} active={mode} />
      <Bone name="r_tibia" geometry={<cylinderGeometry args={[0.05, 0.04, 0.75, 12]} />} position={[0.19, -1.52, 0.01]} active={mode} />
      <Bone name="r_fibula" geometry={<cylinderGeometry args={[0.032, 0.032, 0.73, 10]} />} position={[0.24, -1.52, 0]} active={mode} />

      {/* Ankles + Feet */}
      <Bone name="l_ankle" geometry={<sphereGeometry args={[0.06, 12, 12]} />} position={[-0.2, -1.92, 0]} active={mode} />
      <Bone name="r_ankle" geometry={<sphereGeometry args={[0.06, 12, 12]} />} position={[0.2, -1.92, 0]} active={mode} />
      <Bone name="l_foot" geometry={<boxGeometry args={[0.16, 0.08, 0.3]} />} position={[-0.2, -1.99, 0.08]} active={mode} />
      <Bone name="r_foot" geometry={<boxGeometry args={[0.16, 0.08, 0.3]} />} position={[0.2, -1.99, 0.08]} active={mode} />
    </group>
  );
}

/* ---------- Burst particles ---------- */
function Burst({ mode, burstStat, burstId }: { mode: SceneMode; burstStat: StatKind | null; burstId: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const t = useRef(0);
  const lastTrig = useRef(burstId);

  const anchor: [number, number, number] = burstStat
    ? BURST_ANCHOR[burstStat]
    : mode !== "idle"
      ? BURST_ANCHOR[mode]
      : [0, 0, 0];
  const color = burstStat ? STAT_GLOW[burstStat] : mode !== "idle" ? STAT_GLOW[mode] : "#60a5fa";

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

/* ---------- Wrapper ---------- */
export function HeroScene({
  mode,
  stats: _stats,
  hoveredStat: _hoveredStat,
  burstStat,
  burstId,
  pulseTrigger,
  xpRatio: _xpRatio,
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

  const accent = mode === "idle" ? "#60a5fa" : STAT_GLOW[mode];
  const sparkleCount = Math.min(180, 40 + streak * 2);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <Canvas camera={{ position: [0, 0.1, 4.5], fov: 38 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <color attach="background" args={["#020617"]} />
        <fog attach="fog" args={["#020617", 6, 14]} />

        <ambientLight intensity={0.5} />
        <pointLight position={[5, 5, 5]} intensity={1.8} color={accent} />
        <pointLight position={[-5, -5, -5]} intensity={0.8} color="#a855f7" />
        <directionalLight position={[0, 5, 2]} intensity={0.6} />

        <Suspense fallback={null}>
          <Skeleton mode={mode} pulseTrigger={pulseTrigger} />
          <Burst mode={mode} burstStat={burstStat} burstId={burstId} />
          <CameraRig mode={mode} />

          <Sparkles count={sparkleCount} scale={[14, 8, 10]} size={2.2} speed={0.32} color={accent} opacity={0.5} />
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
            "radial-gradient(ellipse 65% 55% at 50% 50%, transparent 0%, rgba(2,6,23,0.55) 70%, rgba(2,6,23,0.92) 100%)",
        }}
      />

      <div className="absolute left-4 bottom-4 flex items-center gap-1.5 rounded-full bg-slate-950/60 px-2.5 py-1 backdrop-blur">
        <span className="block h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: accent }} />
        <span className="font-mono text-[9px] tracking-[0.3em] uppercase text-slate-300">LIVE · WebGL</span>
      </div>
    </div>
  );
}
