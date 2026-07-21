import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Convert pixel coordinates to real-world metres using the floor's scale
export function pxToMetres(px: number, scaleMpp: number): number {
  return px * scaleMpp
}

// Euclidean distance between two points in metres
export function distanceM(
  x1: number, y1: number,
  x2: number, y2: number
): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
}

// Bearing in degrees from point A to point B
// 0 = right (+x), 90 = down (+y), matches screen coordinate space
export function bearing(
  x1: number, y1: number,
  x2: number, y2: number
): number {
  return Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI)
}
