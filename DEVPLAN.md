# MediRoute — End to End Build Plan

Everything you need to build MediRoute from zero to demo-ready. Follow phases in order — each one depends on the previous.

---

## Phase 0 — Prerequisites

Accounts you need. All free tiers are fine.

- GitHub account
- Vercel account — vercel.com, sign up with GitHub
- Supabase account — supabase.com, sign up with GitHub

Local machine:
- Node.js 20+ installed
- Git configured
- Android phone with Chrome (for AR testing — you cannot test WebXR in a desktop browser)

---

## Phase 1 — Project Setup

### 1.1 Bootstrap Next.js

```bash
npx create-next-app@latest mediroute
```

When prompted:
- TypeScript → Yes
- ESLint → Yes
- Tailwind CSS → Yes
- src/ directory → No
- App Router → Yes
- Import alias → Yes, keep default `@/*`

```bash
cd mediroute
```

### 1.2 Install dependencies

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install qrcode
npm install lucide-react
npm install clsx tailwind-merge
npm install --save-dev @types/qrcode
```

That's the full list. No charting libraries, no component libraries, no auth packages beyond Supabase. Keep it small.

### 1.3 Folder structure

```bash
mkdir -p app/\(patient\)/scan
mkdir -p app/\(patient\)/navigate
mkdir -p app/\(admin\)/admin/\[hospitalId\]/\[floor\]
mkdir -p app/\(admin\)/admin/\[hospitalId\]/qr
mkdir -p app/api/anchor/\[anchorId\]
mkdir -p app/api/hospital/\[id\]/graph
mkdir -p app/api/admin/hospitals
mkdir -p app/api/admin/floors
mkdir -p app/api/admin/nodes
mkdir -p app/api/admin/edges
mkdir -p app/api/admin/anchors
mkdir -p lib/supabase
mkdir -p lib/pathfinding
mkdir -p lib/ar
mkdir -p lib/voice
mkdir -p components/patient
mkdir -p components/admin
mkdir -p hooks
mkdir -p types
```

### 1.4 Create .env.local

```bash
touch .env.local .env.example
```

Paste into `.env.local` and fill values as you complete each phase:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Copy the same into `.env.example` with values empty. Commit `.env.example`, never commit `.env.local`.

Add to `.gitignore`:
```
.env.local
.env*.local
```

### 1.5 Create lib/utils.ts

```typescript
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Convert pixel coordinates to real-world metres using the floor's scale
export function pxToMetres(px: number, scaleMpp: number): number {
  return px * scaleMpp
}

// Euclidean distance between two points in metres
export function distanceM(
  x1: number, y1: number,
  x2: number, y2: number
): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
}

// Bearing in degrees from point A to point B
// 0 = right (+x), 90 = down (+y), matches screen coordinate space
export function bearing(
  x1: number, y1: number,
  x2: number, y2: number
): number {
  return Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI)
}
```

### 1.6 Create types/index.ts

```typescript
export type Profile = 'standard' | 'wheelchair'

export type NodeType = 'junction' | 'destination' | 'elevator' | 'stairs' | 'entry'

export type GraphNode = {
  id: string
  hospitalId: string
  floor: number
  label: string
  type: NodeType
  x: number        // real-world metres from top-left of floor plan
  y: number        // real-world metres from top-left of floor plan
  accessible: boolean
}

export type GraphEdge = {
  id: string
  hospitalId: string
  fromNode: string
  toNode: string
  distanceM: number
  accessible: boolean
  isStairs: boolean
  isElevator: boolean
  landmark: string | null   // "after the pharmacy"
}

export type Graph = {
  nodes: Record<string, GraphNode>
  edges: GraphEdge[]
}

export type QRAnchor = {
  anchorId: string
  nodeId: string
  hospitalId: string
}

export type Hospital = {
  id: string
  name: string
  floors: number
}

export type Floor = {
  id: string
  hospitalId: string
  floorNumber: number
  floorPlanUrl: string | null
  scaleMpp: number | null     // metres per pixel — set during calibration
}

// Live navigation state — lives in React state, never persisted
export type NavigationState = {
  hospitalId: string
  currentNodeId: string
  currentX: number
  currentY: number
  currentFloor: number
  currentHeading: number     // degrees, from device compass
  route: GraphEdge[]         // ordered edges from current to destination
  destinationNodeId: string
  profile: Profile
}
```

### 1.7 Create lib/constants.ts

```typescript
export const APP_NAME = 'MediRoute'

// IMU dead reckoning — how often we update position from accelerometer
export const IMU_POLL_INTERVAL_MS = 100

// How close (in metres) the user needs to be to a node to count as "arrived"
export const NODE_ARRIVAL_THRESHOLD_M = 3

// Cross-floor edge cost — added to route weight when passing through an elevator
// High enough to prefer single-floor routes but not so high it blocks multi-floor routing
export const ELEVATOR_FLOOR_PENALTY = 50

// Supabase storage bucket for floor plan images
export const FLOOR_PLAN_BUCKET = 'floor-plans'
```

### 1.8 Set up app/globals.css

Replace `app/globals.css` with a sleek, pure black theme. We force a clean, dark aesthetic inspired by modern minimalist interfaces like Vercel, utilizing Geist typography.

```css
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Geist+Mono:wght@100..900&display=swap');
@import "tailwindcss";

@theme inline {
  --font-sans: "Geist", system-ui, -apple-system, sans-serif;
  --font-mono: "Geist Mono", monospace;
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-border: var(--border);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-sm: calc(var(--radius) * 0.6);
}

:root {
  /* Pure Black Background */
  --background: oklch(0.03 0 0);
  --foreground: oklch(0.985 0 0);
  
  --primary: oklch(0.985 0 0);
  --primary-foreground: oklch(0.03 0 0);
  
  --muted: oklch(0.12 0 0);
  --muted-foreground: oklch(0.65 0 0);
  
  --border: oklch(1 0 0 / 6%);
  --radius: 0.625rem;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
    color-scheme: dark;
  }
}
```

Ensure `app/layout.tsx` is updated to force a sleek dark mode appearance by adding `className="dark"` to the `<html>` tag if needed, but the `:root` above already defaults to dark.

---

## Phase 2 — Supabase Setup

### 2.1 Create the project

- Go to supabase.com → New Project
- Name it `mediroute`
- Choose a region close to you
- Save the database password somewhere — you won't need it often but save it

Once created, go to Settings → API and copy:
- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- publishable key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- secret key → `SUPABASE_SECRET_KEY`

Paste all three into `.env.local`.

### 2.2 Create the Supabase clients

`lib/supabase/client.ts` — used in browser components:

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}
```

`lib/supabase/server.ts` — used in API routes and server components:

```typescript
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )
}
```

### 2.3 Run migrations

Go to Supabase → SQL Editor and run this in one go:

```sql
-- Hospitals
create table hospitals (
  id    text primary key,
  name  text not null,
  floors int not null default 1
);

-- Floors (one row per floor per hospital)
create table floors (
  id              uuid primary key default gen_random_uuid(),
  hospital_id     text references hospitals(id) on delete cascade,
  floor_number    int not null,
  floor_plan_url  text,
  scale_mpp       float,        -- metres per pixel, set during calibration
  unique (hospital_id, floor_number)
);

-- Nodes (every navigable point)
create table nodes (
  id           uuid primary key default gen_random_uuid(),
  hospital_id  text references hospitals(id) on delete cascade,
  floor        int not null,
  label        text not null,
  type         text not null check (type in ('junction','destination','elevator','stairs','entry')),
  x            float not null,   -- metres from top-left
  y            float not null,   -- metres from top-left
  accessible   bool not null default true
);

-- Edges (stored bidirectionally — A→B and B→A as separate rows)
create table edges (
  id           uuid primary key default gen_random_uuid(),
  hospital_id  text references hospitals(id) on delete cascade,
  from_node    uuid references nodes(id) on delete cascade,
  to_node      uuid references nodes(id) on delete cascade,
  distance_m   float not null,
  accessible   bool not null default true,
  is_stairs    bool not null default false,
  is_elevator  bool not null default false,
  landmark     text
);

-- QR anchor lookup
create table qr_anchors (
  anchor_id    text primary key,
  node_id      uuid references nodes(id) on delete cascade,
  hospital_id  text references hospitals(id) on delete cascade
);

-- Admin auth (one email/password per hospital — simple, no OAuth needed)
-- We use Supabase Auth for this — no extra table required.
-- Enable Email auth in Supabase → Authentication → Providers → Email

-- Indexes for graph queries
create index on nodes(hospital_id, floor);
create index on edges(hospital_id);
create index on edges(from_node);
create index on qr_anchors(anchor_id);
```

### 2.4 Set up Supabase Storage

- Supabase → Storage → New bucket
- Name: `floor-plans`
- Public bucket: Yes (floor plan images are not sensitive, and we need public URLs to display them in the admin editor)

### 2.5 Enable Email auth for admin with Brevo

- Go to **Supabase → Project Settings → Authentication → SMTP Settings**
- Enable Custom SMTP and configure your Brevo credentials:
  - **Host:** `smtp-relay.brevo.com`
  - **Port:** `587`
  - **Username:** Your Brevo SMTP login
  - **Password:** Your Brevo SMTP master password
  - **Sender Email:** Your verified Brevo sender email
- Ensure "Confirm email" is turned **ON** in Supabase → Authentication → Providers → Email.
- Go to **Supabase → Authentication → Users → Add user** and create one admin account with your email + a password.
- Check your inbox to confirm the account via the Brevo-delivered email.

This is the only account that can access `/admin`. No signup flow needed.

---

## Phase 3 — A* Pathfinding

Write and test this in complete isolation before touching any UI. It's pure logic.

### 3.1 Create lib/pathfinding/astar.ts

```typescript
import type { Graph, GraphEdge, GraphNode, Profile } from '@/types'

type NodeId = string

function heuristic(a: GraphNode, b: GraphNode): number {
  // Euclidean distance in metres + a floor-change penalty
  const dx = a.x - b.x
  const dy = a.y - b.y
  const floorPenalty = Math.abs(a.floor - b.floor) * 50
  return Math.sqrt(dx * dx + dy * dy) + floorPenalty
}

function edgeWeight(edge: GraphEdge, profile: Profile): number {
  if (profile === 'wheelchair') {
    if (edge.isStairs) return Infinity
    if (!edge.accessible) return Infinity
  }
  return edge.distanceM
}

export function astar(
  graph: Graph,
  startId: NodeId,
  endId: NodeId,
  profile: Profile
): GraphEdge[] | null {
  const { nodes } = graph
  if (!nodes[startId] || !nodes[endId]) return null
  if (startId === endId) return []

  // Build adjacency list from edge list
  const adj: Record<NodeId, GraphEdge[]> = {}
  for (const edge of graph.edges) {
    if (!adj[edge.fromNode]) adj[edge.fromNode] = []
    adj[edge.fromNode].push(edge)
  }

  const gScore: Record<NodeId, number> = { [startId]: 0 }
  const fScore: Record<NodeId, number> = {
    [startId]: heuristic(nodes[startId], nodes[endId]),
  }
  const cameFrom: Record<NodeId, { prevNode: NodeId; edge: GraphEdge }> = {}
  const open = new Set<NodeId>([startId])
  const closed = new Set<NodeId>()

  while (open.size > 0) {
    // Node in open with lowest fScore
    let current = [...open].reduce((a, b) =>
      (fScore[a] ?? Infinity) < (fScore[b] ?? Infinity) ? a : b
    )

    if (current === endId) {
      // Reconstruct path
      const path: GraphEdge[] = []
      while (cameFrom[current]) {
        const { edge, prevNode } = cameFrom[current]
        path.unshift(edge)
        current = prevNode
      }
      return path
    }

    open.delete(current)
    closed.add(current)

    for (const edge of adj[current] ?? []) {
      if (closed.has(edge.toNode)) continue
      const w = edgeWeight(edge, profile)
      if (w === Infinity) continue

      const tentativeG = (gScore[current] ?? Infinity) + w
      if (tentativeG < (gScore[edge.toNode] ?? Infinity)) {
        cameFrom[edge.toNode] = { prevNode: current, edge }
        gScore[edge.toNode] = tentativeG
        fScore[edge.toNode] =
          tentativeG + heuristic(nodes[edge.toNode], nodes[endId])
        open.add(edge.toNode)
      }
    }
  }

  return null // No path found
}
```

### 3.2 Test it manually before moving on

Create `lib/pathfinding/astar.test.ts` and run a few cases:

```typescript
import { astar } from './astar'
import type { Graph } from '@/types'

const testGraph: Graph = {
  nodes: {
    a: { id: 'a', hospitalId: 'h1', floor: 1, label: 'Entry', type: 'entry', x: 0, y: 0, accessible: true },
    b: { id: 'b', hospitalId: 'h1', floor: 1, label: 'Junction', type: 'junction', x: 10, y: 0, accessible: true },
    c: { id: 'c', hospitalId: 'h1', floor: 1, label: 'Stairs', type: 'stairs', x: 10, y: 10, accessible: false },
    d: { id: 'd', hospitalId: 'h1', floor: 1, label: 'OPD', type: 'destination', x: 20, y: 0, accessible: true },
  },
  // Edges as stored in DB — undirected, single row each.
  // loadGraph() expands these to both directions; in the test we do it manually.
  edges: [
    { id: 'e1',     hospitalId: 'h1', fromNode: 'a', toNode: 'b', distanceM: 10, accessible: true,  isStairs: false, isElevator: false, landmark: null },
    { id: 'e1_rev', hospitalId: 'h1', fromNode: 'b', toNode: 'a', distanceM: 10, accessible: true,  isStairs: false, isElevator: false, landmark: null },
    { id: 'e2',     hospitalId: 'h1', fromNode: 'b', toNode: 'c', distanceM: 10, accessible: false, isStairs: true,  isElevator: false, landmark: null },
    { id: 'e2_rev', hospitalId: 'h1', fromNode: 'c', toNode: 'b', distanceM: 10, accessible: false, isStairs: true,  isElevator: false, landmark: null },
    { id: 'e3',     hospitalId: 'h1', fromNode: 'b', toNode: 'd', distanceM: 10, accessible: true,  isStairs: false, isElevator: false, landmark: 'after the pharmacy' },
    { id: 'e3_rev', hospitalId: 'h1', fromNode: 'd', toNode: 'b', distanceM: 10, accessible: true,  isStairs: false, isElevator: false, landmark: null },
  ],
}

// Standard — should route a → b → d
const standardRoute = astar(testGraph, 'a', 'd', 'standard')
console.assert(standardRoute?.length === 2, 'Standard: 2 edges expected')
console.assert(standardRoute?.[1].landmark === 'after the pharmacy', 'Landmark on last edge')

// Wheelchair — should also route a → b → d (stairs excluded but b→d is accessible)
const wcRoute = astar(testGraph, 'a', 'd', 'wheelchair')
console.assert(wcRoute?.length === 2, 'Wheelchair: same route, stairs never taken')

// No path case
const noRoute = astar(testGraph, 'c', 'a', 'standard')
console.assert(noRoute === null, 'No path from c (no outgoing edges)')

console.log('All A* tests passed')
```

Run with:
```bash
npx tsx lib/pathfinding/astar.test.ts
```

Do not proceed to Phase 4 until all assertions pass.

### 3.3 Create lib/pathfinding/graph.ts

Helper to load the graph from Supabase and cache it.

```typescript
import type { Graph, GraphEdge, GraphNode } from '@/types'
import { createAdminClient } from '@/lib/supabase/server'

// Simple in-memory cache per hospitalId — graph rarely changes
const cache: Record<string, { graph: Graph; loadedAt: number }> = {}
const CACHE_TTL_MS = 60_000 // 1 minute

export async function loadGraph(hospitalId: string): Promise<Graph> {
  const cached = cache[hospitalId]
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.graph
  }

  const supabase = createAdminClient()

  const [{ data: rawNodes }, { data: rawEdges }] = await Promise.all([
    supabase.from('nodes').select('*').eq('hospital_id', hospitalId),
    supabase.from('edges').select('*').eq('hospital_id', hospitalId),
  ])

  const nodes: Record<string, GraphNode> = {}
  for (const n of rawNodes ?? []) {
    nodes[n.id] = {
      id: n.id,
      hospitalId: n.hospital_id,
      floor: n.floor,
      label: n.label,
      type: n.type,
      x: n.x,
      y: n.y,
      accessible: n.accessible,
    }
  }

  // Each DB row is an undirected edge — expand to both directions here.
  // Single source of truth: update one row and both directions stay in sync.
  const edges: GraphEdge[] = []
  for (const e of rawEdges ?? []) {
    const base: GraphEdge = {
      id: e.id,
      hospitalId: e.hospital_id,
      fromNode: e.from_node,
      toNode: e.to_node,
      distanceM: e.distance_m,
      accessible: e.accessible,
      isStairs: e.is_stairs,
      isElevator: e.is_elevator,
      landmark: e.landmark,
    }
    edges.push(base)
    // Reverse — landmark only applies walking toward the original to_node
    edges.push({ ...base, id: `${e.id}_rev`, fromNode: e.to_node, toNode: e.from_node, landmark: null })
  }

  const graph: Graph = { nodes, edges }
  cache[hospitalId] = { graph, loadedAt: Date.now() }
  return graph
}
```

---

## Phase 4 — API Routes

### 4.1 GET /api/anchor/[anchorId]

Patient's phone calls this immediately after scanning a QR. Returns the node the anchor is attached to.

`app/api/anchor/[anchorId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: { anchorId: string } }
) {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('qr_anchors')
    .select('anchor_id, node_id, hospital_id, nodes(id, label, floor, x, y)')
    .eq('anchor_id', params.anchorId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Anchor not found' }, { status: 404 })
  }

  return NextResponse.json({
    anchorId: data.anchor_id,
    nodeId: data.node_id,
    hospitalId: data.hospital_id,
    node: data.nodes,
  })
}
```

### 4.2 GET /api/hospital/[id]/graph

Sends the full graph to the client. Called once when navigation starts — client caches it.

`app/api/hospital/[id]/graph/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { loadGraph } from '@/lib/pathfinding/graph'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const graph = await loadGraph(params.id)
    return NextResponse.json(graph)
  } catch {
    return NextResponse.json({ error: 'Hospital not found' }, { status: 404 })
  }
}
```

### 4.3 Admin CRUD routes

These are all used by the admin UI in Phase 5. Create each file with the pattern below — adjust table name per route.

`app/api/admin/hospitals/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createAdminClient()
  const { data } = await supabase.from('hospitals').select('*').order('name')
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('hospitals')
    .insert({ id: body.id, name: body.name, floors: body.floors })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
```

`app/api/admin/nodes/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('nodes')
    .insert({
      hospital_id: body.hospitalId,
      floor: body.floor,
      label: body.label,
      type: body.type,
      x: body.x,
      y: body.y,
      accessible: body.accessible ?? true,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const supabase = createAdminClient()
  const { id, ...fields } = body
  const { data, error } = await supabase
    .from('nodes')
    .update(fields)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  const supabase = createAdminClient()
  await supabase.from('nodes').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
```

`app/api/admin/edges/route.ts` — same pattern as nodes but for the `edges` table. Store **one row per undirected edge** — never insert the reverse. The graph loader expands each row into both directions when building the adjacency list. This way an admin updating distance or closing an edge only touches one row and the graph stays consistent.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const supabase = createAdminClient()
  // Single row — graph.ts expands to both directions at load time
  const { data, error } = await supabase
    .from('edges')
    .insert({
      hospital_id: body.hospitalId,
      from_node: body.fromNode,
      to_node: body.toNode,
      distance_m: body.distanceM,
      accessible: body.accessible ?? true,
      is_stairs: body.isStairs ?? false,
      is_elevator: body.isElevator ?? false,
      landmark: body.landmark ?? null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, ...fields } = body
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('edges').update(fields).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  const supabase = createAdminClient()
  await supabase.from('edges').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
```

`app/api/admin/anchors/route.ts` — GET (list by hospitalId), POST (create anchor), DELETE (by anchorId). Same pattern.

`app/api/admin/floors/route.ts` — GET, POST, PATCH (for updating scale_mpp after calibration).

---

## Phase 5 — Admin UI

The admin UI is the tool you use to build the demo hospital. Build it before the patient-facing AR so you have real data to work with.

### 5.1 Admin auth middleware

`middleware.ts` at project root:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  // Only protect /admin routes
  if (!request.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.next()
  }

  const response = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: ['/admin/:path*'],
}
```

### 5.2 Login page

`app/login/page.tsx` — simple email/password form, calls `supabase.auth.signInWithPassword`, redirects to `/admin` on success. No signup link — admin accounts are created manually in Supabase dashboard.

```typescript
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
    } else {
      router.push('/admin')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={handleLogin} className="bg-white p-8 rounded-xl shadow w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">MediRoute Admin</h1>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm"
          required
        />
        <button type="submit" className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium">
          Sign in
        </button>
      </form>
    </div>
  )
}
```

### 5.3 Hospital list — /admin

Server component. Fetches hospitals from `/api/admin/hospitals`. Lists them. Add hospital form at the bottom (id slug, name, floor count). Clicking a hospital goes to `/admin/[hospitalId]/1` (first floor).

### 5.4 Floor plan editor — /admin/[hospitalId]/[floor]

This is the most complex component. It is a `'use client'` page.

`app/(admin)/admin/[hospitalId]/[floor]/page.tsx`:

The page state machine has three modes:
- `calibrating` — shown immediately after image upload, before any nodes are placed
- `placing-nodes` — click on image to drop a node
- `placing-edges` — click node A then node B to draw an edge

```typescript
'use client'
import { useState, useRef, useEffect } from 'react'

type Mode = 'calibrating' | 'placing-nodes' | 'placing-edges'
type CalibrationStep = 'point-a' | 'point-b' | 'enter-distance' | 'done'
```

**Calibration flow inside this component:**

```typescript
// Calibration state
const [calibStep, setCalibStep] = useState<CalibrationStep>('point-a')
const [calibPtA, setCalibPtA] = useState<{px: number, py: number} | null>(null)
const [calibPtB, setCalibPtB] = useState<{px: number, py: number} | null>(null)
const [realDistM, setRealDistM] = useState('')

function handleCalibrationClick(px: number, py: number) {
  if (calibStep === 'point-a') {
    setCalibPtA({ px, py })
    setCalibStep('point-b')
  } else if (calibStep === 'point-b') {
    setCalibPtB({ px, py })
    setCalibStep('enter-distance')
  }
}

async function confirmCalibration() {
  if (!calibPtA || !calibPtB || !realDistM) return
  const dx = calibPtB.px - calibPtA.px
  const dy = calibPtB.py - calibPtA.py
  const pixelDist = Math.sqrt(dx * dx + dy * dy)
  const scaleMpp = parseFloat(realDistM) / pixelDist

  await fetch('/api/admin/floors', {
    method: 'PATCH',
    body: JSON.stringify({ hospitalId, floorNumber: floor, scaleMpp }),
    headers: { 'Content-Type': 'application/json' },
  })

  setScaleMpp(scaleMpp)
  setCalibStep('done')
  setMode('placing-nodes')
}
```

**Node placement:**

```typescript
function handleImageClick(e: React.MouseEvent<HTMLImageElement>) {
  const rect = e.currentTarget.getBoundingClientRect()
  const px = e.clientX - rect.left
  const py = e.clientY - rect.top

  if (mode === 'calibrating') {
    handleCalibrationClick(px, py)
    return
  }

  if (mode === 'placing-nodes') {
    const x = px * scaleMpp!    // convert to metres
    const y = py * scaleMpp!
    setDraftNode({ px, py, x, y })
    setShowNodeForm(true)
  }

  if (mode === 'placing-edges') {
    const clicked = getNodeAtPixel(px, py)  // find nearest node within 20px
    if (!clicked) return
    if (!edgeStart) {
      setEdgeStart(clicked)
    } else {
      setDraftEdge({ from: edgeStart, to: clicked })
      setShowEdgeForm(true)
      setEdgeStart(null)
    }
  }
}
```

**Rendering — overlay dots and lines on the image using an absolutely-positioned SVG:**

```tsx
<div className="relative inline-block">
  <img
    src={floorPlanUrl}
    onClick={handleImageClick}
    className="block max-w-full"
    draggable={false}
    ref={imgRef}
  />
  {/* SVG overlay — same size as the image */}
  <svg
    className="absolute inset-0 w-full h-full pointer-events-none"
    viewBox={`0 0 ${imgRef.current?.naturalWidth ?? 0} ${imgRef.current?.naturalHeight ?? 0}`}
  >
    {/* Edges */}
    {edges.map(edge => {
      const from = nodes.find(n => n.id === edge.fromNode)
      const to = nodes.find(n => n.id === edge.toNode)
      if (!from || !to) return null
      return (
        <line
          key={edge.id}
          x1={from.x / scaleMpp!} y1={from.y / scaleMpp!}
          x2={to.x / scaleMpp!}   y2={to.y / scaleMpp!}
          stroke={edge.isStairs ? '#ef4444' : '#3b82f6'}
          strokeWidth={2}
          strokeDasharray={edge.isElevator ? '6 4' : undefined}
        />
      )
    })}
    {/* Nodes */}
    {nodes.map(node => (
      <circle
        key={node.id}
        cx={node.x / scaleMpp!}
        cy={node.y / scaleMpp!}
        r={8}
        fill={node.type === 'destination' ? '#10b981' : '#6366f1'}
        stroke="white"
        strokeWidth={2}
      />
    ))}
    {/* Calibration points */}
    {calibPtA && <circle cx={calibPtA.px} cy={calibPtA.py} r={6} fill="#f59e0b" />}
    {calibPtB && <circle cx={calibPtB.px} cy={calibPtB.py} r={6} fill="#f59e0b" />}
    {calibPtA && calibPtB && (
      <line
        x1={calibPtA.px} y1={calibPtA.py}
        x2={calibPtB.px} y2={calibPtB.py}
        stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 2"
      />
    )}
  </svg>
</div>
```

**Floor plan upload** — file input → `supabase.storage.from('floor-plans').upload(...)` → get public URL → PATCH the floor row → set `mode = 'calibrating'`.

### 5.5 QR sheet — /admin/[hospitalId]/qr

`app/(admin)/admin/[hospitalId]/qr/page.tsx` — `'use client'`.

Fetches all anchors for the hospital. For each anchor, generates a QR code using the `qrcode` package pointing to the scan URL.

```typescript
import QRCode from 'qrcode'

const url = `${process.env.NEXT_PUBLIC_APP_URL}/scan?a=${anchor.anchorId}`
const dataUrl = await QRCode.toDataURL(url, { width: 200, margin: 2 })
```

Render all QR codes in a grid with the anchor ID and node label printed below each. Add a "Print" button that calls `window.print()`. Add a `@media print` CSS rule to hide all UI chrome and show only the QR grid.

---

## Phase 6 — Patient Entry Screen

`app/(patient)/page.tsx` — this is `/`, the first thing a patient sees.

```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Profile } from '@/types'

export default function EntryPage() {
  const [query, setQuery] = useState('')
  const [profile, setProfile] = useState<Profile>('standard')
  const [results, setResults] = useState<{id: string, label: string}[]>([])
  const router = useRouter()

  // In a real implementation, search against the node list
  // For demo: hardcode the destination nodes and filter by label substring
  async function handleSearch(q: string) {
    setQuery(q)
    // fetch node list once and filter — or hit a search endpoint
  }

  function handleSelect(nodeId: string) {
    router.push(`/scan?dest=${nodeId}&profile=${profile}`)
  }

  return (
    <div className="min-h-screen bg-white flex flex-col px-4 pt-12">
      <h1 className="text-2xl font-bold mb-1">MediRoute</h1>
      <p className="text-gray-500 text-sm mb-6">Where do you need to go?</p>

      {/* Profile toggle */}
      <div className="flex gap-2 mb-4">
        {(['standard', 'wheelchair'] as Profile[]).map(p => (
          <button
            key={p}
            onClick={() => setProfile(p)}
            className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
              profile === p
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-300'
            }`}
          >
            {p === 'standard' ? 'Standard' : '♿ Wheelchair'}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <input
        type="search"
        placeholder="Search — Cardiology OPD, Blood Lab..."
        value={query}
        onChange={e => handleSearch(e.target.value)}
        className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
      />

      {/* Results */}
      <div className="flex flex-col gap-2">
        {results.map(r => (
          <button
            key={r.id}
            onClick={() => handleSelect(r.id)}
            className="text-left px-4 py-3 rounded-xl border border-gray-200 text-sm hover:bg-gray-50"
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  )
}
```

---

## Phase 7 — QR Scan + Positioning

The patient does not run a QR scanner in the app. Their native camera app reads the QR and opens the URL. The `/scan` page just reads the URL params.

`app/(patient)/scan/page.tsx`:

```typescript
'use client'
import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

export default function ScanPage() {
  const params = useSearchParams()
  const router = useRouter()
  const anchorId = params.get('a')
  const dest = params.get('dest')
  const profile = params.get('profile') ?? 'standard'
  const [status, setStatus] = useState('Locating you...')

  useEffect(() => {
    if (!anchorId) {
      setStatus('Invalid QR code.')
      return
    }

    // Check sessionStorage first — if we already fetched this anchor during
    // this hospital visit, use the cached copy. Hospitals have hostile RF
    // environments; we don't want a mid-corridor QR rescan to fail on a
    // dropped network request.
    const cacheKey = `anchor:${anchorId}`
    const cached = sessionStorage.getItem(cacheKey)

    const resolveAnchor = cached
      ? Promise.resolve(JSON.parse(cached))
      : fetch(`/api/anchor/${anchorId}`)
          .then(r => r.json())
          .then(data => {
            if (!data.error) sessionStorage.setItem(cacheKey, JSON.stringify(data))
            return data
          })

    resolveAnchor
      .then(data => {
        if (data.error) {
          setStatus('QR code not recognised.')
          return
        }
        const url = new URL('/navigate', window.location.origin)
        url.searchParams.set('hospitalId', data.hospitalId)
        url.searchParams.set('startNodeId', data.nodeId)
        url.searchParams.set('startX', data.node.x)
        url.searchParams.set('startY', data.node.y)
        url.searchParams.set('startFloor', data.node.floor)
        if (dest) url.searchParams.set('dest', dest)
        url.searchParams.set('profile', profile)
        router.replace(url.pathname + url.search)
      })
      .catch(() => setStatus('No signal. Try moving closer to a window.'))
  }, [anchorId])

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <p className="text-gray-600 text-lg">{status}</p>
    </div>
  )
}
```

### 7.1 Positioning strategy — WebXR SLAM, not dead reckoning

**Do not use raw accelerometer data to estimate position.** Double-integrating accelerometer readings to get distance drifts exponentially — after a 15-metre walk, your estimated position is metres off. We are not building a step counter.

Instead, use what WebXR already gives you for free.

When running an `immersive-ar` session on Android Chrome, WebXR uses ARCore under the hood. ARCore does visual-inertial odometry (SLAM) — it tracks the camera's motion through space using the camera feed + IMU together, far more accurately than raw IMU alone. `XRFrame.getViewerPose()` returns the device's current pose in the session's reference space, updated every frame.

**How we use it:**

1. QR code scan establishes absolute position: `worldOrigin = { x, y, floor }` (in metres, in our floor plan coordinate space)
2. XR session starts — we capture `initialPose` from `getViewerPose()` at session start
3. Every frame, we get `currentPose` from `getViewerPose()`. The delta from `initialPose` gives us how far the user has moved in XR space (in metres, in the XR session's local coordinate system)
4. We add that delta to `worldOrigin` to get the estimated real-world position
5. When the user scans another QR code, we recalibrate: `worldOrigin` is reset to the new anchor's known position, and `initialPose` is reset to the current XR pose. Drift is wiped out.

`lib/ar/tracking.ts`:

```typescript
export type XRPosition = {
  x: number   // metres, floor plan coordinate space
  y: number
  floor: number
}

export type XRTracker = {
  // Call when a QR anchor establishes absolute position
  recalibrate: (worldPos: XRPosition, currentPose: XRViewerPose) => void
  // Call every XR frame — returns current estimated world position
  getWorldPosition: (currentPose: XRViewerPose) => XRPosition
  // Heading in degrees (0 = +X axis of floor plan)
  getHeading: (currentPose: XRViewerPose) => number
}

export function createXRTracker(): XRTracker {
  let worldOrigin: XRPosition = { x: 0, y: 0, floor: 1 }
  // XR position at the time of last calibration
  let poseOrigin: { x: number; y: number; z: number } | null = null

  function getPoseTranslation(pose: XRViewerPose) {
    const m = pose.transform.matrix
    return { x: m[12], y: m[13], z: m[14] }
  }

  return {
    recalibrate(worldPos, currentPose) {
      worldOrigin = worldPos
      poseOrigin = getPoseTranslation(currentPose)
    },

    getWorldPosition(currentPose) {
      if (!poseOrigin) return worldOrigin
      const p = getPoseTranslation(currentPose)
      // XR space: X = right, Z = forward (into screen/ahead of camera), Y = up
      // Floor plan space: X = right, Y = down the corridor
      // Map XR delta-X → floor plan delta-X, XR delta-Z → floor plan delta-Y
      const dx = p.x - poseOrigin.x
      const dy = p.z - poseOrigin.z   // forward movement in XR = Y in our 2D plan
      return {
        x: worldOrigin.x + dx,
        y: worldOrigin.y + dy,
        floor: worldOrigin.floor,
      }
    },

    getHeading(currentPose) {
      // Extract heading from the rotation component of the XR transform
      // XR quaternion → yaw angle
      const q = currentPose.transform.orientation
      const yaw = Math.atan2(
        2 * (q.w * q.y + q.x * q.z),
        1 - 2 * (q.y * q.y + q.z * q.z)
      )
      return yaw * (180 / Math.PI)
    },
  }
}
```

**Note on the coordinate mapping:** The XR reference space has Y pointing up and Z pointing toward you (out of the screen when standing upright). Our floor plan has Y pointing down the page. The mapping `XR.z → floorPlan.y` holds as long as the user is walking roughly perpendicular to the floor — which in a hospital corridor they always are. If the floor plan orientation differs from physical north, add a rotation offset during calibration.

---

## Phase 8 — AR Navigation View

This is the centrepiece. `app/(patient)/navigate/page.tsx`.

### 8.1 WebXR setup

```typescript
'use client'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { astar } from '@/lib/pathfinding/astar'
import { bearing, distanceM } from '@/lib/utils'
import { useIMU } from '@/hooks/useIMU'
import type { Graph, GraphEdge, Profile } from '@/types'

export default function NavigatePage() {
  const params = useSearchParams()
  const hospitalId = params.get('hospitalId')!
  const startNodeId = params.get('startNodeId')!
  const startX = parseFloat(params.get('startX')!)
  const startY = parseFloat(params.get('startY')!)
  const startFloor = parseInt(params.get('startFloor')!)
  const destNodeId = params.get('dest')!
  const profile = (params.get('profile') ?? 'standard') as Profile

  const [graph, setGraph] = useState<Graph | null>(null)
  const [route, setRoute] = useState<GraphEdge[]>([])
  const [currentX, setCurrentX] = useState(startX)
  const [currentY, setCurrentY] = useState(startY)
  const [currentFloor, setCurrentFloor] = useState(startFloor)
  const [routeIndex, setRouteIndex] = useState(0)   // which edge we're currently on
  const [xrSupported, setXrSupported] = useState<boolean | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const xrSessionRef = useRef<XRSession | null>(null)
  const xrTrackerRef = useRef(createXRTracker())
  const [heading, setHeading] = useState(0)

  // Load graph once — check sessionStorage first so a signal dropout
  // mid-navigation doesn't break a QR rescan.
  useEffect(() => {
    const cacheKey = `graph:${hospitalId}`
    const cached = sessionStorage.getItem(cacheKey)

    const resolveGraph: Promise<Graph> = cached
      ? Promise.resolve(JSON.parse(cached))
      : fetch(`/api/hospital/${hospitalId}/graph`)
          .then(r => r.json())
          .then(g => {
            sessionStorage.setItem(cacheKey, JSON.stringify(g))
            return g
          })

    resolveGraph.then((g: Graph) => {
      setGraph(g)
      const edges = astar(g, startNodeId, destNodeId, profile)
      setRoute(edges ?? [])
    })
  }, [hospitalId, startNodeId, destNodeId, profile])

  // Check WebXR support
  useEffect(() => {
    if (!navigator.xr) { setXrSupported(false); return }
    navigator.xr.isSessionSupported('immersive-ar').then(setXrSupported)
  }, [])

  // ...
}
```

### 8.2 Starting the XR session

```typescript
async function startAR() {
  if (!navigator.xr || !overlayRef.current) return

  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['dom-overlay'],
    domOverlay: { root: overlayRef.current },
  })

  // The camera feed is automatic in immersive-ar
  // The overlayRef div floats above the camera
  // We update the arrow in the overlay using React state

  session.addEventListener('end', () => {
    // Session ended — user pressed back or browser closed XR
  })

  // Start render loop (needed to keep session alive, even if we render in DOM)
  const gl = document.createElement('canvas').getContext('webgl2', { xrCompatible: true })!
  await gl.canvas  // ensure compatible
  session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) })

  const refSpace = await session.requestReferenceSpace('local')

  // Calibrate tracker with the starting anchor position
  session.requestAnimationFrame(function firstFrame(time, xrFrame) {
    const pose = xrFrame.getViewerPose(refSpace)
    if (pose) {
      xrTrackerRef.current.recalibrate(
        { x: startX, y: startY, floor: startFloor },
        pose
      )
    }
  })

  session.requestAnimationFrame(function frame(time, xrFrame) {
    session.requestAnimationFrame(frame)

    const pose = xrFrame.getViewerPose(refSpace)
    if (!pose) return

    const worldPos = xrTrackerRef.current.getWorldPosition(pose)
    const h = xrTrackerRef.current.getHeading(pose)

    setCurrentX(worldPos.x)
    setCurrentY(worldPos.y)
    setHeading(h)
  })
}
```

### 8.3 The DOM overlay — what the user sees

```tsx
{/* This div IS the AR overlay — floats over the camera feed */}
<div ref={overlayRef} className="fixed inset-0 pointer-events-none">

  {/* Top bar */}
  <div className="absolute top-0 left-0 right-0 bg-black/50 text-white px-4 py-3 flex items-center justify-between pointer-events-none">
    <div>
      <p className="text-xs text-white/70">Navigating to</p>
      <p className="font-semibold">{destNode?.label}</p>
    </div>
    <div className="text-right">
      <p className="text-xs text-white/70">Floor {currentFloor}</p>
      <p className="text-sm">{Math.round(remainingDistM)}m</p>
    </div>
  </div>

  {/* Directional arrow — rotates based on bearing vs heading */}
  <div
    className="absolute inset-0 flex items-center justify-center"
    style={{ transform: `rotate(${arrowRotation}deg)`, transition: 'transform 0.2s ease' }}
  >
    <div className="w-20 h-20 bg-blue-500/80 rounded-full flex items-center justify-center shadow-lg">
      {/* Arrow pointing up — rotation handles direction */}
      <svg viewBox="0 0 24 24" className="w-10 h-10 text-white fill-current">
        <path d="M12 2L4 14h5v8h6v-8h5z" />
      </svg>
    </div>
  </div>

  {/* Voice cue banner at bottom */}
  {currentEdge?.landmark && (
    <div className="absolute bottom-8 left-4 right-4 bg-black/60 text-white rounded-2xl px-5 py-4">
      <p className="text-sm text-white/70 mb-1">Next</p>
      <p className="font-medium">Turn left {currentEdge.landmark}</p>
    </div>
  )}

  {/* Elevator instruction overlay */}
  {currentEdge?.isElevator && (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70">
      <div className="bg-white rounded-2xl p-6 mx-4 text-center">
        <p className="text-4xl mb-3">🛗</p>
        <p className="font-semibold text-lg">Take the elevator</p>
        <p className="text-gray-500 mt-1">to Floor {nextFloor}</p>
        <button
          onClick={confirmFloorTransition}
          className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-full text-sm pointer-events-auto"
        >
          I'm on Floor {nextFloor}
        </button>
      </div>
    </div>
  )}

  {/* Wheelchair mode indicator */}
  {profile === 'wheelchair' && (
    <div className="absolute top-16 right-4 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
      ♿ Accessible route
    </div>
  )}
</div>
```

### 8.4 Arrow rotation calculation

```typescript
// arrowRotation: how much to rotate the up-pointing arrow so it points toward the next node

const currentEdge = route[routeIndex]
const nextNode = currentEdge ? graph?.nodes[currentEdge.toNode] : null

const arrowRotation = useMemo(() => {
  if (!nextNode) return 0
  // Bearing from current position to next node (in our coordinate space)
  const targetBearing = bearing(currentX, currentY, nextNode.x, nextNode.y)
  // Device heading from compass (alpha = degrees from north, clockwise)
  // Our coordinate space: 0 = right (+x). Adjust as needed based on how
  // the floor plan is oriented vs. physical north.
  // For demo: assume floor plan top = physical north
  const deviceBearingFromRight = heading - 90  // convert north-up to right-up
  return targetBearing - deviceBearingFromRight
}, [nextNode, currentX, currentY, heading])
```

### 8.5 Node arrival detection

```typescript
useEffect(() => {
  if (!graph || route.length === 0) return
  const currentEdge = route[routeIndex]
  if (!currentEdge) return

  const nextNode = graph.nodes[currentEdge.toNode]
  const dist = distanceM(currentX, currentY, nextNode.x, nextNode.y)

  if (dist < NODE_ARRIVAL_THRESHOLD_M) {
    if (routeIndex === route.length - 1) {
      // Arrived at destination
      setArrived(true)
      speakCue('You have arrived at your destination.')
    } else {
      setCurrentX(nextNode.x)
      setCurrentY(nextNode.y)
      setCurrentFloor(nextNode.floor)
      setRouteIndex(i => i + 1)
      const nextEdge = route[routeIndex + 1]
      if (nextEdge?.landmark) {
        speakCue(`Continue, then ${nextEdge.landmark}`)
      }
    }
  }
}, [currentX, currentY, routeIndex, route, graph])
```

---

## Phase 9 — Voice Guidance

`lib/voice/speech.ts`:

```typescript
let synth: SpeechSynthesis | null = null

function getSynth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null
  if (!synth) synth = window.speechSynthesis
  return synth
}

export function speakCue(text: string) {
  const s = getSynth()
  if (!s) return

  // Cancel current speech before new cue
  s.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 0.95
  utterance.pitch = 1
  utterance.volume = 1

  // Prefer a local voice to avoid network dependency
  const voices = s.getVoices()
  const preferred = voices.find(v => v.lang.startsWith('en') && v.localService)
  if (preferred) utterance.voice = preferred

  s.speak(utterance)
}

export function cancelSpeech() {
  getSynth()?.cancel()
}
```

Import `speakCue` in the navigate page and call it on:
- Route computed: `"Navigating to Cardiology OPD. Route found."`
- Node transition: `"Turn left after the pharmacy"` (from `currentEdge.landmark`)
- Floor transition: `"Take the elevator to floor 3"`
- Arrival: `"You have arrived at your destination"`

---

## Phase 10 — Seed the Demo Hospital

Now that the admin UI exists, use it to build the demo hospital.

### 10.1 Create the hospital

Admin → `/admin` → Add hospital:
- ID: `demo-hospital`
- Name: `City General Hospital`
- Floors: 2

### 10.2 Upload floor plans and calibrate

For each floor:
1. Get or draw a simple floor plan image (PNG). It does not need to be a real hospital — a corridor layout you sketch works fine.
2. Admin → `/admin/demo-hospital/1` → Upload image
3. Calibration tool: click two points you know the distance between (measure a corridor in your demo venue if possible, or use a known scale on the image), enter the distance
4. `scale_mpp` is saved

### 10.3 Place nodes

For Floor 1, place at minimum:
- Entry node at the main entrance
- Junction nodes at every corridor turn
- An elevator node
- 2–3 destination nodes (Blood Lab, Pharmacy, OPD Registration)

For Floor 2:
- Elevator node (connected to Floor 1 elevator node with a cross-floor edge)
- Destination nodes (Cardiology OPD, Radiology)

### 10.4 Draw edges

Connect every adjacent node. Mark stairs edges. Mark elevator edges. Add landmark text to edges where it helps (near pharmacy, past the nurses' station).

### 10.5 Create QR anchors

For every junction node and destination node, create a QR anchor. Print the QR sheet. The QR codes are ready to stick on walls.

---

## Phase 11 — Deployment

### 11.1 Push to GitHub

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/yourusername/mediroute
git push -u origin main
```

### 11.2 Deploy to Vercel

- vercel.com → New Project → Import your repo
- Vercel auto-detects Next.js — no config needed
- Add all env vars from `.env.local` in Vercel dashboard:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_APP_URL` → set to your Vercel URL
- Deploy

### 11.3 Verify HTTPS

WebXR, DeviceOrientation, and camera access all require HTTPS. Vercel preview and production URLs are HTTPS by default — you're covered. Do not demo over HTTP.

Local development with HTTPS:
```bash
next dev --experimental-https
```

This generates a self-signed cert. Chrome will warn — click through for local testing. On your Android phone, you'll need to access via your machine's local IP over HTTPS, or use ngrok:

```bash
npx ngrok http 3000
# Use the https:// ngrok URL on your phone
```

---

## Phase 12 — Demo Prep

### 12.1 Print QR codes

Go to `/admin/demo-hospital/qr`. Print the sheet. Cut out individual QR codes.

### 12.2 Physical walkthrough

Walk the actual corridor (or demo space) with your phone. Stick QR codes at the right junction points. Scan each one and confirm it correctly identifies your position. Fix any that don't.

### 12.3 Full demo run

Start from the entry node. Select a destination. Walk the route. Confirm:
- Arrow points the right way at every junction
- Voice cues fire at each node transition
- Elevator transition screen appears correctly
- Arrival message fires at the destination

Fix whatever breaks. Something will.

---

## Phase 12 — Pre-Demo Checklist

- [ ] All env vars set in Vercel
- [ ] Supabase database reachable from production
- [ ] Floor plans uploaded and calibrated for both floors
- [ ] All nodes placed with correct coordinates
- [ ] All edges drawn — no isolated nodes
- [ ] Wheelchair profile tested — no route includes stairs
- [ ] QR codes printed and physically placed
- [ ] Each QR code scanned to confirm anchor lookup works
- [ ] AR session starts on Android Chrome
- [ ] Arrow rotates correctly as you turn
- [ ] Voice guidance fires at each node transition
- [ ] Elevator transition screen works
- [ ] Arrival message fires
- [ ] Demo hospital destination search works from entry screen
- [ ] Admin login works on production URL
- [ ] No console errors in Chrome DevTools on Android (use remote debugging: `chrome://inspect`)

---

## Build Order Summary

| Phase | What | Why first |
|---|---|---|
| 0 | Prerequisites | Accounts and device |
| 1 | Project setup | Foundation |
| 2 | Supabase schema + storage | Everything depends on this |
| 3 | A* pathfinding | Core logic — test in isolation |
| 4 | API routes | Bridge between DB and client |
| 5 | Admin UI | Need real data before building navigation |
| 6 | Patient entry screen | Simple, connects to navigation |
| 7 | QR scan + positioning | Position foundation for AR |
| 8 | AR navigation view | Riskiest — do after all data is in place |
| 9 | Voice guidance | Plugs into navigation view |
| 10 | Seed demo hospital | Validates the whole stack |
| 11 | Deploy | Ship before demo prep |
| 12 | Demo prep | Physical walkthrough last |

---

*Follow phases in order. Do not skip ahead. Each phase assumes the previous one is working.*
