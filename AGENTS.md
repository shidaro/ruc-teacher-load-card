# Project instructions

## Purpose

Build a web app for Russian University of Cooperation teachers to select themselves and a month, review their teaching schedule, and download a generated monthly teaching-load card.

## Current product decisions

- The first version should be a static web app deployable to GitHub Pages.
- Preferred starting stack: Vue 3, TypeScript, and Vite.
- Keep workload rules configurable so rates and API type mappings can change without rewriting schedule loading or the UI.
- Use the supplied workbook (`assets/бланк.xlsx`) and its `Образец` sheet to determine the output structure and validate calculations.
- The card has separate columns for lectures, labs, practical/seminar classes, classroom course work, supervision, consultations, interim assessment, GIA, practice, and totals. The example combines multiple groups into rows where applicable. Build rows grouped by discipline and group, and preserve the workbook's header and signature areas when implementing export.
- Student counts are entered manually per scheduled activity when a known rule requires them; inputs are optional and held only in page state (they are not sent to the source API or persisted). Classroom lesson duration comes from API `Time`: a numeric value marks a pair (2 academic hours), while `Урок N` marks a one-hour lesson. The API can repeat one joint session once per group; merge records with the same date, slot, start/end, type, discipline, subgroup, and classroom into one card row and list all participating groups. Pre-exam consultations = 1 hour per group and discipline; accepting a credit/differentiated credit/exam = 0.5 hour per group and discipline; checking/accepting an in-class test = 0.5 hour per group and discipline; repeat assessment = 0.2 hour per student per discipline; individual project defense = 0.5 hour per student. Preparation remains outside the card calculation unless explicitly present as a mapped workload item. Keep rates configurable. Leave unmatched types out of totals and show each lesson with a reason for review.
- These rates come from Appendix 2, “Нормы времени … по образовательным программам среднего профессионального образования,” of the local reference `assets/приказ.pdf` (pages 17–20 in the supplied PDF). The workbook is available locally and includes both the blank `Карточка нагрузки` sheet and a populated `Образец` sheet; neither source asset is included in the public repository.

## Schedule API

Public API base URL: `https://api-schedule.ruc.su/api/v1`.

- `GET /get_branches` — list branches.
- `GET /get_employees/{branchId}` — employees for a branch.
- `GET /get_schedule/employee/{branchId}/{employeeId}/no` — current-week schedule.
- `GET /get_schedule/employee/{branchId}/{employeeId}/{date}` — schedule for the week containing a date, with date formatted as `YYYY.MM.DD`.

Example IDs supplied for the head university and one employee:

- Branch: `844a7033-7a9a-11df-b9d8-005056bd3ce5`
- Employee: `f889a519-2853-11e9-a384-00155d647941`

For a monthly workflow, request a date in each week overlapping that month, then filter returned classes to the month using `Data`. Do not assume the API accepts a month range.

### API behavior checked on 2026-11-19

- `get_branches` returns a JSON array with `guid`, `code`, and `name` fields.
- `get_employees/{branchId}` returns a JSON array with `GUID`, `Name`, `Male`, and `Position` fields.
- A dated schedule request returns an object with `schedule` and `date` properties. `schedule` is keyed by localized day labels; each lesson has fields including `FilialGUID`, `Data` (`DD.MM.YYYY`), `Time_start`, `Time_end`, `Group`, `Type`, `Discipline`, `Employee`, and `Classroom`. `date` includes the requested date and week boundaries/navigation values.
- The sample schedule distinguishes lesson types such as `Лекция` and `Практические занятия`; keep the source type intact for later rule mapping.
- Direct API requests succeeded outside the sandbox. The source GET response did not include `Access-Control-Allow-Origin`; the deployed Worker proxy handles browser access for the published app.

## Architecture guidance

- Keep API access, schedule normalization, hour calculation, and file generation in separate modules.
- Normalize API data into an internal class model before calculating or exporting.
- Keep hour rules data-driven/configurable; do not hard-code the 1-hour MVP assumption into UI components.
- Keep deployment compatible with a static GitHub Pages build unless API constraints prove a small backend/proxy is required.

## Repository state

- The Vue 3 + TypeScript + Vite app has selectors for branch, employee, and month, loads monthly API data, groups supported workload by discipline/group, lets teachers enter student counts for supported assessment types, shows unmatched lessons with a specific reason, and downloads a semicolon-delimited UTF-8 CSV for spreadsheet review. The CSV is a first export step and does not yet preserve the supplied workbook formatting or signature area.
- Direct browser requests to the source API fail because CORS is not enabled. The deployed Worker proxy resolves this for the allowed GitHub Pages origin.
- A Cloudflare Worker proxy is prepared in `worker/`. It forwards only the known GET endpoints, applies CORS for one configured origin, and the frontend now reads its API base URL from `VITE_SCHEDULE_API_BASE_URL`.
- Cloudflare Workers Cache is enabled. Worker cache TTLs are route-specific: branches 24 hours, employees 6 hours, schedule 5 minutes. Successful responses receive matching `Cache-Control`; upstream errors are `no-store`.
- Worker is deployed at `https://ruc-teacher-load-card-api.ruc-teacher-load-card.workers.dev`. Its GET branch-list endpoint returned HTTP 200 with `Access-Control-Allow-Origin: https://shidaro.github.io`.
- A GitHub Pages Actions workflow is prepared in `.github/workflows/pages.yml`. It requires the repository variable `VITE_SCHEDULE_API_BASE_URL`.
- Public repository: `https://github.com/shidaro/ruc-teacher-load-card`.
- Published site: `https://shidaro.github.io/ruc-teacher-load-card/`.
- The public Git history excludes all supplied `assets/` files. They remain local project references and are not needed by the current app build.
- October 2026 reconciliation for the supplied teacher matches the example's classroom totals: the API returned 37 lecture rows, 43 practical-class rows, and 1 repeat assessment; after grouping simultaneous records across groups and reading numeric `Time` slots as 2 academic hours, totals are 40 lecture and 82 practical/seminar hours (122 overall). The repeat assessment remains excluded until student-count rules are available.
- Git is initialized locally on branch `main`, tracking `origin/main`.

## Verification and workflow

- Compare generated output against the supplied example before expanding to multiple teachers/months.
- Record confirmed API behavior and product decisions here as development progresses. Mark unknowns as unverified rather than guessing.
- Do not add or run tests unless the user asks for tests or verification.
