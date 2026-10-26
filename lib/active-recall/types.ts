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
}

export type StudentRecallLesson = {
  id: string
  title: string
  day: number
  available: boolean
  content?: string
  question?: RecallQuestion
}

export type StudentRecallCourse = {
  id: string
  name: string
  startDate: string
  currentDay: number
  completedLessonIds: string[]
  lessons: StudentRecallLesson[]
}
