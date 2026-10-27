import type { PlannedRecallSession } from './types'

export const DEFAULT_RECALL_INTERVALS = [0, 1, 3, 6, 10, 15, 22, 29]
export const DEFAULT_DAILY_RECALL_GOAL = 12

export type RecallSchedule = {
  sessions: PlannedRecallSession[]
  dailyCounts: Record<string, number>
  overloadedDays: string[]
}

function dayOffset(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('اختر تاريخًا صحيحًا للخطة.')
  }
  return parsed.getTime() / 86_400_000
}

function dateAt(startDate: string, offset: number) {
  return new Date((dayOffset(startDate) + offset) * 86_400_000).toISOString().slice(0, 10)
}

export function buildRecallSchedule({
  lessonIds,
  startDate,
  endDate,
  intervals = DEFAULT_RECALL_INTERVALS,
  dailyGoal = DEFAULT_DAILY_RECALL_GOAL,
  restDay = null,
}: {
  lessonIds: string[]
  startDate: string
  endDate: string
  intervals?: number[]
  dailyGoal?: number
  restDay?: number | null
}): RecallSchedule {
  const start = dayOffset(startDate)
  const end = dayOffset(endDate)
  const duration = end - start + 1
  if (end < start || duration > 366) throw new Error('يجب أن تكون مدة الخطة بين يوم واحد وسنة.')
  if (lessonIds.length === 0) throw new Error('اختر درسًا واحدًا على الأقل.')
  if (new Set(lessonIds).size !== lessonIds.length) throw new Error('لا يمكن اختيار الدرس نفسه أكثر من مرة.')
  if (!Number.isInteger(dailyGoal) || dailyGoal < 1 || dailyGoal > 100) throw new Error('هدف الجلسات اليومية يجب أن يكون بين 1 و100.')
  if (restDay !== null && (!Number.isInteger(restDay) || restDay < 0 || restDay > 6)) {
    throw new Error('اختر يوم راحة صحيحًا.')
  }
  if (intervals.length < 1 || intervals.length > 12 || intervals.some((item, index) =>
    !Number.isInteger(item) || item < 0 || (index > 0 && item <= intervals[index - 1]))) {
    throw new Error('فواصل المراجعة يجب أن تكون أعدادًا صحيحة متزايدة.')
  }

  const counts = Array.from({ length: duration }, () => 0)
  // Keep the configured goal for normal plans, but automatically raise the planning target
  // when the student compresses many reviews into a short time window.
  const effectiveDailyGoal = Math.max(dailyGoal, Math.ceil((lessonIds.length * intervals.length) / duration))
  const lastAssigned = new Map<string, number>()
  const sessions: PlannedRecallSession[] = []
  const work = [...lessonIds].sort().flatMap((lessonId, lessonIndex) =>
    intervals.map((interval, index) => ({
      lessonId,
      lessonIndex,
      reviewNumber: index + 1,
      target: Math.round(interval / Math.max(1, intervals[intervals.length - 1]) * (duration - 1)),
    })),
  ).sort((a, b) => a.target - b.target || a.lessonIndex - b.lessonIndex || a.reviewNumber - b.reviewNumber)

  for (const item of work) {
    const previousDay = lastAssigned.get(item.lessonId)
    // When the window is short, several spaced repetitions may need to share a day.
    // Never let the lower bound move past the final available day; that caused the
    // previous "تعذر توزيع جلسات هذا الدرس" crash for compressed schedules.
    const proposedMinimumDay = previousDay === undefined ? 0 : previousDay + (duration >= intervals.length ? 1 : 0)
    const minimumDay = Math.min(proposedMinimumDay, duration - 1)
    const candidates = Array.from({ length: duration - minimumDay }, (_, index) => minimumDay + index)
    if (candidates.length === 0) throw new Error('تعذر توزيع جلسات هذا الدرس ضمن المدة المحددة.')
    candidates.sort((a, b) => {
      const aRest = restDay !== null && new Date((start + a) * 86_400_000).getUTCDay() === restDay ? 1 : 0
      const bRest = restDay !== null && new Date((start + b) * 86_400_000).getUTCDay() === restDay ? 1 : 0
      const aOver = counts[a] >= effectiveDailyGoal ? 1 : 0
      const bOver = counts[b] >= effectiveDailyGoal ? 1 : 0
      return aRest - bRest || aOver - bOver || Math.abs(a - item.target) - Math.abs(b - item.target) || counts[a] - counts[b] || a - b
    })
    const assignedDay = candidates[0]
    lastAssigned.set(item.lessonId, assignedDay)
    counts[assignedDay] += 1
    sessions.push({
      lessonId: item.lessonId,
      reviewNumber: item.reviewNumber,
      scheduledDate: dateAt(startDate, assignedDay),
    })
  }

  const dailyCounts: Record<string, number> = {}
  counts.forEach((count, offset) => {
    dailyCounts[dateAt(startDate, offset)] = count
  })
  return {
    sessions: sessions.sort((a, b) =>
      a.scheduledDate.localeCompare(b.scheduledDate) || a.lessonId.localeCompare(b.lessonId) || a.reviewNumber - b.reviewNumber,
    ),
    dailyCounts,
    overloadedDays: Object.keys(dailyCounts).filter((date) => dailyCounts[date] > effectiveDailyGoal),
  }
}
