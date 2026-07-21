export const APP_NAME = 'MediRoute'

// IMU dead reckoning — how often we update position from accelerometer
export const IMU_POLL_INTERVAL_MS = 100

// How close (in metres) the user needs to be to a node to count as "arrived"
export const NODE_ARRIVAL_THRESHOLD_M = 3

// Cross-floor edge cost — added to route weight when passing through an elevator
// High enough to prefer single-floor routes but not so high it blocks multi-floor routing
export const ELEVATOR_FLOOR_PENALTY = 50

// Supabase storage bucket for floor plan images
export const FLOOR_PLAN_BUCKET = 'floor-plans'
