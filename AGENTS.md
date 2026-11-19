# Project instructions

## Purpose

Build a web app for Russian University of Cooperation teachers to select themselves and a month, review their teaching schedule, and download a generated monthly teaching-load card.

## Current product decisions

- The first version should be a static web app deployable to GitHub Pages.
- Preferred starting stack: Vue 3, TypeScript, and Vite.
- The first version counts each scheduled class as 1 hour.
- Keep class-hour rules configurable so the order's rules can be added later without rewriting schedule loading or the UI.
- Use the supplied form (`assets/бланк.xls`) and example (`assets/пример.jpeg`) to determine the output structure and validate calculations.
- The supplied example groups workload by semester, discipline, study form, specialty, course, group, and module, with separate lecture and seminar hour columns. Verify the complete form before implementing export.

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
- Direct API requests succeeded outside the sandbox. The GET response had no `Access-Control-Allow-Origin` header, and the `OPTIONS` request returned HTTP 400. A browser request from the local Vue app also failed before receiving the branch list. Direct browser access is currently blocked, so a static-only GitHub Pages app cannot use this API as-is. Ask the API owner to enable CORS or add a small server-side proxy/backend before completing API integration.

## Architecture guidance

- Keep API access, schedule normalization, hour calculation, and file generation in separate modules.
- Normalize API data into an internal class model before calculating or exporting.
- Keep hour rules data-driven/configurable; do not hard-code the 1-hour MVP assumption into UI components.
- Keep deployment compatible with a static GitHub Pages build unless API constraints prove a small backend/proxy is required.

## Repository state

- A Vue 3 + TypeScript + Vite prototype is scaffolded. It has selectors for branch, employee, and month, loads API data, and displays monthly lesson rows with the MVP 1-hour count.
- The prototype currently cannot load API data in the browser due to the observed cross-origin/access failure.
- A Cloudflare Worker proxy is prepared in `worker/`. It forwards only the known GET endpoints, applies CORS for one configured origin, and the frontend now reads its API base URL from `VITE_SCHEDULE_API_BASE_URL`.
- The Worker has not been deployed; its upstream connectivity and the Pages build with the deployed Worker URL remain to be confirmed after account setup.
- A GitHub Pages Actions workflow is prepared in `.github/workflows/pages.yml`. It requires the repository variable `VITE_SCHEDULE_API_BASE_URL`.
- Before publishing publicly, exclude the supplied `assets/` files from the public Git history. They remain local project references and are not needed by the current app build.
- Git is initialized locally on branch `main`; GitHub CLI and Wrangler are authenticated for account `shidaro` / its Cloudflare account. No remote repository existed at the last check.

## Verification and workflow

- Compare generated output against the supplied example before expanding to multiple teachers/months.
- Record confirmed API behavior and product decisions here as development progresses. Mark unknowns as unverified rather than guessing.
- Do not add or run tests unless the user asks for tests or verification.
