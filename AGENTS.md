# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Verification scripts

There is no unit test runner. `scripts/verify*.mjs` are Playwright scripts run against a
built preview, one fixed port per script, declared at the top of each file. Each script
prints `All checks passed` or a failure count and exits non-zero.

```
npx vite build
npx vite preview --port <the script's port> --strictPort
node scripts/verifyNN.mjs
```

Green as of 2026-08-10: `verify.mjs`, `verify12`, `verify13`, `verify14`, `verify15`
(no browser), `verify16`, `verify17`. `verify2` through `verify11` fail on selectors the
UI no longer has (`.drawer`, `.vplay`, `.verse-sheet`, a second `.mini` "Export"); the
failures reproduce identically on older commits, so treat them as stale scripts, not as
regressions, and re-check against the base commit before believing otherwise.

## Sharp edges

A touch gesture only reaches the pointer handlers if CSS gave it up first. Anything
dragged by finger needs `touch-action: none` on every element the finger can start on,
not just the one that looks like the grip: without it the browser claims the vertical
gesture and the page gets `pointercancel` after roughly one move. `src/components/Sheet.tsx`
plus `.sheet-grab, .sheet-head` in `src/styles.css` is the worked example.

Real touch drags need CDP `Input.dispatchTouchEvent`. Playwright's `page.touchscreen`
taps but does not drag, and a mouse drag exercises neither `touch-action` nor the race
against a scroller. `scripts/verify17.mjs` has the helper.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
