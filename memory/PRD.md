# DigiRise Partner OS — PRD

## Original problem statement
Market-best UI/UX master upgrade for DigiRise Partner OS: transform a functional Firebase‑backed staff/partner management app into a premium, emotionally engaging platform.
Constraint: CSS + HTML visual structure only — do NOT touch JS logic, Firebase connections, ID/class hooks, or tab-switching logic. Fix a critical light-mode invisible-text bug first, then apply Sections 1–6 of the design system.

## Tech stack
- Pure static HTML/CSS/JS (no build step) served via Vercel
- Firebase Realtime Database + Auth (client-side SDKs)
- Vanilla JS (no framework)

## User personas
1. **Growth Partner** — logs deals, tracks pipeline, requests payouts. Wants a "₹10k/mo enterprise tool" feel while earning commissions.
2. **Admin (Satyam)** — manages partners, reviews deals/payouts, posts announcements. Wants data-dense authority.
3. **Prospect (landing page)** — evaluates program, needs to convert on Hero → CTA.

## Core requirements (static)
- Dark mode: deep space black + gold accents (power/exclusivity)
- Light mode: warm cream + gold (trust/premium paper — NOT stark white)
- Firebase deal logging, payouts, announcements, auth — unchanged
- Fully responsive on 360–390 px mobile
- Zero JS logic changes; only additive scroll-reveal function

## What's been implemented (2026-01)
### Section 0 — Critical light-mode bug fix
- Replaced entire inline `<style>` block in `partner.html` (~400 lines) with theme-token driven rules
- All hardcoded darks (#0f0f0f → #2a2a2a) replaced with `var(--bg-surface-*)` / `var(--border-*)`
- All hardcoded grays (#333–#888) replaced with `var(--text-secondary)` / `var(--text-tertiary)`
- Pipeline `mini-stage-btn`, `pipeline-notes`, `ann-item`, `pipeline-card` etc. now render correctly in both themes
- Pipeline filter buttons ("All / Lead / Pitched / Negotiating / Closed") visible in light mode ✅

### Section 1 — Design system foundation
- Added motion tokens (`--ease-*`, `--dur-*`), depth tokens (`--shadow-*`, `--glow-*`), fluid type scale (`--text-xs`…`--text-3xl`) to `shared.css :root`
- Gold-tinted `::selection`, gold-on-hover scrollbar

### Section 2 — Homepage premium upgrades
- Animated multi-layer mesh gradient hero (`heroFloat` 22s)
- Animated gold gradient shine on `.hero-h1 .grad` (`goldFlow` 5s)
- Pulsing hero badge with blinking dot
- Step cards, commission cards, tier cards, showcase cards — all hover-lift with glow variants
- Stats strip with vertical dividers, real-stats grid, proof cards, culture do/don't
- Premium FAQ accordion (45° rotate + gold hover)
- Final CTA with gradient background + top gold divider
- Scroll reveal (`.reveal-on-scroll` + `.reveal-stagger`) applied to all sections

### Section 3 — Partner dashboard premium
- Cleaner sticky header with backdrop-blur, tier badge, logo mark
- Unified 34×34 header icon buttons (bell, theme, logout) with hover states
- Stat cards with subtle top gradient and hover-lift
- Tier ring using SVG stroke with gold drop-shadow
- Pipeline cards with color-coded left accent (Lead=blue, Pitched=purple, Negotiating=amber, Closed=green, Payment=gold), progress bars, expanding accent on hover
- Form inputs with gold focus ring
- Announcement urgency pulse animation

### Section 4 — Admin panel premium
- Purple as authority color (`admin-badge`, tab active state)
- Data-dense table with tiny uppercase headers, hover row highlight
- Purple gradient primary buttons, outline variants (green/red)
- Premium drawer with backdrop blur + right slide-in
- Complete light-theme override for scoped `--admin-*` tokens (fixed invisible text)

### Section 5 — Motion & micro-interactions
- Bell shake animation on new notification
- Tab section enter animation (`tabSectionEnter`)
- Button press-down active state
- Additive `initScrollReveal()` in `js/index.js` — IntersectionObserver toggles `.revealed` class
- `prefers-reduced-motion` respected throughout

### Section 6 — Light theme: warm premium paper
- Cream palette (`#F5F1E8` base, `#FDFCF8` surface-1)
- Warm shadows (rgb 100,80,40 tint) instead of black
- Subpixel font smoothing for light bg
- Reduced backdrop opacity for mesh gradient in light mode
- Modal/drawer overlays use warm tint

## Files modified
- `/app/partner.html` (inline `<style>` block fully re-tokenised — Section 0 fix)
- `/app/css/shared.css` (motion tokens, fluid type, scrollbar, selection, Section 5 reveal + Section 6 light theme)
- `/app/css/index.css` (Section 2 — homepage premium upgrades appended)
- `/app/css/partner.css` (Section 3 — dashboard upgrades appended)
- `/app/css/admin.css` (Section 4 — admin upgrades + light-theme scoped-token override appended)
- `/app/index.html` (added `.reveal-on-scroll` / `.reveal-stagger` classes)
- `/app/js/index.js` (added standalone `initScrollReveal()` — additive only)

## Verification performed
- Playwright screenshots at 390×800 viewport in both themes:
  - Homepage (hero, how-it-works, tiers, FAQ, CTA)
  - Partner dashboard (stats, tier ring, announcements)
  - Partner pipeline in LIGHT MODE — all filter buttons + card text visible ✅ (critical bug fix confirmed)
  - Partner Log Deal (package cards, stage pills, form)
  - Admin dashboard (leaderboard, live activity) both themes
  - Admin Partners table both themes
- Zero JS logic changes; Firebase globals still intact
- CSS brace-balance verified across all 4 files

## Deployment
- User will push to GitHub `main` via Emergent "Save to GitHub" — Vercel auto-deploys.

## Backlog / next actions
- P1: Verify on real device @ 360 px (iPhone SE, small Android)
- P1: Live-test Firebase deal logging / payout after Vercel deploy
- P2: Consider small enter-animation for individual pipeline card additions (currently only tab section animates)
- P2: Analytics events on hero CTA clicks (Apply on WhatsApp, Partner Login)
