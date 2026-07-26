'use client'
import { useEffect, useRef, useState, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import * as THREE from 'three'
import { astar } from '@/lib/pathfinding/astar'
import { bearing, distanceM } from '@/lib/utils'
import { createXRTracker } from '@/lib/ar/tracking'
import { speakCue } from '@/lib/voice/speech'
import { NODE_ARRIVAL_THRESHOLD_M } from '@/lib/constants'
import { NavDashboard } from '@/components/patient/NavDashboard'
import { NavMiniMap } from '@/components/patient/NavMiniMap'
import type { Graph, GraphEdge, Profile } from '@/types'

function NavigateContent() {
  const params = useSearchParams()
  const hospitalId = params.get('hospitalId')!
  const startNodeId = params.get('startNodeId')!
  const startX = parseFloat(params.get('startX')!)
  const startY = parseFloat(params.get('startY')!)
  const startFloor = parseInt(params.get('startFloor')!)
  const destNodeId = params.get('dest')!
  const profile = (params.get('profile') ?? 'standard') as Profile

  const [graph, setGraph] = useState<Graph | null>(null)
  const [route, setRoute] = useState<GraphEdge[]>([])
  const [currentX, setCurrentX] = useState(startX)
  const [currentY, setCurrentY] = useState(startY)
  const [currentFloor, setCurrentFloor] = useState(startFloor)
  const [routeIndex, setRouteIndex] = useState(0) // which edge we're currently on
  const [xrSupported, setXrSupported] = useState<boolean | null>(null)
  const [arSessionActive, setArSessionActive] = useState(false)
  const [arrived, setArrived] = useState(false)
  const [heading, setHeading] = useState(0)
  const [routeError, setRouteError] = useState<string | null>(null)

  const overlayRef = useRef<HTMLDivElement>(null)
  const xrTrackerRef = useRef(createXRTracker())
  const graphRef = useRef<Graph | null>(null)
  const routeStateRef = useRef({ route: [] as GraphEdge[], routeIndex: 0 })

  useEffect(() => { graphRef.current = graph }, [graph])
  useEffect(() => { routeStateRef.current = { route, routeIndex } }, [route, routeIndex])

  // Load graph
  useEffect(() => {
    if (!hospitalId || !startNodeId || !destNodeId) return

    // Always fetch fresh — sessionStorage cache can be stale after AI re-analysis
    fetch(`/api/hospital/${hospitalId}/graph`)
      .then(r => r.json())
      .then((g: Graph) => {
        setGraph(g)
        const nodeCount = Object.keys(g.nodes).length
        const startExists = !!g.nodes[startNodeId]
        const destExists = !!g.nodes[destNodeId]

        if (!startExists || !destExists) {
          console.error(`[Nav] startNode=${startNodeId} exists=${startExists}, destNode=${destNodeId} exists=${destExists}, total nodes=${nodeCount}`)
          setRouteError(`Navigation node not found in graph. Start: ${startExists}, Dest: ${destExists}. Try re-scanning the QR code.`)
          return
        }

        const edges = astar(g, startNodeId, destNodeId, profile)
        if (!edges || edges.length === 0) {
          setRouteError(`No path found between your location and ${g.nodes[destNodeId]?.label ?? 'destination'}. The map may not have a connected route yet.`)
          return
        }
        setRoute(edges)
        const destNode = g.nodes[destNodeId]
        if (destNode) speakCue(`Navigating to ${destNode.label}. Route found.`)
      })
      .catch(err => {
        console.error('[Nav] graph load error:', err)
        setRouteError('Failed to load navigation map. Please check your connection.')
      })
  }, [hospitalId, startNodeId, destNodeId, profile])

  // Check WebXR support
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.xr) {
      navigator.xr.isSessionSupported('immersive-ar').then(setXrSupported)
    } else {
      setXrSupported(false)
    }
  }, [])

  // Node arrival detection
  useEffect(() => {
    if (!graph || route.length === 0 || arrived) return
    const currentEdge = route[routeIndex]
    if (!currentEdge) return

    const nextNode = graph.nodes[currentEdge.toNode]
    if (!nextNode) return

    // If on a different floor (e.g. elevator edge), wait for user to confirm floor change
    if (nextNode.floor !== currentFloor) return

    const dist = distanceM(currentX, currentY, nextNode.x, nextNode.y)
    if (dist < NODE_ARRIVAL_THRESHOLD_M) {
      if (routeIndex === route.length - 1) {
        setArrived(true)
        speakCue('You have arrived at your destination.')
      } else {
        setCurrentX(nextNode.x)
        setCurrentY(nextNode.y)
        setCurrentFloor(nextNode.floor)
        setRouteIndex(i => i + 1)
        const nextEdge = route[routeIndex + 1]
        if (nextEdge?.landmark) {
          speakCue(`Continue, then ${nextEdge.landmark}`)
        }
      }
    }
  }, [currentX, currentY, currentFloor, routeIndex, route, graph, arrived])

  async function startAR() {
    if (!navigator.xr || !overlayRef.current) return

    try {
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
      renderer.setPixelRatio(window.devicePixelRatio)
      renderer.setSize(window.innerWidth, window.innerHeight)
      renderer.xr.enabled = true
      renderer.xr.setReferenceSpaceType('local-floor')

      const session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['dom-overlay'],
        optionalFeatures: ['local-floor', 'bounded-floor', 'local'],
        domOverlay: { root: overlayRef.current },
      })

      setArSessionActive(true)
      session.addEventListener('end', () => setArSessionActive(false))

      await renderer.xr.setSession(session as any)

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 1000)

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.7)
      scene.add(ambientLight)
      const dirLight = new THREE.DirectionalLight(0xffffff, 1)
      dirLight.position.set(2, 10, 2)
      scene.add(dirLight)

      const arrowsGroup = new THREE.Group()
      scene.add(arrowsGroup)

      const pathGroup = new THREE.Group()
      scene.add(pathGroup)

      // Pre-allocate object pool for Google Maps style blue floor walking pathway
      const basePlaneGeo = new THREE.PlaneGeometry(0.55, 1)
      basePlaneGeo.rotateX(-Math.PI / 2)
      const pathMat = new THREE.MeshPhysicalMaterial({
        color: 0x0088ff,
        emissive: 0x0066cc,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.7,
        roughness: 0.2,
        metalness: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false,
      })

      const nodeGeo = new THREE.CircleGeometry(0.28, 32)
      nodeGeo.rotateX(-Math.PI / 2)
      const nodeMat = new THREE.MeshPhysicalMaterial({
        color: 0x00d8ff,
        emissive: 0x00a8ff,
        emissiveIntensity: 0.9,
        transparent: true,
        opacity: 0.85,
        roughness: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false,
      })

      const pathSegmentPool: THREE.Mesh[] = []
      const pathNodePool: THREE.Mesh[] = []
      for (let i = 0; i < 25; i++) {
        const segMesh = new THREE.Mesh(basePlaneGeo, pathMat)
        segMesh.visible = false
        pathGroup.add(segMesh)
        pathSegmentPool.push(segMesh)

        const circleMesh = new THREE.Mesh(nodeGeo, nodeMat)
        circleMesh.visible = false
        pathGroup.add(circleMesh)
        pathNodePool.push(circleMesh)
      }

      // Create a single sleek glowing chevron, scaled down to fit the screen
      const shape = new THREE.Shape()
      shape.moveTo(0, 0.15)
      shape.lineTo(0.15, -0.15)
      shape.lineTo(0, -0.05)
      shape.lineTo(-0.15, -0.15)
      shape.lineTo(0, 0.15)

      const extrudeSettings = { depth: 0.02, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.01, bevelThickness: 0.01 }
      const arrowGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings)
      
      // Rotate so it lays flat on the floor, pointing sharp tip precisely towards local -Z
      arrowGeo.rotateX(-Math.PI / 2)
      arrowGeo.rotateY(Math.PI)

      const arrowMat = new THREE.MeshPhysicalMaterial({
        color: 0x22c55e,
        metalness: 0.3,
        roughness: 0.2,
        transmission: 0.5,
        thickness: 0.1,
        transparent: true,
        opacity: 0.9,
        emissive: 0x22c55e,
        emissiveIntensity: 0.8,
      })

      const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat)
      arrowsGroup.add(arrowMesh)

      let calibrated = false

      renderer.setAnimationLoop((timestamp, xrFrame) => {
        if (!xrFrame) return
        
        const refSpace = renderer.xr.getReferenceSpace()
        if (!refSpace) return
        
        const pose = xrFrame.getViewerPose(refSpace)
        if (!pose) return
        
        if (!calibrated) {
          let mapAngle = -Math.PI / 2 // Default: facing North (-Y)
          
          // If we have a route, we assume the user is starting the session facing the first destination node.
          // This allows us to mathematically align the XR coordinate system with the 2D floor plan!
          if (route && route.length > 0 && graph) {
            const firstNode = graph.nodes[route[0].toNode]
            if (firstNode) {
              mapAngle = Math.atan2(firstNode.y - startY, firstNode.x - startX)
            }
          }
          
          xrTrackerRef.current.recalibrate({ x: startX, y: startY, floor: startFloor }, pose, mapAngle)
          calibrated = true
        }

        const worldPos = xrTrackerRef.current.getWorldPosition(pose)
        const deviceHeading = xrTrackerRef.current.getHeading(pose)

        setCurrentX(worldPos.x)
        setCurrentY(worldPos.y)
        setHeading(deviceHeading)

        const { route: currentRoute, routeIndex: currentRouteIndex } = routeStateRef.current
        const currentEdge = currentRoute[currentRouteIndex]
        const nextN = currentEdge ? graphRef.current?.nodes[currentEdge.toNode] : null

        // Extract live camera world matrix to establish dynamic ground elevation plane
        const xrCamera = renderer.xr.getCamera()
        const camPos = new THREE.Vector3()
        const camQuat = new THREE.Quaternion()
        const camScale = new THREE.Vector3()
        xrCamera.matrixWorld.decompose(camPos, camQuat, camScale)

        // In 'local-floor', ARCore vision algorithms set real floor surface precisely at Y = 0.
        // In 'local' fallback space (where camera starts near Y = 0), physical floor is approx 1.4m below eye level.
        const groundY = camPos.y > 0.7 ? 0 : camPos.y - 1.4

        // Update glowing blue walking path directly on physical floor
        for (let i = 0; i < pathSegmentPool.length; i++) pathSegmentPool[i].visible = false
        for (let i = 0; i < pathNodePool.length; i++) pathNodePool[i].visible = false

        if (currentRoute && currentRoute.length > 0 && graphRef.current) {
          const mapPoints: { x: number; y: number }[] = [{ x: worldPos.x, y: worldPos.y }]
          for (let i = currentRouteIndex; i < currentRoute.length; i++) {
            const edge = currentRoute[i]
            if (edge.isElevator || edge.isStairs) break
            const targetNode = graphRef.current.nodes[edge.toNode]
            if (!targetNode || targetNode.floor !== worldPos.floor) break
            mapPoints.push({ x: targetNode.x, y: targetNode.y })
          }

          const xrPoints = mapPoints.map(pt => xrTrackerRef.current.getXRPosition(pt, pose, groundY))
          for (let i = 0; i < xrPoints.length - 1 && i < pathSegmentPool.length; i++) {
            const p1 = xrPoints[i]
            const p2 = xrPoints[i + 1]
            const dist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.z - p1.z) ** 2)
            if (dist > 0.05) {
              const segMesh = pathSegmentPool[i]
              segMesh.position.set((p1.x + p2.x) / 2, groundY, (p1.z + p2.z) / 2)
              segMesh.lookAt(p2.x, groundY, p2.z)
              segMesh.scale.set(1, 1, dist)
              segMesh.visible = true
            }
            if (i < pathNodePool.length) {
              const circleMesh = pathNodePool[i]
              circleMesh.position.set(p2.x, groundY + 0.005, p2.z)
              circleMesh.visible = true
            }
          }
        }

        if (nextN && !currentEdge?.isElevator && !currentEdge?.isStairs) {
          arrowsGroup.visible = true
          
          // Current camera forward direction
          const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat)
          forward.y = 0
          if (forward.lengthSq() > 0.001) forward.normalize()
          else forward.set(0, 0, -1)

          // Compute true XR coordinates of target node on the ground plane so arrow and path align perfectly
          const targetXR = xrTrackerRef.current.getXRPosition({ x: nextN.x, y: nextN.y }, pose, groundY)
          const targetVec = new THREE.Vector3(targetXR.x - camPos.x, 0, targetXR.z - camPos.z)
          if (targetVec.lengthSq() > 0.001) targetVec.normalize()
          else targetVec.set(0, 0, -1)
          
          // Angle difference between where we are looking and the target
          const angleRad = forward.angleTo(targetVec)
          
          const isCorrectDir = angleRad < (45 * Math.PI / 180)
          
          // Green when facing generally towards destination, Red if off-track
          const colorHex = isCorrectDir ? 0x22c55e : 0xef4444
          
          // Position the chevron arrow 1.2m in front of the camera, slightly lower at eye/chest level
          arrowMesh.position.copy(camPos).add(forward.clone().multiplyScalar(1.2))
          arrowMesh.position.y -= 0.5
          
          arrowMat.color.setHex(colorHex)
          arrowMat.emissive.setHex(colorHex)
          
          // Point arrow tip straight along targetVec (synchronized with the blue floor path)
          arrowMesh.lookAt(arrowMesh.position.x + targetVec.x, arrowMesh.position.y, arrowMesh.position.z + targetVec.z)

        } else {
          arrowsGroup.visible = false
        }
        
        renderer.render(scene, camera)
      })
    } catch (err) {
      console.error('Failed to start AR session:', err)
      alert(`Failed to start AR session: ${err instanceof Error ? err.message : String(err)}\nPlease make sure you are using Chrome on an ARCore-supported Android device.`)
    }
  }

  // --- Derived render state ---
  const currentEdge = route[routeIndex]
  const nextNode = currentEdge ? graph?.nodes[currentEdge.toNode] : null
  const destNode = graph?.nodes[destNodeId]
  
  // Calculate remaining distance roughly by summing current edge + remaining edges
  const remainingDistM = useMemo(() => {
    if (!nextNode) return 0
    let dist = distanceM(currentX, currentY, nextNode.x, nextNode.y)
    for (let i = routeIndex + 1; i < route.length; i++) {
      dist += route[i].distanceM
    }
    return dist
  }, [currentX, currentY, nextNode, route, routeIndex])

  const arrowRotation = 0

  function confirmFloorTransition() {
    if (!nextNode) return
    setCurrentFloor(nextNode.floor)
    setCurrentX(nextNode.x)
    setCurrentY(nextNode.y)
    setRouteIndex(i => i + 1)
    
    // Recalibrate tracker to new floor position so SLAM starts fresh here
    const currentWorldOrigin = { x: nextNode.x, y: nextNode.y, floor: nextNode.floor }
    // We cannot access xrFrame here directly outside of RAF, but tracking library 
    // will just keep deltas from whenever it recalibrated.
    // In a real robust system, we would ask user to scan a QR code out of the elevator.
    // For demo, we just update state and hope SLAM doesn't drift too much between floors.
    
    const nextEdge = route[routeIndex + 1]
    if (nextEdge?.landmark) {
      speakCue(`Continue, then ${nextEdge.landmark}`)
    }
  }

  if (xrSupported === null) {
    return <div className="min-h-screen bg-background flex items-center justify-center">Checking device compatibility...</div>
  }

  if (routeError) {
    return (
      <div className="min-h-screen bg-background p-8 flex flex-col items-center justify-center text-center">
        <h2 className="text-xl font-bold mb-4 text-red-400">Navigation Error</h2>
        <p className="text-muted-foreground mb-4">{routeError}</p>
        <button onClick={() => window.location.href = '/'} className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold">Go Back</button>
      </div>
    )
  }

  if (xrSupported === false) {
    return (
      <div className="min-h-screen bg-background p-8 flex flex-col items-center justify-center text-center">
        <h2 className="text-xl font-bold mb-4">AR Not Supported</h2>
        <p className="text-muted-foreground mb-4">Your device or browser does not support WebXR AR sessions.</p>
        <p className="text-sm">Please try using Google Chrome on an Android device.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background relative flex flex-col items-center justify-center overflow-hidden">
      
      {!arSessionActive ? (
        <div className="p-8 text-center max-w-sm w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h1 className="text-2xl font-bold mb-2">Ready to Navigate</h1>
          <p className="text-muted-foreground mb-8">Follow the on-screen arrows to your destination.</p>
          
          <button
            onClick={startAR}
            className="w-full bg-primary text-primary-foreground py-4 rounded-2xl font-semibold text-lg shadow-lg hover:shadow-primary/20 transition-all active:scale-95"
          >
            Start AR Camera
          </button>
        </div>
      ) : null}

      {/* DOM Overlay container for WebXR */}
      <div 
        ref={overlayRef} 
        className="fixed inset-0 pointer-events-none"
      >
        {arSessionActive && graph && route.length > 0 && (
          <>
            <NavDashboard
              graph={graph}
              route={route}
              routeIndex={routeIndex}
              currentX={currentX}
              currentY={currentY}
              currentFloor={currentFloor}
              remainingDistM={remainingDistM}
              destinationLabel={destNode?.label}
              profile={profile}
              arrived={arrived}
            />
            <NavMiniMap
              graph={graph}
              route={route}
              routeIndex={routeIndex}
              currentX={currentX}
              currentY={currentY}
              currentFloor={currentFloor}
              arrived={arrived}
            />
          </>
        )}

        {arSessionActive && (
          <>
            {/* Landmarks / Voice Cues */}
            {currentEdge?.landmark && !arrived && !currentEdge?.isElevator && (
              <div className="absolute bottom-6 left-4 right-44 max-w-md z-30 pointer-events-none">
                <div className="bg-black/85 backdrop-blur-xl text-white rounded-2xl px-5 py-4 border border-white/10 shadow-2xl pointer-events-auto">
                  <p className="text-xs text-white/70 font-medium mb-1 uppercase tracking-wider">Next landmark</p>
                  <p className="font-semibold text-base truncate">📍 {currentEdge.landmark}</p>
                </div>
              </div>
            )}

            {/* Elevator / Stairs transition */}
            {(currentEdge?.isElevator || currentEdge?.isStairs) && !arrived && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
                <div className="bg-background rounded-3xl p-8 mx-6 text-center border border-border max-w-sm w-full animate-in zoom-in-95 duration-300">
                  <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <p className="text-4xl">{currentEdge.isElevator ? '🛗' : '🪜'}</p>
                  </div>
                  <p className="font-bold text-2xl mb-1">Take the {currentEdge.isElevator ? 'elevator' : 'stairs'}</p>
                  <p className="text-muted-foreground mb-8">Go to Floor {nextNode?.floor}</p>
                  <button
                    onClick={confirmFloorTransition}
                    className="w-full bg-primary text-primary-foreground font-semibold py-4 rounded-xl shadow-lg active:scale-95 transition-transform"
                  >
                    I'm on Floor {nextNode?.floor}
                  </button>
                </div>
              </div>
            )}

            {/* Arrival Screen */}
            {arrived && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
                <div className="bg-background rounded-3xl p-8 mx-6 text-center border border-border max-w-sm w-full animate-in zoom-in-95 duration-300">
                  <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4 text-green-500">
                    <svg viewBox="0 0 24 24" className="w-10 h-10 fill-current"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>
                  </div>
                  <p className="font-bold text-2xl mb-2">You have arrived</p>
                  <p className="text-muted-foreground mb-8">You are now at {destNode?.label}.</p>
                  <button
                    onClick={() => window.location.href = '/'}
                    className="w-full bg-secondary text-secondary-foreground font-semibold py-4 rounded-xl active:scale-95 transition-transform"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function NavigatePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Loading Navigation...</div>}>
      <NavigateContent />
    </Suspense>
  )
}
