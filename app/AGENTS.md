# app — Next.js App Router routes, patient navigation, and admin API handlers

**Score:** 14 — Core routing subsystem encapsulating public WebXR navigation and hospital floor editor

## OVERVIEW
Next.js App Router tree containing unauthenticated patient guidance views, QR code anchor resolution, hospital floor editing, and REST API handlers for graph retrieval and vision analysis.

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Root layout & styling | `layout.tsx`, `globals.css` | Geist font, dark oklch theme, root metadata |
| Patient entry & search | `(patient)/page.tsx` | Hospital dropdown and destination search landing |
| QR anchor resolution | `(patient)/scan/page.tsx` | URL param resolution, anchor caching, redirect to navigate |
| Core AR navigation | `(patient)/navigate/page.tsx` | Main view: WebXR session, A* execution, speech guidance |
| Hospital management | `(admin)/admin/page.tsx` | Hospital directory and facility registration form |
| Interactive floor editor | `(admin)/admin/[hospitalId]/[floor]/page.tsx` | Calibration, waypoint/edge CRUD, blueprint upload |
| QR anchor sheet generator | `(admin)/admin/[hospitalId]/qr/page.tsx` | Anchor code rendering and printable sheets |
| Graph query API | `api/hospital/[id]/graph/route.ts` | Graph waypoint and edge loader for pathfinding |
| Vision floor plan API | `api/admin/analyze-floor/route.ts` | Ollama / Gemma 4 vision model integration |

## CONVENTIONS
- **Route Group Partitioning**: `(patient)` for public patient flows and `(admin)` for administrative dashboards.
- **Server Route Clients**: API handlers in `api/` initialize the Supabase admin client (`lib/supabase/server.ts`).
- **URL Parameter State**: Navigation parameters (`hospitalId`, `floor`, `anchorId`) flow across routes via search params.

## ANTI-PATTERNS (THIS PROJECT)
- **Unprotected Admin Routes**: Admin routes lack active middleware enforcement due to `proxy.ts` naming.
- **Missing Loading Boundaries**: Pages lack `loading.tsx` or `error.tsx` fallback boundaries.
- **Local Constant Redefinition**: `navigate/page.tsx` re-defines `NODE_ARRIVAL_THRESHOLD_M` locally instead of importing constants.

## COMMANDS
```bash
npm run dev              # Start dev server on :3000
npm run dev:network      # Launch with HTTPS certificates for mobile WebXR testing
npm test                 # Run test suite (A*, AR simulation, floor change)
npm run typecheck        # Execute TypeScript compiler checks
npm run lint             # Execute ESLint checks
```

