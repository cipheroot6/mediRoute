# MediRoute — Indoor AR Hospital Navigation

**Generated:** 2026-07-25
**Commit:** 36b16ea
**Branch:** main

## Project Overview
MediRoute is a web-based indoor navigation system for hospitals. Patients scan a QR code (anchor point) to establish position, then follow turn-by-turn directions overlaid via WebXR AR with voice guidance. Administrators manage hospitals, floors, calibration points, navigation nodes, and connections through a separate admin dashboard.

**Status**: Prototype (Phase 10 partially implemented). Core features work end-to-end; some UI/UX polish remains.

## Tech Stack
| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 16 (App Router) | TypeScript strict mode |
| UI | React 19 + Tailwind CSS v4 | Dark-only theme (oklch), Geist font, lucide-react icons |
| 3D/AR | Three.js 0.185 + WebXR Device API | Position tracking via SLAM pose deltas, chevron arrow mesh |
| Backend | Supabase (PostgreSQL) | SSR for browser, admin client for server/API routes |
| AI | Ollama Cloud (Gemma 4 31B vision) | Floor plan analysis via `/api/admin/analyze-floor` |
| Pathfinding | A* (custom, wheelchair-aware) | Multi-floor with elevator penalty |
| Voice | Web Speech API | WebkitSpeechRecognition (browser) |
| Testing | None installed | 1 manual test file: `lib/pathfinding/astar.test.ts` via `npx tsx` |

## Directory Structure
```
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (Geist fonts, dark mode)
│   ├── globals.css               # Tailwind + custom properties (oklch dark theme)
│   ├── login/page.tsx            # Admin login form (email + password)
│   ├── (patient)/                # Public navigation flows
│   │   ├── page.tsx              # Landing: hospital selector + destination search
│   │   ├── scan/page.tsx         # QR anchor resolver (URL params) → redirect to navigate
│   │   └── navigate/page.tsx     # Core navigation: graph load, A*, WebXR AR, voice (415 lines)
│   ├── (admin)/admin/            # Admin dashboard (guarded by proxy middleware)
│   │   ├── page.tsx              # Hospital list + create hospital
│   │   ├── [hospitalId]/[floor]/page.tsx  # Floor plan editor (788 lines)
│   │   └── qr/page.tsx          # QR anchor sheet generator
│   └── api/                      # Route handlers (admin Supabase client)
│       ├── admin/                # CRUD: hospitals, nodes, edges, floors, anchors
│       │   └── analyze-floor/route.ts  # AI floor plan analysis (Ollama/Gemma)
│       ├── hospital/[id]/graph/route.ts  # Public: load graph via loadGraph()
│       └── anchor/[anchorId]/route.ts    # Public: resolve anchor → hospital + floor
├── lib/                          # Core algorithms + infrastructure
│   ├── pathfinding/astar.ts      # A* with wheelchair + elevator logic
│   ├── pathfinding/graph.ts      # Supabase graph loader + in-memory cache
│   ├── ar/tracking.ts            # WebXR pose tracking (SLAM deltas from calibration)
│   ├── voice/speech.ts           # Web Speech API wrapper
│   ├── supabase/client.ts        # Browser Supabase client (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
│   ├── supabase/server.ts        # Admin Supabase client (SUPABASE_SECRET_KEY)
│   ├── utils.ts                  # cn() helper (clsx + tailwind-merge)
│   └── constants.ts              # App-wide constants
├── types/index.ts                # Shared TypeScript types
├── hooks/                        # Empty — reserved for custom hooks
├── components/                   # React components
│   ├── admin/
│   │   └── AIReviewPanel.tsx     # AI-suggested node/edge review UI
│   └── patient/                  # Empty — reserved for patient components
├── proxy.ts                      # Auth middleware (NOT wired as middleware.ts)
├── next.config.ts                # next.config.ts (not .js/.mjs)
├── tsconfig.json                 # Strict TypeScript
├── .env.local                    # Environment variables (gitignored)
├── .gitignore                    # Note: *.md gitignored except README.md
└── DEVPLAN.md                    # Authoritative build plan (gitignored)
```

## Architecture
### Data Flow
```
QR Scan → anchor resolution → floor detection → graph load → A* pathfinding → AR overlay + voice guidance
```

### Supabase Tables (5 total)
| Table | Purpose | Key Relationships |
|-------|---------|-------------------|
| `hospitals` | Hospital definitions | → floors, nodes, edges, qr_anchors |
| `floors` | Floor metadata + calibration points | → hospital_id |
| `nodes` | Navigation waypoints (ELEVATOR, ENTRANCE, etc.) | → hospital_id, floor_id |
| `edges` | Connections between nodes (bidirectional) | → hospital_id, floor, from_node, to_node |
| `qr_anchors` | QR code → position mapping | → hospital_id, floor_id |

### Supabase Client Pattern
- **Browser** (`lib/supabase/client.ts`): Uses `@supabase/ssr`'s `createBrowserClient` with `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (non-standard name)
- **Server/API** (`lib/supabase/server.ts`): Uses `@supabase/supabase-js`'s `createClient` with `SUPABASE_SECRET_KEY` (admin client, bypasses RLS) — does NOT use `@supabase/ssr`

### Pathfinding (A*)
- Multi-floor support with elevator penalty (`ELEVATOR_FLOOR_PENALTY=50`)
- Wheelchair-aware: filters edges by `wheelchair_accessible` flag
- Graph loaded from Supabase, cached in memory, re-fetched on page load
- Expands undirected edges (each edge becomes two directed)

### AR Tracking
- Requires WebXR session with `"local"` reference space
- Tracks position via SLAM pose deltas (not GPS)
- Calibration: user points at a known anchor, system uses relative offset
- Fallback: 2D compass-style guidance when AR unavailable

## Key Files to Read First
| File | Why |
|------|-----|
| `DEVPLAN.md` | Authoritative build plan — all phases, SQL schema, implementation details |
| `types/index.ts` | All shared types (GraphNode, GraphEdge, Graph, QRAnchor, NavigationState, Profile) |
| `lib/pathfinding/astar.ts` | Core algorithm — understand wheelchair routing + elevator penalty |
| `lib/pathfinding/graph.ts` | Graph loader — understand caching, edge expansion, floor filtering |
| `app/(patient)/navigate/page.tsx` | Main navigation page — longest file, ties everything together (415 lines) |
| `app/(admin)/admin/[hospitalId]/[floor]/page.tsx` | Floor editor — node/edge placement, calibration, AI analysis (788 lines) |
| `app/api/admin/analyze-floor/route.ts` | AI floor plan analysis — Ollama/Gemma vision model integration (277 lines) |
| `components/admin/AIReviewPanel.tsx` | AI suggestion review/edit UI (256 lines) |
| `lib/constants.ts` | App-wide constants (thresholds, bucket names, intervals) |

## Conventions
- **File naming**: kebab-case for files, PascalCase for components, camelCase for functions/variables
- **TypeScript**: Strict mode, prefer interfaces for objects, explicit return types on exported functions
- **Styling**: Tailwind CSS v4, dark-only theme (oklch), `cn()` utility for class merging
- **State management**: React useState/useEffect (no global state library)
- **Data fetching**: Direct Supabase calls in components (no SWR/React Query)
- **API routes**: Next.js Route Handlers in `app/api/`, use admin Supabase client
- **Error handling**: Try/catch in async functions, no global error boundary
- **Imports**: Use `@/` path alias (maps to project root)

## Anti-Patterns (THIS PROJECT)
- `as any` type assertion: `navigate/page.tsx:128` (`renderer.xr.setSession(session as any)`)
- Hardcoded magic number: `astar.ts:9` uses `* 50` instead of importing `ELEVATOR_FLOOR_PENALTY` from constants
- Console statements left in: `page.tsx:38,41,70`, `navigate/page.tsx:256`, `admin/page.tsx:30`
- `speech.ts:17-19` hardcodes speech rate/pitch/volume instead of using constants
- Floor editor `[floor]/page.tsx:189` hardcodes click threshold `15`px
- `navigate/page.tsx:11` re-declares `NODE_ARRIVAL_THRESHOLD_M` locally instead of importing from constants

## Commands
```bash
# Development
npm run dev              # Start dev server
npm run dev:network      # LAN access with HTTPS (required for WebXR)
npm run build            # Production build (will fail — no env vars)
npm run start            # Start production server
npm run lint             # ESLint

# Testing (no framework installed — manual)
npx tsx lib/pathfinding/astar.test.ts

# Database
# SQL migrations are in DEVPLAN.md (not automated)
# Run manually in Supabase dashboard
```

## Environment Variables
```env
# Supabase (browser — public)
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key

# Supabase (server — secret, never exposed to client)
SUPABASE_SECRET_KEY=your-service-role-key

# Supabase project URL
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co

# Ollama Cloud API (for AI floor plan analysis)
OLLAMA_API_KEY=your-ollama-api-key
```

## Known Issues
1. **proxy.ts not wired**: Auth middleware exists but isn't named `middleware.ts` — admin routes are unprotected
2. **Layout metadata**: Still says "Create Next App" — needs hospital name
3. **Empty directories**: `hooks/` and `components/{admin,patient}/` exist but are empty
4. **No test framework**: Only 1 manual test file, no vitest/jest configured
5. **No CI/CD**: No GitHub Actions or deployment pipeline
6. **QR scan page is URL-param-only**: No camera scanning — requires `?a=<anchorId>` in URL
7. **.gitignore**: `*.md` is gitignored except `README.md` — DEVPLAN.md won't commit

## Notes for Contributors
- **Read DEVPLAN.md first** — it's the source of truth for what needs to be built
- **Supabase env vars are non-standard**: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (not `ANON_KEY`)
- **No `src/` directory**: Everything is at project root
- **Admin routes are at `(admin)/admin/`**: Nested group structure
- **Graph is cached in memory**: `lib/pathfinding/graph.ts` — no cache invalidation
- **QR codes link to `/scan?a=<uuid>`**: Scan page reads `a`, `dest`, `profile` from URL params → redirect to navigate
- **Voice guidance uses browser API**: Only works in Chromium-based browsers
- **AR requires HTTPS**: WebXR only works over HTTPS or localhost
- **AI floor analysis**: Uses Ollama Cloud (Gemma 4 31B vision) — requires `OLLAMA_API_KEY` env var
- **Three.js for AR arrows**: AR navigation uses Three.js chevron arrow mesh, not just 2D overlays
