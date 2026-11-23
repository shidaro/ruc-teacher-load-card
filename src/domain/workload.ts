import type { Lesson } from '../api/schedule'

export type WorkloadColumn = 'lecture' | 'lab' | 'practical' | 'consultation' | 'credit' | 'test' | 'exam' | 'individualProject'
export type ReattestationPlacement = 'credit' | 'test' | 'individualProject' | 'exam'

export const reattestationPlacementOptions: Array<{ value: ReattestationPlacement; label: string }> = [
  { value: 'credit', label: 'Зачёт / дифференцированный зачёт' },
  { value: 'test', label: 'Аудиторная контрольная работа' },
  { value: 'individualProject', label: 'Курсовая работа / проект' },
  { value: 'exam', label: 'Экзамен' },
]

export interface WorkloadRow {
  discipline: string
  group: string
  hours: Record<WorkloadColumn, number>
  total: number
}

export interface WorkloadSummary {
  rows: WorkloadRow[]
  totalHours: number
  studentActivities: StudentActivity[]
  unclassified: UnclassifiedActivity[]
}

export interface StudentActivity {
  id: string
  lesson: Lesson
  ratePerStudent: number
  column: 'reattestation' | 'individualProject'
  rule: string
  studentCount?: number
  placementColumn?: ReattestationPlacement
  hours: number
}

export interface UnclassifiedActivity {
  id: string
  lesson: Lesson
  reason: string
}

const columns: WorkloadColumn[] = ['lecture', 'lab', 'practical', 'consultation', 'credit', 'test', 'exam', 'individualProject']

// Workload rates use halves and tenths of an hour. Round each accumulated result
// to two decimal places to avoid exposing binary floating-point artifacts.
export function roundHours(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function formatHours(value: number) {
  return roundHours(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 })
}

// Rates and API type mapping are kept outside the UI so they can be refined independently.
const classroomTypes: Array<{ column: WorkloadColumn; pattern: RegExp }> = [
  { column: 'lecture', pattern: /лекц/i },
  { column: 'lab', pattern: /лаборатор/i },
  { column: 'practical', pattern: /практическ|семинар/i },
]

// This lesson arrives with an empty Type and its name in Discipline. The card
// has no generic classroom column, so it is included with practical/seminar hours.
const classroomDisciplines: Array<{ column: WorkloadColumn; pattern: RegExp }> = [
  { column: 'practical', pattern: /^разговоры о важном$/i },
]

function normalized(value: string) {
  return value.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')
}

function disciplineLabel(lesson: Lesson) {
  return lesson.Discipline?.trim() || lesson.Type?.trim() || 'Дисциплина не указана'
}

function rowKey(lesson: Lesson) {
  return `${normalized(disciplineLabel(lesson))}\u0000${normalized(lesson.Group)}`
}

function groupSetKey(discipline: string, groups: string[]) {
  return `${normalized(discipline)}\u0000${groups.map(normalized).join('\u0001')}`
}

function scheduledHours(value: string) {
  const time = value.trim()
  if (/^урок\s*\d+$/i.test(time)) return 1
  if (/^\d+$/.test(time)) return 2
  return undefined
}

function assessmentKey(lesson: Lesson, kind: string) {
  return `${rowKey(lesson)}\u0000${kind}`
}

function activityId(lesson: Lesson) {
  return [lesson.Data, lesson.Time, lesson.Time_start, lesson.Time_end, lesson.Type, lesson.Discipline, lesson.Group, lesson.SubGroup, lesson.Classroom]
    .map((value) => normalized(value ?? ''))
    .join('\u0000')
}

export function calculateWorkload(
  lessons: Lesson[],
  studentCounts: Record<string, number | undefined> = {},
  studentActivityPlacements: Record<string, ReattestationPlacement | undefined> = {},
): WorkloadSummary {
  const byGroup = new Map<string, WorkloadRow>()
  const classroomSessions = new Map<string, { lesson: Lesson; groups: Set<string>; hours: number; column: WorkloadColumn }>()
  const studentActivities = new Map<string, StudentActivity>()
  const unclassified = new Map<string, UnclassifiedActivity>()
  const oncePerGroupDiscipline = new Set<string>()

  function getRow(lesson: Lesson) {
    const key = rowKey(lesson)
    let row = byGroup.get(key)
    if (!row) {
      row = {
        discipline: disciplineLabel(lesson),
        group: lesson.Group?.trim() || 'Группа не указана',
        hours: Object.fromEntries(columns.map((column) => [column, 0])) as Record<WorkloadColumn, number>,
        total: 0,
      }
      byGroup.set(key, row)
    }
    return row
  }

  for (const lesson of lessons) {
    const type = normalized(lesson.Type ?? '')
    const discipline = normalized(lesson.Discipline ?? '')
    const classroom = classroomTypes.find((entry) => entry.pattern.test(type))
      ?? classroomDisciplines.find((entry) => entry.pattern.test(discipline))
    if (classroom) {
      const hours = scheduledHours(lesson.Time ?? '')
      if (hours === undefined) {
        const id = activityId(lesson)
        unclassified.set(id, { id, lesson, reason: `Не удалось определить длительность по полю Time «${lesson.Time || 'пусто'}».` })
        continue
      }

      // The schedule repeats one joint class once per group. Combine those entries before counting it.
      const sessionKey = [
        lesson.Data,
        lesson.Time,
        lesson.Time_start,
        lesson.Time_end,
        type,
        normalized(lesson.Discipline ?? ''),
        normalized(lesson.SubGroup ?? ''),
        normalized(lesson.Classroom ?? ''),
      ].join('\u0000')
      let session = classroomSessions.get(sessionKey)
      if (!session) {
        session = { lesson, groups: new Set(), hours, column: classroom.column }
        classroomSessions.set(sessionKey, session)
      }
      if (lesson.Group?.trim()) session.groups.add(lesson.Group.trim())
      continue
    }

    let column: WorkloadColumn | undefined
    let rate = 0
    let uniqueKind: string | undefined

    if (/предэкзаменац|перед экзаменом/.test(type) && /консультац/.test(type)) {
      column = 'consultation'
      rate = 1 // Item 1.2: per group and discipline.
      uniqueKind = column
    } else if (/дифференцированн|зачет/.test(type) && !/повторн/.test(type)) {
      column = 'credit'
      rate = 0.5 // Item 1.3: per group and discipline.
      uniqueKind = column
    } else if (/аудиторн.*контрольн|контрольн.*работ/.test(type)) {
      column = 'test'
      rate = 0.5 // Item 1.4: per group and discipline.
      uniqueKind = column
    } else if (/экзамен/.test(type) && !/квалификационн|модул/.test(type)) {
      column = 'exam'
      rate = 0.5 // Item 1.3: per group and discipline.
      uniqueKind = column
    }

    if (!column) {
      const id = activityId(lesson)
      let studentRule: Omit<StudentActivity, 'id' | 'lesson' | 'studentCount' | 'hours'> | undefined

      if (/защит.*индивидуальн.{0,20}проект|индивидуальн.{0,20}проект.*защит/.test(type)) {
        studentRule = { ratePerStudent: 0.5, column: 'individualProject', rule: 'Приказ, приложение 2, п. 1.7: 0,5 ч на студента.' }
      } else if (/повторн.*(аттестаци|зачет|экзамен|защит)|переаттестаци/.test(type)) {
        studentRule = { ratePerStudent: 0.2, column: 'reattestation', rule: 'Приказ, приложение 2, п. 1.5: 0,2 ч на студента по дисциплине.' }
      }

      if (studentRule) {
        if (!studentActivities.has(id)) {
          const count = studentCounts[id]
          const validCount = Number.isInteger(count) && count! >= 0 ? count : undefined
          studentActivities.set(id, {
            id,
            lesson,
            ...studentRule,
            studentCount: validCount,
            placementColumn: studentRule.column === 'reattestation' ? studentActivityPlacements[id] : undefined,
            hours: validCount === undefined ? 0 : roundHours(validCount * studentRule.ratePerStudent),
          })
        }
        continue
      }

      const reason = /курсов|индивидуальн.{0,20}проект/.test(type)
        ? 'Нужно уточнить вид работы: в приказе для курсовой есть нормы за руководство и защиту, а также отдельная норма для переаттестации.'
        : /выпускн.{0,20}квалификационн|государственн.{0,20}экзамен|^гиа$/.test(type)
          ? 'Нужны число студентов, роль преподавателя в комиссии и состав комиссии: норма зависит от этих данных.'
          : /квалификационн.{0,20}экзамен|экзамен.{0,20}модул/.test(type)
            ? 'Нужно уточнить, относится ли это к квалификационному экзамену по модулю, и указать число студентов и состав комиссии.'
            : /практик/.test(type)
              ? 'Нужно уточнить вид практики, форму обучения и период расчёта; этих данных нет в записи занятия.'
              : 'Название не сопоставлено с пунктом приказа. Нужно уточнить вид работы, норму часов и расчётную единицу (занятие, группа или студент).'
      unclassified.set(id, { id, lesson, reason })
      continue
    }

    const key = assessmentKey(lesson, uniqueKind!)
    if (oncePerGroupDiscipline.has(key)) continue
    oncePerGroupDiscipline.add(key)
    getRow(lesson).hours[column] += rate
  }

  for (const session of classroomSessions.values()) {
    const groups = [...session.groups].sort((left, right) => left.localeCompare(right, 'ru'))
    const groupLabel = groups.join('; ') || 'Группа не указана'
    const key = groupSetKey(disciplineLabel(session.lesson), groups)
    let row = byGroup.get(key)
    if (!row) {
      row = {
        discipline: disciplineLabel(session.lesson),
        group: groupLabel,
        hours: Object.fromEntries(columns.map((column) => [column, 0])) as Record<WorkloadColumn, number>,
        total: 0,
      }
      byGroup.set(key, row)
    }
    row.hours[session.column] += session.hours
  }

  for (const activity of studentActivities.values()) {
    const targetColumn = activity.column === 'reattestation' ? activity.placementColumn : activity.column
    if (!targetColumn || (activity.column === 'reattestation' && activity.studentCount === undefined)) continue
    const row = getRow(activity.lesson)
    row.hours[targetColumn] += activity.hours
  }

  const rows = [...byGroup.values()].map((row) => {
    for (const column of columns) row.hours[column] = roundHours(row.hours[column])
    row.total = roundHours(columns.reduce((sum, column) => sum + row.hours[column], 0))
    return row
  }).sort((left, right) => left.discipline.localeCompare(right.discipline, 'ru') || left.group.localeCompare(right.group, 'ru'))

  return {
    rows,
    totalHours: roundHours(rows.reduce((sum, row) => sum + row.total, 0)),
    studentActivities: [...studentActivities.values()],
    unclassified: [...unclassified.values()],
  }
}

