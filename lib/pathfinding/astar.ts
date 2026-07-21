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
