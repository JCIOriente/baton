# E2E guide

End-to-end browser tests with Playwright, run against the real app. Read together with the
TypeScript guide. Project conventions override this.

## What deserves an E2E test

- **Critical user journeys only:** sign-in, the flows that create or change important records,
  permission boundaries, and anything that produces an artifact users depend on (exports,
  generated documents). Each journey is one test that a product person would recognize.
- Everything else goes lower in the pyramid. Validation rules, formatting and edge cases
  belong in unit and component tests. Business rules belong in API/integration tests. E2E
  tests prove the pieces work together.
- Don't re-test every permutation through the browser. One happy path plus the failure
  modes users actually hit (validation error shown, forbidden action unavailable).

## Locators

- Locate the way users do: `getByRole(role, { name })`, then `getByLabel`, `getByText`,
  `getByPlaceholder`. If a control can't be found by role and name, fix its accessibility
  first.
- `getByTestId` is the escape hatch for elements without an accessible name (canvas, charts).
  No CSS or XPath selectors tied to markup structure or class names.
- Scope locators to a region instead of using `nth()`:
  `page.getByRole('row', { name: /Jane Doe/ }).getByRole('button', { name: 'Edit' })`.
- Test text through the message catalog or a fixed test locale, so copy changes don't break
  selectors in other locales.

## Waiting

- **No sleeps.** No `waitForTimeout`. Use web-first assertions, which retry until a timeout:
  `await expect(locator).toBeVisible()`, `toHaveText`, `toHaveURL`, `toHaveCount`.
- Don't read a value and then assert on it (`expect(await loc.textContent()).toBe(...)`):
  it doesn't retry. Assert on the locator.
- Don't use `waitForLoadState('networkidle')` as a readiness signal. Wait for the UI state the
  user would wait for. Use `waitForResponse` only when the response itself is under test.
- Control time with `page.clock` instead of waiting for real timers.
- Lint with `eslint-plugin-playwright` to catch missing `await` and non-retrying assertions.

## Isolation and data

- Every test is independent and can run alone, in any order, in parallel. No test relies on
  data another test created.
- **Seed through the API**, not the UI: create the records a test needs via the `request`
  fixture (or a test-only seeding endpoint enabled only in test environments) in a fixture,
  and clean up in its teardown where that matters.
- Generate unique values per test (names, emails with a run or worker suffix), so parallel
  workers don't collide and assertions find the right row.
- The database starts from migrations plus a minimal baseline seed (reference data, one
  account per role). Don't depend on hand-made state in a shared environment.

## Auth and roles

- Sign in once per role in a setup project and save `storageState` per role. Tests reuse it
  with `test.use({ storageState: 'playwright/.auth/<role>.json' })`. Keep `playwright/.auth`
  out of version control.
- Keep one real UI sign-in test. Everything else starts authenticated.
- **Test permission-scoped views per role:** for each sensitive journey, run it (or a focused
  check) as each relevant role. Assert that actions are available or absent as expected.
- Hidden UI is not enforcement. For each forbidden action, also call the API with that
  role's auth state and assert a 403. Data from other tenants or scopes never shows up.

## Real backend

- E2E runs against the real API and a real database (containers in CI), started by
  `webServer` (it accepts several servers) or by the CI job. No API mocking in E2E tests.
  Use component tests with MSW for that.
- Stub only third parties you don't control (payment, email delivery, maps) at their
  boundary, and assert on what was sent (e.g. a local mail catcher).
- For downloads, use `page.waitForEvent('download')` and check the file's name, type and key
  content, not only that a download happened.

## Locales, time zones and devices

- Set `locale` and `timezoneId` per project or per test (`test.use`). Run time-sensitive
  journeys in at least two time zones, one of them far from UTC.
- Run one RTL locale through the main layout if the app supports one. See the i18n guide.
- Default to Chromium in pull requests. Add Firefox/WebKit and a mobile viewport to
  scheduled or pre-release runs when users need them.

## Accessibility

Run `@axe-core/playwright` (`AxeBuilder`) on the key pages of each journey, in the states
that matter (dialog open, form with errors). Fail on violations. Exclude a rule only with a
linked issue.

## Flakes

- A flaky test is a bug in the test or the app. Investigate with the trace first.
- Retries in CI (`retries: 1` or `2`) are allowed only to collect diagnostics. Tests that pass
  on retry are reported as flaky and tracked, never accepted as green without notice. Consider
  `--fail-on-flaky-tests` once the suite is stable.
- **Quarantine with an issue:** `test.fixme(true, 'Flaky: #123')` or a `@quarantine` tag
  excluded from the gating run. A quarantined test has an owner and a deadline. Don't delete
  it, and don't raise timeouts to hide the problem.
- Reproduce with `--repeat-each=20` before and after a fix.
- `forbidOnly: !!process.env.CI` so a stray `test.only` fails the build.

## CI artifacts

- Configure `trace: 'on-first-retry'` (or `'retain-on-failure'`), `screenshot:
  'only-on-failure'`, and optionally `video: 'retain-on-failure'`.
- Upload the HTML report and `test-results/` as CI artifacts on failure, so anyone can open
  the trace (`npx playwright show-trace`).
- Traces and screenshots can contain personal data. Seed with synthetic data only, and keep
  artifact retention short.

## Structure

- Use fixtures (`test.extend`) for seeded data, authenticated pages and page objects.
  Page objects expose user-level actions (`createEvent(...)`), not raw locators for every
  element. Keep assertions in tests.
- File per journey (`events/create-event.spec.ts`). Test names describe user intent.
