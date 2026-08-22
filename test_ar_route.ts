import { astar } from './lib/pathfinding/astar'

const nodes: Record<string, any> = {
  "n1": { id: "n1", floor: 1, x: 0, y: 0, hospitalId: "h1" },
  "n2": { id: "n2", floor: 1, x: 10, y: 0, hospitalId: "h1" },
  "n3": { id: "n3", floor: 2, x: 10, y: 0, hospitalId: "h1" },
  "n4": { id: "n4", floor: 2, x: 20, y: 0, hospitalId: "h1" },
}

const edges = [
  { id: "e1", fromNode: "n1", toNode: "n2", distanceM: 10, isElevator: false, isStairs: false, accessible: true, landmark: null, hospitalId: "h1" },
  { id: "e2", fromNode: "n2", toNode: "n3", distanceM: 1, isElevator: true, isStairs: false, accessible: true, landmark: null, hospitalId: "h1" },
  { id: "e3", fromNode: "n3", toNode: "n4", distanceM: 10, isElevator: false, isStairs: false, accessible: true, landmark: null, hospitalId: "h1" },
]

const graph = { nodes, edges, anchors: {}, floors: {
  1: { floorPlanUrl: "url1", scaleMpp: 0.05 },
  2: { floorPlanUrl: "url2", scaleMpp: 0.05 }
} }

const route = astar(graph as any, "n1", "n4", 'standard')
console.log(route)

// Now simulate handleManualFloorChange
const newFloor = 2
let targetIndex = -1
let targetNode = null
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
console.log("handleManualFloorChange targetIndex:", targetIndex)
console.log("route[targetIndex]:", route?.[targetIndex])

