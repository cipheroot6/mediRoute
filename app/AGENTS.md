# app/ — Next.js App Router

**Generated:** 2026-07-25
**Commit:** 36b16ea

## Overview
All pages and API routes for MediRoute. Uses Next.js App Router with route groups:
- `(patient)/` — Public-facing navigation flows (unauthenticated)
- `(admin)/admin/` — Admin dashboard (should be auth-protected via proxy middleware, currently broken)
- `api/` — Server-side Route Handlers (Supabase admin client)
- `login/` — Admin login page

## Structure
```
app/
├── layout.tsx                    # Root layout: Geist fonts, dark mode, <html lang="en">
├── globals.css                   # Tailwind v4 + oklch dark theme + custom properties
├── login/page.tsx                # Admin login: email + password (signInWithPassword)
├── (patient)/
│   ├── page.tsx                  # Landing: hospital dropdown + destination autocomplete + "Navigate" button
│   ├── scan/page.tsx             # QR anchor resolver (URL params) → fetch /api/anchor/ → redirect to /navigate
│   └── navigate/page.tsx         # CORE FILE (415 lines): graph load, A*, WebXR AR, voice guidance, progress bar
├── (admin)/admin/
│   ├── page.tsx                  # Hospital list + create hospital form (name, address)
│   ├── [hospitalId]/[floor]/page.tsx  # Floor editor (788 lines): calibration, node/edge CRUD, floor plan upload, AI analysis
│   └── qr/page.tsx              # QR sheet generator: select hospital → preview/print anchor QR codes
└── api/
    ├── admin/
    │   ├── analyze-floor/route.ts  # AI floor plan analysis (Ollama/Gemma vision model)
    │   ├── hospitals/route.ts    # GET list, POST create (name, address)
    │   ├── nodes/route.ts        # GET by hospital+floor, POST create, PUT update, DELETE
    │   ├── edges/route.ts        # GET by hospital+floor, POST create, DELETE
    │   ├── floors/route.ts       # GET by hospital, POST create, PUT (calibration), DELETE
    │   └── anchors/route.ts      # GET by hospital+floor, POST create, DELETE
    ├── hospital/[id]/graph/route.ts  # GET: loadGraph(hospitalId) → { nodes, edges }
    └── anchor/[anchorId]/route.ts    # GET: resolve anchor → { hospitalId, floorId }
```

## Key Files

### `navigate/page.tsx` — Core Navigation (read first)
- Loads graph via `/api/hospital/[id]/graph`
- Runs A* pathfinding from nearest node to destination
- Attempts WebXR AR session; falls back to 2D compass overlay
- Voice guidance via `startVoiceGuidance()` from `lib/voice/speech.ts`
- Position tracking via `startTracking()` from `lib/ar/tracking.ts`
- Node arrival detection: `NODE_ARRIVAL_THRESHOLD_M` (3m default)
- States: `idle → loading → navigating → completed`

### `[hospitalId]/[floor]/page.tsx` — Floor Editor (788 lines, largest)
- Calibration: capture device pose → store as floor's reference point
- Node placement: click on floor plan image → create waypoint with type (ELEVATOR, ENTRANCE, DESK, etc.)
- Edge creation: select two nodes → create bidirectional connection with `wheelchair_accessible` flag
- Floor plan upload to Supabase Storage bucket `floor-plans`
- AI analysis: POST to `/api/admin/analyze-floor` → review suggestions via `AIReviewPanel` component
- Uses URL params: `[hospitalId]` and `[floor]` (floor number)

### `scan/page.tsx` — QR Anchor Resolver
- No camera scanning — reads `anchorId` from URL params (`?a=<uuid>&dest=...&profile=...`)
- Resolves anchor via `/api/anchor/[anchorId]` → gets `hospitalId` + `floorId`
- Caches result in `sessionStorage` for hospital RF environment resilience
- Redirects to `/navigate?hospitalId=...&floor=...&anchorId=...`

### `login/page.tsx` — Admin Login
- Email input + "Sign In" button
- Uses `supabase.auth.signInWithPassword({ email, password })`
- Redirects to admin dashboard on success

## API Route Patterns
- All admin routes use `lib/supabase/server.ts` (admin client, bypasses RLS)
- Public routes (`hospital/[id]/graph`, `anchor/[anchorId]`) also use admin client
- AI route (`analyze-floor`) uses Ollama Cloud API directly (no Supabase)
- Standard pattern: `const supabase = await createClient()` → query → `NextResponse.json()`
- Error handling: try/catch with `NextResponse.json({ error }, { status: 500 })`
- No authentication middleware on admin routes (proxy.ts not wired)

## Route Groups
- `(patient)` — No layout wrapper, direct access, public
- `(admin)/admin/` — Nested group, should be auth-protected (currently broken)
- Route groups don't affect URL structure: `(patient)/page.tsx` → `/`, `(admin)/admin/page.tsx` → `/admin`

## Conventions
- **Pages are self-contained**: All state + logic in page.tsx (only 1 component extracted: `AIReviewPanel.tsx`)
- **Direct Supabase calls**: No data fetching abstraction, no SWR/React Query
- **`useEffect` for initialization**: Graph loading, AR session, voice guidance all start in useEffect
- **URL search params**: Used for state passing between pages (hospitalId, floor, anchorId, destination)
- **No loading.tsx or error.tsx**: No route-level loading/error boundaries

## Anti-Patterns (THIS PROJECT)
- `as any` type assertion: `navigate/page.tsx:128` (`renderer.xr.setSession(session as any)`)
- Console statements left in: `page.tsx:38,41,70`, `navigate/page.tsx:256`, `admin/page.tsx:30`
- Floor editor `[floor]/page.tsx:189` hardcodes click threshold `15`px
- QR page `qr/page.tsx:46` hardcodes QR dimensions `{ width: 200, margin: 2 }`
- `navigate/page.tsx:11` re-declares `NODE_ARRIVAL_THRESHOLD_M` locally instead of importing from constants
