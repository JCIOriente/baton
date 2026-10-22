# React guide

Read together with the TypeScript guide. Project conventions override this.

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

## Authorization in the UI

- Permission checks in the UI (e.g. CASL `Can` / `ability.can()`) **decide what to show**, not
  what is allowed. The server enforces every permission independently.
- Define abilities in one module that is built from the session's roles/permissions. Components
  ask `can(action, subject)` and never inspect role names directly.
- Hide or disable actions consistently (follow the project convention), and handle the 403
  the server may still return.

## Performance

Measure before memoizing. `useMemo`/`useCallback`/`memo` go where a profiler or a
referential-equality dependency shows a need. Lazy-load route-level chunks. Virtualize long
lists (hundreds of rows or more).

## Accessibility

Semantic elements first (`button`, `a`, `label`, `table`). Every input has a label. Interactive
elements are keyboard reachable with visible focus. Dialogs trap focus and restore it. Don't
rely on color alone to carry information.

## Testing

- Testing Library: query by role/label/text the way a user would, and interact with `user-event`.
  Don't test implementation details (state, internal methods).
- Mock the network at the HTTP layer (MSW), not by mocking hooks.
- Cover the permission states: same screen, different abilities.
- E2E (Playwright) for critical flows only.
