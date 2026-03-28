"use client";

import { motion, useReducedMotion } from "framer-motion";
import { pageVariants, pageTransition } from "@/lib/animations";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();

  if (reduced) return <>{children}</>;

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={pageTransition}
    >
      {children}
    </motion.div>
  );
}
