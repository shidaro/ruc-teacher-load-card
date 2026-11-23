import ExcelJS from 'exceljs'
import { reattestationPlacementOptions } from './workload'
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
  card.getCell('P30').value = null // The source template contains whitespace here, which some spreadsheet viewers render as 0.

  const firstDataRow = 13
  const originalTotalRow = 28
  const cardRows = summary.rows.filter((item) => [
    item.hours.lecture,
    item.hours.lab,
    item.hours.practical,
    item.hours.consultation,
    item.hours.credit,
    item.hours.test,
    item.hours.exam,
    item.hours.individualProject,
  ].some((hours) => hours !== 0))
  const templateRowCount = originalTotalRow - firstDataRow
  if (cardRows.length > templateRowCount) {
    const extraRows = cardRows.length - templateRowCount
    const rangesToShift = card.model.merges.filter((range) => {
      const startRow = Number(range.match(/^[A-Z]+(\d+):/)?.[1])
      return startRow >= originalTotalRow
    })
    for (const range of rangesToShift) card.unMergeCells(range)
    card.insertRows(originalTotalRow, Array.from({ length: extraRows }, () => []), 'i')
    for (const range of rangesToShift) {
      const shifted = range.replace(/(\D+)(\d+)/g, (_match, column: string, rowText: string) => `${column}${Number(rowText) + extraRows}`)
      card.mergeCells(shifted)
    }
    const styleSource = card.getRow(originalTotalRow - 1)
    for (let index = 0; index < extraRows; index += 1) {
      const insertedRow = card.getRow(originalTotalRow + index)
      insertedRow.height = styleSource.height
      insertedRow.hidden = false
      for (let column = 1; column <= 18; column += 1) {
        insertedRow.getCell(column).style = { ...styleSource.getCell(column).style }
      }
    }
  }
  const totalRowIndex = originalTotalRow + Math.max(0, cardRows.length - templateRowCount)

  cardRows.forEach((item, index) => {
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
    return key ? roundHours(cardRows.reduce((sum, item) => sum + item.hours[key], 0)) : 0
  })
  totals.forEach((value, index) => { card.getRow(totalRowIndex).getCell(categoryColumns[index]).value = value || null })
  card.getRow(totalRowIndex).getCell(2).value = 'Итого'
  card.getRow(totalRowIndex).getCell(18).value = roundHours(totals.reduce((sum, value) => sum + value, 0))

  const hasPendingStudentActivity = summary.studentActivities.some((activity) =>
    activity.studentCount === undefined || (activity.column === 'reattestation' && activity.placementColumn === undefined),
  )
  const note = summary.unclassified.length || hasPendingStudentActivity
    ? 'Есть занятия, требующие выбора типа, данных или уточнения: см. лист «Проверка». Они не включены в итог карточки.'
    : ''
  if (note) {
    const noteRow = totalRowIndex + 1
    card.mergeCells(`B${noteRow}:R${noteRow}`)
    card.getCell(`B${noteRow}`).value = note
    card.getCell(`B${noteRow}`).font = { name: 'Times New Roman', size: 9 }
    card.getCell(`B${noteRow}`).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
    card.getRow(noteRow).height = 24
  }

  const reviewItems = [
    ...summary.studentActivities.map((activity) => {
      const placementLabel = activity.placementColumn
        ? reattestationPlacementOptions.find((option) => option.value === activity.placementColumn)?.label ?? activity.placementColumn
        : activity.column === 'individualProject' ? 'Курсовая работа / проект' : ''
      const status = activity.column === 'reattestation' && !activity.placementColumn
        ? 'Выберите тип в карточке'
        : activity.studentCount === undefined
          ? 'Нужно указать число студентов'
          : `Рассчитано: ${roundHours(activity.hours)} ч`
      return {
        lesson: activity.lesson,
        status,
        placement: placementLabel,
        rule: activity.rule,
        count: activity.studentCount ?? null,
        rate: activity.ratePerStudent,
        hours: activity.studentCount === undefined ? null : roundHours(activity.hours),
      }
    }),
    ...summary.unclassified.map((activity) => ({ lesson: activity.lesson, status: activity.reason, placement: '', rule: '', count: null, rate: null, hours: null })),
  ]
  if (reviewItems.length) {
    const review = workbook.addWorksheet('Проверка')
    review.columns = [
      { header: 'Дата', key: 'date', width: 14 }, { header: 'Время', key: 'time', width: 12 },
      { header: 'Вид занятия', key: 'type', width: 34 }, { header: 'Дисциплина', key: 'discipline', width: 38 },
      { header: 'Группа', key: 'group', width: 20 }, { header: 'Статус / что уточнить', key: 'status', width: 70 },
      { header: 'Колонка карточки', key: 'placement', width: 38 }, { header: 'Норма', key: 'rule', width: 50 },
      { header: 'Студентов', key: 'count', width: 14 }, { header: 'Часов на студента', key: 'rate', width: 20 }, { header: 'Часы', key: 'hours', width: 14 },
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
        placement: item.placement,
        rule: item.rule,
        count: item.count,
        rate: item.rate,
        hours: item.hours,
      })
    }
    review.views = [{ state: 'frozen', ySplit: 1 }]
    review.autoFilter = { from: 'A1', to: 'K1' }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  download(buffer, teacherName, monthValue)
}
