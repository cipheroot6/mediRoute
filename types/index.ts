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
