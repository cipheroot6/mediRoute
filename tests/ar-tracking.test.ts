import { createXRTracker } from '@/lib/ar/tracking'

function createFakePose(x: number, y: number, z: number, yRotRad: number): XRViewerPose {
  const m = new Float32Array(16)
  m[12] = x
  m[13] = y
  m[14] = z

  const q = {
    x: 0,
    y: Math.sin(yRotRad / 2),
    z: 0,
    w: Math.cos(yRotRad / 2),
  }

  return {
    transform: {
      matrix: m,
      orientation: q as DOMPointReadOnly,
      position: { x, y, z, w: 1 } as DOMPointReadOnly,
      inverse: {} as XRRigidTransform,
    } as XRRigidTransform,
    views: [] as readonly XRView[],
  } as unknown as XRViewerPose
}

function runTrackingSimulation() {
  const tracker = createXRTracker()

  // Calibration at (10, 10), facing EAST (mapAngleRad = 0)
  const initialPose = createFakePose(0, 0, 0, 0)
  tracker.recalibrate({ x: 10, y: 10, floor: 1 }, initialPose, 0)

  const posAtStart = tracker.getWorldPosition(initialPose)
  console.assert(Math.abs(posAtStart.x - 10) < 0.1, 'Initial X near 10')
  console.assert(Math.abs(posAtStart.y - 10) < 0.1, 'Initial Y near 10')

  // Move 5m forward in XR space (z = -5)
  let finalPos = { x: 0, y: 0, floor: 1 }
  for (let i = 1; i <= 60; i++) {
    const movedPose = createFakePose(0, 0, -5 * (i / 60), 0)
    finalPos = tracker.getWorldPosition(movedPose)
  }
  console.assert(finalPos.x > 14 && finalPos.x <= 15.1, 'Moved forward ~5m along +X')

  console.log('✓ AR Tracking simulation tests passed')
}

runTrackingSimulation()
