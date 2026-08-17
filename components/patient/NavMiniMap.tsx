'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Map, Maximize2, Minimize2, Navigation2 } from 'lucide-react'
import type { Graph, GraphEdge } from '@/types'

export interface NavMiniMapProps {
  graph: Graph
  route: GraphEdge[]
  routeIndex: number
  currentX: number
  currentY: number
  currentFloor: number
  arrived?: boolean
  heading?: number
}

export function NavMiniMap({
  graph,
  route,
  routeIndex,
  currentX,
  currentY,
  currentFloor,
  arrived = false,
  heading = 0,
}: NavMiniMapProps) {
  const [imgSize, setImgSize] = useState<{ width: number; height: number } | null>(null)
  const [expanded, setExpanded] = useState(false)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      setContainerSize({ width: entries[0].contentRect.width, height: entries[0].contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [expanded]) // Re-evaluate when expanded changes just in case

  const floorData = graph.floors?.[currentFloor]
  const floorPlanUrl = floorData?.floorPlanUrl
  const scaleMpp = floorData?.scaleMpp || 0.05

  const userPx = currentX / scaleMpp
  const userPy = currentY / scaleMpp

  const dotPosition = useMemo(() => {
    if (!imgSize || imgSize.width <= 0 || containerSize.width <= 0) return { left: '50%', top: '50%' }
    
    const scale = Math.min(containerSize.width / imgSize.width, containerSize.height / imgSize.height)
    const renderedWidth = imgSize.width * scale
    const renderedHeight = imgSize.height * scale
    
    // offset caused by object-fit: contain centering the image
    const offsetX = (containerSize.width - renderedWidth) / 2
    const offsetY = (containerSize.height - renderedHeight) / 2

    return {
      left: `${offsetX + (userPx * scale)}px`,
      top: `${offsetY + (userPy * scale)}px`
    }
  }, [userPx, userPy, imgSize, containerSize])

  // Calculate route polyline points for current floor
  const polylinePoints = useMemo(() => {
    if (!imgSize || routeIndex >= route.length) return ''
    const points: string[] = [`${userPx},${userPy}`]
    for (let i = routeIndex; i < route.length; i++) {
      const edge = route[i]
      if (edge.isElevator || edge.isStairs) break
      const targetNode = graph.nodes[edge.toNode]
      if (!targetNode || targetNode.floor !== currentFloor) break
      const nx = targetNode.x / scaleMpp
      const ny = targetNode.y / scaleMpp
      points.push(`${nx},${ny}`)
    }
    return points.join(' ')
  }, [imgSize, route, routeIndex, graph.nodes, currentFloor, userPx, userPy, scaleMpp])

  if (arrived || !floorPlanUrl) return null

  return (
    <div
      className={`absolute bottom-4 right-4 z-40 pointer-events-auto transition-all duration-300 ease-in-out shadow-[0_8px_30px_rgba(0,0,0,0.8)] rounded-2xl border border-emerald-500/30 bg-slate-950/90 backdrop-blur-xl overflow-hidden group ${
        expanded
          ? 'w-64 h-64 md:w-80 md:h-80 border-emerald-500/60'
          : 'w-36 h-36 md:w-44 md:h-44 hover:border-emerald-500/50'
      }`}
    >
      {/* Floor Badge and Expand Controls */}
      <div className="absolute top-2 left-2 right-2 z-20 flex items-center justify-between pointer-events-none">
        <span className="bg-slate-900/90 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md flex items-center gap-1 uppercase tracking-wider">
          <Map size={10} />
          Floor {currentFloor}
        </span>
        
        <button
          onClick={() => setExpanded(e => !e)}
          className="pointer-events-auto bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white p-1 rounded-lg border border-slate-700/80 transition-colors shadow-md"
          title={expanded ? "Minimize map" : "Expand map"}
          type="button"
        >
          {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
      </div>

      {/* Map Content Container */}
      <div 
        ref={containerRef}
        onClick={() => setExpanded(e => !e)}
        className="w-full h-full relative cursor-pointer flex items-center justify-center bg-slate-950 overflow-hidden"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={floorPlanUrl}
          alt={`Floor ${currentFloor} Map`}
          onLoad={(e) => {
            const img = e.currentTarget
            setImgSize({ width: img.naturalWidth, height: img.naturalHeight })
          }}
          className="w-full h-full object-contain select-none opacity-85 hover:opacity-95 transition-opacity"
          draggable={false}
        />

        {/* Route Polyline Layer */}
        {imgSize && polylinePoints && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 ${imgSize.width} ${imgSize.height}`}
            preserveAspectRatio="xMidYMid meet"
          >
            <polyline
              points={polylinePoints}
              fill="none"
              stroke="#0088ff"
              strokeWidth={Math.max(3, imgSize.width * 0.015)}
              strokeDasharray={`${Math.max(6, imgSize.width * 0.02)} ${Math.max(4, imgSize.width * 0.015)}`}
              strokeLinecap="round"
              opacity={0.85}
            />
          </svg>
        )}

        {/* Live User Position Dot */}
        <div
          style={{ left: dotPosition.left, top: dotPosition.top }}
          className="absolute -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none flex items-center justify-center transition-all duration-200"
        >
          {/* Pulsing Outer Halo */}
          <div className="absolute w-6 h-6 bg-blue-500/30 rounded-full animate-ping" />
          {/* Blue Position Indicator */}
          <div className="relative w-3.5 h-3.5 bg-blue-500 rounded-full border-[2.5px] border-white shadow-[0_0_10px_#3b82f6] flex items-center justify-center">
            <Navigation2 
              className="w-2 h-2 text-white stroke-[3] transition-transform duration-150" 
              style={{ transform: `rotate(${(heading ?? 0) + 45}deg)` }} 
            />
          </div>
        </div>
      </div>
    </div>
  )
}
