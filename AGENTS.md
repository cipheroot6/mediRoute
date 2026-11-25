# mediroute — Web-based augmented reality hospital indoor navigation platform

**Score:** 14 — Next.js 16 AR navigation application with A* pathfinding and Three.js WebXR

## OVERVIEW
Indoor hospital navigation platform allowing patients to scan QR anchor waypoints, receive wheelchair-accessible turn-by-turn guidance via WebXR AR and voice prompts, and allowing administrators to manage floor plans with Gemma AI vision analysis.

## STRUCTURE
```
mediroute/
├── app/            # Next.js 16 App Router views ((patient)/, (admin)/admin/, api/)
├── components/     # UI elements and AIReviewPanel for floor plan suggestions
├── certificates/   # Localhost HTTPS SSL certificates required for WebXR testing
├── floor plans/    # Reference PDF architectural hospital blueprints
├── lib/            # A* pathfinding, WebXR SLAM tracking, voice synthesis, Supabase
└── types/          # Domain TypeScript interfaces (GraphNode, GraphEdge, QRAnchor)
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Authoritative build plan | `DEVPLAN.md` | Multi-phase specifications, SQL schema, calibration math |
| Pathfinding algorithms | `lib/pathfinding/` | A* algorithm (`astar.ts`) and Supabase graph loader (`graph.ts`) |
| WebXR AR pose tracking | `lib/ar/tracking.ts` | SLAM pose delta tracking and Three.js chevron arrow rendering |
| Voice guidance synthesis | `lib/voice/speech.ts` | Web Speech API speech synthesis wrapper |
| Supabase clients | `lib/supabase/` | SSR browser client and admin service role backend client |
| AI floor plan analysis | `app/api/admin/analyze-floor/` | Ollama Cloud / Gemma 4 vision model integration |
| Shared TypeScript models | `types/index.ts` | Type definitions for GraphNode, GraphEdge, QRAnchor |

## CONVENTIONS
- **Next.js 16 with Tailwind v4**: Built using React 19, `@tailwindcss/postcss`, and oklch dark palette.
- **HTTPS for WebXR**: AR features require secure HTTPS context; use local certificates in `certificates/`.
- **A* Pathfinding**: Calculates multi-floor paths with wheelchair filters and `ELEVATOR_FLOOR_PENALTY`.
- **Supabase Keys**: Browser uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; server routes use `SUPABASE_SECRET_KEY`.

## ANTI-PATTERNS (THIS PROJECT)
- **Unwired Middleware**: Auth middleware resides in `proxy.ts` rather than `middleware.ts`, leaving routes unprotected.
- **Unsafe XR Types**: Avoid `session as any` casting inside WebXR session initialization.
- **Hardcoded Constants**: Import penalties and arrival thresholds from `lib/constants.ts` instead of using magic numbers.

## COMMANDS
```bash
npm run dev              # Start dev server on :3000
npm run dev:network      # Start with LAN HTTPS support (required for mobile WebXR)
npm test                 # Run test suite (A*, AR simulation, floor change)
npm run typecheck        # Execute TypeScript compiler checks
npm run lint             # Execute ESLint checks
```

