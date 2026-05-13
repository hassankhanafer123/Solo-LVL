"use client";

import { Suspense, useState, useEffect, useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, useAnimations, Sparkles, Stars } from "@react-three/drei";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
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

  // Pseudo-noise
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

  void main() {
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - max(0.0, dot(vWorldNormal, viewDir)), uFresnelPower);

    // Heavy scanlines
    float scan = sin(vWorldPosition.y * uScanlineFreq - uTime * 3.0);
    scan = smoothstep(-0.3, 1.0, scan);

    // Heavy flicker so clothing details dissolve
    float n = hash(floor(vWorldPosition * 60.0) + vec3(uTime * 0.4));
    float flicker = 0.7 + 0.3 * n;

    // Final color — body is almost gone in the middle, edges bright
    vec3 col = uColor * (fresnel * 3.5 + 0.15 * scan);

    // Body almost transparent in the middle, opaque at edges
    float alpha = fresnel * 0.95 * uOpacity + scan * 0.04 * uOpacity;
    alpha *= flicker;

    gl_FragColor = vec4(col, alpha);
  }
`;

function makeHoloMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: BASE_COLOR_VEC.clone() },
      uTime: { value: 0 },
      uOpacity: { value: 1.0 },
      uFresnelPower: { value: 3.0 },
      uScanlineFreq: { value: 30.0 },
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
 * Pose targets — Euler rotations applied to specific bones per mode.
 * These layer on TOP of the idle animation each frame (we set rotations
 * after the mixer updates the skeleton), creating a task-specific
 * posture with the idle anim's subtle breathing still showing through.
 *
 * Bone names follow Mixamo convention (mixamorigHead, mixamorigLeftArm,
 * etc.). We look up partial-match suffixes to handle naming variants.
 * ============================================================ */
type Pose = Record<string, { x?: number; y?: number; z?: number; sx?: number; sy?: number; sz?: number }>;
// `x/y/z` are absolute target Euler rotations; `sx/sy/sz` are sin-modulation amplitudes
// added on top with frequency 1.

// SUBTLE pose deltas only — head/neck/spine. Arms left to the idle animation.
// Mixamo bone local axes are inconsistent across bones, so we keep all values
// in a safe range (|value| < 0.25 rad) and never touch shoulders/arms/hands.

const POSE_IDLE: Pose = {};

const POSE_INT: Pose = {
  // Head tilted slightly down + tiny side-to-side sway — concentration
  Head:    { x: 0.22, sy: 0.025 },
  Neck:    { x: 0.10 },
  Spine2:  { x: 0.06 },
  Spine1:  { x: 0.04 },
};

const POSE_STR: Pose = {
  // Chest up, slight back-arch — power / tension
  Head:    { x: -0.06 },
  Neck:    { x: -0.04 },
  Spine2:  { x: -0.08 },
  Spine1:  { x: -0.06, sx: 0.012 },
  Spine:   { x: -0.03 },
};

const POSE_DIS: Pose = {
  // Tall posture, head slightly up — composure / discipline
  Head:    { x: -0.03, sy: 0.012 },
  Neck:    { x: 0.0 },
  Spine2:  { x: -0.02 },
  Spine1:  { x: -0.02 },
};

const POSES: Record<SceneMode, Pose> = {
  idle: POSE_IDLE,
  INT: POSE_INT,
  STR: POSE_STR,
  DIS: POSE_DIS,
};

/* ============================================================
 * The character
 * ============================================================ */
function Character({ mode, pulseTrigger }: { mode: SceneMode; pulseTrigger: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const { scene, animations } = useGLTF("/models/figure.glb");

  const character = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { actions, names } = useAnimations(animations, character);

  const pulse = useRef(0);
  const lastPulse = useRef(pulseTrigger);
  const bonesRef = useRef<Record<string, THREE.Bone>>({});
  // Smoothly-interpolated current pose values per bone-key
  const currentPose = useRef<Record<string, { x: number; y: number; z: number; sx: number; sy: number; sz: number }>>({});

  // Material setup
  useEffect(() => {
    const holoMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#7dd3fc"),
      emissive: new THREE.Color("#7dd3fc"),
      emissiveIntensity: 1.4,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
      roughness: 0.35,
      metalness: 0.0,
    });
    matRef.current = holoMat;
    character.traverse((child) => {
      const m = child as THREE.SkinnedMesh;
      if (m.isSkinnedMesh || (child as THREE.Mesh).isMesh) {
        m.material = holoMat;
        m.castShadow = false;
        m.receiveShadow = false;
        m.frustumCulled = false;
      }
    });
  }, [character]);

  // Find bones — Mixamo uses prefixes like `mixamorigHead`. We strip and match.
  useEffect(() => {
    const found: Record<string, THREE.Bone> = {};
    character.traverse((child) => {
      const b = child as THREE.Bone;
      if (!b.isBone) return;
      // Strip common Mixamo prefixes for cleaner key
      const cleaned = b.name
        .replace(/^mixamorig:?/i, "")
        .replace(/^Armature\|/, "");
      found[cleaned] = b;
    });
    bonesRef.current = found;
  }, [character]);

  // Play idle animation — provides breathing motion under all poses
  useEffect(() => {
    const idleName = names.find((n) => n.toLowerCase().includes("idle")) ?? names[0];
    if (idleName && actions[idleName]) {
      const action = actions[idleName];
      action.reset().setLoop(THREE.LoopRepeat, Infinity).play();
      action.timeScale = 0.8;
    }
    return () => {
      Object.values(actions).forEach((a) => a?.stop());
    };
  }, [actions, names]);

  useFrame((state, delta) => {
    // Hologram color lerp
    if (matRef.current) {
      const target = mode === "idle" ? BASE_COLOR_VEC : STAT_COLOR_VEC[mode];
      matRef.current.color.lerp(target, Math.min(1, delta * 2.5));
      matRef.current.emissive.lerp(target, Math.min(1, delta * 2.5));
    }

    // Pulse on XP gain
    if (pulseTrigger !== lastPulse.current) {
      pulse.current = 1;
      lastPulse.current = pulseTrigger;
    }
    pulse.current = Math.max(0, pulse.current - delta * 2);
    if (groupRef.current) {
      const s = 1 + pulse.current * 0.04;
      groupRef.current.scale.setScalar(lerp(groupRef.current.scale.x, s, Math.min(1, delta * 8)));
    }

    // Apply per-mode pose AFTER the idle animation has updated bones this frame
    // The idle anim sets bone rotations; we then either layer on top (for idle = no-op)
    // or override entirely with our pose targets, plus a small sin modulation.
    const targetPose = POSES[mode];
    const lerpRate = Math.min(1, delta * 4);
    const t = state.clock.elapsedTime;

    // For each pose key, lerp current values toward targets
    for (const [boneKey, target] of Object.entries(targetPose)) {
      const cur = currentPose.current[boneKey] ?? { x: 0, y: 0, z: 0, sx: 0, sy: 0, sz: 0 };
      cur.x = lerp(cur.x, target.x ?? 0, lerpRate);
      cur.y = lerp(cur.y, target.y ?? 0, lerpRate);
      cur.z = lerp(cur.z, target.z ?? 0, lerpRate);
      cur.sx = lerp(cur.sx, target.sx ?? 0, lerpRate);
      cur.sy = lerp(cur.sy, target.sy ?? 0, lerpRate);
      cur.sz = lerp(cur.sz, target.sz ?? 0, lerpRate);
      currentPose.current[boneKey] = cur;
    }
    // Also fade out any bones whose target was removed (e.g., switching out of a mode)
    for (const boneKey of Object.keys(currentPose.current)) {
      if (!(boneKey in targetPose)) {
        const cur = currentPose.current[boneKey]!;
        cur.x = lerp(cur.x, 0, lerpRate);
        cur.y = lerp(cur.y, 0, lerpRate);
        cur.z = lerp(cur.z, 0, lerpRate);
        cur.sx = lerp(cur.sx, 0, lerpRate);
        cur.sy = lerp(cur.sy, 0, lerpRate);
        cur.sz = lerp(cur.sz, 0, lerpRate);
      }
    }

    // Now apply to the actual bones (overwriting what the idle anim set)
    for (const [boneKey, vals] of Object.entries(currentPose.current)) {
      const bone = bonesRef.current[boneKey];
      if (!bone) continue;
      // Magnitude — when in idle mode all targets are 0; we let the anim show through
      const mag = Math.hypot(vals.x, vals.y, vals.z, vals.sx, vals.sy, vals.sz);
      if (mag < 0.005) continue;
      bone.rotation.x = vals.x + Math.sin(t * 1.2 + boneKey.length) * vals.sx;
      bone.rotation.y = vals.y + Math.sin(t * 1.0 + boneKey.length * 0.7) * vals.sy;
      bone.rotation.z = vals.z + Math.sin(t * 1.4 + boneKey.length * 0.5) * vals.sz;
    }
  });

  return (
    <group ref={groupRef} rotation={[0, Math.PI, 0]} position={[0, 0, 0]}>
      <primitive object={character} />
    </group>
  );
}

/* ============================================================
 * Task-specific floating prop art per stat
 *
 *   INT — small icosahedrons orbiting the head (thoughts / ideas)
 *   STR — dumbbells & impact rings around the torso (lifting energy)
 *   DIS — lotus mandala ring on the floor + rising sparkles (meditation)
 * ============================================================ */

function IntProps({ visible }: { visible: number }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.6;
    groupRef.current.children.forEach((c, i) => {
      c.rotation.x += delta * (1 + (i % 3) * 0.4);
      c.rotation.y += delta * (1.2 + (i % 4) * 0.3);
      const breathe = 1 + Math.sin(state.clock.elapsedTime * 1.5 + i) * 0.15;
      c.scale.setScalar(0.08 * breathe);
    });
  });
  if (visible < 0.02) return null;
  // 8 icosahedrons in a horizontal ring around the head (y ~ 1.85)
  return (
    <group ref={groupRef} position={[0, 1.85, 0]}>
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        const r = 0.55;
        return (
          <mesh key={i} position={[Math.cos(a) * r, Math.sin(a * 1.7) * 0.08, Math.sin(a) * r]}>
            <icosahedronGeometry args={[1, 0]} />
            <meshBasicMaterial color="#60a5fa" transparent opacity={visible * 0.9} wireframe toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

function StrProps({ visible }: { visible: number }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.4;
    groupRef.current.children.forEach((c, i) => {
      const t = state.clock.elapsedTime + i;
      c.position.y = 1.1 + Math.sin(t * 1.2) * 0.18;
      c.rotation.z = Math.sin(t * 0.6) * 0.4;
    });
  });
  if (visible < 0.02) return null;
  // Dumbbells: 4 around the torso, plus 2 impact rings on the floor
  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2;
        const r = 0.95;
        return (
          <group key={i} position={[Math.cos(a) * r, 1.1, Math.sin(a) * r]}>
            {/* dumbbell handle */}
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.018, 0.018, 0.2, 12]} />
              <meshBasicMaterial color="#fb7185" transparent opacity={visible * 0.85} toneMapped={false} />
            </mesh>
            {/* left plate */}
            <mesh position={[-0.11, 0, 0]}>
              <sphereGeometry args={[0.06, 14, 14]} />
              <meshBasicMaterial color="#fb7185" transparent opacity={visible} toneMapped={false} />
            </mesh>
            {/* right plate */}
            <mesh position={[0.11, 0, 0]}>
              <sphereGeometry args={[0.06, 14, 14]} />
              <meshBasicMaterial color="#fb7185" transparent opacity={visible} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
      {/* Impact rings */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.9, 0.95, 64]} />
        <meshBasicMaterial color="#fb7185" transparent opacity={visible * 0.6} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <ringGeometry args={[1.15, 1.18, 64]} />
        <meshBasicMaterial color="#fb7185" transparent opacity={visible * 0.4} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  );
}

function DisProps({ visible }: { visible: number }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y -= delta * 0.15;
    // Make rising sparkles drift up
    groupRef.current.children.forEach((c, i) => {
      if ((c as THREE.Mesh).isMesh) return;
      const t = state.clock.elapsedTime;
      const offset = (t * 0.3 + i * 0.4) % 2.5;
      c.position.y = offset - 0.2;
      (c as THREE.Mesh & { material?: THREE.MeshBasicMaterial }).traverse((sub) => {
        const m = (sub as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
        if (m && "opacity" in m) m.opacity = Math.max(0, (1 - offset / 2.5) * visible);
      });
    });
  });
  if (visible < 0.02) return null;
  // Lotus mandala under feet — multiple rings + radiating petals
  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      {/* Concentric mandala rings on floor */}
      {[0.4, 0.6, 0.85, 1.1].map((r, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01 + i * 0.001, 0]}>
          <ringGeometry args={[r, r + 0.02, 64]} />
          <meshBasicMaterial color="#c084fc" transparent opacity={visible * (0.6 - i * 0.1)} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ))}
      {/* Petals — 8 small ovals around the inner ring */}
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        const r = 0.55;
        return (
          <mesh
            key={`p${i}`}
            position={[Math.cos(a) * r, 0.012, Math.sin(a) * r]}
            rotation={[-Math.PI / 2, 0, -a + Math.PI / 2]}
          >
            <circleGeometry args={[0.08, 24]} />
            <meshBasicMaterial color="#c084fc" transparent opacity={visible * 0.45} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
        );
      })}
      {/* Rising column sparkles */}
      {Array.from({ length: 6 }).map((_, i) => (
        <group key={`s${i}`}>
          <mesh position={[Math.sin(i * 1.7) * 0.25, 0, Math.cos(i * 1.7) * 0.25]}>
            <sphereGeometry args={[0.025, 8, 8]} />
            <meshBasicMaterial color="#c084fc" transparent opacity={visible * 0.8} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function TaskProps({ mode }: { mode: SceneMode }) {
  // Smoothly fade each prop set in/out
  const visRef = useRef({ INT: 0, STR: 0, DIS: 0 });
  const [, force] = useState(0);

  useFrame((_, delta) => {
    const lerpRate = Math.min(1, delta * 3);
    const target = {
      INT: mode === "INT" ? 1 : 0,
      STR: mode === "STR" ? 1 : 0,
      DIS: mode === "DIS" ? 1 : 0,
    };
    let changed = false;
    (["INT", "STR", "DIS"] as const).forEach((k) => {
      const next = lerp(visRef.current[k], target[k], lerpRate);
      if (Math.abs(next - visRef.current[k]) > 0.01) {
        visRef.current[k] = next;
        changed = true;
      }
    });
    if (changed) force((n) => n + 1);
  });

  return (
    <>
      <IntProps visible={visRef.current.INT} />
      <StrProps visible={visRef.current.STR} />
      <DisProps visible={visRef.current.DIS} />
    </>
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

        <ambientLight intensity={0.45} />
        <pointLight position={[2, 3, 3]} intensity={1.6} color={accent} />
        <pointLight position={[-2, 2, 1]} intensity={0.8} color="#a855f7" />
        <pointLight position={[0, 2, -3]} intensity={1.2} color={accent} />
        <directionalLight position={[0, 5, 2]} intensity={0.5} />

        <Suspense fallback={null}>
          <Character mode={mode} pulseTrigger={pulseTrigger} />
          <TaskProps mode={mode} />
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
