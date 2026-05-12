"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";

/**
 * Studio-style custom cursor — small filled dot + larger trailing ring.
 * The ring lags behind via spring physics, the dot tracks the pointer 1:1.
 * Hides on touch devices.
 */
export function StudioCursor() {
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const ringX = useSpring(x, { stiffness: 180, damping: 22, mass: 0.6 });
  const ringY = useSpring(y, { stiffness: 180, damping: 22, mass: 0.6 });
  const [hovering, setHovering] = useState(false);
  const enabledRef = useRef(false);

  useEffect(() => {
    // Detect fine pointer with hover support (desktop). If not, bail.
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    enabledRef.current = true;
    document.documentElement.classList.add("has-custom-cursor");

    const move = (e: MouseEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };
    const over = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      const interactive =
        !!t?.closest(
          "button, a, [role='button'], input, textarea, select, [data-cursor='hover']",
        );
      setHovering(interactive);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseover", over);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseover", over);
      document.documentElement.classList.remove("has-custom-cursor");
    };
  }, [x, y]);

  if (typeof window !== "undefined" && !window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    return null;
  }

  return (
    <>
      {/* Trailing ring */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[60] mix-blend-difference"
        style={{ x: ringX, y: ringY, translateX: "-50%", translateY: "-50%" }}
      >
        <motion.div
          animate={{ scale: hovering ? 1.8 : 1, opacity: hovering ? 0.9 : 0.6 }}
          transition={{ duration: 0.25 }}
          className="h-9 w-9 rounded-full border border-white"
        />
      </motion.div>
      {/* Inner dot */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[60] mix-blend-difference"
        style={{ x, y, translateX: "-50%", translateY: "-50%" }}
      >
        <motion.div
          animate={{ scale: hovering ? 0 : 1 }}
          transition={{ duration: 0.2 }}
          className="h-2 w-2 rounded-full bg-white"
        />
      </motion.div>
    </>
  );
}
