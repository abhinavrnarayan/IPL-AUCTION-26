# UI Modernization Plan — SFL Fantasy Auction
> **Goal:** Make every screen feel fast, alive, and polished — smooth spring animations,
> modern glassmorphism, real-time feedback, and motion-first micro-interactions.
> **Stack addition:** Framer Motion (only new dep needed)

---

## Architecture Decisions

| Concern | Decision | Why |
|---|---|---|
| Animation library | **Framer Motion** | Best-in-class React animations, spring physics, layout animations, gestures |
| CSS strategy | Keep vanilla CSS, extend with CSS variables | No migration cost; Framer handles motion layer |
| Page transitions | Framer `AnimatePresence` + Next.js App Router | Works with app dir without extra wrappers |
| Performance | `will-change: transform` only on animated elements | Prevent GPU layer explosion |
| Reduced motion | `useReducedMotion()` hook wrapping all animations | Accessibility requirement |

---

## Wave 1 — Foundation & Setup
*All other waves depend on this. Do first.*

### Task 1.1 — Install Framer Motion
```bash
npm install framer-motion
```
- Add to `package.json` dependencies
- Verify `framer-motion` exports `motion`, `AnimatePresence`, `useSpring`, `useMotionValue`, `useReducedMotion`

### Task 1.2 — Animation Utilities File
Create `lib/animations.ts`:
```typescript
import { useReducedMotion } from "framer-motion";

// Spring presets — use these everywhere for consistency
export const spring = {
  snappy:  { type: "spring", stiffness: 400, damping: 30 },
  bouncy:  { type: "spring", stiffness: 300, damping: 20 },
  smooth:  { type: "spring", stiffness: 200, damping: 25 },
  gentle:  { type: "spring", stiffness: 150, damping: 22 },
};

// Fade variants
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

// Stagger container
export const staggerContainer = (stagger = 0.08) => ({
  hidden:  { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: stagger, delayChildren: 0.05 },
  },
});

// Scale pop (for CTAs, sold announcements)
export const scalePop = {
  hidden:  { opacity: 0, scale: 0.88 },
  visible: { opacity: 1, scale: 1 },
  exit:    { opacity: 0, scale: 0.92 },
};
```

### Task 1.3 — Page Transition Wrapper
Create `components/page-transition.tsx`:
```tsx
"use client";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { fadeUp } from "@/lib/animations";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  if (reduced) return <>{children}</>;
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
```

Wrap each page's root element with `<PageTransition>` in:
- `app/page.tsx` (landing)
- `app/lobby/page.tsx`
- `app/room/[code]/page.tsx`
- `app/auction/[code]/page.tsx`
- `app/results/[code]/page.tsx`

---

## Wave 2 — Auction Room (Highest Priority Screen)
*The live auction room is used most — animations here have the biggest impact.*

### Task 2.1 — Animated Bid Price Counter
File: `components/auction/player-card.tsx`

Replace static price display with animated counter using `useSpring` + `useMotionValue`:
```tsx
import { motion, useSpring, useMotionValue, useTransform } from "framer-motion";

// Inside component:
const rawPrice = useMotionValue(currentBid);
const springPrice = useSpring(rawPrice, { stiffness: 200, damping: 20 });
const displayPrice = useTransform(springPrice, Math.round);

// On bid change:
useEffect(() => { rawPrice.set(currentBid); }, [currentBid]);

// In JSX:
<motion.span className="bid-amount">
  ₹<motion.span>{displayPrice}</motion.span>L
</motion.span>
```

Also add flash animation when price updates:
```css
/* globals.css addition */
@keyframes bid-flash {
  0%   { background: rgba(99, 102, 241, 0.25); }
  100% { background: transparent; }
}
.bid-amount-flash { animation: bid-flash 0.4s ease-out; }
```

### Task 2.2 — Timer Urgency Animation
File: `components/auction/timer-bar.tsx`

- When `timeLeft > 10s`: calm green pulse
- When `timeLeft ≤ 10s`: orange, speed up pulse
- When `timeLeft ≤ 3s`: red, fast heartbeat + scale wiggle

```tsx
const urgency = timeLeft <= 3 ? "critical" : timeLeft <= 10 ? "warning" : "normal";

<motion.div
  className={`timer-bar timer-bar--${urgency}`}
  animate={urgency === "critical" ? {
    scale: [1, 1.03, 1],
    transition: { repeat: Infinity, duration: 0.4 }
  } : {}}
/>
```

Add CSS:
```css
.timer-bar--warning { background: var(--warning); }
.timer-bar--critical {
  background: var(--danger);
  box-shadow: 0 0 16px rgba(244, 63, 94, 0.5);
}
```

### Task 2.3 — Sold Player Showcase Animation
File: `components/sold-player-showcase.tsx`

Replace current implementation with Framer `AnimatePresence` key-based swap:
```tsx
<AnimatePresence mode="wait">
  {soldPlayer && (
    <motion.div
      key={soldPlayer.id}
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 1.1, y: -20 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="sold-showcase"
    >
      {/* SOLD banner + player name + team + price */}
    </motion.div>
  )}
</AnimatePresence>
```

Add a "SOLD!" stamp animation that drops in with rotation:
```tsx
<motion.div
  className="sold-stamp"
  initial={{ rotate: -15, scale: 0, opacity: 0 }}
  animate={{ rotate: -8, scale: 1, opacity: 1 }}
  transition={{ type: "spring", stiffness: 500, damping: 18, delay: 0.1 }}
>
  SOLD!
</motion.div>
```

### Task 2.4 — Bid Panel Button Animations
File: `components/auction/bid-panel.tsx`

Wrap bid increment buttons with `motion.button` and add press feedback:
```tsx
<motion.button
  whileHover={{ scale: 1.04, y: -2 }}
  whileTap={{ scale: 0.96 }}
  transition={{ type: "spring", stiffness: 400, damping: 25 }}
  className="btn btn-primary bid-btn"
  onClick={handleBid}
>
  BID ₹{amount}L
</motion.button>
```

### Task 2.5 — Chat Message Entrance
File: `components/auction/auction-chat-panel.tsx`

Animate each new chat message sliding in from bottom:
```tsx
<AnimatePresence initial={false}>
  {messages.map((msg) => (
    <motion.div
      key={msg.id}
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 350, damping: 28 }}
      className="chat-msg"
    >
      {msg.content}
    </motion.div>
  ))}
</AnimatePresence>
```

### Task 2.6 — Emoji Reaction Burst
File: `components/auction/emoji-reactions.tsx`

When emoji button is clicked, fire 5–8 floating emojis that scatter upward and fade:
```tsx
// On click, push N particles with random x offsets into state
// Render them as absolutely positioned motion.span elements:
<motion.span
  key={particle.id}
  initial={{ opacity: 1, y: 0, x: 0, scale: 1 }}
  animate={{
    opacity: 0,
    y: -80 - Math.random() * 40,
    x: (Math.random() - 0.5) * 60,
    scale: 1.4,
  }}
  transition={{ duration: 0.9, ease: "easeOut" }}
  style={{ position: "absolute", fontSize: "1.4rem", pointerEvents: "none" }}
  onAnimationComplete={() => removeParticle(particle.id)}
>
  {particle.emoji}
</motion.span>
```

---

## Wave 3 — Landing Page & Lobby

### Task 3.1 — Hero Section Stagger
File: `app/page.tsx`

Wrap hero elements in `motion.div` with stagger container:
```tsx
<motion.section
  variants={staggerContainer(0.1)}
  initial="hidden"
  animate="visible"
  className="hero"
>
  <motion.h1 variants={fadeUp} className="hero-title">...</motion.h1>
  <motion.p  variants={fadeUp} className="hero-sub">...</motion.p>
  <motion.div variants={fadeUp} className="hero-ctas">
    <motion.a whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} ...>
      Get Started
    </motion.a>
  </motion.div>
</motion.section>
```

### Task 3.2 — Lobby Room Card Hover
File: `app/lobby/page.tsx` (and any room card component)

Add lift + glow on hover for room cards:
```tsx
<motion.div
  whileHover={{ y: -4, boxShadow: "0 24px 48px rgba(99,102,241,0.2)" }}
  transition={{ type: "spring", stiffness: 300, damping: 25 }}
  className="room-card"
>
```

Add a subtle `background-size` gradient pan on hover via CSS:
```css
.room-card {
  background-size: 200% 200%;
  background-position: 0% 50%;
  transition: background-position 0.5s ease;
}
.room-card:hover {
  background-position: 100% 50%;
}
```

### Task 3.3 — Lobby List Stagger
Animate room list items appearing in sequence on load:
```tsx
<motion.ul variants={staggerContainer(0.06)} initial="hidden" animate="visible">
  {rooms.map((room) => (
    <motion.li key={room.id} variants={fadeUp}>
      <RoomCard room={room} />
    </motion.li>
  ))}
</motion.ul>
```

---

## Wave 4 — Results Board

### Task 4.1 — Leaderboard Row Reveal
File: `components/results/results-board.tsx`

Stagger leaderboard rows from top, with rank number counting up:
```tsx
<motion.div variants={staggerContainer(0.05)} initial="hidden" animate="visible">
  {rankedTeams.map((team, i) => (
    <motion.div
      key={team.id}
      variants={fadeUp}
      custom={i}
      className="results-row"
    >
      <AnimatedRank rank={i + 1} />
      ...
    </motion.div>
  ))}
</motion.div>
```

### Task 4.2 — Animated Score Counter
Create `components/ui/animated-number.tsx`:
```tsx
"use client";
import { useSpring, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect } from "react";

export function AnimatedNumber({ value }: { value: number }) {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 80, damping: 18 });
  const rounded = useTransform(spring, Math.round);
  useEffect(() => { mv.set(value); }, [value]);
  return <motion.span>{rounded}</motion.span>;
}
```

Use this everywhere a numeric score or point total is displayed.

### Task 4.3 — Trophy / Winner Animation
For rank #1, add a trophy drop animation on mount:
```tsx
{rank === 1 && (
  <motion.span
    initial={{ y: -30, opacity: 0, rotate: -20 }}
    animate={{ y: 0, opacity: 1, rotate: 0 }}
    transition={{ type: "spring", stiffness: 300, damping: 16, delay: 0.3 }}
  >
    🏆
  </motion.span>
)}
```

---

## Wave 5 — Skeleton Loading States

### Task 5.1 — Skeleton Component
Create `components/ui/skeleton.tsx`:
```tsx
import styles from "./skeleton.module.css";

export function Skeleton({ width, height, rounded }: {
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
}) {
  return (
    <div
      className={`${styles.skeleton} ${rounded ? styles.rounded : ""}`}
      style={{ width, height }}
    />
  );
}
```

`skeleton.module.css`:
```css
.skeleton {
  background: linear-gradient(
    90deg,
    rgba(99, 102, 241, 0.06) 25%,
    rgba(99, 102, 241, 0.14) 50%,
    rgba(99, 102, 241, 0.06) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.6s ease-in-out infinite;
  border-radius: 6px;
}
.rounded { border-radius: 50%; }

@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

### Task 5.2 — Apply Skeletons
Replace loading spinners / blank states with skeletons in:
- `app/lobby/page.tsx` — Room list loading
- `app/room/[code]/page.tsx` — Player pool loading
- `app/results/[code]/page.tsx` — Leaderboard loading
- `components/auction/squad-board.tsx` — Squad loading

---

## Wave 6 — Background & Atmosphere

### Task 6.1 — Animated Background Gradient (Subtle)
Add a slow-drifting ambient glow to `body` in `globals.css`.
**Important:** Use `animation-duration: 20s+` and `will-change: background-position` to avoid jank.

```css
/* Replace static body background with animated version */
body {
  background:
    radial-gradient(ellipse 55% 40% at var(--glow-x, 5%) var(--glow-y, 0%),
      rgba(99, 102, 241, 0.10) 0%, transparent 60%),
    radial-gradient(ellipse 45% 35% at 95% 100%,
      rgba(16, 185, 129, 0.09) 0%, transparent 55%),
    var(--bg);
}

/* In a client component, drive --glow-x and --glow-y via
   requestAnimationFrame with sin/cos for very slow drift */
```

Create `components/ambient-background.tsx` (client component):
```tsx
"use client";
import { useEffect } from "react";

export function AmbientBackground() {
  useEffect(() => {
    let frame: number;
    let t = 0;
    const animate = () => {
      t += 0.0003;
      const x = 5 + Math.sin(t) * 8;       // 5% ± 8%
      const y = 0 + Math.cos(t * 0.7) * 6; // 0% ± 6%
      document.documentElement.style.setProperty("--glow-x", `${x}%`);
      document.documentElement.style.setProperty("--glow-y", `${y}%`);
      frame = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(frame);
  }, []);
  return null;
}
```

Mount in `app/layout.tsx` inside `<body>`.

### Task 6.2 — Card Glassmorphism Enhancement
Update `.panel` / `.card` CSS variables:
```css
/* Enhanced glass panels */
.panel, .card {
  background: rgba(255, 255, 255, 0.035);
  backdrop-filter: blur(16px) saturate(160%);
  -webkit-backdrop-filter: blur(16px) saturate(160%);
  border: 1px solid rgba(99, 102, 241, 0.14);
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.04) inset,
    0 16px 48px -8px rgba(0,0,0,0.7);
}
```

---

## Wave 7 — Micro-Interactions & Polish

### Task 7.1 — Global Button Upgrade
In `globals.css`, add to all `.btn` variants:
```css
.btn {
  transition: transform 0.12s ease, box-shadow 0.15s ease, background 0.2s ease;
  will-change: transform;
}
.btn:hover  { transform: translateY(-2px); }
.btn:active { transform: translateY(0) scale(0.98); }
```

Globally replace `<button>` with `motion.button` where it's a CTA or action button (Framer handles the spring physics better than pure CSS for heavy interactions).

### Task 7.2 — Input Focus Glow
```css
input:focus, textarea:focus, select:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow:
    0 0 0 3px rgba(99, 102, 241, 0.18),
    0 0 16px rgba(99, 102, 241, 0.12);
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}
```

### Task 7.3 — Toast/Alert Slide-in
Create `components/ui/toast.tsx` using Framer `AnimatePresence`:
```tsx
<AnimatePresence>
  {toasts.map((t) => (
    <motion.div
      key={t.id}
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 350, damping: 28 }}
      className={`toast toast--${t.type}`}
    >
      {t.message}
    </motion.div>
  ))}
</AnimatePresence>
```

### Task 7.4 — Modal / Panel Open Animation
Any panel, drawer, or modal that slides/fades in should use:
```tsx
<motion.div
  initial={{ opacity: 0, scale: 0.97, y: 8 }}
  animate={{ opacity: 1, scale: 1, y: 0 }}
  exit={{ opacity: 0, scale: 0.97, y: 4 }}
  transition={{ type: "spring", stiffness: 320, damping: 28 }}
>
```

---

## Wave 8 — Mobile Polish

### Task 8.1 — Touch Gesture Feedback
Add `whileTap` to all interactive elements on mobile:
```tsx
<motion.div whileTap={{ scale: 0.97 }} transition={spring.snappy}>
```

### Task 8.2 — Scroll-Reveal for Results
Use Framer `whileInView` for results rows (they may be below fold on mobile):
```tsx
<motion.div
  initial={{ opacity: 0, x: -12 }}
  whileInView={{ opacity: 1, x: 0 }}
  viewport={{ once: true, margin: "-40px" }}
  transition={{ type: "spring", stiffness: 200, damping: 24 }}
>
```

### Task 8.3 — Bottom Sheet for Bid Panel (Mobile)
On screens < 640px, convert the bid panel into a bottom sheet with drag-to-dismiss:
```tsx
<motion.div
  drag="y"
  dragConstraints={{ top: 0 }}
  onDragEnd={(_, info) => { if (info.offset.y > 80) setOpen(false); }}
  initial={{ y: "100%" }}
  animate={{ y: 0 }}
  exit={{ y: "100%" }}
  className="bid-sheet"
>
```

---

## Execution Order

| Wave | What | When |
|------|------|------|
| 1 | Foundation + Framer install | First |
| 2 | Auction room animations | Second (highest value) |
| 3 | Landing + Lobby | Third |
| 4 | Results board | After wave 3 |
| 5 | Skeleton loaders | Can run parallel with 3–4 |
| 6 | Background atmosphere | After wave 5 |
| 7 | Micro-interactions | Final polish |
| 8 | Mobile | Final pass |

---

## Performance Rules (Non-Negotiable)

1. **`useReducedMotion()`** — every animated component checks this and falls back to instant transitions
2. **No `animate` on scroll without `viewport: { once: true }`** — never re-fires on scroll back
3. **`will-change: transform`** only on elements that animate `transform` or `opacity`
4. **Background animation cap** — `AmbientBackground` uses `t += 0.0003` (full cycle = ~20s), never faster
5. **AnimatePresence `mode="wait"`** — prevents two elements animating simultaneously on route change
6. **Lazy import Framer** — if bundle size matters, `const { motion } = await import("framer-motion")`

---

## CSS Variables to Add in globals.css

```css
:root {
  /* Animation tokens */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);   /* bouncy */
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);          /* smooth decelerate */
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);       /* balanced */
  --duration-fast: 120ms;
  --duration-normal: 220ms;
  --duration-slow: 400ms;

  /* Glassmorphism tokens */
  --glass-bg: rgba(255, 255, 255, 0.035);
  --glass-blur: blur(16px) saturate(160%);
  --glass-border: rgba(99, 102, 241, 0.14);

  /* Shadow tokens */
  --shadow-glow: 0 0 24px rgba(99, 102, 241, 0.18);
  --shadow-glow-emerald: 0 0 24px rgba(16, 185, 129, 0.18);
}
```

---

*Created: 2026-03-28 | Scope: All 7 routes + shared components*
