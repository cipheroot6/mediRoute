import { astar } from '@/lib/pathfinding/astar'
import type { Graph, GraphNode, GraphEdge } from '@/types'

const nodes: Record<string, GraphNode> = {
  n1: { id: 'n1', floor: 1, label: 'N1', type: 'entry', x: 0, y: 0, accessible: true, hospitalId: 'h1' },
  n2: { id: 'n2', floor: 1, label: 'N2', type: 'elevator', x: 10, y: 0, accessible: true, hospitalId: 'h1' },
  n3: { id: 'n3', floor: 2, label: 'N3', type: 'elevator', x: 10, y: 0, accessible: true, hospitalId: 'h1' },
  n4: { id: 'n4', floor: 2, label: 'N4', type: 'destination', x: 20, y: 0, accessible: true, hospitalId: 'h1' },
}

const edges: GraphEdge[] = [
  { id: 'e1', fromNode: 'n1', toNode: 'n2', distanceM: 10, isElevator: false, isStairs: false, accessible: true, landmark: null, hospitalId: 'h1' },
  { id: 'e2', fromNode: 'n2', toNode: 'n3', distanceM: 1, isElevator: true, isStairs: false, accessible: true, landmark: null, hospitalId: 'h1' },
  { id: 'e3', fromNode: 'n3', toNode: 'n4', distanceM: 10, isElevator: false, isStairs: false, accessible: true, landmark: null, hospitalId: 'h1' },
]

const graph: Graph = {
  nodes,
  edges,
  anchors: {},
  floors: {
    1: { floorPlanUrl: 'url1', scaleMpp: 0.05 },
    2: { floorPlanUrl: 'url2', scaleMpp: 0.05 },
  },
}

const route = astar(graph, 'n1', 'n4', 'standard')
console.assert(route !== null && route.length === 3, 'Route contains 3 edges')

const newFloor = 2
let targetIndex = -1
let targetNode: GraphNode | null = null
if (route) {
  for (let i = 0; i < route.length; i++) {
    const edge = route[i]
    const n = graph.nodes[edge.fromNode]
    if (n && n.floor === newFloor && !edge.isElevator && !edge.isStairs) {
      targetIndex = i
      targetNode = n
      break
    }
  }
}

console.assert(targetIndex === 2, 'Found target floor transition index at 2')
console.assert(targetNode?.floor === newFloor, 'Target node is on floor 2')
console.log('✓ AR Route multi-floor transition test passed')
