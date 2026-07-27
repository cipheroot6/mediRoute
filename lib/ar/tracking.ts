import {
  KALMAN_PROCESS_NOISE,
  KALMAN_MEASUREMENT_NOISE,
  PATH_SNAP_MAX_DIST_M,
} from '@/lib/constants'

export type XRPosition = {
  x: number   // metres, floor plan coordinate space
  y: number
  floor: number
}

export type XRTracker = {
  /**
   * Call when a QR anchor establishes absolute position.
   * mapAngleRad: angle in map space (CCW from +X) from startPos toward the first waypoint.
   * compassHeadingDeg: device magnetic north bearing at calibration time (CW from N).
   *   When provided, establishes map↔compass relationship so getHeading() returns
   *   accurate map-space direction for the rest of the session.
   */
  recalibrate: (
    worldPos: XRPosition,
    currentPose: XRViewerPose,
    mapAngleRad?: number,
    compassHeadingDeg?: number
  ) => void
  /** Feed the latest compass reading (degrees CW from magnetic North) every frame. */
  setCompassHeading: (deg: number) => void
  /** Call every XR frame — returns current estimated world position (Kalman-smoothed). */
  getWorldPosition: (currentPose: XRViewerPose) => XRPosition
  /** Heading in degrees in map coordinate space. Uses compass when available, else SLAM quaternion. */
  getHeading: (currentPose: XRViewerPose) => number
  /** Convert 2D map coordinates to 3D XR physical coordinates on the floor plane. */
  getXRPosition: (mapPos: { x: number; y: number }, currentPose: XRViewerPose, targetY?: number) => { x: number; y: number; z: number }
  /** Apply an external position correction (e.g. from IMU dead reckoning when SLAM is lost). */
  applyExternalDelta: (dxMetres: number, dyMetres: number) => void
}

// ─── Kalman Filter (1-D, applied independently to X and Y) ───────────────────
interface KalmanState {
  estimate: number
  errorCovariance: number
}

function kalmanUpdate(state: KalmanState, measurement: number): KalmanState {
  // Prediction: error grows each tick (process noise models real-world drift)
  const predictedCov = state.errorCovariance + KALMAN_PROCESS_NOISE
  // Update: pull toward measurement weighted by Kalman gain
  const gain = predictedCov / (predictedCov + KALMAN_MEASUREMENT_NOISE)
  return {
    estimate: state.estimate + gain * (measurement - state.estimate),
    errorCovariance: (1 - gain) * predictedCov,
  }
}

// ─── Path Snapping ────────────────────────────────────────────────────────────
/**
 * Projects `pos` onto the nearest line segment in `routePoints`.
 * Returns snapped position if within PATH_SNAP_MAX_DIST_M, otherwise original.
 * Keeps the mini-map dot inside corridor walls when SLAM drifts sideways.
 */
export function snapToPath(
  pos: { x: number; y: number },
  routePoints: Array<{ x: number; y: number }>
): { x: number; y: number } {
  if (routePoints.length < 2) return pos

  let bestDist = Infinity
  let bestX = pos.x
  let bestY = pos.y

  for (let i = 0; i < routePoints.length - 1; i++) {
    const ax = routePoints[i].x,   ay = routePoints[i].y
    const bx = routePoints[i+1].x, by = routePoints[i+1].y
    const dx = bx - ax, dy = by - ay
    const lenSq = dx * dx + dy * dy
    if (lenSq === 0) continue

    // Scalar projection clamped to [0, 1]
    const t = Math.max(0, Math.min(1, ((pos.x - ax) * dx + (pos.y - ay) * dy) / lenSq))
    const projX = ax + t * dx
    const projY = ay + t * dy
    const dist = Math.sqrt((pos.x - projX) ** 2 + (pos.y - projY) ** 2)

    if (dist < bestDist) {
      bestDist = dist
      bestX = projX
      bestY = projY
    }
  }

  return bestDist <= PATH_SNAP_MAX_DIST_M ? { x: bestX, y: bestY } : pos
}

// ─── XR Tracker ──────────────────────────────────────────────────────────────
export function createXRTracker(): XRTracker {
  let worldOrigin: XRPosition = { x: 0, y: 0, floor: 1 }
  let poseOrigin: { x: number; y: number; z: number } | null = null
  let trackingTheta = 0         // rotation from XR space → map space

  // Compass support
  let compassAvailable = false
  let latestCompassDeg = 0      // live CW-from-North bearing (updated each frame)
  let mapNorthOffsetRad = 0     // map angle − compass angle at calibration time
  //   = how many radians to ADD to a compass reading to get map-space angle

  // Kalman state for X and Y independently
  let kalmanX: KalmanState = { estimate: 0, errorCovariance: 1 }
  let kalmanY: KalmanState = { estimate: 0, errorCovariance: 1 }
  let kalmanInitialised = false

  // IMU / external delta accumulator
  let externalDx = 0
  let externalDy = 0

  function getPoseTranslation(pose: XRViewerPose) {
    const m = pose.transform.matrix
    return { x: m[12], y: m[13], z: m[14] }
  }

  return {
    recalibrate(worldPos, currentPose, mapAngleRad = -Math.PI / 2, compassHeadingDeg) {
      worldOrigin = worldPos
      poseOrigin = getPoseTranslation(currentPose)
      externalDx = 0
      externalDy = 0

      if (typeof compassHeadingDeg === 'number' && isFinite(compassHeadingDeg)) {
        compassAvailable = true
        latestCompassDeg = compassHeadingDeg

        // Magnetic heading is CW from North. Convert to CCW math radians:
        //   0°N → 90° in standard, 90°E → 0°, 180°S → -90° etc.
        //   compassRad (CCW from East) = (90 - compassDeg) * π/180
        const compassRad = (90 - compassHeadingDeg) * (Math.PI / 180)

        // The user is facing compassRad in map space AT calibration time.
        // We assume they are facing toward mapAngleRad (direction to first waypoint).
        // So: mapAngleRad corresponds to compassRad in physical space.
        // mapNorthOffset = offset so that compass → map heading is always:
        //   mapAngle = compassRad_any + mapNorthOffset
        mapNorthOffsetRad = mapAngleRad - compassRad

        // trackingTheta: when device moves forward (XR -Z, dz_xr = −d), it should
        // advance in direction mapAngleRad in map space.
        // From movement equations:  result_angle = θ − π/2
        // So θ = mapAngleRad + π/2
        trackingTheta = mapAngleRad + Math.PI / 2
      } else {
        compassAvailable = false
        // Existing fallback: XR -Z maps to mapAngleRad
        trackingTheta = mapAngleRad + Math.PI / 2
      }

      // Reset Kalman with a very tight covariance (we know exactly where we are)
      kalmanX = { estimate: worldPos.x, errorCovariance: 0.005 }
      kalmanY = { estimate: worldPos.y, errorCovariance: 0.005 }
      kalmanInitialised = true
    },

    setCompassHeading(deg: number) {
      latestCompassDeg = deg
    },

    getWorldPosition(currentPose) {
      if (!poseOrigin) return worldOrigin

      const p = getPoseTranslation(currentPose)
      const dx_xr = p.x - poseOrigin.x
      const dz_xr = p.z - poseOrigin.z

      // Rotate XR delta → map delta
      const rawMapDx = dx_xr * Math.cos(trackingTheta) - dz_xr * Math.sin(trackingTheta)
      const rawMapDy = dx_xr * Math.sin(trackingTheta) + dz_xr * Math.cos(trackingTheta)

      const rawX = worldOrigin.x + rawMapDx + externalDx
      const rawY = worldOrigin.y + rawMapDy + externalDy

      // Kalman-smooth the raw measurement
      if (!kalmanInitialised) {
        kalmanX = { estimate: rawX, errorCovariance: 1 }
        kalmanY = { estimate: rawY, errorCovariance: 1 }
        kalmanInitialised = true
      } else {
        kalmanX = kalmanUpdate(kalmanX, rawX)
        kalmanY = kalmanUpdate(kalmanY, rawY)
      }

      return {
        x: kalmanX.estimate,
        y: kalmanY.estimate,
        floor: worldOrigin.floor,
      }
    },

    getHeading(currentPose) {
      if (compassAvailable) {
        // Convert live compass bearing (CW from N) to CCW-from-East radians, then to map angle
        const compassRad = (90 - latestCompassDeg) * (Math.PI / 180)
        const mapAngleRad = compassRad + mapNorthOffsetRad
        return mapAngleRad * (180 / Math.PI)
      }

      // Fallback: derive heading from SLAM quaternion yaw
      const q = currentPose.transform.orientation
      const yaw = Math.atan2(
        2 * (q.w * q.y + q.x * q.z),
        1 - 2 * (q.y * q.y + q.z * q.z)
      )
      return yaw * (180 / Math.PI)
    },

    getXRPosition(mapPos, currentPose, targetY = 0) {
      if (!poseOrigin) return { x: 0, y: 0, z: -2 }

      const mapDx = mapPos.x - worldOrigin.x
      const mapDy = mapPos.y - worldOrigin.y

      // Inverse of the forward rotation
      const dx_xr =  mapDx * Math.cos(trackingTheta) + mapDy * Math.sin(trackingTheta)
      const dz_xr = -mapDx * Math.sin(trackingTheta) + mapDy * Math.cos(trackingTheta)

      return {
        x: poseOrigin.x + dx_xr,
        y: targetY,
        z: poseOrigin.z + dz_xr,
      }
    },

    applyExternalDelta(dxMetres, dyMetres) {
      externalDx += dxMetres
      externalDy += dyMetres
    },
  }
}
