import type { Lesson } from '../api/schedule'

export type WorkloadColumn = 'lecture' | 'lab' | 'practical' | 'consultation' | 'credit' | 'test' | 'exam'

export interface WorkloadRow {
  discipline: string
  group: string
  hours: Record<WorkloadColumn, number>
  total: number
}

export interface WorkloadSummary {
  rows: WorkloadRow[]
  totalHours: number
  unclassified: Lesson[]
}

const columns: WorkloadColumn[] = ['lecture', 'lab', 'practical', 'consultation', 'credit', 'test', 'exam']

// Rates and API type mapping are kept outside the UI so they can be refined independently.
const classroomTypes: Array<{ column: WorkloadColumn; pattern: RegExp }> = [
  { column: 'lecture', pattern: /лекц/i },
  { column: 'lab', pattern: /лаборатор/i },
  { column: 'practical', pattern: /практическ|семинар/i },
]

function normalized(value: string) {
  return value.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')
}

function rowKey(lesson: Lesson) {
  return `${normalized(lesson.Discipline)}\u0000${normalized(lesson.Group)}`
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

export function calculateWorkload(lessons: Lesson[]): WorkloadSummary {
  const byGroup = new Map<string, WorkloadRow>()
  const classroomSessions = new Map<string, { lesson: Lesson; groups: Set<string>; hours: number; column: WorkloadColumn }>()
  const unclassified: Lesson[] = []
  const oncePerGroupDiscipline = new Set<string>()

  function getRow(lesson: Lesson) {
    const key = rowKey(lesson)
    let row = byGroup.get(key)
    if (!row) {
      row = {
        discipline: lesson.Discipline?.trim() || 'Дисциплина не указана',
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
    const classroom = classroomTypes.find((entry) => entry.pattern.test(type))
    if (classroom) {
      const hours = scheduledHours(lesson.Time ?? '')
      if (hours === undefined) {
        unclassified.push(lesson)
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
      unclassified.push(lesson)
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
    const key = groupSetKey(session.lesson.Discipline ?? '', groups)
    let row = byGroup.get(key)
    if (!row) {
      row = {
        discipline: session.lesson.Discipline?.trim() || 'Дисциплина не указана',
        group: groupLabel,
        hours: Object.fromEntries(columns.map((column) => [column, 0])) as Record<WorkloadColumn, number>,
        total: 0,
      }
      byGroup.set(key, row)
    }
    row.hours[session.column] += session.hours
  }

  const rows = [...byGroup.values()].map((row) => {
    row.total = columns.reduce((sum, column) => sum + row.hours[column], 0)
    return row
  }).sort((left, right) => left.discipline.localeCompare(right.discipline, 'ru') || left.group.localeCompare(right.group, 'ru'))

  return { rows, totalHours: rows.reduce((sum, row) => sum + row.total, 0), unclassified }
}

export function workloadCsv(summary: WorkloadSummary) {
  const header = ['№ п/п', 'Дисциплина', 'Группа', 'Лекции', 'Лабораторные', 'Практические, семинарские', 'Консультации', 'Зачёты, дифференцированные зачёты', 'Аудиторные контрольные работы', 'Экзамены', 'Итого']
  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
  const lines = [header, ...summary.rows.map((row, index) => [
    index + 1, row.discipline, row.group, row.hours.lecture, row.hours.lab, row.hours.practical,
    row.hours.consultation, row.hours.credit, row.hours.test, row.hours.exam, row.total,
  ])]
  lines.push(['', 'Итого', '', ...columns.map((column) => summary.rows.reduce((sum, row) => sum + row.hours[column], 0)), summary.totalHours])
  return `\uFEFF${lines.map((line) => line.map(escape).join(';')).join('\r\n')}`
}
