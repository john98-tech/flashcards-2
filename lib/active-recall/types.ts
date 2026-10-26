export type RecallQuestionType = 'open' | 'mcq'

export type RecallQuestion = {
  prompt: string
  type: RecallQuestionType
  answer: string
  options: string[]
  correctIndex: number
}

export type RecallCourse = {
  id: string
  name: string
  startDate: string
  createdAt: string
  lessonCount: number
}

export type RecallLesson = {
  id: string
  courseId: string
  title: string
  content: string
  position: number
  question: RecallQuestion
  additionalQuestion: RecallQuestion | null
}

export type RecallSession = {
  id: string
  lessonId: string
  lessonTitle: string
  reviewNumber: number
  scheduledDate: string
  status: 'pending' | 'completed' | 'rescheduled' | 'skipped'
  completedAt: string | null
  selfAssessment: 'knew_it' | 'review_again' | null
}

export type StudentRecallLesson = {
  id: string
  title: string
  position: number
  content: string
  question: RecallQuestion
  additionalQuestion: RecallQuestion | null
}

export type StudentRecallPlan = {
  id: string
  courseId: string
  startDate: string
  endDate: string
  examDate: string | null
  lessonIds: string[]
  intervals: number[]
  dailyGoal: number
  restDay: number | null
  sessions: RecallSession[]
}

export type PlannedRecallSession = {
  lessonId: string
  reviewNumber: number
  scheduledDate: string
}

export type RecallSettings = {
  intervals: number[]
  dailyGoal: number
  restDay: number | null
}
