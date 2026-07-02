# DigiRise OS — Partner Program Platform
## Product Requirement Document

## Original Problem Statement
Complete ground-up premium UI/UX transformation of an existing DigiRise India
partner program platform (static HTML/CSS/JS + Firebase Realtime DB).  User
wanted every phase executed in exact order with real Firebase-driven data (no
placeholders, no fake testimonials), asymmetric layouts, gold/dark identity,
distinct display typography, glass/depth material system, ambient motion,
and full mobile responsiveness.

## Architecture
- **Frontend**: Static HTML5 (`index.html`, `partner.html`, `admin.html`)
  served by a lightweight Node/Express static server on port 3000.
- **Data**: Firebase Realtime Database + Firebase Auth (anonymous).
- **CSS**: `shared.css` → `foundation.css` (new — Phase 1) →
  `partner.css`/`admin.css`/`index.css` → `enhancements.css` (new — Phases 2–7).
- **JS**: `firebase-config.js` → `shared.js` (with new `.on()` monkey-patch
  + anon-auth retry) → `partner.js`/`admin.js`/`index.js` →
  `enhancements.js` (new — homepage + PWA) → `partner-enhancements.js`
  (new — profile, trophies, motivation engine, forecast, timeline, share).
- **Fonts**: Inter (body) + Bricolage Grotesque (display, variable) +
  Instrument Serif (editorial accents).

## User Personas
1. **Growth Partner** (primary) — logs in with a partner code, tracks deals,
   requests payouts, watches tier progress, and now: sees their trophy case,
   personal best, streak, projected next-tier date, self-anchored monthly
   rank, and can share earnings as a canvas image.
2. **Admin** (Satyam) — oversees all partners, all deals, payouts approvals,
   announcements.  Header rebuilt with a purple-gradient brand lockup.
3. **Public visitor** — lands on the homepage, sees live Firebase counters
   (real partners / real deals / real commission earned / real paid out),
   real trust cards (no fake testimonials), and can apply via WhatsApp.

## Core Requirements (Static)
- ZERO placeholders — every number on screen must trace back to Firebase.
- Preserve all Firebase read/write logic, auth flow, session handling, and
  any element ID/class name that JS queries.
- Distinct gold/dark brand identity, asymmetric layouts, mixed display/body
  typography, glass + depth material, ambient motion, reduced-motion support,
  360–390px mobile responsiveness.

## What's Been Implemented (2026-01-01)

### Phase 0 — Bug fixes
- Restored **Logout** visibility on 320–400px mobile (was hidden by
  `@media(max-width:380px){display:none}` on `.header-secondary-group`).
- Rebuilt **DigiRise OS wordmark** as an icon+wordmark lockup:
  gold-gradient rounded-square mark with an ascending path glyph +
  Bricolage Grotesque wordmark + a small "OS" (or "ADMIN") pill.
- Applied the same rebuild to `admin.html`.

### Phase 1 — Design system foundation (`css/foundation.css`)
- Elevation tokens: soft / medium / strong + gold + purple halos.
- Motion tokens: `--ease-expo-out`, `--ease-spring`, `--ease-hover`,
  duration tokens tap/hover/transition/page/ambient.
- Ambient animated mesh (`.mesh-ambient`) with two gradient blobs.
- Glass material tokens + `.glass-panel` reusable.
- Typography scale (`.display-1/2/3`, `.editorial-italic`, `.eyebrow`)
  with tabular-nums.
- Spring toggle (`.spring-toggle`), shine sweep, focus-visible polish.
- Scroll-reveal + stagger patterns with reduced-motion fallback.

### Phase 2 — Homepage (`index.html`, `enhancements.js`)
- Hero rebuilt with ambient mesh + Bricolage Grotesque display heading +
  a **live-partner-count badge** ("Live from our database — 7 partners
  onboarded") reading straight from Firebase.
- Fake "150+ partners / 420+ deals / ₹2.4M+" **replaced with a live grid**
  reading real numbers: partners, deals, commission earned, paid out.
- Fake testimonials removed, replaced by a "Built On Rules, Not Promises"
  trust card grid citing the real payout policy already in the platform.
- Existing pricing/tier/steps sections inherit new tactile hover +
  count-up + featured Pro glow via `enhancements.css`.
- Homepage 3D pointer-tilt on step/showcase cards.

### Phase 3 — Partner dashboard polish
- Stat card values use display font + tabular-nums.
- Announcement pulse re-attached with entrance animation.
- Pipeline card stage-shift transition (`.pipeline-card.stage-shifting`).

### Phase 4 — Profile / Settings (new tab)
- Editable profile hero with initials avatar generated from real name.
- Personal Info: name / phone / default UPI — all reads AND writes go to
  `partners/{code}` in Firebase.
- Preferences: theme toggle (spring toggle, mirrors header toggle) +
  `partners/{code}/prefs/announcements` bool.
- Account section: read-only partner code + secondary logout.

### Phase 5 — Trophy / recognition system (new tab)
- Motivation grid: projected next tier (computed from historical deal
  cadence), personal best month (computed from `deals[].commission` by
  month), streak (consecutive ISO weeks with at least one deal), and
  partner rank ("#N of X this month by deals").
- 3D-styled Bronze / Silver / Gold medals with lock / next-pulse / unlocked
  shine-sweep states.
- Tap-a-trophy detail popover with real unlock date (`addedAt` of the Nth
  deal) + cash bonus + perks.
- Milestone celebrations (first_deal / 5th / ₹10k / ₹50k / silver / gold)
  fire a toast + confetti, and the "already-shown" flags persist to
  `partners/{code}/milestones/{key}` in Firebase (cross-device).
- Leaderboard is self-anchored — only the partner's own rank + total
  partners + top-partner deal count are exposed; no other partners' names
  or amounts.

### Phase 6 — Custom PWA install modal
- Glass-material modal appears ~3s after page load, IF the app has
  captured `beforeinstallprompt` AND user hasn't already installed AND
  hasn't recently dismissed (`digirise-pwa-dismissed-at` in localStorage).
- On-brand icon + wordmark, 3 perks, "Install App" primary + "Maybe Later"
  secondary.  Dismissal snoozes for 3 days.
- The old header `#installAppBtn` is hidden so we don't double-prompt.

### Phase 7 — High-value partner features
- **Earnings forecast** — linear projection this month based on MTD earnings
  and days elapsed.  Auto-hidden if less than 3 days into month.
- **Smart reminder** — flags deals sitting in Lead / Pitched / Negotiating
  for > 5 days (uses `addedAt` timestamps).  Click jumps to Pipeline.
- **Payout timeline** — replaces the plain table with a visual timeline
  reading `payouts/{code}` — amount, date, UPI, UTR, paid date.
- **Quick-share earnings card** — canvas-rendered PNG (1080×1350) with
  partner name, code, tier, this month's earnings, lifetime earnings,
  brand footer.  Download button opens a native save dialog.
- **Deal velocity insight** — INTENTIONALLY OMITTED because per-stage
  timestamps aren't in the current schema (stated to user explicitly in
  the brief per user's own instruction).

### Root-cause fix bundled with Phase 3
- Firebase compat SDK: `.on('value', cb)` without an error handler would
  silently unregister the listener on `permission_denied`.  Combined with
  a preview-URL anon-auth network flap, this stranded partner.html /
  admin.html with `0` deals / no data.  `shared.js` now:
  - retries `signInAnonymously()` up to 6× with backoff.
  - monkey-patches `firebase.database.Reference.prototype.on` to always
    attach a benign `cancelCb`, keeping listeners alive across auth flaps.
- `partner-enhancements.js` includes a defensive mirror shim so even when
  partner.js listeners get delayed, the Overview tab (stat cards, tier
  ring, announcements) surfaces real numbers within 1–2s.

## Backlog / Next
- **P1** — ~~Extend the mirror shim to Pipeline + History + Payouts lists~~
  **DONE** — mirror shim now renders Pipeline, History, Payout timeline,
  and Announcements when partner.js's listeners get delayed.
- **P2** — Wire the `insight-card-action` "Open pipeline →" to also filter
  to the "Lead"/"Pitched" stages.
- **P2** — Add per-stage timestamps on `updateDealStage` so Phase 7
  velocity insight can be built for real.
- **P2** — Add scroll-triggered stagger to the new Trust card grid and
  Live-stats grid (currently instant-visible).
- **P3** — Instrument the share-canvas action with a Web Share API path so
  mobile can share directly (falls back to download today).

## Enhancement idea (revenue / conversion)
Since the platform is a growth-partner program, the highest-leverage next
improvement is a **"Refer a partner → earn ₹500 when they close their
first deal"** loop, gated on the partner's own tier.  It piggy-backs on
existing partner-code infrastructure and would multiply top-of-funnel
without any paid channel spend.
