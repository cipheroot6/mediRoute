import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { hospitalId, floor, nodes, edges } = body

    if (!hospitalId || floor === undefined) {
      return NextResponse.json({ error: 'Missing hospitalId or floor' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Add hospital_id and floor to all nodes, and map camelCase to snake_case
    const formattedNodes = (nodes || []).map((n: any) => ({
      id: n.id,
      hospital_id: hospitalId,
      floor: floor,
      label: n.label,
      type: n.type,
      x: n.x,
      y: n.y,
      accessible: n.accessible ?? true,
    }))

    // Add hospital_id to all edges, and map camelCase to snake_case
    const formattedEdges = (edges || []).map((e: any) => ({
      id: e.id,
      hospital_id: hospitalId,
      from_node: e.fromNode,
      to_node: e.toNode,
      distance_m: e.distanceM,
      accessible: e.accessible ?? true,
      is_stairs: e.isStairs ?? false,
      is_elevator: e.isElevator ?? false,
      landmark: e.landmark ?? null,
    }))

    if (formattedNodes.length > 0) {
      const { error: nodeError } = await supabase.from('nodes').insert(formattedNodes)
      if (nodeError) {
        return NextResponse.json({ error: nodeError.message }, { status: 400 })
      }
    }

    if (formattedEdges.length > 0) {
      const { error: edgeError } = await supabase.from('edges').insert(formattedEdges)
      if (edgeError) {
        return NextResponse.json({ error: edgeError.message }, { status: 400 })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
