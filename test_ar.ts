import { createXRTracker } from './lib/ar/tracking'

function createFakePose(x: number, y: number, z: number, yRotRad: number) {
  // Float32Array length 16
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
      orientation: q
    }
  } as any
}

function runSimulation() {
  const tracker = createXRTracker()
  console.log('--- TEST 1: Forward Movement Alignment ---')

  // Imagine the map has +X as East, +Y as South.
  // We calibrate the device at map pos (10, 10).
  // We are facing EAST on the map.
  // East means Map Angle = 0 radians.
  // XR Space at startup: phone is at (0,0,0) facing forward (z = -1 in XR, meaning yRot = 0)
  
  const initialPose = createFakePose(0, 0, 0, 0)
  tracker.recalibrate({ x: 10, y: 10, floor: 1 }, initialPose, 0) // mapAngleRad = 0

  console.log('Initial Position:', tracker.getWorldPosition(initialPose))
  console.log('Initial Heading:', tracker.getHeading(initialPose))

  // Move 5 meters forward in XR space (z = -5) over 60 frames
  let finalPos = { x: 0, y: 0, floor: 1 }
  for (let i = 1; i <= 60; i++) {
    const movedPose = createFakePose(0, 0, -5 * (i / 60), 0)
    finalPos = tracker.getWorldPosition(movedPose)
  }
  console.log('Moved Position (Forward 5m):', finalPos)
  
  const turnedPose = createFakePose(0, 0, -5, -Math.PI / 2)
  console.log('Turned Heading:', tracker.getHeading(turnedPose))

  console.log('--- TEST 2: Diagonal Path ---')
  const tracker2 = createXRTracker()
  // Start at (0,0), face SOUTH (+Y), Map Angle = PI/2
  tracker2.recalibrate({ x: 0, y: 0, floor: 1 }, initialPose, Math.PI / 2)
  
  // Move forward 10m (XR z = -10) over 60 frames
  let p2Pos = { x: 0, y: 0, floor: 1 }
  for (let i = 1; i <= 60; i++) {
    const pose2 = createFakePose(0, 0, -10 * (i / 60), 0)
    p2Pos = tracker2.getWorldPosition(pose2)
  }
  console.log('Should be (0, 10):', p2Pos)

  // Move right 5m (XR x = +5) over 60 frames
  let p3Pos = { x: 0, y: 0, floor: 1 }
  for (let i = 1; i <= 60; i++) {
    const pose3 = createFakePose(5 * (i / 60), 0, -10, 0)
    p3Pos = tracker2.getWorldPosition(pose3)
  }
  console.log('Should be (-5, 10):', p3Pos)
}

runSimulation()
