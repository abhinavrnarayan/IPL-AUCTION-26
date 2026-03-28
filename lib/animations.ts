/**
 * Animation utilities — shared presets for Framer Motion
 * Import from here for consistency across all components.
 */

// ── Spring presets ────────────────────────────────────────────────────────────

export const spring = {
  snappy: { type: "spring" as const, stiffness: 400, damping: 30 },
  bouncy: { type: "spring" as const, stiffness: 300, damping: 20 },
  smooth: { type: "spring" as const, stiffness: 200, damping: 25 },
  gentle: { type: "spring" as const, stiffness: 150, damping: 22 },
};

// ── Variant presets ───────────────────────────────────────────────────────────

export const fadeUp = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -8 },
};

export const fadeIn = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1 },
  exit:    { opacity: 0 },
};

export const scalePop = {
  hidden:  { opacity: 0, scale: 0.88 },
  visible: { opacity: 1, scale: 1 },
  exit:    { opacity: 0, scale: 0.92 },
};

export const slideUp = {
  hidden:  { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -16 },
};

export const slideRight = {
  hidden:  { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0 },
  exit:    { opacity: 0, x: 16 },
};

// ── Stagger container factory ─────────────────────────────────────────────────

export const staggerContainer = (stagger = 0.08, delayChildren = 0.05) => ({
  hidden:  { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: stagger, delayChildren },
  },
});

// ── Page transition (fast, feels native) ─────────────────────────────────────

export const pageVariants = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -6 },
};

export const pageTransition = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
};
