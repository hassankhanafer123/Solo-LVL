"use client";

import { Suspense, useState, useEffect, useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, useAnimations, Sparkles, Stars, Edges } from "@react-three/drei";
import * as THREE from "three";
import type { StatKind } from "@/lib/types";

useGLTF.preload("/models/figure.glb");

export type SceneMode = "idle" | StatKind;

/* ============================================================
 * Human hologram — a real rigged character mesh rendered with a
 * custom holographic shader (translucent body, fresnel edges,
 * scanlines moving up). Camera flies to body regions per scroll.
 * ============================================================ */

const STAT_COLOR_VEC: Record<StatKind, THREE.Color> = {
  INT: new THREE.Color("#60a5fa"),
  STR: new THREE.Color("#fb7185"),
  DIS: new THREE.Color("#c084fc"),
};
const BASE_COLOR_VEC = new THREE.Color("#7dd3fc");

const STAT_HEX: Record<StatKind, string> = {
  INT: "#60a5fa",
  STR: "#fb7185",
  DIS: "#c084fc",
};

const CAMERA: Record<SceneMode, { pos: [number, number, number]; look: [number, number, number]; fov: number }> = {
  idle: { pos: [0, 1.1, 3.5], look: [0, 1.1, 0], fov: 38 },
  INT:  { pos: [0.4, 1.85, 1.3], look: [0, 1.85, 0], fov: 26 },
  STR:  { pos: [0, 1.2, 2.0], look: [0, 1.1, 0], fov: 36 },
  DIS:  { pos: [1.7, 1.0, 2.3], look: [0, 1.0, 0], fov: 36 },
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/* ============================================================
 * Holographic shader material
 *
 *   Translucent body (low base alpha)
 *   Fresnel rim — edges glow brighter
 *   Horizontal scanlines drifting up
 *   Subtle vertical glitch flicker
 *   Stat-color tint
 * ============================================================ */
const HOLO_VERTEX = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewPosition = -mvPosition.xyz;
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const HOLO_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uFresnelPower;
  uniform float uScanlineFreq;
  varying vec3 vWorldNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

  void main() {
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - max(0.0, dot(vWorldNormal, viewDir)), uFresnelPower);

    // Scanlines moving up
    float scan = sin(vWorldPosition.y * uScanlineFreq - uTime * 2.5);
    scan = smoothstep(0.0, 1.0, scan);
    float scanStrength = mix(0.85, 1.25, scan);

    // Random flicker
    float flicker = 0.95 + 0.05 * sin(uTime * 13.0 + vWorldPosition.y * 5.0);

    // Combine
    vec3 col = uColor * (0.35 + fresnel * 2.6) * scanStrength * flicker;

    // Edge boost + body slight glow
    float alpha = (fresnel * 0.85 + 0.12) * uOpacity;

    gl_FragColor = vec4(col, alpha);
  }
`;

function makeHoloMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: BASE_COLOR_VEC.clone() },
      uTime: { value: 0 },
      uOpacity: { value: 1.0 },
      uFresnelPower: { value: 2.2 },
      uScanlineFreq: { value: 18.0 },
    },
    vertexShader: HOLO_VERTEX,
    fragmentShader: HOLO_FRAGMENT,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

/* ============================================================
 * The character
 * ============================================================ */
function Character({ mode, pulseTrigger }: { mode: SceneMode; pulseTrigger: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.ShaderMaterial | null>(null);
  const edgeColorRef = useRef<THREE.Color>(new THREE.Color("#7dd3fc"));
  const { scene, animations } = useGLTF("/models/figure.glb");
  const { actions, names } = useAnimations(animations, groupRef);

  const pulse = useRef(0);
  const lastPulse = useRef(pulseTrigger);

  // Clone scene so each mount gets its own
  const character = useMemo(() => scene.clone(true), [scene]);

  // Replace all materials with holographic shader & add edge overlays
  useEffect(() => {
    const sharedMat = makeHoloMaterial();
    matRef.current = sharedMat;
    character.traverse((child) => {
      const m = child as THREE.Mesh;
      if (!m.isMesh) return;
      m.material = sharedMat;
      m.castShadow = false;
      m.receiveShadow = false;
      m.frustumCulled = false;
    });
  }, [character]);

  // Play idle animation for subtle motion
  useEffect(() => {
    const idleName = names.find((n) => n.toLowerCase().includes("idle")) ?? names[0];
    if (idleName && actions[idleName]) {
      actions[idleName].reset().fadeIn(0.4).play();
    }
    return () => {
      Object.values(actions).forEach((a) => a?.fadeOut(0.3));
    };
  }, [actions, names]);

  // Tick shader time, color lerp, pulse scale
  useFrame((state, delta) => {
    if (matRef.current) {
      const u = matRef.current.uniforms;
      if (u.uTime) u.uTime.value = state.clock.elapsedTime;
      const target = mode === "idle" ? BASE_COLOR_VEC : STAT_COLOR_VEC[mode];
      if (u.uColor) (u.uColor.value as THREE.Color).lerp(target, Math.min(1, delta * 2.5));
      edgeColorRef.current.lerp(target, Math.min(1, delta * 2.5));
    }

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

  // Face the camera (rotate 180° around Y)
  return (
    <group ref={groupRef} rotation={[0, Math.PI, 0]} position={[0, 0, 0]}>
      <primitive object={character} />
    </group>
  );
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
 * Floor disc — subtle reflection plane under the figure
 * ============================================================ */
function Floor({ mode }: { mode: SceneMode }) {
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((_, delta) => {
    if (!matRef.current) return;
    const c = mode === "idle" ? BASE_COLOR_VEC : STAT_COLOR_VEC[mode];
    matRef.current.color.lerp(c, Math.min(1, delta * 2.5));
  });
  return (
    <group>
      {/* Subtle floor glow ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[0.5, 1.2, 64]} />
        <meshBasicMaterial ref={matRef} color="#7dd3fc" transparent opacity={0.18} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  );
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
    if (!stat) return [0, 1.2, 0];
    if (stat === "INT") return [0, 1.85, 0];
    if (stat === "STR") return [0, 1.2, 0];
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
      const dist = (1 - t.current) * 0.8;
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
        <mesh key={i} scale={0.05}>
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

  const accent = mode === "idle" ? "#7dd3fc" : STAT_HEX[mode];
  const sparkleCount = Math.min(220, 80 + streak * 2);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <Canvas camera={{ position: [0, 1.1, 3.5], fov: 38 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <color attach="background" args={["#020617"]} />
        <fog attach="fog" args={["#020617", 5, 14]} />

        <ambientLight intensity={0.6} />

        <Suspense fallback={null}>
          <Character mode={mode} pulseTrigger={pulseTrigger} />
          <Floor mode={mode} />
          <Burst mode={mode} burstStat={burstStat} burstId={burstId} />
          <CameraRig mode={mode} />
          <Sparkles count={sparkleCount} scale={[3, 5, 2]} size={1.8} speed={0.35} color={accent} opacity={0.6} position={[0, 1, 0]} />
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
