import type { Graph, GraphEdge, GraphNode } from '@/types'
import { createAdminClient } from '@/lib/supabase/server'

// Simple in-memory cache per hospitalId — graph rarely changes
const cache: Record<string, { graph: Graph; loadedAt: number }> = {}
const CACHE_TTL_MS = 5_000 // 5 seconds — keeps rapid rerenders efficient but never serves stale AI-generated graphs

export async function loadGraph(hospitalId: string): Promise<Graph> {
  const cached = cache[hospitalId]
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.graph
  }

  const supabase = createAdminClient()

  const [{ data: rawNodes }, { data: rawEdges }, { data: rawFloors }] = await Promise.all([
    supabase.from('nodes').select('*').eq('hospital_id', hospitalId),
    supabase.from('edges').select('*').eq('hospital_id', hospitalId),
    supabase.from('floors').select('*').eq('hospital_id', hospitalId),
  ])

  const floors: Record<number, { floorPlanUrl: string | null; scaleMpp: number }> = {}
  for (const f of rawFloors ?? []) {
    floors[f.floor_number] = {
      floorPlanUrl: f.floor_plan_url || null,
      scaleMpp: f.scale_mpp || 0.05,
    }
  }

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

  const graph: Graph = { nodes, edges, floors }
  cache[hospitalId] = { graph, loadedAt: Date.now() }
  return graph
}
