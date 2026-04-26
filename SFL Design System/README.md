# SFL — St. Thomas Fantasy League · Design System

SFL is a **live fantasy auction platform** for sports leagues. You create a private room, invite your group, bid on real players in a live synchronous auction (20-second rolling timer, configurable), manage a purse in crores, and build the squad you want. Points are scored from real match performance once the season begins.

**Primary sports:** Cricket (IPL-style auctions, core product) and Football (ISL, EPL — "Soon"). Design system is multi-sport-ready while biased toward cricket's vocabulary (purse in ₹ Cr, "base price", "sold", "unsold").

**The product is one SPA** with these surfaces:
- **Public marketing / intro** — splash animation, hero landing
- **Lobby** — list of your rooms, create/join forms
- **Room** — setup, invite panel, team ownership, player pool, readiness
- **Live Auction Room** — the centrepiece: player-on-the-block card, timer bar, live bids, chat/emoji reactions, squad board, sold showcase marquee
- **Results** — post-season leaderboard, top scorers, team-wise dream-team boards, trade log
- **Admin** — player/team upload, scoring sync, room controls

---

## Sources

- **Codebase (mounted, read-only via host):** `components/` — Next.js + React 18, Framer Motion, CSS variables, Supabase realtime
- **Brand mark:** `uploads/sfl.png` — crest-style illustration, "SNT Thomas Fantasy League · SFL"
- No Figma provided; no sample decks provided.

---

## Index of this folder

| File / folder | Purpose |
|---|---|
| `README.md` | This file — brand, content, visual foundations, iconography |
| `SKILL.md` | Claude Code / Agent Skill entry point |
| `colors_and_type.css` | All design tokens (colors, type scale, radii, shadow, spacing) |
| `assets/sfl-logo.png` | Primary crest mark |
| `preview/` | Design System tab cards (colors, type, spacing, components) |
| `ui_kits/sfl-app/` | Interactive UI kit recreating the live auction + lobby |

---

## Content fundamentals

**Voice:** Warm, clear, and operational. Talks TO the user in second person ("**your** squad," "**your** purse"). Admin copy is imperative ("Start auction," "End round"). No marketing fluff — short, real verbs.

**Casing:** **Sentence case** for buttons, labels, headings — never Title Case except for proper nouns and the brand wordmark "SFL". Examples:
- "Create room" (not "Create Room")
- "Open lobby"
- "Bid panel"
- "Start next round"
- "Room chat"

**Units & numbers:** Always ₹ Cr (Crore, 10^7) and ₹ L (Lakh, 10^5) — never raw rupees. Currency uses `formatCurrencyShort`. Timers in seconds ("20s", "Live timer 14s"). Purse sizes: ₹100 Cr / ₹150 Cr / ₹200 Cr presets.

**Status vocabulary** (used as pills and state badges):
- `SOLD`, `UNSOLD`, `AVAILABLE` — player states, uppercase mono
- `LIVE`, `PAUSED`, `ROUND_END`, `COMPLETED` — auction phase
- `Leading`, `Open bid`, `No bids yet`, `No active player`
- `Soon` — used for unreleased leagues

**Copy patterns:**
- Eyebrow → Heading → Subtle support line (repeat on every major screen)
  - `On the block` → `Virat Kohli` → `Royal Challengers Bengaluru`
  - `Fantasy IPL Auction Game` → `Build your fantasy IPL team through live player auctions.` → "SFL — St. Thomas Fantasy League — is a live fantasy IPL auction platform. Create a private room…"
- Empty states are plain and instructive: "No rooms yet. Create one above or join a room with a code."
- Destructive confirms name the object and state the consequence: "Remove **Virat Kohli** and return **₹18.5 Cr** back to the team purse?"
- Errors are short, human, period-terminated: "Bid failed.", "Bidding is closed for the current player."

**Emoji:** Used **sparingly and intentionally** as UI glyphs, not decoration:
- Sport group icons: 🏏 Cricket, ⚽ Football (navigation only)
- Quick-chat reactions: 🔥 👏 😮 😂 💸 🏏 (auction chat emoji row)
- Rank crown: 🏆 (only for #1 in results)

**Tone examples — verbatim from the product:**
- Hero: "Build your fantasy IPL team through live player auctions."
- Marketing tile: "Create a private room, share a code with your group, and run the live IPL player auction together."
- Timer: "Live timer", "Paused"
- Bid panel: "No bids yet - open at base price"
- Chat empty: "Start the chat. Messages and emoji reactions will appear here live."
- Sold showcase header: "Highest sold prices first. Click any item for details."

---

## Visual foundations

### Overall vibe
**Deep-midnight auction stage.** Near-black background, soft indigo ambient glow that drifts slowly (21-second sine cycle via `--glow-x`, `--glow-y`), high-contrast type, restrained use of colour. Think live-sports broadcast control room — the UI stays dark so the player card and bids *pop*. The brand crest adds warmth (orange flame, gold trim, red ball) against the cold indigo.

### Colour
- **Backdrop:** near-black `#0b0d14` with stacked radial gradients (indigo top-centre, amber bottom-right) that drift — see `.sfl-ambient`.
- **Primary:** indigo `#6366f1` / strong `#818cf8` — all CTAs, leading-bid outlines, accents, focus ring.
- **Accent:** amber `#f59e0b` / gold `#fcd34d` — only for highlights, currency pills (`.pill.highlight`), timer warning, "Auction complete".
- **Crest palette** (used in brand moments): navy `#0f1d3a`, orange `#f59e0b`, gold `#fcd34d`, ball red `#c9182b`.
- **Leading bid** gets a green outline `#4ade80` — a nod to "live / go".
- **Semantic:** success `#10b981`, warning `#f59e0b`, danger `#f43f5e`, info `#60a5fa`.
- Avatar backgrounds cycle through indigo / emerald / pink / amber / blue / violet (see sidebar `AVATAR_COLORS`).
- Timer bar **shifts colour with urgency:** indigo gradient normally → amber gradient ≤10s → rose gradient ≤3s with a pulsing scaleY animation.

### Typography
- **Display (headings, wordmark, player names):** `Space Grotesk` — geometric, sporty, slightly condensed. *Flagged substitution — no font files shipped; nearest Google Font.*
- **Body / UI:** `Manrope` — warm humanist, reads well at 12–16px. *Flagged substitution.*
- **Mono (room codes, stats, currency):** `JetBrains Mono`. *Flagged substitution.*
- Eyebrow labels are **uppercase, 0.72rem, letter-spacing 0.18em**, coloured with `--primary-strong`. They appear above nearly every h1/h2.
- `text-wrap: balance` on h1 for clean hero wraps.
- Headlines are tight (`-0.02em` letter-spacing, line-height 1.15).

### Backgrounds & texture
- **Panels:** translucent white `rgba(255,255,255,0.04)` on top of the dark body — NOT flat colour. Gives a glassy, layered feel.
- **No full-bleed imagery** in chrome. Imagery (player photos, team logos) is card-contained. The intro splash uses grid + scanlines + grain + flare layers for a broadcast feel.
- **No hand-drawn illustrations.** The only illustration is the crest, used as brand mark only.
- **Patterns used:** ambient radial glow; timer bar stripes; marquee scrolling ticker (`sold-showcase`).

### Animation
- **Framer Motion throughout.** Easing: `[0.22, 1, 0.36, 1]` (fast-out, slow-in — sporty).
- **Standard springs** (from `lib/animations.ts` usage):
  - `spring.snappy` — hovers / taps (scale 1.03–1.04, translateY -2)
  - `spring.bouncy` — "Leading" pill pop, rank chip entrance, emoji reactions
  - `spring.smooth` — page / card entrances
- **Entrance pattern:** `fadeUp` with `staggerContainer(0.1, 0.08)` — children enter one after another, never all at once.
- **Bid feedback:** the current-bid value AnimatePresences out/in with y-flip + scale, giving a satisfying "tick" each new bid.
- **Timer critical:** scaleY pulse at 0.35s, rose glow.
- **Reduced-motion:** every animated component respects `useReducedMotion()` — mandatory.

### Hover & press states
- **Buttons:** `whileHover={{ scale: 1.03–1.04, y: -2 }}`, `whileTap={{ scale: 0.96, y: 0 }}`. No colour change.
- **Cards:** `whileHover={{ y: -2, boxShadow: "0 16px 40px rgba(99,102,241,0.16)" }}` — indigo lift.
- **Leaderboard rows:** `whileHover={{ x: 4, backgroundColor: "rgba(99,102,241,0.06)" }}` — horizontal slide + tint.
- **Squad team header:** background tint `rgba(255,255,255,0.05)` on hover.
- **No underline** hovers; no colour swaps. Movement + shadow only.

### Borders, shadows, elevation
- **Borders** are always translucent white: `rgba(255,255,255,0.05)` soft, `rgba(255,255,255,0.08)` normal, `rgba(255,255,255,0.12)` emphatic.
- **Leading bid outline:** `2px solid var(--accent, #4ade80)`.
- **Focused bid button** ("AI highlighted"): `0 0 0 2px rgba(129,140,248,0.95), 0 0 24px rgba(99,102,241,0.35)` — **indigo double-ring** with glow.
- **Card hover shadow:** always indigo-tinted, never neutral black.

### Corner radii
- 4px — tiny (team short-code chip)
- 6px — inputs
- 8px — squad team cards
- 10px — standard panels, buttons (default)
- 14px — larger cards
- 20px — hero panels
- 999px — pills, avatars

### Cards
- **Panel** (`.panel`): translucent surface, 14–20px radius, 1px border, no visible shadow at rest, indigo hover-lift.
- **Room card** (`.room-card`): stats strip built in at the bottom (`.stats-strip` with 4 tiles).
- **Player card** (`.player-card`): the hero card of the auction — eyebrow, h2, franchise subtle, pill row (role, nationality, base price), stats strip (current bid, leading team, status). This is the single most important component of the product.
- **Stat tile** (`.stat-tile`): bold number / short label, bottom-aligned text.

### Transparency & blur
- **Panels and modals** live on the backdrop through translucency, not backdrop blur — the design avoids heavy glassmorphism in favour of subtle layering.
- Modal backdrops: `rgba(0,0,0,0.6)` flat.

### Layout rules
- Fixed left **sidebar** (collapsible, remembered in `localStorage`). Desktop only; mobile uses a hamburger that toggles a drawer.
- Content area sits in a `.shell` with max-width; hero uses generous vertical rhythm.
- `.stats-strip` is 3–4 column responsive grid — used on nearly every page.
- `.grid.two` for side-by-side panels.
- DrawerSection / CollapsibleSection for dense pages like Results and Room.

### Imagery vibe
- **Cool, cinematic broadcast.** Product photos of players are rare; when present, dark-matte backgrounds preferred.
- The crest is the only "warm" asset — used as badge, loader core, and intro splash.

---

## Iconography

**The codebase has almost no SVG icon system.** Icons are handled three ways, in this priority:

1. **Inline SVGs** for specific UI affordances — stroke-based, `strokeWidth="2"` or `"2.5"`, `stroke-linecap="round"`, `stroke-linejoin="round"`. Used for: profile icon, sign-out, chevrons (polyline `6 9 12 15 18 9`). Styled with `stroke="currentColor"` so they inherit text colour.
2. **Unicode glyphs** as icon substitutes: `‹` / `›` (sidebar chevrons), `?` (expand indicator — should really be `▾`).
3. **Emoji** as semantic icons — only in specific slots: 🏏 ⚽ (sport nav), 🏆 (rank #1), and the chat reactions row.

**No icon font. No Lucide/Heroicons. No PNG icon set.** Because the codebase is sparse on icons, this design system substitutes **Lucide** (CDN) as the recommended default for new work — same stroke weight, same rounded caps, matches the existing hand-rolled SVGs visually.

> ⚠️ **Substitution flagged:** Lucide is a stand-in. If your team has a preferred icon set, swap the CDN import in the UI kit `index.html`.

**Brand assets stored in `assets/`:**
- `sfl-logo.png` — the crest (Napoleon-on-scooter illustration, full colour, ~970×1000).

---

## Font substitutions — action needed

No `.ttf` / `.woff2` files were provided with the codebase. I've used Google Font approximations based on the design feel:

| Use | Substitute (current) | Likely intent |
|---|---|---|
| Display | **Space Grotesk** | Could be Sora, Clash Display, or a custom SFL mark |
| Body | **Manrope** | Could be Inter, DM Sans |
| Mono | **JetBrains Mono** | Could be IBM Plex Mono |

**Please drop your actual font files into `fonts/` and update `colors_and_type.css` @font-face rules.**

---

## What's in `ui_kits/`

- `ui_kits/sfl-app/` — a single interactive kit covering the whole product (sidebar, lobby, live auction room, results). `index.html` opens on the live auction view by default; tabs at top switch surfaces.
