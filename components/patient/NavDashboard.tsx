'use client'

import { useMemo } from 'react'
import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  MapPin,
  CheckCircle2,
  Building2,
  Navigation2,
  RotateCcw,
  Accessibility
} from 'lucide-react'
import { distanceM } from '@/lib/utils'
import type { Graph, GraphEdge, Profile } from '@/types'

export interface NavDashboardProps {
  graph: Graph
  route: GraphEdge[]
  routeIndex: number
  currentX: number
  currentY: number
  currentFloor: number
  remainingDistM: number
  destinationLabel?: string
  profile: Profile
  arrived: boolean
}

type TurnType = 
  | 'left'
  | 'right'
  | 'slight_left'
  | 'slight_right'
  | 'straight'
  | 'uturn'
  | 'elevator'
  | 'stairs'
  | 'arrive'

interface NavStep {
  type: TurnType
  title: string
  shortTitle: string
  subtext: string
  distanceM: number
}

function formatDistance(meters: number): string {
  if (meters < 1) return '< 1 m'
  return `${Math.round(meters)} m`
}

function calculateTurnType(v1x: number, v1y: number, v2x: number, v2y: number): TurnType {
  const theta1 = Math.atan2(v1y, v1x)
  const theta2 = Math.atan2(v2y, v2x)
  let angleDeg = ((theta2 - theta1) * (180 / Math.PI)) % 360
  if (angleDeg > 180) angleDeg -= 360
  if (angleDeg < -180) angleDeg += 360

  if (Math.abs(angleDeg) <= 25) return 'straight'
  if (angleDeg > 25 && angleDeg <= 60) return 'slight_right'
  if (angleDeg > 60 && angleDeg <= 135) return 'right'
  if (angleDeg >= -60 && angleDeg < -25) return 'slight_left'
  if (angleDeg >= -135 && angleDeg < -60) return 'left'
  return 'uturn'
}

function getNavStep(
  graph: Graph,
  route: GraphEdge[],
  idx: number,
  currentX: number,
  currentY: number
): NavStep | null {
  const currentEdge = route[idx]
  if (!currentEdge) return null

  const nextNode = graph.nodes[currentEdge.toNode]
  const fromNode = graph.nodes[currentEdge.fromNode]
  if (!nextNode) return null

  let dist = 0
  if (fromNode) {
    const geoTotal = distanceM(fromNode.x, fromNode.y, nextNode.x, nextNode.y)
    const geoRemaining = distanceM(currentX, currentY, nextNode.x, nextNode.y)
    const proportion = geoTotal > 0.001 ? Math.max(0, Math.min(1, geoRemaining / geoTotal)) : 0
    dist = proportion * currentEdge.distanceM
  } else {
    dist = distanceM(currentX, currentY, nextNode.x, nextNode.y)
  }

  const isLastEdge = idx === route.length - 1

  if (currentEdge.isElevator || currentEdge.isStairs) {
    const isEv = currentEdge.isElevator
    return {
      type: isEv ? 'elevator' : 'stairs',
      title: `Take ${isEv ? 'elevator' : 'stairs'} to Floor ${nextNode.floor}`,
      shortTitle: `Take ${isEv ? 'elevator' : 'stairs'} to Floor ${nextNode.floor}`,
      subtext: `Transitioning to Floor ${nextNode.floor}`,
      distanceM: dist
    }
  }

  if (isLastEdge) {
    return {
      type: 'arrive',
      title: `Arrive at ${nextNode.label}`,
      shortTitle: `Arrive at destination (${nextNode.label})`,
      subtext: `Destination is on Floor ${nextNode.floor}`,
      distanceM: dist
    }
  }

  const nextEdge = route[idx + 1]
  const afterNextNode = nextEdge ? graph.nodes[nextEdge.toNode] : null

  if (nextEdge?.isElevator || nextEdge?.isStairs) {
    const isEv = nextEdge.isElevator
    const targetFloor = afterNextNode?.floor ?? nextNode.floor
    return {
      type: isEv ? 'elevator' : 'stairs',
      title: `Go to ${isEv ? 'Elevator' : 'Stairs'} at ${nextNode.label}`,
      shortTitle: `Take ${isEv ? 'elevator' : 'stairs'} to Floor ${targetFloor}`,
      subtext: `Prepare to ascend/descend to Floor ${targetFloor}`,
      distanceM: dist
    }
  }

  let v1x = nextNode.x - currentX
  let v1y = nextNode.y - currentY
  if (fromNode && fromNode.floor === nextNode.floor && (nextNode.x !== fromNode.x || nextNode.y !== fromNode.y)) {
    v1x = nextNode.x - fromNode.x
    v1y = nextNode.y - fromNode.y
  }

  const v2x = (afterNextNode?.x ?? nextNode.x) - nextNode.x
  const v2y = (afterNextNode?.y ?? nextNode.y) - nextNode.y

  const turnType = calculateTurnType(v1x, v1y, v2x, v2y)
  const targetName = afterNextNode?.label || 'corridor'
  const junctionName = nextNode.label || 'junction'

  switch (turnType) {
    case 'left':
      return {
        type: 'left',
        title: `Turn left at ${junctionName}`,
        shortTitle: `Turn left towards ${targetName}`,
        subtext: `Towards ${targetName}`,
        distanceM: dist
      }
    case 'right':
      return {
        type: 'right',
        title: `Turn right at ${junctionName}`,
        shortTitle: `Turn right towards ${targetName}`,
        subtext: `Towards ${targetName}`,
        distanceM: dist
      }
    case 'slight_left':
      return {
        type: 'slight_left',
        title: `Slight left at ${junctionName}`,
        shortTitle: `Slight left towards ${targetName}`,
        subtext: `Towards ${targetName}`,
        distanceM: dist
      }
    case 'slight_right':
      return {
        type: 'slight_right',
        title: `Slight right at ${junctionName}`,
        shortTitle: `Slight right towards ${targetName}`,
        subtext: `Towards ${targetName}`,
        distanceM: dist
      }
    case 'uturn':
      return {
        type: 'uturn',
        title: `Make a U-turn at ${junctionName}`,
        shortTitle: `U-turn towards ${targetName}`,
        subtext: `Towards ${targetName}`,
        distanceM: dist
      }
    case 'straight':
    default:
      return {
        type: 'straight',
        title: `Continue straight past ${junctionName}`,
        shortTitle: `Continue straight towards ${targetName}`,
        subtext: `Towards ${targetName}`,
        distanceM: dist
      }
  }
}

function renderTurnIcon(type: TurnType, className = "w-8 h-8") {
  switch (type) {
    case 'left':
      return <CornerUpLeft className={className} />
    case 'right':
      return <CornerUpRight className={className} />
    case 'slight_left':
      return <ArrowUpLeft className={className} />
    case 'slight_right':
      return <ArrowUpRight className={className} />
    case 'uturn':
      return <RotateCcw className={className} />
    case 'elevator':
      return <Building2 className={className} />
    case 'stairs':
      return <Navigation2 className={className} />
    case 'arrive':
      return <MapPin className={className} />
    case 'straight':
    default:
      return <ArrowUp className={className} />
  }
}

export function NavDashboard({
  graph,
  route,
  routeIndex,
  currentX,
  currentY,
  currentFloor,
  remainingDistM,
  destinationLabel,
  profile,
  arrived
}: NavDashboardProps) {
  const currentStep = useMemo(() => {
    return getNavStep(graph, route, routeIndex, currentX, currentY)
  }, [graph, route, routeIndex, currentX, currentY])

  const thenStep = useMemo(() => {
    const nextEdge = route[routeIndex]
    if (!nextEdge || routeIndex + 1 >= route.length) return null
    const nextNode = graph.nodes[nextEdge.toNode]
    if (!nextNode) return null
    return getNavStep(graph, route, routeIndex + 1, nextNode.x, nextNode.y)
  }, [graph, route, routeIndex])

  const currentEdge = route[routeIndex]

  if (arrived) {
    return (
      <div className="absolute top-4 left-4 right-4 z-40 max-w-lg mx-auto pointer-events-auto animate-in fade-in slide-in-from-top-4 duration-300">
        <div className="bg-emerald-950/95 border-2 border-emerald-500/50 backdrop-blur-xl rounded-2xl p-4 shadow-2xl flex items-center gap-4 text-white">
          <div className="w-14 h-14 bg-emerald-500/20 border border-emerald-500/40 rounded-xl flex items-center justify-center text-emerald-400 shrink-0 shadow-inner">
            <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Destination Reached</p>
            <h2 className="text-xl font-extrabold text-white tracking-tight truncate mt-0.5">
              {destinationLabel ?? 'Your Destination'}
            </h2>
          </div>
        </div>
      </div>
    )
  }

  if (!currentStep) return null

  return (
    <div className="absolute top-4 left-4 right-4 z-40 max-w-lg mx-auto pointer-events-auto animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="bg-slate-950/95 border border-emerald-500/30 backdrop-blur-2xl rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.7)] overflow-hidden transition-all duration-300">
        {/* Main Turn & Distance Section */}
        <div className="p-4 flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-700/30 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(34,197,94,0.15)] transition-transform duration-300">
            {renderTurnIcon(currentStep.type, "w-9 h-9 stroke-[2.5]")}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-3xl font-black text-emerald-400 tracking-tight font-mono">
                {formatDistance(currentStep.distanceM)}
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 whitespace-nowrap">
                Floor {currentFloor}
              </span>
            </div>

            <h2 className="text-lg font-bold text-white leading-snug tracking-tight truncate">
              {currentStep.title}
            </h2>

            <p className="text-xs font-medium text-slate-400 mt-0.5 truncate flex items-center gap-1.5">
              {currentEdge?.landmark ? (
                <span className="text-amber-400 font-semibold truncate">
                  📍 {currentEdge.landmark}
                </span>
              ) : (
                currentStep.subtext
              )}
            </p>
          </div>
        </div>

        {/* Connected Footer Ribbon - Next Step ("Then...") & Trip Totals */}
        <div className="bg-slate-900/90 border-t border-slate-800 px-4 py-2.5 flex items-center justify-between text-xs gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0 text-slate-300 font-medium">
            {thenStep ? (
              <>
                <span className="text-emerald-400 shrink-0">
                  {renderTurnIcon(thenStep.type, "w-4 h-4 stroke-[2.5]")}
                </span>
                <span className="truncate">
                  <span className="text-slate-500 font-normal">Then </span>
                  {thenStep.shortTitle}
                </span>
              </>
            ) : (
              <span className="text-slate-400 italic truncate">Direct route to final destination</span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 font-mono text-[11px] font-semibold text-slate-400">
            {profile === 'wheelchair' && (
              <span className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/30 flex items-center gap-1 not-italic font-sans text-[10px]">
                <Accessibility className="w-3 h-3" />
                Accessible
              </span>
            )}
            <span className="bg-slate-800/80 px-2 py-1 rounded text-slate-200">
              {Math.round(remainingDistM)}m total
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
