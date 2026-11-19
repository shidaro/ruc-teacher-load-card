<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { formatLessonDate, getBranches, getEmployees, getMonthlySchedule } from './api/schedule'
import type { Branch, Employee, Lesson } from './api/schedule'

const today = new Date()
const monthValue = ref(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)
const branches = ref<Branch[]>([])
const employees = ref<Employee[]>([])
const selectedBranchId = ref('')
const selectedEmployeeId = ref('')
const lessons = ref<Lesson[]>([])
const loadingBranches = ref(false)
const loadingEmployees = ref(false)
const loadingSchedule = ref(false)
const error = ref('')

const selectedEmployee = computed(() => employees.value.find((employee) => employee.GUID === selectedEmployeeId.value))
const hoursTotal = computed(() => lessons.value.length)
const monthLabel = computed(() => {
  const [year, month] = monthValue.value.split('-').map(Number)
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))
})

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
          <span>Всего занятий</span>
          <strong>{{ loadingSchedule ? '…' : hoursTotal }}</strong>
          <small>часов по правилу MVP</small>
        </div>
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
        <table>
          <thead>
            <tr><th>Дата</th><th>Время</th><th>Тип занятия</th><th>Дисциплина</th><th>Группа</th><th>Аудитория</th><th>Часы</th></tr>
          </thead>
          <tbody>
            <tr v-for="(lesson, index) in lessons" :key="`${lesson.Data}-${lesson.Time}-${lesson.Group}-${index}`">
              <td class="date-cell">{{ formatLessonDate(lesson.Data) }}</td>
              <td>{{ lesson.Time_start }}–{{ lesson.Time_end }}</td>
              <td><span class="type-pill" :class="{ lecture: lesson.Type === 'Лекция' }">{{ lesson.Type }}</span></td>
              <td class="discipline-cell">{{ lesson.Discipline }}</td>
              <td>{{ lesson.Group }}</td>
              <td>{{ lesson.Classroom || '—' }}</td>
              <td class="hours-cell">1</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="lessons.length > 0 && !loadingSchedule" class="results-footnote">
        <span class="info-mark">i</span>
        Пока каждое занятие считается за 1 час. Точные правила добавим после разбора приказа.
      </div>
    </section>

    <footer class="page-footer">
      <span>Источник расписания: api-schedule.ruc.su</span>
      <span>Предварительный расчёт · проверьте данные перед сдачей</span>
    </footer>
  </main>
</template>
