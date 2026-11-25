import { astar } from '@/lib/pathfinding/astar'
import type { Graph } from '@/types'

const testGraph: Graph = {
  nodes: {
    a: { id: 'a', hospitalId: 'h1', floor: 1, label: 'Entry', type: 'entry', x: 0, y: 0, accessible: true },
    b: { id: 'b', hospitalId: 'h1', floor: 1, label: 'Junction', type: 'junction', x: 10, y: 0, accessible: true },
    c: { id: 'c', hospitalId: 'h1', floor: 1, label: 'Stairs', type: 'stairs', x: 10, y: 10, accessible: false },
    d: { id: 'd', hospitalId: 'h1', floor: 1, label: 'OPD', type: 'destination', x: 20, y: 0, accessible: true },
  },
  edges: [
    { id: 'e1', hospitalId: 'h1', fromNode: 'a', toNode: 'b', distanceM: 10, accessible: true, isStairs: false, isElevator: false, landmark: null },
    { id: 'e1_rev', hospitalId: 'h1', fromNode: 'b', toNode: 'a', distanceM: 10, accessible: true, isStairs: false, isElevator: false, landmark: null },
    { id: 'e2', hospitalId: 'h1', fromNode: 'b', toNode: 'c', distanceM: 10, accessible: false, isStairs: true, isElevator: false, landmark: null },
    { id: 'e2_rev', hospitalId: 'h1', fromNode: 'c', toNode: 'b', distanceM: 10, accessible: false, isStairs: true, isElevator: false, landmark: null },
    { id: 'e3', hospitalId: 'h1', fromNode: 'b', toNode: 'd', distanceM: 10, accessible: true, isStairs: false, isElevator: false, landmark: 'after the pharmacy' },
    { id: 'e3_rev', hospitalId: 'h1', fromNode: 'd', toNode: 'b', distanceM: 10, accessible: true, isStairs: false, isElevator: false, landmark: null },
  ],
}

// 1. Standard Profile Route
const standardRoute = astar(testGraph, 'a', 'd', 'standard')
console.assert(standardRoute !== null && standardRoute.length === 2, 'Standard: 2 edges expected')
console.assert(standardRoute?.[1].landmark === 'after the pharmacy', 'Landmark on last edge')

// 2. Wheelchair Accessible Route (stairs excluded)
const wcRoute = astar(testGraph, 'a', 'd', 'wheelchair')
console.assert(wcRoute !== null && wcRoute.length === 2, 'Wheelchair: same route, stairs never taken')

// 3. Inaccessible Route Case
const noRoute = astar(testGraph, 'c', 'a', 'wheelchair')
console.assert(noRoute === null, 'No path from c for wheelchair')

console.log('✓ A* Pathfinding tests passed')
