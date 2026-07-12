# Plan 001: Unifyify overlay motion and add reduced-motion + page enter animations

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0d94986..HEAD -- apps/web/src/styles.css apps/web/src/components/ui/dialog.tsx apps/web/src/components/ui/sheet.tsx apps/web/src/components/ui/dropdown-menu.tsx apps/web/src/components/ui/popover.tsx apps/web/src/components/ui/tooltip.tsx apps/web/src/components/app-shell.tsx apps/web/src/components/app-shell.structure.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `0d94986`, 2026-07-12

## Why this matters

deplow's control plane already uses `tw-animate-css` and Base UI open/close
attributes, but motion is inconsistent: dialogs use `duration-150` +
`animate-in`, sheets use a different Base UI `data-starting-style` opacity
model at `duration-150`, dropdowns use `duration-100`, and main content has
no enter animation at all. The product UX roadmap wants Railway/Vercel-like
polish; shared overlay timing plus `prefers-reduced-motion` is the highest
leverage animation pass without adding Framer Motion or noisy list staggers.

## Current state

- `apps/web/src/styles.css` — imports `tw-animate-css`; utilities
  `.surface-panel` / `.icon-well` only; **no** shared motion tokens or
  reduced-motion rules (see end of file ~L145–157).
- `apps/web/src/components/ui/dialog.tsx` — overlay/content:
  `duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95`
  (lines 34–56).
- `apps/web/src/components/ui/sheet.tsx` — overlay uses
  `transition-opacity duration-150 data-ending-style:opacity-0
  data-starting-style:opacity-0` (different system than dialog).
- `apps/web/src/components/ui/dropdown-menu.tsx` — popup
  `duration-100` + side slide + zoom (line ~45).
- `apps/web/src/components/ui/popover.tsx` — `duration-100` + slide/zoom.
- `apps/web/src/components/ui/tooltip.tsx` — open/close zoom/fade; no shared
  duration token.
- `apps/web/src/components/app-shell.tsx` — `SidebarInset` content wrapper
  has no enter animation (~L289+).
- Stack constraint: keep **`tw-animate-css`** only — do **not** add
  `framer-motion` / `motion`. Match Cloudflare-inspired light shell in
  `styles.css` comments; avoid purple glow / dark-mode gimmicks.
- Structure tests: `apps/web/src/components/app-shell.structure.test.ts`
  reads source files with `expect(src).toContain(...)`.

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Typecheck | `pnpm --filter @deplow/web typecheck` | exit 0 (pre-existing errors in `command-palette.tsx` / `register-service-webhook.ts` may already exist — do not introduce **new** errors in in-scope files) |
| Tests     | `pnpm exec vitest run apps/web/src/components/app-shell.structure.test.ts` | all pass |
| Grep reduced-motion | `rg -n "prefers-reduced-motion|motion-safe|animate-content-in" apps/web/src/styles.css apps/web/src/components` | matches present as specified below |

## Scope

**In scope** (the only files you should modify):
- `apps/web/src/styles.css`
- `apps/web/src/components/ui/dialog.tsx`
- `apps/web/src/components/ui/sheet.tsx`
- `apps/web/src/components/ui/dropdown-menu.tsx`
- `apps/web/src/components/ui/popover.tsx`
- `apps/web/src/components/ui/tooltip.tsx`
- `apps/web/src/components/app-shell.tsx`
- `apps/web/src/components/app-shell.structure.test.ts`

**Out of scope** (do NOT touch):
- Adding Framer Motion / Motion One / GSAP
- Per-row list stagger animations on dashboards
- `apps/site` marketing site
- Backend / orpc / db packages
- Rewriting component layouts or multi-tenancy UX
- Fixing pre-existing typecheck errors outside these files

## Git workflow

- Branch: `advisor/001-unify-ui-motion` (work in the isolated worktree)
- Commit message style (from repo): short imperative, e.g. `feat(ui): unify overlay motion and reduced-motion`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add shared motion utilities + reduced-motion to `styles.css`

In `@layer utilities` (after existing utilities), add:

1. `.animate-content-in` — short fade+translate for main page content:
   - `animation: content-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both;`
2. `@keyframes content-in` — from `opacity: 0; transform: translateY(4px)` to
   `opacity: 1; transform: none`.
3. Global reduced-motion gate (can live after `@layer utilities` or inside
   a `@media (prefers-reduced-motion: reduce)` block at file end):

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Keep existing `.surface-panel` / `.icon-well` unchanged.

**Verify**: `rg -n "animate-content-in|prefers-reduced-motion|@keyframes content-in" apps/web/src/styles.css` → all three match.

### Step 2: Unifyify dialog overlay/content timing

In `dialog.tsx`, change overlay and content motion classes to:

- Overlay: `duration-200 ease-out data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0`
- Content: `duration-200 ease-out data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95`

Do not change layout positioning classes.

**Verify**: `rg -n "duration-200" apps/web/src/components/ui/dialog.tsx` → at least 2 matches; no `duration-150` left in that file for overlay/content.

### Step 3: Align sheet with dialog-style `animate-in` API

In `sheet.tsx`:

- Overlay: match dialog overlay classes (`duration-200 ease-out` + `data-open:animate-in` / `data-closed:animate-out` fade). Remove reliance on `data-starting-style:opacity-0` / `data-ending-style:opacity-0` for the overlay if you switch to animate-in (Base UI still fires open/close — animate-in classes used elsewhere in this repo work with `data-open` / `data-closed`).
- Panel (`SheetContent`): keep side slide transforms, but set `duration-200 ease-out` and prefer `data-open:animate-in` / `data-closed:animate-out` fade where compatible. If converting the slide entirely breaks Base UI sheet behavior, keep the existing `data-starting-style` / `data-ending-style` translate pattern but bump duration to `duration-200 ease-out` and add fade via opacity starting/ending styles — **do not leave duration-150**.

**Verify**: `rg -n "duration-150" apps/web/src/components/ui/sheet.tsx` → no matches; `duration-200` present.

### Step 4: Align dropdown + popover + tooltip durations

- `dropdown-menu.tsx` popup: change `duration-100` → `duration-200 ease-out` (keep side slide + zoom classes).
- `popover.tsx`: same `duration-200 ease-out`.
- `tooltip.tsx`: add `duration-150 ease-out` (tooltips can be slightly snappier than menus) on the popup class string if no duration exists; ensure open/close still use `animate-in` / `animate-out`.

**Verify**:
- `rg -n "duration-100" apps/web/src/components/ui/dropdown-menu.tsx apps/web/src/components/ui/popover.tsx` → no matches
- `rg -n "duration-200|duration-150" apps/web/src/components/ui/tooltip.tsx` → at least one duration present

### Step 5: Page content enter on AppShell

In `app-shell.tsx`, on the main content wrapper `div` inside `SidebarInset` (the one that wraps `{children}` and already has padding classes), add `animate-content-in` to its `className` via `cn(...)`.

Do not animate the sticky header. Do not add JS transition libraries.

**Verify**: `rg -n "animate-content-in" apps/web/src/components/app-shell.tsx` → 1 match.

### Step 6: Structure test for motion contract

In `app-shell.structure.test.ts`, add a test:

```ts
it("shell content uses shared content enter animation", () => {
  const shell = readFileSync(path.join(root, "components/app-shell.tsx"), "utf8")
  const css = readFileSync(path.join(root, "styles.css"), "utf8")
  expect(shell).toContain("animate-content-in")
  expect(css).toContain("animate-content-in")
  expect(css).toContain("prefers-reduced-motion")
})
```

**Verify**: `pnpm exec vitest run apps/web/src/components/app-shell.structure.test.ts` → all pass including the new test.

### Step 7: Commit

Commit all in-scope changes with message:

```
feat(ui): unify overlay motion and honor reduced-motion

```

**Verify**: `git status` clean for those files on the worktree branch; `git log -1 --oneline` shows the commit.

## Test plan

- Structure test above (no browser E2E required).
- Manual smoke (executor: note in NOTES if you cannot run UI): open a dialog (`Invite` / New project), a dropdown (org switcher), sidebar collapse — should feel ~200ms, not instant/janky.
- With OS reduced-motion enabled, animations should effectively disable via the CSS media query.

## Done criteria

- [ ] `styles.css` defines `animate-content-in`, `@keyframes content-in`, and `prefers-reduced-motion` reduce rules
- [ ] `dialog.tsx` / `sheet.tsx` use `duration-200` (no `duration-150` on those overlays/panels)
- [ ] `dropdown-menu.tsx` / `popover.tsx` no longer use `duration-100`
- [ ] `app-shell.tsx` content wrapper has `animate-content-in`
- [ ] `app-shell.structure.test.ts` new test passes
- [ ] `pnpm exec vitest run apps/web/src/components/app-shell.structure.test.ts` exits 0
- [ ] No files outside the in-scope list are modified (`git status` / `git diff --stat`)
- [ ] `plans/README.md` status row updated (unless reviewer maintains index)

## STOP conditions

Stop and report back (do not improvise) if:

- Drift check shows in-scope files changed vs excerpts and behavior is unclear.
- Aligning sheet to `data-open:animate-in` breaks sheet open/close (Base UI attribute mismatch) after one careful retry — then keep starting/ending-style slides at `duration-200` and document in NOTES.
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require Framer Motion or touching `apps/site`.

## Maintenance notes

- When adding new overlays, copy dialog's `duration-200 ease-out` + `animate-in` pattern.
- Reviewers should check `prefers-reduced-motion` isn't overridden by new `!important` durations elsewhere.
- Deferred: route-level View Transitions API; animated status badge transitions.
