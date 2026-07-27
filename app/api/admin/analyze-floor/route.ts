import { NextRequest, NextResponse } from 'next/server'

// ─── Types returned to the client ────────────────────────────────────────────

export interface AISuggestedNode {
  tempId: string
  label: string
  type: 'destination' | 'junction' | 'elevator' | 'stairs' | 'entry'
  x: number       // metres (floor-plan coordinate space)
  y: number       // metres
  accessible: boolean
  notes: string   // AI reasoning, shown in review panel
}

export interface AISuggestedEdge {
  tempId: string
  fromTempId: string
  toTempId: string
  isStairs: boolean
  isElevator: boolean
  accessible: boolean
}

export interface AIAnalysisResult {
  nodes: AISuggestedNode[]
  edges: AISuggestedEdge[]
  summary: string
  warnings: string[]
}

// ─── AI JSON schema ───────────────────────────────────────────────────────

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label:      { type: 'string' },
          type:       { type: 'string', enum: ['destination', 'junction', 'elevator', 'stairs', 'entry'] },
          pixel_x:    { type: 'integer' },
          pixel_y:    { type: 'integer' },
          accessible: { type: 'boolean' },
          notes:      { type: 'string' },
        },
        required: ['label', 'type', 'pixel_x', 'pixel_y', 'accessible', 'notes'],
      },
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from_index:   { type: 'integer' },
          to_index:     { type: 'integer' },
          is_stairs:    { type: 'boolean' },
          is_elevator:  { type: 'boolean' },
          accessible:   { type: 'boolean' },
        },
        required: ['from_index', 'to_index', 'is_stairs', 'is_elevator', 'accessible'],
      },
    },
    summary:  { type: 'string' },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['nodes', 'edges', 'summary', 'warnings'],
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

const SYSTEM_INSTRUCTION = `You are an expert hospital facilities engineer and indoor navigation architect with 20+ years of experience analysing architectural floor plans and building wayfinding graphs for hospital indoor positioning systems. Your outputs are used directly in software that helps patients navigate real hospitals — missed rooms or incorrect connections directly harm patient outcomes. Prioritise completeness and accuracy above all else. When a label is ambiguous, make your best assessment and document it in the warnings field. Never silently skip a visible room.`

function buildPrompt(scaleMpp: number, imageWidth: number, imageHeight: number): string {
  const pxPerMetre = Math.round(1 / scaleMpp)
  const longCorridorPx = Math.round(15 / scaleMpp)   // 15 m threshold for mid-point junction
  const typicalRoomPx  = Math.round(4 / scaleMpp)    // typical room width reference

  return `Analyse this hospital floor plan image and extract a complete navigation graph.

═══ SCALE REFERENCE ═══
• 1 pixel = ${scaleMpp.toFixed(6)} metres
• 1 metre ≈ ${pxPerMetre} pixels
• Image: ${imageWidth} × ${imageHeight} pixels (pixel_x in [0,${imageWidth}], pixel_y in [0,${imageHeight}])

═══ ANALYSIS — FOLLOW EVERY STEP ═══

STEP 1 — READ ALL TEXT LABELS
Scan the image systematically left-to-right, top-to-bottom. Identify every visible text label, including small or partially obscured text. Note approximate pixel location for each.

STEP 2 — DESTINATION ROOMS
For every labeled room, ward, department, clinic, pharmacy, laboratory, office, toilet, reception, store, etc.:
• Place a node at the visual centroid of the room boundary (not just where the label sits).
• Use the EXACT text from the image as the label. If the label is cut off or unclear, append " (unverified)" and add a warning.
• type = "destination"

STEP 3 — CIRCULATION NETWORK (corridors, hallways, lobbies)
For each corridor / hallway:
a) Trace its full path.
b) Place "junction" nodes at:
   — Every intersection where ≥2 corridors meet (T, X, L, Y junctions).
   — The point directly opposite each room door (where the door meets the corridor).
   — Midpoints of corridors longer than ${longCorridorPx} pixels (~15 m). Add further midpoints every ~10 m for very long corridors.
c) CRITICAL LINE-OF-SIGHT & WALL CLEARANCE RULE: When setting (pixel_x, pixel_y) for corridor junctions connecting to rooms, you MUST visually verify an imaginary straight line between the room node and the corridor junction. This straight connection MUST pass cleanly through the open doorway gap and MUST NEVER cut through, clip, or intersect solid architectural walls (dark lines or thick structural borders). Always place corridor junctions squarely in the center of the open hallway directly inline with the door gap!
d) ESTIMATING UNLABELED CORRIDOR LENGTHS: If a corridor has no explicit dimension label, estimate its length by summing the widths of rooms running along one side. Example: if 3 rooms each span ≈${typicalRoomPx} px (~4 m) along the corridor, the corridor is ≈${3 * typicalRoomPx} px (~12 m). If this exceeds ${longCorridorPx} px, add an intermediate junction at the midpoint.
e) Label junction nodes descriptively: "Corridor A Junction", "Main Hall – East End", etc.

STEP 4 — VERTICAL CIRCULATION
For every elevator bank, lift, staircase, escalator, ramp:
• type = "elevator" or "stairs"
• Place node at centre of the shaft/symbol.
• Mark is_elevator / is_stairs appropriately.

STEP 5 — ENTRY / EXIT POINTS
Main entrance, emergency entrance, service entrance, car-park access:
• type = "entry"

STEP 6 — BUILD EDGES (walkable direct connections)
Add an edge between two nodes ONLY IF a person can walk in a near-straight line from one to the other without passing through a third node.
Rules:
• Each destination room → its corridor junction node (the one directly inline with its doorway opening).
• Junction nodes → adjacent junction nodes along the corridor.
• Elevator/stair nodes → adjacent corridor junction.
• DO NOT connect rooms directly to rooms.
• ABSOLUTE RULE AGAINST WALL CLIPPING: Do not draw edges through walls, structural corners, or across impassable barriers. If a straight line between two nodes clips a wall corner, you must reposition one of the nodes into clear floor space until line-of-sight is completely unobstructed!
• Wheelchair: accessible=false for edges that involve stairs.

STEP 7 — SELF-CHECK (mandatory before responding)
Verify:
□ Every destination node has ≥1 edge.
□ Every junction node has ≥2 edges (if not, remove the junction or merge with neighbour).
□ All from_index / to_index values are valid 0-based indices into your nodes array.
□ No duplicate edges (same pair of node indices appears twice).
□ No edges intersect or slice across solid structural walls or doorframe boundaries.
□ All pixel_x in [0,${imageWidth}], all pixel_y in [0,${imageHeight}].
□ Correct any errors found before writing the final JSON.

Return a JSON object matching the required schema.`
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = process.env.OLLAMA_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OLLAMA_API_KEY is not configured in environment variables.' },
      { status: 500 }
    )
  }

  const body = await req.json()
  const { floorPlanUrl, scaleMpp, imageWidth, imageHeight } = body as {
    floorPlanUrl: string
    scaleMpp: number
    imageWidth: number
    imageHeight: number
  }

  if (!floorPlanUrl || !scaleMpp || !imageWidth || !imageHeight) {
    return NextResponse.json({ error: 'Missing required fields: floorPlanUrl, scaleMpp, imageWidth, imageHeight' }, { status: 400 })
  }

  try {
    const urlObj = new URL(floorPlanUrl)
    const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254', '::1']
    if (blockedHosts.includes(urlObj.hostname) || urlObj.hostname.startsWith('10.') || urlObj.hostname.startsWith('192.168.')) {
      return NextResponse.json({ error: 'Invalid or unauthorized floorPlanUrl host' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL syntax for floorPlanUrl' }, { status: 400 })
  }

  // Fetch floor plan image and convert to base64
  let base64Image: string
  try {
    const imgRes = await fetch(floorPlanUrl)
    if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`)
    const buf = await imgRes.arrayBuffer()
    // Ollama requires raw base64 strings WITHOUT the data URI prefix (e.g. no "data:image/png;base64,")
    base64Image = Buffer.from(buf).toString('base64')
  } catch (e) {
    return NextResponse.json({ error: `Failed to fetch floor plan image: ${e}` }, { status: 400 })
  }

  const promptWithSchema = buildPrompt(scaleMpp, imageWidth, imageHeight) + `

You must return ONLY a JSON object matching this exact schema, with no markdown formatting or extra text:
${JSON.stringify(RESPONSE_SCHEMA, null, 2)}`

  const ollamaBody = {
    // We are using Google's 31B parameter Gemma 4 model, which is available on Ollama Cloud's free tier and natively supports vision.
    model: 'gemma4:31b',
    messages: [
      {
        role: 'user',
        content: SYSTEM_INSTRUCTION + '\n\n' + promptWithSchema,
        images: [base64Image]
      }
    ],
    format: 'json',
    stream: false,
    options: {
      temperature: 0.1
    }
  }

  let ollamaData: { message?: { content?: string } } | null = null
  try {
    const aiRes = await fetch('https://ollama.com/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(ollamaBody),
      signal: AbortSignal.timeout(180_000), // Allow up to 3 mins for massive models
    })
    
    if (!aiRes.ok) {
      const errText = await aiRes.text()
      return NextResponse.json({ error: `Ollama Cloud API error (${aiRes.status}): ${errText}` }, { status: 502 })
    }
    ollamaData = await aiRes.json()
  } catch (e) {
    return NextResponse.json({ error: `Ollama Cloud request failed: ${e}` }, { status: 502 })
  }

  const rawText = ollamaData?.message?.content
  if (!rawText) {
    return NextResponse.json({ error: 'Empty or unexpected response from Ollama Cloud.' }, { status: 502 })
  }

  // Attempt to extract JSON from markdown or conversational text
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  const extractedJson = jsonMatch ? jsonMatch[0] : rawText

  let parsed: {
    nodes: Array<{ label: string; type: string; pixel_x: number; pixel_y: number; accessible: boolean; notes: string }>
    edges: Array<{ from_index: number; to_index: number; is_stairs: boolean; is_elevator: boolean; accessible: boolean }>
    summary: string
    warnings: string[]
  }
  try {
    parsed = JSON.parse(extractedJson.trim())
  } catch (err) {
    console.error('JSON Parse Error:', err)
    console.error('Raw Model Output:', rawText)
    return NextResponse.json({ 
      error: 'Failed to parse JSON response from Ollama Cloud.', 
      rawOutput: rawText 
    }, { status: 502 })
  }

  const now = Date.now()

  // Convert pixel coords → metres and assign stable tempIds
  const nodes: AISuggestedNode[] = parsed.nodes.map((n, i) => ({
    tempId: `ai-node-${i}-${now}`,
    label: n.label,
    type: n.type as AISuggestedNode['type'],
    x: n.pixel_x * scaleMpp,
    y: n.pixel_y * scaleMpp,
    accessible: n.accessible,
    notes: n.notes ?? '',
  }))

  // Build edges using tempIds resolved from node index
  const edges: AISuggestedEdge[] = parsed.edges
    .filter(e => e.from_index >= 0 && e.from_index < nodes.length && e.to_index >= 0 && e.to_index < nodes.length && e.from_index !== e.to_index)
    .map((e, i) => ({
      tempId: `ai-edge-${i}-${now}`,
      fromTempId: nodes[e.from_index].tempId,
      toTempId:   nodes[e.to_index].tempId,
      isStairs:   e.is_stairs,
      isElevator: e.is_elevator,
      accessible: e.accessible,
    }))

  const result: AIAnalysisResult = {
    nodes,
    edges,
    summary: parsed.summary ?? '',
    warnings: parsed.warnings ?? [],
  }

  return NextResponse.json(result)
}
