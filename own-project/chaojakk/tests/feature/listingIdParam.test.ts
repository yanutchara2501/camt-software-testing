import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { resetDatabase } from '../helpers/database.js'

/**
 * Component test (the app in-process, a real PostgreSQL): what a caller sees
 * when the id in a public URL is nonsense.
 *
 * `parseId` says in its own comment that "/bookings/abc and /bookings/999999 are
 * both no such thing, and answering differently would tell a caller which id
 * shapes exist". This is the test of that promise through the real route,
 * because the unit test only proves that the function throws, not that the
 * router turns it into an identical answer.
 */
const app = createApp()

describe('GET /api/v1/listings/:id with an id that does not exist', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('answers 404 with a Thai JSON message for a well-formed id that nobody has', async () => {
    const response = await request(app).get('/api/v1/listings/999999')

    expect(response.status).toBe(404)
    expect(response.headers['content-type']).toMatch(/application\/json/)
    expect(response.body.message).toBe('ไม่พบข้อมูลที่ต้องการ')
  })

  it.each([
    ['letters', 'abc'],
    ['zero', '0'],
    ['a negative number', '-5'],
    ['a fraction', '1.5'],
  ])('answers %s exactly as it answers an id that is well-formed but missing', async (_label, id) => {
    const missing = await request(app).get('/api/v1/listings/999999')

    const malformed = await request(app).get(`/api/v1/listings/${id}`)

    expect(malformed.status).toBe(missing.status)
    expect(malformed.body).toEqual(missing.body)
  })
})
