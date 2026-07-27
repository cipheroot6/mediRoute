export const APP_NAME = 'MediRoute'

// IMU dead reckoning — how often we update position from accelerometer
export const IMU_POLL_INTERVAL_MS = 100

// Arrival thresholds — coarser for final destination, tighter for mid-route waypoints
export const NODE_ARRIVAL_THRESHOLD_M = 3        // legacy alias — kept for astar.test.ts
export const NODE_ARRIVAL_THRESHOLD_WAYPOINT_M = 1.5  // advance to next node when this close
export const NODE_ARRIVAL_THRESHOLD_DEST_M = 3.0      // final destination — coarser is fine

// Cross-floor edge cost — added to route weight when passing through an elevator
// High enough to prefer single-floor routes but not so high it blocks multi-floor routing
export const ELEVATOR_FLOOR_PENALTY = 50

// Supabase storage bucket for floor plan images
export const FLOOR_PLAN_BUCKET = 'floor-plans'

// Kalman filter tuning — lower process noise = smoother but slower to react
export const KALMAN_PROCESS_NOISE = 0.008
export const KALMAN_MEASUREMENT_NOISE = 0.6

// Path snapping — max perpendicular distance before we stop snapping to corridor
export const PATH_SNAP_MAX_DIST_M = 2.0

// IMU step detection — human average stride, used for dead-reckoning fallback
export const IMU_STEP_LENGTH_M = 0.75

// Proximity re-anchor — show recalibration banner when this close to an anchor node
export const REANCHOR_PROXIMITY_M = 4.0

// Voice navigation speech synthesis default parameters
export const SPEECH_RATE = 0.95
export const SPEECH_PITCH = 1
export const SPEECH_VOLUME = 1

// Admin interactive floor map editor click hit-detection distance threshold (px)
export const NODE_HIT_THRESHOLD_PX = 15
