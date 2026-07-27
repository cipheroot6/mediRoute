/**
 * IMU Dead-Reckoning Fallback
 *
 * Activated only when WebXR SLAM tracking is lost (getViewerPose returns null).
 * Uses DeviceMotion accelerometer to detect steps and accumulate a position delta.
 * Hands position back to SLAM automatically when tracking recovers.
 *
 * Accuracy: ~15–30% error per step, but far better than freezing the dot when
 * the user walks through a dark stairwell or poorly-lit corridor.
 */

import { IMU_STEP_LENGTH_M } from '@/lib/constants'

export interface IMUTracker {
  /** Start listening to DeviceMotion events. headingDeg = current compass bearing. */
  start(headingDeg: number): void
  /** Stop listening — call when SLAM tracking recovers. */
  stop(): void
  /** Update heading as compass reading changes (called each XR frame when available). */
  setHeading(headingDeg: number): void
  /** Metres accumulated since last resetDelta call. */
  getDeltaM(): { dx: number; dy: number }
  /** Zero out the accumulated delta (call after consuming it). */
  resetDelta(): void
  /** Whether the IMU tracker is currently active. */
  readonly active: boolean
}

export function createIMUTracker(): IMUTracker {
  let _active = false
  let headingRad = 0         // current facing direction in radians
  let dx = 0                 // accumulated East delta (map +X)
  let dy = 0                 // accumulated South delta (map +Y)

  // Step detection — peak in |vertical acceleration| above threshold
  const STEP_THRESHOLD = 1.2  // m/s² above gravity baseline
  let lastAz = 0
  let rising = false

  function onMotion(event: DeviceMotionEvent) {
    const az = event.accelerationIncludingGravity?.z ?? 0

    // Simple peak detector: rising edge then falling edge = one step
    if (!rising && az > lastAz + STEP_THRESHOLD) {
      rising = true
    } else if (rising && az < lastAz - STEP_THRESHOLD * 0.5) {
      rising = false
      // One step detected — project along current heading in map space
      dx += IMU_STEP_LENGTH_M * Math.cos(headingRad)
      dy += IMU_STEP_LENGTH_M * Math.sin(headingRad)
    }
    lastAz = az
  }

  return {
    get active() { return _active },

    start(headingDeg: number) {
      if (_active) return
      headingRad = headingDeg * (Math.PI / 180)
      rising = false
      lastAz = 0
      _active = true
      window.addEventListener('devicemotion', onMotion)
    },

    stop() {
      if (!_active) return
      _active = false
      window.removeEventListener('devicemotion', onMotion)
    },

    setHeading(headingDeg: number) {
      headingRad = headingDeg * (Math.PI / 180)
    },

    getDeltaM() {
      return { dx, dy }
    },

    resetDelta() {
      dx = 0
      dy = 0
    },
  }
}
