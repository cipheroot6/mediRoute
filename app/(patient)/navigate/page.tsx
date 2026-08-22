'use client'
import { useEffect, useRef, useState, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import * as THREE from 'three'
import { astar } from '@/lib/pathfinding/astar'
import { distanceM, getTurnDirection } from '@/lib/utils'
import { createXRTracker, snapToPath } from '@/lib/ar/tracking'
import { createIMUTracker } from '@/lib/ar/imu'
import { speakCue } from '@/lib/voice/speech'
import {
  NODE_ARRIVAL_THRESHOLD_WAYPOINT_M,
  NODE_ARRIVAL_THRESHOLD_DEST_M,
  REANCHOR_PROXIMITY_M,
} from '@/lib/constants'
import { NavDashboard } from '@/components/patient/NavDashboard'
import { NavMiniMap } from '@/components/patient/NavMiniMap'
import type { Graph, GraphEdge, GraphNode, Profile, WebkitDeviceOrientationEvent } from '@/types'
import { Compass, Sparkles, Navigation2, RefreshCw, Layers, ChevronUp, ChevronDown } from 'lucide-react'

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

  // Improvement #3: Deferred calibration state
  const [isTrackerCalibrated, setIsTrackerCalibrated] = useState(false)
  // Improvement #4 & #9: Proximity re-anchoring & floor prompt state
  const [proximityAnchorNodeId, setProximityAnchorNodeId] = useState<string | null>(null)
  const [needsFloorRecalibration, setNeedsFloorRecalibration] = useState(false)
  const [compassHeading, setCompassHeading] = useState<number | null>(null)

  const overlayRef = useRef<HTMLDivElement>(null)
  const xrTrackerRef = useRef(createXRTracker())
  const imuTrackerRef = useRef(createIMUTracker())
  const graphRef = useRef<Graph | null>(null)
  const routeStateRef = useRef({ route: [] as GraphEdge[], routeIndex: 0 })

  const calibrationRequestRef = useRef(false)
  const recalibrateToNodeRef = useRef<string | null>(null)
  const activeRendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const lastHeadingRef = useRef<number>(0)
  
  const lastSpokenRouteIndexRef = useRef<number>(-1)
  const lastSpokenDistRef = useRef<number | null>(null)

  useEffect(() => {
    const imu = imuTrackerRef.current
    return () => {
      if (activeRendererRef.current) {
        activeRendererRef.current.setAnimationLoop(null)
        activeRendererRef.current.dispose()
      }
      imu.stop()
    }
  }, [])

  useEffect(() => { graphRef.current = graph }, [graph])
  useEffect(() => { routeStateRef.current = { route, routeIndex } }, [route, routeIndex])

  // Improvement #2: Listen to DeviceOrientation for magnetic compass bearing on Android Chrome
  useEffect(() => {
    function handleOrientation(event: DeviceOrientationEvent) {
      const webkitEvent = event as WebkitDeviceOrientationEvent
      let deg: number | null = null
      if (typeof webkitEvent.webkitCompassHeading === 'number') {
        deg = webkitEvent.webkitCompassHeading
      } else if (event.absolute && typeof event.alpha === 'number') {
        // Absolute orientation on Android: 360 - alpha gives CW degrees from magnetic North
        deg = (360 - event.alpha) % 360
      }
      if (deg !== null && !isNaN(deg)) {
        setCompassHeading(deg)
        xrTrackerRef.current.setCompassHeading(deg)
        if (imuTrackerRef.current.active) {
          imuTrackerRef.current.setHeading(deg)
        }
      }
    }

    window.addEventListener('deviceorientationabsolute' as keyof WindowEventMap, handleOrientation as EventListener)
    window.addEventListener('deviceorientation', handleOrientation)
    return () => {
      window.removeEventListener('deviceorientationabsolute' as keyof WindowEventMap, handleOrientation as EventListener)
      window.removeEventListener('deviceorientation', handleOrientation)
    }
  }, [])

  // Load graph
  useEffect(() => {
    if (!hospitalId || !startNodeId || !destNodeId) return

    fetch(`/api/hospital/${hospitalId}/graph`)
      .then(r => r.json())
      .then((g: Graph) => {
        setGraph(g)
        const startExists = !!g.nodes[startNodeId]
        const destExists = !!g.nodes[destNodeId]

        if (!startExists || !destExists) {
          setRouteError(`Navigation node not found in graph. Start: ${startExists}, Dest: ${destExists}. Try re-scanning the QR code.`)
          return
        }

        // Always sync the starting position with the absolute truth from the database.
        // This prevents catastrophic failure if the URL params (startX/startY) were 
        // generated from a stale cache, bookmarked link, or old database state.
        setCurrentX(g.nodes[startNodeId].x)
        setCurrentY(g.nodes[startNodeId].y)

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
      Promise.resolve().then(() => setXrSupported(false))
    }
  }, [])

  // Improvement #7 & #4: Node arrival detection (adaptive thresholds) & Proximity anchor detection
  useEffect(() => {
    if (!graph || route.length === 0 || arrived || !isTrackerCalibrated) return
    const currentEdge = route[routeIndex]
    if (!currentEdge) return

    const nextNode = graph.nodes[currentEdge.toNode]
    if (!nextNode) return

    // If on a different floor (e.g. elevator edge), wait for user to confirm floor change
    if (nextNode.floor !== currentFloor) return

    const dist = distanceM(currentX, currentY, nextNode.x, nextNode.y)
    
    // Calculate remaining distance exactly like the dashboard to prevent conflicts
    // between the raw geometric distance and database-overridden edge distances.
    let currentEdgeRemainingM = dist
    const startNode = graph.nodes[currentEdge.fromNode]
    
    let hasPassedNode = false

    if (startNode) {
      const geoTotal = distanceM(startNode.x, startNode.y, nextNode.x, nextNode.y)
      const proportion = geoTotal > 0.001 ? Math.max(0, Math.min(1, dist / geoTotal)) : 0
      currentEdgeRemainingM = proportion * currentEdge.distanceM
      
      // Auto-advance if the user bypassed the node laterally but passed it longitudinally
      if (routeIndex < route.length - 1 && geoTotal > 0.001) {
        const dx = nextNode.x - startNode.x
        const dy = nextNode.y - startNode.y
        const t = ((currentX - startNode.x) * dx + (currentY - startNode.y) * dy) / (dx * dx + dy * dy)
        const longitudinalDistToNode = (1 - t) * geoTotal
        
        // If they are longitudinally past the node, or within 1.0m of its perpendicular axis, auto-advance
        if (longitudinalDistToNode < 1.0) {
          hasPassedNode = true
        }
      }
    }
    
    // Improvement #7: Use 1.5m threshold for waypoints, 3.0m for final destination
    const threshold = routeIndex === route.length - 1
      ? NODE_ARRIVAL_THRESHOLD_DEST_M
      : NODE_ARRIVAL_THRESHOLD_WAYPOINT_M

    // Voice Navigation Enhancements: Announce at start of new edge
    if (lastSpokenRouteIndexRef.current !== routeIndex) {
      lastSpokenDistRef.current = null
      lastSpokenRouteIndexRef.current = routeIndex
      const nextEdge = route[routeIndex + 1]
      if (nextEdge) {
        const turn = getTurnDirection(currentEdge, nextEdge, graph)
        const noun = nextNode?.type === 'elevator' ? 'the elevator' : nextNode?.type === 'stairs' ? 'the stairs' : nextNode?.label || 'the next waypoint'
        // Only say "Continue straight for..." if they just started a segment or just turned.
        // Prevent spam if the routeIndex just updated because they arrived at a node.
        speakCue(`Continue straight for ${Math.round(currentEdge.distanceM)} meters, then ${turn} towards ${noun}.`)
      }
    }

    // Voice Navigation Enhancements: Distance thresholds
    const voiceThresholds = [15, 10, 5]
    for (const t of voiceThresholds) {
      if (currentEdgeRemainingM <= t + 0.5 && (lastSpokenDistRef.current === null || lastSpokenDistRef.current > t)) {
        lastSpokenDistRef.current = t
        if (routeIndex === route.length - 1) {
          speakCue(`In ${t} meters, you will reach your destination.`)
        } else {
          const nextEdge = route[routeIndex + 1]
          const turn = nextEdge ? getTurnDirection(currentEdge, nextEdge, graph) : 'continue'
          speakCue(`In ${t} meters, ${turn}.`)
        }
        break
      }
    }

    if (currentEdgeRemainingM < threshold || hasPassedNode) {
      if (routeIndex === route.length - 1) {
        Promise.resolve().then(() => setArrived(true))
        speakCue('You have arrived at your destination.')
        imuTrackerRef.current.stop()
      } else {
        Promise.resolve().then(() => {
          setCurrentX(nextNode.x)
          setCurrentY(nextNode.y)
          setCurrentFloor(nextNode.floor)
          setRouteIndex(i => i + 1)
        })
        const nextEdge = route[routeIndex + 1]
        if (nextEdge) {
          const turn = getTurnDirection(currentEdge, nextEdge, graph)
          const landmarkStr = nextEdge.landmark ? ` ${nextEdge.landmark}` : ` towards next waypoint`
          speakCue(`${turn}, then continue${landmarkStr}`)
        }
      }
    }

    // Improvement #4: Proximity re-anchoring detection
    if (graph.anchors) {
      let bestNodeId: string | null = null
      let minDist = REANCHOR_PROXIMITY_M
      for (const nodeId of Object.keys(graph.anchors)) {
        // Skip start node right after leaving it unless we walked far away and returned
        if (nodeId === startNodeId && routeIndex < 2) continue
        const n = graph.nodes[nodeId]
        if (n && n.floor === currentFloor) {
          const d = distanceM(currentX, currentY, n.x, n.y)
          if (d < minDist) {
            minDist = d
            bestNodeId = nodeId
          }
        }
      }
      Promise.resolve().then(() => setProximityAnchorNodeId(bestNodeId))
    }
  }, [currentX, currentY, currentFloor, routeIndex, route, graph, arrived, isTrackerCalibrated, startNodeId])

  async function startAR() {
    if (!navigator.xr || !overlayRef.current) return

    try {
      // Performance Optimization: disable antialias and cap pixel ratio for smooth WebXR frame rates
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(window.innerWidth, window.innerHeight)
      renderer.xr.enabled = true
      renderer.xr.setReferenceSpaceType('local-floor')

      const session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['dom-overlay'],
        optionalFeatures: ['local-floor', 'bounded-floor', 'local'],
        domOverlay: { root: overlayRef.current },
      })

      setArSessionActive(true)
      session.addEventListener('end', () => {
        setArSessionActive(false)
        setIsTrackerCalibrated(false)
        imuTrackerRef.current.stop()
      })

      activeRendererRef.current = renderer
      await (renderer.xr as { setSession: (s: unknown) => Promise<void> }).setSession(session)

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
      pathGroup.visible = false // Hidden to prevent clipping through walls
      scene.add(pathGroup)

      // Pre-allocate object pool for glowing floor walking pathway
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

      // Create glowing chevron arrow
      const shape = new THREE.Shape()
      shape.moveTo(0, 0.15)
      shape.lineTo(0.15, -0.15)
      shape.lineTo(0, -0.05)
      shape.lineTo(-0.15, -0.15)
      shape.lineTo(0, 0.15)

      const extrudeSettings = { depth: 0.02, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.01, bevelThickness: 0.01 }
      const arrowGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings)
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

      renderer.setAnimationLoop((_timestamp, xrFrame) => {
        if (!xrFrame) return

        const refSpace = renderer.xr.getReferenceSpace()
        if (!refSpace) return

        const pose = xrFrame.getViewerPose(refSpace)

        if (!pose) {
          // Fallback: If WebXR completely loses tracking, we activate the step counter
          if (calibrated && !imuTrackerRef.current.active) {
            // Can't reliably get heading without a pose, so we rely on the last set heading
            imuTrackerRef.current.start(lastHeadingRef.current) 
          }
          if (calibrated && imuTrackerRef.current.active) {
            const delta = imuTrackerRef.current.getDeltaM()
            if (delta.dx !== 0 || delta.dy !== 0) {
              imuTrackerRef.current.resetDelta()
              // Because we return early, we need to update state manually based on the delta
              // We do NOT apply this to xrTrackerRef because when SLAM recovers, WebXR will provide
              // the true updated position natively. Applying it to xrTracker would cause double-counting.
              setCurrentX(prev => prev + delta.dx)
              setCurrentY(prev => prev + delta.dy)
            }
          }
          return
        }

        // Tracking is active, so stop the fallback IMU tracker
        if (imuTrackerRef.current.active) {
          imuTrackerRef.current.stop()
        }

        // Improvement #3: Deferred calibration (wait for user confirmation tap)
        if (!calibrated) {
          if (calibrationRequestRef.current) {
            let mapAngle = -Math.PI / 2
            if (routeStateRef.current.route && routeStateRef.current.route.length > 0 && graphRef.current) {
              const firstNode = graphRef.current.nodes[routeStateRef.current.route[0].toNode]
              if (firstNode) {
                mapAngle = Math.atan2(firstNode.y - currentY, firstNode.x - currentX)
              }
            }
            xrTrackerRef.current.recalibrate(
              { x: currentX, y: currentY, floor: currentFloor },
              pose,
              mapAngle,
              compassHeading ?? undefined
            )
            calibrated = true
            calibrationRequestRef.current = false
            setIsTrackerCalibrated(true)
            // Start IMU standby
            imuTrackerRef.current.start(xrTrackerRef.current.getHeading(pose))
          }
          renderer.render(scene, camera)
          return
        }

        // Improvement #4: Handle mid-route in-session recalibration tap
        if (recalibrateToNodeRef.current && graphRef.current) {
          const targetNode = graphRef.current.nodes[recalibrateToNodeRef.current]
          if (targetNode) {
            xrTrackerRef.current.reanchorPosition(
              { x: targetNode.x, y: targetNode.y, floor: targetNode.floor },
              pose
            )
            recalibrateToNodeRef.current = null
            setProximityAnchorNodeId(null)
            setNeedsFloorRecalibration(false)
            speakCue(`Position recalibrated at ${targetNode.label}`)
          }
        }

        const rawPos = xrTrackerRef.current.getWorldPosition(pose)
        const deviceHeading = xrTrackerRef.current.getHeading(pose)
        lastHeadingRef.current = deviceHeading
        
        // Pass the synchronized map heading to the IMU tracker
        if (imuTrackerRef.current.active) {
          imuTrackerRef.current.setHeading(deviceHeading)
        }

        const { route: currentRoute, routeIndex: currentRouteIndex } = routeStateRef.current

        // Improvement #5: Map-based position snapping
        let finalX = rawPos.x
        let finalY = rawPos.y
        if (currentRoute && currentRoute.length > 0 && graphRef.current) {
          const currentEdge = currentRoute[currentRouteIndex]
          const startNode = currentEdge ? graphRef.current.nodes[currentEdge.fromNode] : null
          
          if (startNode) {
            const pathPoints: { x: number; y: number }[] = [{ x: startNode.x, y: startNode.y }]
            for (let i = currentRouteIndex; i < currentRoute.length; i++) {
              const edge = currentRoute[i]
              if (edge.isElevator || edge.isStairs) break
              const tNode = graphRef.current.nodes[edge.toNode]
              if (!tNode || tNode.floor !== rawPos.floor) break
              pathPoints.push({ x: tNode.x, y: tNode.y })
            }
            if (pathPoints.length >= 2) {
              const snapped = snapToPath({ x: rawPos.x, y: rawPos.y }, pathPoints)
              finalX = snapped.x
              finalY = snapped.y
            }
          }
        }

        setCurrentX(finalX)
        setCurrentY(finalY)
        setHeading(deviceHeading)

        const currentEdge = currentRoute[currentRouteIndex]
        const nextN = currentEdge ? graphRef.current?.nodes[currentEdge.toNode] : null

        const xrCamera = renderer.xr.getCamera()
        const camPos = new THREE.Vector3()
        const camQuat = new THREE.Quaternion()
        const camScale = new THREE.Vector3()
        xrCamera.matrixWorld.decompose(camPos, camQuat, camScale)

        const groundY = camPos.y > 0.7 ? 0 : camPos.y - 1.4

        for (let i = 0; i < pathSegmentPool.length; i++) pathSegmentPool[i].visible = false
        for (let i = 0; i < pathNodePool.length; i++) pathNodePool[i].visible = false

        if (currentRoute && currentRoute.length > 0 && graphRef.current) {
          const mapPoints: { x: number; y: number }[] = [{ x: finalX, y: finalY }]
          for (let i = currentRouteIndex; i < currentRoute.length; i++) {
            const edge = currentRoute[i]
            if (edge.isElevator || edge.isStairs) break
            const targetNode = graphRef.current.nodes[edge.toNode]
            if (!targetNode || targetNode.floor !== currentFloor) break
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
          const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat)
          forward.y = 0
          if (forward.lengthSq() > 0.001) forward.normalize()
          else forward.set(0, 0, -1)

          const targetXR = xrTrackerRef.current.getXRPosition({ x: nextN.x, y: nextN.y }, pose, groundY)
          const targetVec = new THREE.Vector3(targetXR.x - camPos.x, 0, targetXR.z - camPos.z)
          if (targetVec.lengthSq() > 0.001) targetVec.normalize()
          else targetVec.set(0, 0, -1)

          const angleRad = forward.angleTo(targetVec)
          const isCorrectDir = angleRad < (45 * Math.PI / 180)
          const colorHex = isCorrectDir ? 0x22c55e : 0xef4444

          arrowMesh.position.copy(camPos).add(forward.clone().multiplyScalar(1.2))
          arrowMesh.position.y -= 0.5

          arrowMat.color.setHex(colorHex)
          arrowMat.emissive.setHex(colorHex)
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

  const currentEdge = route[routeIndex]
  const nextNode = currentEdge ? graph?.nodes[currentEdge.toNode] : null
  const destNode = graph?.nodes[destNodeId]

  const remainingDistM = useMemo(() => {
    if (!nextNode || !graph || !currentEdge) return 0
    const startNode = graph.nodes[currentEdge.fromNode]
    
    let currentEdgeRemainingM = 0
    if (startNode) {
      // Calculate geometric distance from start to next node in map units
      const geoTotal = distanceM(startNode.x, startNode.y, nextNode.x, nextNode.y)
      // Calculate geometric distance from current XR location to next node
      const geoRemaining = distanceM(currentX, currentY, nextNode.x, nextNode.y)
      
      // Calculate the proportion (0.0 to 1.0) of the edge we have left to travel
      const proportion = geoTotal > 0.001 ? Math.max(0, Math.min(1, geoRemaining / geoTotal)) : 0
      
      // Scale the custom database distance by our proportion
      currentEdgeRemainingM = proportion * currentEdge.distanceM
    } else {
      currentEdgeRemainingM = distanceM(currentX, currentY, nextNode.x, nextNode.y)
    }

    let dist = currentEdgeRemainingM
    for (let i = routeIndex + 1; i < route.length; i++) {
      dist += route[i].distanceM
    }
    return dist
  }, [currentX, currentY, nextNode, graph, currentEdge, route, routeIndex])

  const availableFloors = useMemo(() => {
    if (!graph) return [currentFloor]
    const floorSet = new Set<number>()
    if (graph.floors) {
      Object.keys(graph.floors).forEach(f => floorSet.add(Number(f)))
    }
    Object.values(graph.nodes).forEach(n => floorSet.add(n.floor))
    const sorted = Array.from(floorSet).sort((a, b) => a - b)
    return sorted.length > 0 ? sorted : [currentFloor]
  }, [graph, currentFloor])

  function handleManualFloorChange(newFloor: number) {
    if (newFloor === currentFloor || !graph) return
    setCurrentFloor(newFloor)
    setNeedsFloorRecalibration(true)

    if (route.length > 0) {
      // Find the first node on the new floor along the route
      let targetIndex = -1
      let targetNode: GraphNode | null = null
      for (let i = 0; i < route.length; i++) {
        const edge = route[i]
        const n = graph.nodes[edge.toNode]
        if (n && n.floor === newFloor && !edge.isElevator && !edge.isStairs) {
          targetIndex = i
          targetNode = n
          break
        }
      }
      if (targetIndex === -1) {
        for (let i = 0; i < route.length; i++) {
          const n = graph.nodes[route[i].toNode]
          if (n && n.floor === newFloor) {
            targetIndex = i
            targetNode = n
            break
          }
        }
      }

      if (targetNode && targetIndex !== -1) {
        setCurrentX(targetNode.x)
        setCurrentY(targetNode.y)
        setRouteIndex(targetIndex)
        if (graph.anchors?.[targetNode.id]) {
          setProximityAnchorNodeId(targetNode.id)
        }
        const nextEdge = route[targetIndex + 1]
        if (nextEdge?.landmark) {
          speakCue(`Floor ${newFloor}. Continue, then ${nextEdge.landmark}`)
        } else {
          speakCue(`Switched to Floor ${newFloor}`)
        }
        return
      }
    }
    speakCue(`Switched to Floor ${newFloor}`)
  }

  // Improvement #9: Floor transition triggers re-anchor request
  function confirmFloorTransition() {
    if (!nextNode) return
    setCurrentFloor(nextNode.floor)
    setCurrentX(nextNode.x)
    setCurrentY(nextNode.y)
    setRouteIndex(i => i + 1)
    setNeedsFloorRecalibration(true)

    if (graph?.anchors?.[nextNode.id]) {
      setProximityAnchorNodeId(nextNode.id)
    }

    const nextEdge = route[routeIndex + 1]
    if (nextEdge?.landmark) {
      speakCue(`Continue, then ${nextEdge.landmark}`)
    }
  }

  if (xrSupported === null) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Checking device compatibility...</div>
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
          <p className="text-muted-foreground mb-6">Follow the on-screen arrows to your destination.</p>

          {compassHeading !== null && (
            <div className="mb-6 inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-xs font-semibold">
              <Compass className="w-4 h-4 animate-spin-slow" />
              <span>Compass Active ({Math.round(compassHeading)}°)</span>
            </div>
          )}

          <button
            onClick={startAR}
            className="w-full bg-primary text-primary-foreground py-4 rounded-2xl font-semibold text-lg shadow-lg hover:shadow-primary/20 transition-all active:scale-95"
          >
            Start AR Camera
          </button>
        </div>
      ) : null}

      {/* DOM Overlay container for WebXR */}
      <div ref={overlayRef} className="fixed inset-0 pointer-events-none">
        {/* Improvement #3: Deferred Calibration UI Overlay */}
        {arSessionActive && !isTrackerCalibrated && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-md p-6 pointer-events-auto z-50 animate-in fade-in duration-300">
            <div className="bg-slate-950/90 border border-emerald-500/40 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl">
              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/40">
                <Navigation2 className="w-8 h-8 rotate-45 animate-bounce" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Point & Confirm</h2>
              <p className="text-sm text-slate-300 mb-6 leading-relaxed">
                Stand near the starting QR anchor, face down the corridor toward your pathway, and tap below to initialize precise AR tracking.
              </p>
              {compassHeading !== null && (
                <p className="text-xs text-emerald-400 font-mono mb-4">
                  Compass aligned at {Math.round(compassHeading)}° North
                </p>
              )}
              <button
                onClick={() => { calibrationRequestRef.current = true }}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold py-4 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.4)] active:scale-95 transition-all"
              >
                Confirm Direction & Start
              </button>
            </div>
          </div>
        )}

        {/* Improvement #4 & #9: Proximity Re-Anchoring / Floor Calibration Banner */}
        {arSessionActive && isTrackerCalibrated && (proximityAnchorNodeId || needsFloorRecalibration) && !arrived && (
          <div className="absolute top-24 left-4 right-4 z-40 max-w-sm mx-auto pointer-events-auto animate-in slide-in-from-top duration-300">
            <div className="bg-gradient-to-r from-emerald-950/95 to-slate-950/95 border-2 border-emerald-500/60 backdrop-blur-xl rounded-2xl p-4 shadow-[0_0_25px_rgba(16,185,129,0.25)] flex items-center gap-4">
              <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/40 shrink-0">
                <RefreshCw className="w-6 h-6 animate-spin" style={{ animationDuration: '4s' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> Zero-Drift Anchor
                </p>
                <p className="text-sm font-semibold text-white truncate mt-0.5">
                  Near {proximityAnchorNodeId ? graph?.nodes[proximityAnchorNodeId]?.label : 'Elevator Exit'}?
                </p>
              </div>
              <button
                onClick={() => {
                  if (proximityAnchorNodeId) {
                    recalibrateToNodeRef.current = proximityAnchorNodeId
                  } else if (nextNode) {
                    recalibrateToNodeRef.current = nextNode.id
                  }
                }}
                className="px-3.5 py-2 bg-emerald-500 text-slate-950 text-xs font-extrabold rounded-xl shadow hover:bg-emerald-400 active:scale-95 transition-transform shrink-0"
              >
                Tap to Sync
              </button>
            </div>
          </div>
        )}

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
            {/* Improvement #8: Pass live heading to NavMiniMap */}
            <NavMiniMap
              graph={graph}
              route={route}
              routeIndex={routeIndex}
              currentX={currentX}
              currentY={currentY}
              currentFloor={currentFloor}
              arrived={arrived}
              heading={heading}
            />

            {/* Floor Counter: always available so user can manually update if they take stairs */}
            {destNode && !arrived && (
              <div className="absolute left-4 top-1/2 -translate-y-1/2 z-40 pointer-events-auto animate-in fade-in slide-in-from-left duration-300">
                <div className="bg-slate-950/90 border border-emerald-500/40 backdrop-blur-2xl rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.7)] p-2 flex flex-col items-center gap-1.5 min-w-[58px]">
                  <div className="flex flex-col items-center gap-0.5 pb-1 border-b border-slate-800/80 w-full text-center">
                    <Layers className="w-4 h-4 text-emerald-400 animate-pulse" />
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 font-mono">Floor</span>
                  </div>

                  <button
                    onClick={() => {
                      const nextFloor = availableFloors.find(f => f > currentFloor)
                      if (nextFloor !== undefined) handleManualFloorChange(nextFloor)
                    }}
                    disabled={!availableFloors.some(f => f > currentFloor)}
                    className="w-10 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900 disabled:cursor-not-allowed border border-slate-700/60 flex items-center justify-center text-slate-200 active:scale-90 transition-all shadow-inner group"
                    title="Next Floor Up"
                    type="button"
                  >
                    <ChevronUp className="w-6 h-6 text-emerald-400 group-hover:scale-110 transition-transform stroke-[2.5]" />
                  </button>

                  <div className="py-1.5 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black font-mono tracking-tight text-white drop-shadow-[0_2px_10px_rgba(16,185,129,0.3)]">
                      {currentFloor}
                    </span>
                    <span className="text-[9px] font-semibold text-amber-400 px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 whitespace-nowrap mt-0.5">
                      Dest: {destNode.floor}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      const prevFloors = availableFloors.filter(f => f < currentFloor)
                      if (prevFloors.length > 0) {
                        handleManualFloorChange(prevFloors[prevFloors.length - 1])
                      }
                    }}
                    disabled={!availableFloors.some(f => f < currentFloor)}
                    className="w-10 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900 disabled:cursor-not-allowed border border-slate-700/60 flex items-center justify-center text-slate-200 active:scale-90 transition-all shadow-inner group"
                    title="Next Floor Down"
                    type="button"
                  >
                    <ChevronDown className="w-6 h-6 text-emerald-400 group-hover:scale-110 transition-transform stroke-[2.5]" />
                  </button>
                </div>
              </div>
            )}
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
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto z-40">
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
                    I&apos;m on Floor {nextNode?.floor}
                  </button>
                </div>
              </div>
            )}

            {/* Arrival Screen */}
            {arrived && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto z-50">
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
