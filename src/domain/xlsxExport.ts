import ExcelJS from 'exceljs'
import type { WorkloadSummary } from './workload'
import { roundHours } from './workload'

const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function schoolYear(monthValue: string) {
  const [year, month] = monthValue.split('-').map(Number)
  const start = month >= 9 ? year : year - 1
  return `${start}-${start + 1}`
}

function monthName(monthValue: string) {
  const [year, month] = monthValue.split('-').map(Number)
  return new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(new Date(year, month - 1, 1))
}

function download(buffer: ExcelJS.Buffer, teacherName: string, monthValue: string) {
  const blob = new Blob([buffer], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const safeName = teacherName.replace(/[^\p{L}\p{N}-]+/gu, '_') || 'преподаватель'
  link.href = url
  link.download = `нагрузка_${safeName}_${monthValue}.xlsx`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function downloadWorkloadXlsx(summary: WorkloadSummary, teacherName: string, monthValue: string) {
  const response = await fetch(`${import.meta.env.BASE_URL}workload-template.xlsx`)
  if (!response.ok) throw new Error('Не удалось загрузить шаблон карточки нагрузки.')

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await response.arrayBuffer())
  const card = workbook.getWorksheet('Карточка нагрузки') ?? workbook.worksheets[0]
  if (!card) throw new Error('В шаблоне отсутствует лист карточки нагрузки.')

  card.getCell('C5').value = teacherName
  card.getCell('K5').value = monthName(monthValue)
  card.getCell('O5').value = schoolYear(monthValue)

  const firstDataRow = 13
  const originalTotalRow = 28
  if (summary.rows.length > originalTotalRow - firstDataRow) {
    const extraRows = summary.rows.length - (originalTotalRow - firstDataRow)
    card.insertRows(originalTotalRow, Array.from({ length: extraRows }, () => []), 'i')
  }
  const totalRowIndex = originalTotalRow + Math.max(0, summary.rows.length - (originalTotalRow - firstDataRow))

  summary.rows.forEach((item, index) => {
    const rowIndex = firstDataRow + index
    const row = card.getRow(rowIndex)
    row.hidden = false
    row.getCell(1).value = index + 1
    row.getCell(2).value = item.discipline
    row.getCell(3).value = item.group
    const mappedHours: Record<number, number> = {
      4: item.hours.lecture,
      5: item.hours.lab,
      6: item.hours.practical,
      10: item.hours.consultation,
      11: item.hours.credit,
      12: item.hours.test,
      13: item.hours.individualProject,
      14: item.hours.exam,
    }
    for (const column of [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]) {
      const cell = row.getCell(column)
      cell.value = mappedHours[column] || null
    }
    row.getCell(18).value = roundHours(Object.values(mappedHours).reduce((sum, hours) => sum + hours, 0))
  })

  const categoryColumns = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]
  const totals = categoryColumns.map((column) => {
    const key = ({ 4: 'lecture', 5: 'lab', 6: 'practical', 10: 'consultation', 11: 'credit', 12: 'test', 13: 'individualProject', 14: 'exam' } as const)[column as 4 | 5 | 6 | 10 | 11 | 12 | 13 | 14]
    return key ? roundHours(summary.rows.reduce((sum, item) => sum + item.hours[key], 0)) : 0
  })
  totals.forEach((value, index) => { card.getRow(totalRowIndex).getCell(categoryColumns[index]).value = value || null })
  card.getRow(totalRowIndex).getCell(2).value = 'Итого'
  card.getRow(totalRowIndex).getCell(18).value = roundHours(totals.reduce((sum, value) => sum + value, 0))

  const outsideCardCount = summary.studentActivities.filter((activity) => activity.column === 'reattestation').length
  const note = outsideCardCount
    ? `Переаттестация рассчитана отдельно и не включена в итог карточки: см. лист «Проверка».`
    : summary.unclassified.length || summary.studentActivities.some((activity) => activity.studentCount === undefined)
      ? 'Есть занятия, требующие уточнения или данных: см. лист «Проверка». Они не включены в итог карточки.'
      : ''
  if (note) card.getCell(`B${totalRowIndex + 1}`).value = note

  const reviewItems = [
    ...summary.studentActivities.map((activity) => ({
      lesson: activity.lesson,
      status: activity.studentCount === undefined ? 'Нужно указать число студентов' : `Рассчитано: ${roundHours(activity.hours)} ч; отдельно от итогов карточки`,
      rule: activity.rule,
      count: activity.studentCount ?? null,
      rate: activity.ratePerStudent,
      hours: activity.studentCount === undefined ? null : roundHours(activity.hours),
    })),
    ...summary.unclassified.map((activity) => ({ lesson: activity.lesson, status: activity.reason, rule: '', count: null, rate: null, hours: null })),
  ]
  if (reviewItems.length) {
    const review = workbook.addWorksheet('Проверка')
    review.columns = [
      { header: 'Дата', key: 'date', width: 14 }, { header: 'Время', key: 'time', width: 12 },
      { header: 'Вид занятия', key: 'type', width: 34 }, { header: 'Дисциплина', key: 'discipline', width: 38 },
      { header: 'Группа', key: 'group', width: 20 }, { header: 'Статус / что уточнить', key: 'status', width: 70 },
      { header: 'Норма', key: 'rule', width: 50 }, { header: 'Студентов', key: 'count', width: 14 },
      { header: 'Часов на студента', key: 'rate', width: 20 }, { header: 'Часы', key: 'hours', width: 14 },
    ]
    review.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    review.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF31566D' } }
    for (const item of reviewItems) {
      review.addRow({
        date: item.lesson.Data,
        time: item.lesson.Time,
        type: item.lesson.Type,
        discipline: item.lesson.Discipline,
        group: item.lesson.Group,
        status: item.status,
        rule: item.rule,
        count: item.count,
        rate: item.rate,
        hours: item.hours,
      })
    }
    review.views = [{ state: 'frozen', ySplit: 1 }]
    review.autoFilter = { from: 'A1', to: 'J1' }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  download(buffer, teacherName, monthValue)
}
