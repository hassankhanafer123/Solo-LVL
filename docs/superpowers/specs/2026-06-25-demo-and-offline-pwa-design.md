# Demo Mode + Offline-Installable PWA — Design

> **Status:** approved design, pre-implementation.
> **Goal:** Let anyone try DayMaxing instantly with no sign-up (to prove the concept and gather feedback), and make the app installable on a phone home screen and usable offline. Stay a web app — native/App Store is explicitly future, out of scope.

## Context

DayMaxing (Solo Leveling Life) is a gamified daily-discipline tracker: Next.js 16 frontend + Python FastAPI backend + Supabase (auth/DB). A polished responsive **mobile shell already exists** (`components/shells/mobile-app.tsx`) and `app/dashboard-client.tsx` already switches to it under 768px. There is **no** demo route, **no** PWA scaffolding (no manifest, service worker, or icons), and **no** license/terms.

The live authed app is currently un-runnable (its Supabase project went NXDOMAIN after free-tier inactivity, surfacing as "Failed to fetch" in `@supabase/auth-js`). The demo mode in this design is **100% client-side** and depends on neither Supabase nor the Python API, so it can be built, tested, and deployed independently of that outage.

## Scope

**In scope**
1. **Demo mode** — a no-login route that renders the *real* tracker UI against an in-memory snapshot, with session persistence and a sign-up CTA.
2. **Offline-installable PWA** — manifest, icons, Apple meta, and a service worker so the app installs to a home screen and loads offline.
3. **License + Terms** — proprietary "All Rights Reserved" `LICENSE`, `package.json` license field, and a `/terms` route.

**Out of scope (deliberately)**
- Native iOS/Android app or App Store submission (future, only if the concept proves out).
- Full offline **data sync** for logged-in users (queued mutations, conflict resolution). Offline for authed users = shell loads + graceful "you're offline" state only.
- Restoring/replacing the Supabase project (separate task; does not block this work).
- Deep UI design-review/QA polish — a planned **follow-on** pass run on the live demo, not part of this build.

## Sequencing

1. **Build (this spec):** demo mode + offline-installable PWA + license/terms.
2. **Refine:** deep UI design-review + QA pass on the running demo.
3. **Deploy:** push the demo online (Vercel) — works publicly even with Supabase down. Full login flow online waits on Supabase being restored.

---

## Architecture

### Decision: how demo reuses the real UI — context-injected API

The shells (`MobileApp`, `DesktopExperience`) call `useTracker(snapshot)`, and `useTracker` imports the live `api` from `@/lib/api/client` at module scope. To run the same shells with no backend, the API must be swappable per-route.

**Chosen:** define a `TrackerApi` interface; `useTracker` resolves its API from a React **context** (defaulting to the live client). Demo wraps the *same* shells in a provider supplying a **demo API** that mutates an in-memory snapshot using the real `lib/` game logic and persists to `localStorage`.

- **Zero UI duplication** — demo is pixel-identical to production and never drifts.
- **One small change** to `useTracker` (read context instead of importing `api`).
- **High fidelity** — demo recomputes XP/levels/streaks/completion via the same `lib/xp.ts`, `lib/quests.ts`, `lib/plan.ts` the real app uses.

Rejected: duplicating shells for demo (drift + 500-line maintenance trap); build-time module aliasing (can't host live + demo in one build).

### Components / units

| Unit | File | Purpose | Depends on |
|------|------|---------|-----------|
| `TrackerApi` contract | `lib/api/contract.ts` | Interface of the methods the UI calls (snapshot mutations + leaderboard). | tracker types |
| Live client (existing) | `lib/api/client.ts` | Implements `TrackerApi` over the Python backend. Already matches; just declared `implements`/typed against the contract. | fetch, Supabase token |
| API context | `lib/demo/context.tsx` | `TrackerApiProvider` + `useTrackerApi()`. Default value = live client. | React context |
| `useTracker` (edit) | `hooks/use-tracker.ts` | Switch from `import { api }` to `useTrackerApi()`. No behavior change for live. | API context |
| Demo seed | `lib/demo/seed.ts` | A realistic in-progress `TrackerSnapshot` (Lv 7 "Awakened", active streak, ~half of today done, checkbox/count/timer mix, weekly DIS goals mid-progress). | tracker types |
| Demo API | `lib/demo/demo-api.ts` | Implements `TrackerApi` against an in-memory snapshot; recomputes via `lib/` logic; persists to `localStorage`. Returns Promises. | seed, lib logic |
| Demo banner | `components/demo/demo-banner.tsx` | Sticky "Demo mode — sign up to save your progress" + Sign in + Reset. | — |
| Demo page | `app/demo/page.tsx` | Client route, no auth/redirect. Loads snapshot from storage-or-seed, wraps `TrackerRoot` in provider, renders banner. | provider, demo-api, seed |
| Demo leaderboard | `app/demo/leaderboard/page.tsx` | Static curated board (fake hunters + highlighted "You") so the Trophy link works in demo. | — |
| Login entry (edit) | `app/login/page.tsx` | Add "Try the demo — no sign-up" button linking to `/demo`. | — |
| PWA manifest | `app/manifest.ts` | Next route generating `manifest.webmanifest`. | icons |
| PWA icons | `public/icons/*` | 192, 512, maskable-512, apple-touch-icon 180 — generated from a simple DayMaxing glyph. | generation script |
| Layout meta (edit) | `app/layout.tsx` | Add `metadata.appleWebApp` + `metadata.icons`. (themeColor + viewportFit already set.) | manifest, icons |
| Service worker | Serwist (`@serwist/next`) config + `app/sw.ts` | Precache built shell + static assets; runtime cache strategy; enable install prompt. | @serwist/next |
| License | `LICENSE` | Proprietary "All Rights Reserved". | — |
| Terms route | `app/terms/page.tsx` | Terms of Use + liability disclaimer ("self-improvement tool, not medical/fitness advice"). | — |

### Data flow

- **Live (unchanged):** shell → `useTracker` → `useTrackerApi()` → live client → Python API → Supabase.
- **Demo:** shell → `useTracker` → `useTrackerApi()` → demo API → in-memory snapshot (recomputed via `lib/`) → `localStorage` (`slvl.demo`). No network.
- **Demo mutation:** `useTracker` applies its existing optimistic update, then `await`s the demo API, which recomputes the authoritative snapshot synchronously, persists it, and resolves with it. The hook replaces state with the resolved snapshot — same code path as live.

### Offline behavior

- Service worker precaches the app shell, JS/CSS, fonts, icons, and the 3D model assets in `public/models/`.
- **Demo:** fully functional offline (no network dependency once cached).
- **Authed app:** shell + static assets load offline; data fetches degrade to a "you're offline" state. No mutation queueing.

### Error handling

- **Demo storage:** reads guarded — corrupt JSON, parse failure, or quota error → silently reseed from `seed.ts`. All writes wrapped in try/catch (private-mode Safari can throw on `localStorage.setItem`).
- **SSR safety:** `localStorage` only touched in `useEffect`/client; demo page renders the seed on first paint, hydrates persisted state after mount.
- **Demo API never throws network errors** — methods are local and total; `useTracker`'s catch path (revert + toast) effectively never triggers in demo.
- **Service worker:** versioned cache; on activate, old caches purged. SW registration failure is non-fatal (app still works online).

### Testing

- **Demo (testable now, no Supabase):**
  - Unit (`vitest`): `demo-api` — completing a quest awards XP and can level up; count/timer progress; weekly progress; `planWeek` reconciles; reset restores seed; persistence round-trips; corrupt storage reseeds.
  - E2E (`playwright`, headless): open `/demo` → toggle a quest → assert XP/level changed → reload → state persisted → Reset → seed restored. Confirm no redirect to `/login`.
- **PWA:**
  - Assert `/manifest.webmanifest` serves valid JSON with required fields and icon paths resolve (200).
  - Assert apple meta tags + manifest `<link>` present in `<head>`.
  - Assert the service worker registers and a second load serves shell from cache (offline check).

---

## Self-review notes

- **Placeholders:** none — every unit has a file, purpose, and dependency.
- **Consistency:** demo and live share `TrackerApi`, `useTracker`, and the shells; the only divergence is the injected API implementation and the demo-only banner/leaderboard. Offline scope statements are consistent across Scope, Architecture, and Out-of-scope.
- **Scope:** single coherent build (demo + PWA + license). UI deep-review and deploy are sequenced as separate follow-ons, not folded in.
- **Ambiguity:** "offline" is explicitly bounded — demo fully offline, shell cached, no authed data sync.
