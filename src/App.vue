<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { formatLessonDate, getBranches, getEmployees, getMonthlySchedule } from './api/schedule'
import type { Branch, Employee, Lesson } from './api/schedule'
import { calculateWorkload, workloadCsv } from './domain/workload'

const today = new Date()
const monthValue = ref(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)
const branches = ref<Branch[]>([])
const employees = ref<Employee[]>([])
const selectedBranchId = ref('')
const selectedEmployeeId = ref('')
const lessons = ref<Lesson[]>([])
const studentCounts = ref<Record<string, number | undefined>>({})
const loadingBranches = ref(false)
const loadingEmployees = ref(false)
const loadingSchedule = ref(false)
const error = ref('')

const selectedEmployee = computed(() => employees.value.find((employee) => employee.GUID === selectedEmployeeId.value))
const workload = computed(() => calculateWorkload(lessons.value, studentCounts.value))
const hoursTotal = computed(() => workload.value.totalHours)
const pendingStudentCount = computed(() => workload.value.studentActivities.filter((activity) => activity.studentCount === undefined).length)
const reviewItemCount = computed(() => pendingStudentCount.value + workload.value.unclassified.length)
const monthLabel = computed(() => {
  const [year, month] = monthValue.value.split('-').map(Number)
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))
})

function downloadWorkload() {
  const blob = new Blob([workloadCsv(workload.value)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const teacherName = selectedEmployee.value?.Name?.replace(/[^\p{L}\p{N}-]+/gu, '_') || 'преподаватель'
  link.href = url
  link.download = `нагрузка_${teacherName}_${monthValue.value}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function updateStudentCount(id: string, event: Event) {
  const raw = (event.target as HTMLInputElement).value.trim()
  const value = raw === '' ? undefined : Number(raw)
  const next = { ...studentCounts.value }

  if (value === undefined) {
    delete next[id]
  } else if (Number.isInteger(value) && value >= 0) {
    next[id] = value
  } else {
    delete next[id]
  }

  studentCounts.value = next
}

onMounted(async () => {
  loadingBranches.value = true
  error.value = ''
  try {
    branches.value = await getBranches()
    selectedBranchId.value = branches.value.find((branch) => branch.name === 'Головной вуз')?.guid ?? branches.value[0]?.guid ?? ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось загрузить филиалы.'
  } finally {
    loadingBranches.value = false
  }
})

watch(selectedBranchId, async (branchId) => {
  employees.value = []
  selectedEmployeeId.value = ''
  lessons.value = []
  if (!branchId) return

  loadingEmployees.value = true
  error.value = ''
  try {
    employees.value = await getEmployees(branchId)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось загрузить преподавателей.'
  } finally {
    loadingEmployees.value = false
  }
})

watch([selectedEmployeeId, monthValue, selectedBranchId], async ([employeeId, month, branchId]) => {
  lessons.value = []
  studentCounts.value = {}
  if (!employeeId || !branchId || !month) return

  loadingSchedule.value = true
  error.value = ''
  try {
    lessons.value = await getMonthlySchedule(branchId, employeeId, month)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось загрузить расписание.'
  } finally {
    loadingSchedule.value = false
  }
}, { immediate: true })
</script>

<template>
  <main class="page-shell">
    <header class="topbar">
      <a class="brand" href="#" aria-label="На главную">
        <span class="brand-mark">РУК</span>
        <span class="brand-copy"><strong>Учебная нагрузка</strong><small>Карточка преподавателя</small></span>
      </a>
      <span class="topbar-note">Черновик сервиса</span>
    </header>

    <section class="intro">
      <div class="eyebrow"><span class="eyebrow-dot"></span> Подготовка отчёта</div>
      <h1>Соберите карточку<br /><span>учебной нагрузки</span></h1>
      <p>Выберите филиал, преподавателя и месяц. Сервис соберёт занятия из расписания и подготовит данные для карточки.</p>
    </section>

    <section class="workspace" aria-label="Параметры отчёта">
      <div class="form-grid">
        <label class="field">
          <span class="field-label">Филиал</span>
          <span class="select-wrap">
            <select v-model="selectedBranchId" :disabled="loadingBranches || branches.length === 0">
              <option value="">{{ loadingBranches ? 'Загружаем филиалы…' : 'Выберите филиал' }}</option>
              <option v-for="branch in branches" :key="branch.guid" :value="branch.guid">{{ branch.name }}</option>
            </select>
            <span class="chevron">⌄</span>
          </span>
        </label>

        <label class="field">
          <span class="field-label">Преподаватель</span>
          <span class="select-wrap">
            <select v-model="selectedEmployeeId" :disabled="!selectedBranchId || loadingEmployees || employees.length === 0">
              <option value="">{{ loadingEmployees ? 'Загружаем преподавателей…' : 'Выберите преподавателя' }}</option>
              <option v-for="employee in employees" :key="employee.GUID" :value="employee.GUID">{{ employee.Name }}</option>
            </select>
            <span class="chevron">⌄</span>
          </span>
        </label>

        <label class="field field-month">
          <span class="field-label">Месяц</span>
          <input v-model="monthValue" type="month" />
        </label>
      </div>

      <div class="selection-summary">
        <div class="summary-person">
          <div class="avatar">{{ selectedEmployee?.Name?.slice(0, 1) ?? '—' }}</div>
          <div>
            <strong>{{ selectedEmployee?.Name ?? 'Преподаватель не выбран' }}</strong>
            <span>{{ selectedEmployee?.Position || 'Выберите преподавателя, чтобы загрузить расписание' }}</span>
          </div>
        </div>
        <div class="summary-period"><span>Период отчёта</span><strong>{{ monthLabel }}</strong></div>
      </div>
    </section>

    <section class="results" aria-live="polite">
      <div class="results-heading">
        <div>
          <div class="eyebrow eyebrow-muted">Расписание</div>
          <h2>Занятия за месяц</h2>
        </div>
        <div class="total-card">
          <span>Академические часы</span>
          <strong>{{ loadingSchedule ? '…' : hoursTotal }}</strong>
          <small>по доступным данным расписания</small>
        </div>
      </div>
      <div v-if="workload.rows.length > 0" class="export-row">
        <button class="export-button" type="button" @click="downloadWorkload">Скачать расчёт в CSV</button>
        <span>Файл откроется в Excel; пока выгружаются только рассчитанные категории.</span>
      </div>

      <div v-if="error" class="message message-error">
        <strong>Не удалось получить данные</strong>
        <span>{{ error }}</span>
      </div>
      <div v-else-if="loadingBranches || loadingEmployees || loadingSchedule" class="message message-loading">
        <span class="spinner"></span> Загружаем данные расписания…
      </div>
      <div v-else-if="!selectedEmployeeId" class="message message-empty">
        Выберите преподавателя, чтобы увидеть занятия за месяц.
      </div>
      <div v-else-if="lessons.length === 0" class="message message-empty">
        В расписании нет занятий за {{ monthLabel }}.
      </div>
      <div v-else class="table-frame">
        <table class="summary-table">
          <thead>
            <tr>
              <th>Дисциплина</th><th>Группа</th><th>Лекции</th><th>Лабораторные</th><th>Практические, семинарские</th>
              <th>Консультации</th><th>Зачёты</th><th>Контрольные</th><th>Экзамены</th><th>Переаттестация</th><th>Защита индивидуального проекта</th><th>Итого</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in workload.rows" :key="`${row.discipline}-${row.group}-${index}`">
              <td class="discipline-cell">{{ row.discipline }}</td><td>{{ row.group }}</td>
              <td>{{ row.hours.lecture || '—' }}</td><td>{{ row.hours.lab || '—' }}</td><td>{{ row.hours.practical || '—' }}</td>
              <td>{{ row.hours.consultation || '—' }}</td><td>{{ row.hours.credit || '—' }}</td><td>{{ row.hours.test || '—' }}</td>
              <td>{{ row.hours.exam || '—' }}</td><td>{{ row.hours.reattestation || '—' }}</td><td>{{ row.hours.individualProject || '—' }}</td>
              <td class="hours-cell">{{ row.total }}</td>
            </tr>
            <tr class="summary-total">
              <td colspan="2">Итого</td>
              <td>{{ workload.rows.reduce((sum, row) => sum + row.hours.lecture, 0) || '—' }}</td>
              <td>{{ workload.rows.reduce((sum, row) => sum + row.hours.lab, 0) || '—' }}</td>
              <td>{{ workload.rows.reduce((sum, row) => sum + row.hours.practical, 0) || '—' }}</td>
              <td>{{ workload.rows.reduce((sum, row) => sum + row.hours.consultation, 0) || '—' }}</td>
              <td>{{ workload.rows.reduce((sum, row) => sum + row.hours.credit, 0) || '—' }}</td>
              <td>{{ workload.rows.reduce((sum, row) => sum + row.hours.test, 0) || '—' }}</td>
              <td>{{ workload.rows.reduce((sum, row) => sum + row.hours.exam, 0) || '—' }}</td>
              <td>{{ workload.rows.reduce((sum, row) => sum + row.hours.reattestation, 0) || '—' }}</td>
              <td>{{ workload.rows.reduce((sum, row) => sum + row.hours.individualProject, 0) || '—' }}</td>
              <td class="hours-cell">{{ hoursTotal }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="reviewItemCount > 0 && !loadingSchedule" class="results-footnote results-footnote-warning">
        <span class="info-mark">!</span>
        {{ reviewItemCount }} занятий требуют внимания: {{ pendingStudentCount }} — введите число студентов, {{ workload.unclassified.length }} — уточните норму. Список ниже.
      </div>
      <section v-if="workload.studentActivities.length > 0 || workload.unclassified.length > 0" class="review-section">
        <h3 class="detail-heading">Занятия, требующие данных или уточнения</h3>
        <div v-if="workload.studentActivities.length > 0" class="table-frame review-table-frame">
          <table class="review-table">
            <thead><tr><th>Дата</th><th>Тип</th><th>Дисциплина</th><th>Группа</th><th>Норма</th><th>Студентов</th><th>Часы</th></tr></thead>
            <tbody>
              <tr v-for="activity in workload.studentActivities" :key="activity.id">
                <td class="date-cell">{{ formatLessonDate(activity.lesson.Data) }}</td>
                <td>{{ activity.lesson.Type }}</td>
                <td class="discipline-cell">{{ activity.lesson.Discipline || '—' }}</td>
                <td>{{ activity.lesson.Group || '—' }}</td>
                <td>{{ activity.ratePerStudent.toLocaleString('ru-RU') }} ч / студент<br /><small>{{ activity.rule }}</small></td>
                <td><input class="student-count-input" type="number" min="0" step="1" inputmode="numeric" :aria-label="`Количество студентов: ${activity.lesson.Discipline}, ${activity.lesson.Group}`" :value="activity.studentCount ?? ''" @input="updateStudentCount(activity.id, $event)" /></td>
                <td class="hours-cell">{{ activity.studentCount === undefined ? '—' : activity.hours.toLocaleString('ru-RU') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="workload.studentActivities.length > 0" class="review-help">Введите число студентов, к которым относится конкретная аттестация или защита. Часы пересчитаются автоматически. Введённые числа сохраняются только пока открыта эта страница.</p>
        <div v-if="workload.unclassified.length > 0" class="table-frame review-table-frame">
          <table class="review-table">
            <thead><tr><th>Дата</th><th>Тип</th><th>Дисциплина</th><th>Группа</th><th>Что уточнить</th></tr></thead>
            <tbody>
              <tr v-for="activity in workload.unclassified" :key="activity.id">
                <td class="date-cell">{{ formatLessonDate(activity.lesson.Data) }}</td>
                <td>{{ activity.lesson.Type || 'Тип не указан' }}</td>
                <td class="discipline-cell">{{ activity.lesson.Discipline || '—' }}</td>
                <td>{{ activity.lesson.Group || '—' }}</td>
                <td class="review-reason">{{ activity.reason }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <h3 v-if="lessons.length > 0" class="detail-heading">Исходные занятия</h3>
      <div v-if="lessons.length > 0" class="table-frame">
        <table>
          <thead>
            <tr><th>Дата</th><th>Время</th><th>Тип занятия</th><th>Дисциплина</th><th>Группа</th><th>Аудитория</th></tr>
          </thead>
          <tbody>
            <tr v-for="(lesson, index) in lessons" :key="`${lesson.Data}-${lesson.Time}-${lesson.Group}-${index}`">
              <td class="date-cell">{{ formatLessonDate(lesson.Data) }}</td>
              <td>{{ lesson.Time_start }}–{{ lesson.Time_end }}</td>
              <td><span class="type-pill" :class="{ lecture: lesson.Type === 'Лекция' }">{{ lesson.Type }}</span></td>
              <td class="discipline-cell">{{ lesson.Discipline }}</td>
              <td>{{ lesson.Group }}</td>
              <td>{{ lesson.Classroom || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="lessons.length > 0 && !loadingSchedule" class="results-footnote">
        <span class="info-mark">i</span>
        Пара в расписании = 2 акад. часа; «Урок N» = 1 час. Совпадающие занятия для нескольких групп объединены.
      </div>
    </section>

    <footer class="page-footer">
      <span>Источник расписания: api-schedule.ruc.su</span>
      <span>Предварительный расчёт · проверьте данные перед сдачей</span>
    </footer>
  </main>
</template>
