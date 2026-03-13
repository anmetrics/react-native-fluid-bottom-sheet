import { RUBBER_COEFF, VELOCITY_FACTOR } from './constants'

export function rubberBand(offset: number, maxExtent: number): number {
  'worklet'
  return (1 - 1 / ((offset * RUBBER_COEFF) / maxExtent + 1)) * maxExtent
}

export function findTargetSnap(
  position: number,
  velocity: number,
  snaps: readonly number[],
  dismissAt: number
): number {
  'worklet'

  const projected = position + velocity * VELOCITY_FACTOR

  if (projected > dismissAt) return dismissAt

  let nearest = snaps[0]
  let minDist = Math.abs(projected - snaps[0])

  for (let i = 1; i < snaps.length; i++) {
    const dist = Math.abs(projected - snaps[i])
    if (dist < minDist) {
      minDist = dist
      nearest = snaps[i]
    }
  }

  return nearest
}
