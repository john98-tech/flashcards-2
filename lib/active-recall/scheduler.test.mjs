import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRecallSchedule, DEFAULT_RECALL_INTERVALS } from './scheduler.ts'

const startDate = '2026-10-26'

function dateAfter(days) {
  return new Date(Date.parse(`${startDate}T00:00:00.000Z`) + (days - 1) * 86_400_000).toISOString().slice(0, 10)
}

test('keeps the balanced 30-day offsets for a single lesson', () => {
  const schedule = buildRecallSchedule({
    lessonIds: ['lesson-1'],
    startDate,
    endDate: dateAfter(30),
  })
  assert.deepEqual(
    schedule.sessions.sort((a, b) => a.reviewNumber - b.reviewNumber).map((session) => session.scheduledDate),
    DEFAULT_RECALL_INTERVALS.map((offset) => dateAfter(offset + 1)),
  )
})

test('creates eight sessions for a one-week plan', () => {
  const schedule = buildRecallSchedule({ lessonIds: ['lesson-1'], startDate, endDate: dateAfter(7) })
  assert.equal(schedule.sessions.length, 8)
  assert.ok(schedule.sessions.every((session) => session.scheduledDate <= dateAfter(7)))
})

test('balances twelve lessons across a month within the default daily goal', () => {
  const schedule = buildRecallSchedule({
    lessonIds: Array.from({ length: 12 }, (_, index) => `lesson-${index}`),
    startDate,
    endDate: dateAfter(30),
  })
  assert.equal(schedule.sessions.length, 96)
  assert.equal(Math.max(...Object.values(schedule.dailyCounts)), 12)
  assert.deepEqual(schedule.overloadedDays, [])
})

test('balances forty lessons across a month without losing reviews', () => {
  const lessonIds = Array.from({ length: 40 }, (_, index) => `lesson-${index}`)
  const schedule = buildRecallSchedule({ lessonIds, startDate, endDate: dateAfter(30) })
  assert.equal(schedule.sessions.length, 320)
  assert.equal(Math.max(...Object.values(schedule.dailyCounts)), 12)
  for (const lessonId of lessonIds) {
    const reviews = schedule.sessions
      .filter((session) => session.lessonId === lessonId)
      .sort((a, b) => a.reviewNumber - b.reviewNumber)
    assert.equal(reviews.length, 8)
    assert.ok(reviews.every((session, index) =>
      session.reviewNumber === index + 1 && (index === 0 || session.scheduledDate > reviews[index - 1].scheduledDate),
    ))
  }
})

test('reports overload when an exam deadline compresses too many sessions into one day', () => {
  const schedule = buildRecallSchedule({
    lessonIds: Array.from({ length: 40 }, (_, index) => `lesson-${index}`),
    startDate,
    endDate: startDate,
  })
  assert.equal(schedule.sessions.length, 320)
  assert.equal(schedule.overloadedDays[0], startDate)
  assert.equal(schedule.dailyCounts[startDate], 320)
})

test('moves reviews away from the selected weekly rest day when capacity allows', () => {
  const schedule = buildRecallSchedule({
    lessonIds: Array.from({ length: 12 }, (_, index) => `lesson-${index}`),
    startDate,
    endDate: dateAfter(30),
    restDay: 0,
  })
  assert.ok(schedule.sessions.every((session) => new Date(`${session.scheduledDate}T00:00:00Z`).getUTCDay() !== 0))
})

test('produces the same session dates regardless of selection order', () => {
  const lessonIds = ['lesson-c', 'lesson-a', 'lesson-b']
  const original = buildRecallSchedule({ lessonIds, startDate, endDate: dateAfter(14) })
  const shuffled = buildRecallSchedule({ lessonIds: [...lessonIds].reverse(), startDate, endDate: dateAfter(14) })
  assert.deepEqual(original.sessions, shuffled.sessions)
})

test('supports forty lessons in a week without dropping repeated reviews', () => {
  const lessonIds = Array.from({ length: 40 }, (_, index) => `short-week-${index}`)
  const schedule = buildRecallSchedule({ lessonIds, startDate, endDate: dateAfter(7) })
  assert.equal(schedule.sessions.length, 320)
  for (const lessonId of lessonIds) {
    const reviews = schedule.sessions.filter((session) => session.lessonId === lessonId)
    assert.equal(reviews.length, DEFAULT_RECALL_INTERVALS.length)
    assert.ok(reviews.every((session) => session.scheduledDate >= startDate && session.scheduledDate <= dateAfter(7)))
  }
})

test('supports two-day and one-day plans by stacking repeated reviews on the same day', () => {
  const lessonIds = Array.from({ length: 40 }, (_, index) => `compressed-${index}`)
  for (const days of [2, 1]) {
    const schedule = buildRecallSchedule({ lessonIds, startDate, endDate: dateAfter(days) })
    assert.equal(schedule.sessions.length, 320)
    assert.ok(schedule.sessions.every((session) => session.scheduledDate >= startDate && session.scheduledDate <= dateAfter(days)))
    for (const lessonId of lessonIds) {
      assert.equal(schedule.sessions.filter((session) => session.lessonId === lessonId).length, DEFAULT_RECALL_INTERVALS.length)
    }
  }
})
