# React guide

Read together with the TypeScript guide. For translated text, dates and RTL see the i18n guide.
For browser journeys see the E2E guide. Project conventions override this.

## Components

- Function components only. One component per file for anything exported. Small private
  helpers can share a file.
- Props are typed explicitly (`type Props = {...}`). Don't use `React.FC`.
- Keep components presentational where possible. Data fetching, permissions and mutations
  live in hooks or route loaders, not scattered through JSX.
- Composition over configuration: prefer `children` and slots to large prop matrices.
- Lists need stable `key`s from data IDs, never array indexes for dynamic lists.

## State

- Put state in the right place, in this order: URL (filters, pagination, selected tab) ->
  server cache -> local component state -> shared context/store. Don't put server data in a
  global store.
- **Server state goes through a query library** (TanStack Query or the project's choice),
  with query keys built by a typed factory. Mutations invalidate the affected keys. No
  hand-rolled `useEffect` + `fetch` + `useState` data loading.
- Derive values during render instead of syncing them into state. Don't write a `useEffect`
  that only sets state from props or other state.
- Context is for low-frequency values (session, theme, permissions). Split contexts so
  frequent updates don't re-render the whole tree.

## Effects

`useEffect` is for synchronizing with external systems (subscriptions, DOM APIs, timers)
only. Every effect has a correct dependency array (`react-hooks/exhaustive-deps` on) and
cleans up after itself. Event-driven logic goes in event handlers, not effects.

## Forms

Use a form library (React Hook Form + a zod resolver, or the project's choice). Share the
same schema with the API client where possible. Show server validation errors next to their
fields. Disable submit while pending, and handle double submits.

## Errors and loading

Wrap route-level and independently failing regions in error boundaries
(`react-error-boundary` or the router's error element), with a retry where it makes sense.
Every `Suspense` boundary has an error boundary above it. Place boundaries close to the data
so one failing widget doesn't blank the page. Loading, empty and error states are part of
each data-driven view, not an afterthought.

## Security

- React escapes text. Keep it that way: render user data as children, not as HTML.
- `dangerouslySetInnerHTML` only with HTML sanitized by an allowlist sanitizer (DOMPurify) at
  the same call site, or HTML you fully control. Prefer rendering Markdown through a
  library that builds React elements.
- Validate user-supplied URLs before using them in `href`/`src`: allow only `http:`,
  `https:` (and `mailto:` where needed) by parsing with `new URL()`. React doesn't block
  `javascript:` URLs at runtime.
- `target="_blank"` links to external sites get `rel="noopener noreferrer"`.
- Keep session tokens out of `localStorage`/`sessionStorage`: any XSS can read them. Prefer
  `HttpOnly`, `Secure`, `SameSite` cookies, with CSRF protection for cookie-authenticated
  writes. If the architecture needs a bearer token in the browser, keep it in memory.
- Everything in the client bundle is public, including `VITE_*`/`NEXT_PUBLIC_*` env vars and
  source maps if you publish them. No secrets in the front end.
- Never spread untrusted objects into props or state without parsing them with a schema.
- A Content Security Policy without `unsafe-inline`/`unsafe-eval` for scripts is set by the
  server. Don't add code that needs them.

## Authorization in the UI

- Permission checks in the UI (e.g. CASL `Can` / `ability.can()`) **decide what to show**, not
  what is allowed. The server enforces every permission independently.
- Define abilities in one module that is built from the session's roles/permissions. Components
  ask `can(action, subject)` and never inspect role names directly.
- Hide or disable actions consistently (follow the project convention), and handle the 403
  the server may still return.

## Performance

Measure before memoizing. `useMemo`/`useCallback`/`memo` go where a profiler or a
referential-equality dependency shows a need. Don't add them by default, and use the React
Compiler where the project has it on. Lazy-load route-level chunks and heavy libraries
(charts, PDF viewers, rich-text editors). Virtualize long lists (hundreds of rows or more).
Give images explicit dimensions to avoid layout shift. Debounce search-as-you-type requests and
cancel stale ones. Watch Core Web Vitals (LCP, INP, CLS) on real pages, not only in local dev.

## Accessibility

Target WCAG 2.2 AA.

- Semantic elements first (`button` for actions, `a` for navigation, `label`, `table`, landmarks
  like `main`/`nav`). Use ARIA only when no native element fits, and then implement the full
  pattern (roles, states, keyboard) from the ARIA Authoring Practices. No clickable `div`s.
- Every input has a visible, associated label. Required fields and errors are conveyed in
  text. Error messages are linked with `aria-describedby`, and focus moves to the first
  invalid field on submit.
- Everything works with the keyboard, in a logical order, with a visible focus indicator
  that isn't hidden behind sticky headers. Dialogs contain focus, close on `Escape`, and
  return focus to the trigger. Prefer a tested headless library for dialogs, menus,
  comboboxes and date pickers over hand-rolled widgets.
- Icon-only buttons have an accessible name. Decorative images have `alt=""`.
- Contrast is at least 4.5:1 for text and 3:1 for large text and UI components. Don't
  convey information with color alone (status badges, calendar markers).
- Pointer targets are at least 24x24 CSS px. Dragging has a single-pointer alternative.
- Async updates (saved, errors, results counts) are announced via a live region. On route
  change, move focus to the main heading or content, and update the document title.
- Layout reflows at 320 CSS px and 200% text zoom without loss. Respect
  `prefers-reduced-motion`.
- `eslint-plugin-jsx-a11y` is on. Automated checks find only part of the issues: try a new
  flow with the keyboard and a screen reader.

## Testing

- Testing Library: query by role/label/text the way a user would (`getByRole(..., { name })`
  first, `getByTestId` last), and interact with `user-event` (`const user = userEvent.setup()`,
  then `await user.click(...)`). Don't test implementation details (state, internal methods,
  render counts), and don't mock React or child components by default.
- Async UI: `findBy*` for elements that appear, `waitFor` for other expectations, `queryBy*`
  to assert absence. No manual timeouts. Treat `act()` warnings as bugs.
- Mock the network at the HTTP layer (MSW), not by mocking hooks or the fetch client. Shared
  handlers for the happy path, with per-test `server.use(...)` overrides for errors and
  edge cases. Fail on unhandled requests.
- One `renderWithProviders` helper (query client per test, router, intl, ability) used
  everywhere.
- Cover loading, empty, error and permission states: same screen, different abilities.
- Run `axe` (`vitest-axe` or `jest-axe`) on key components and states. It complements
  manual keyboard checks.
- No DOM snapshot tests as the main assertion.
- E2E (Playwright) for critical journeys only. See the E2E guide.
