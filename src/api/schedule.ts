const API_BASE = import.meta.env.VITE_SCHEDULE_API_BASE_URL?.replace(/\/$/, '')

export interface Branch {
  guid: string
  code: string
  name: string
}

export interface Employee {
  GUID: string
  Name: string
  Male: string
  Position: string
}

export interface Lesson {
  FilialGUID: string
  Data: string
  DayOFWeek: string
  Time: string
  Time_start: string
  Time_end: string
  Group: string
  SubGroup: string
  Type: string
  Discipline: string
  Employee: string
  Classroom: string
}

interface WeekSchedule {
  schedule: Record<string, Lesson[]>
  date: {
    to_sch: string
    type: string
    back: string
    next: string
    day: number
    day_string: string
    month: number
    month_string: string
    year: number
    monday: number
    sunday: number
  }
}

async function getJson<T>(path: string): Promise<T> {
  if (!API_BASE) {
    throw new Error('Не настроен адрес API-прокси. Укажите VITE_SCHEDULE_API_BASE_URL.')
  }

  let response: Response

  try {
    response = await fetch(`${API_BASE}${path}`)
  } catch {
    throw new Error('Браузер не смог подключиться к API расписания. Проверьте CORS или доступность сервера.')
  }

  if (!response.ok) {
    throw new Error(`API расписания ответил с ошибкой ${response.status}. Попробуйте позже.`)
  }

  return response.json() as Promise<T>
}

export function getBranches() {
  return getJson<Branch[]>('/get_branches')
}

export function getEmployees(branchId: string) {
  return getJson<Employee[]>(`/get_employees/${encodeURIComponent(branchId)}`)
}

function apiDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}.${month}.${day}`
}

function lessonDate(value: string) {
  const [day, month, year] = value.split('.').map(Number)
  return new Date(year, month - 1, day)
}

export async function getMonthlySchedule(branchId: string, employeeId: string, monthValue: string) {
  const [year, month] = monthValue.split('-').map(Number)
  if (!year || !month) return []

  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  const weeks: Date[] = []

  for (const date = new Date(firstDay); date <= lastDay; date.setDate(date.getDate() + 7)) {
    weeks.push(new Date(date))
  }

  const lessons: Lesson[] = []
  for (const weekDate of weeks) {
    const result = await getJson<WeekSchedule>(
      `/get_schedule/employee/${encodeURIComponent(branchId)}/${encodeURIComponent(employeeId)}/${apiDate(weekDate)}`,
    )
    lessons.push(...Object.values(result.schedule ?? {}).flat())
  }

  return lessons
    .filter((lesson) => {
      const date = lessonDate(lesson.Data)
      return date >= firstDay && date <= lastDay
    })
    .sort((left, right) => {
      const byDate = lessonDate(left.Data).getTime() - lessonDate(right.Data).getTime()
      return byDate || left.Time_start.localeCompare(right.Time_start)
    })
}

export function formatLessonDate(value: string) {
  const [day, month, year] = value.split('.')
  return `${day}.${month}.${year}`
}
