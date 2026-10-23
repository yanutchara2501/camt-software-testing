import { describe, expect, it } from 'vitest'
import { distanceInMetres } from '../../src/lib/geo.js'

/**
 * Straight-line distance between two GPS points.
 *
 * The expected figures are worked out from the sphere (R = 6,371 km) and not
 * read back from the function: one degree of arc is 2πR/360 = 111,195 m, and
 * the half-circumference πR is 20,015,087 m. Longitude is the interesting
 * direction, because a degree of it shrinks with the cosine of the latitude.
 */
const BANGKOK = { latitude: 13.7563, longitude: 100.5018 }
const CHIANG_MAI = { latitude: 18.7883, longitude: 98.9853 }

describe('distanceInMetres', () => {
  it('is zero between a point and itself', () => {
    expect(distanceInMetres(BANGKOK, BANGKOK)).toBe(0)
  })

  it('is the same in both directions', () => {
    expect(distanceInMetres(BANGKOK, CHIANG_MAI)).toBe(distanceInMetres(CHIANG_MAI, BANGKOK))
  })

  it('measures one degree of latitude as 111,195 m', () => {
    const distance = distanceInMetres({ latitude: 14, longitude: 100 }, { latitude: 15, longitude: 100 })

    expect(distance).toBe(111_195)
  })

  it('measures one degree of longitude on the equator the same as one of latitude', () => {
    const distance = distanceInMetres({ latitude: 0, longitude: 100 }, { latitude: 0, longitude: 101 })

    expect(distance).toBe(111_195)
  })

  it('makes a degree of longitude shorter away from the equator (half as long at 60 degrees north)', () => {
    const distance = distanceInMetres({ latitude: 60, longitude: 100 }, { latitude: 60, longitude: 101 })

    // exact haversine value is a few metres under half of 111,195
    expect(Math.abs(distance - 55_597)).toBeLessThanOrEqual(5)
  })

  it('gives roughly 580 km between Bangkok and Chiang Mai in a straight line', () => {
    const kilometres = distanceInMetres(BANGKOK, CHIANG_MAI) / 1000

    expect(kilometres).toBeGreaterThan(575)
    expect(kilometres).toBeLessThan(590)
  })

  it('does not break for points on opposite sides of the Earth (the square root is clamped at 1)', () => {
    const distance = distanceInMetres({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 })

    expect(distance).toBe(20_015_087)
  })

  it('returns whole metres', () => {
    const distance = distanceInMetres(BANGKOK, { latitude: 13.7564, longitude: 100.5019 })

    expect(Number.isInteger(distance)).toBe(true)
  })

  it('measures a short hop of about 15 m between two nearby site points', () => {
    // 0.0001 degree of latitude is 11.1 m, 0.0001 of longitude at 13.75 N is 10.8 m
    const distance = distanceInMetres(BANGKOK, { latitude: 13.7564, longitude: 100.5019 })

    expect(distance).toBeGreaterThanOrEqual(14)
    expect(distance).toBeLessThanOrEqual(16)
  })
})
