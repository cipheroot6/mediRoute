import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { GraphEdge, Graph } from '@/types'

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

export function getTurnDirection(
  currentEdge: GraphEdge,
  nextEdge: GraphEdge,
  graph: Graph
): string {
  const p1 = graph.nodes[currentEdge.fromNode]
  const p2 = graph.nodes[currentEdge.toNode]
  const p3 = graph.nodes[nextEdge.toNode]

  if (!p1 || !p2 || !p3) return 'continue straight'

  const angle1 = Math.atan2(p2.y - p1.y, p2.x - p1.x)
  const angle2 = Math.atan2(p3.y - p2.y, p3.x - p2.x)

  let diff = angle2 - angle1
  while (diff > Math.PI) diff -= 2 * Math.PI
  while (diff < -Math.PI) diff += 2 * Math.PI

  const deg = diff * (180 / Math.PI)

  if (deg > 45 && deg < 135) return 'turn right'
  if (deg >= 135 || deg <= -135) return 'turn around'
  if (deg < -45 && deg > -135) return 'turn left'
  if (deg > 10 && deg <= 45) return 'bear right'
  if (deg < -10 && deg >= -45) return 'bear left'
  
  return 'continue straight'
}
