"use client";

import { motion, useReducedMotion } from "framer-motion";
import { pageVariants, pageTransition } from "@/lib/animations";

export default function Template({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();

  if (reduced) return <>{children}</>;

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      transition={pageTransition}
    >
      {children}
    </motion.div>
  );
}
