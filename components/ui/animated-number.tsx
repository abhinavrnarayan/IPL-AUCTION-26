"use client";

import { useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from "framer-motion";

export function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const reduced = useReducedMotion();
  const mv = useMotionValue(reduced ? value : 0);
  const springMv = useSpring(mv, { stiffness: 80, damping: 20 });
  const display = useTransform(springMv, (v) =>
    decimals > 0 ? v.toFixed(decimals) : String(Math.round(v)),
  );

  useEffect(() => {
    mv.set(value);
  }, [value, mv]);

  if (reduced) return <span>{value}</span>;

  return <motion.span>{display}</motion.span>;
}
