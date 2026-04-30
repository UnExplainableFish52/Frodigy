# Frodigy Coding Principles

These principles guide all AI agents and contributors in this repository.

## 1) Maintainability First
- Write clear, modular, and readable code.
- Prefer simple solutions over clever solutions.
- Keep functions small and focused.
- Preserve consistent naming and project structure.

## 2) Scope Discipline
- Build only features defined in `INFO.md` for v1.
- Do not add extra UX, pages, settings, or logic unless requested.
- If a requirement is ambiguous, ask before implementing.

## 3) Verify Uncertainty
- If uncertain about requirements, assumptions, or behavior, pause and confirm.
- Double-check date logic, persistence rules, and timer behavior before finalizing.
- State assumptions clearly when asking for confirmation.

## 4) Be Honest About Limits
- Do not pretend a task is complete if it is blocked.
- If tools, dependencies, or permissions are missing, report it directly.
- Ask for help early when a blocker appears.

## 5) Efficiency and Token Discipline
- Keep responses concise and implementation-focused.
- Avoid repeated explanations and unnecessary file reads.
- Make minimal, targeted changes that solve the root issue.

## 6) Development Order
- Start from architecture and data model, then vertical slices.
- Prioritize:
  1. Electron app shell and tray/background behavior
  2. SQLite setup and migrations
  3. IPC contract between main and renderer
  4. First vertical slice: Today tasks flow

## 7) Quality Gates
- Before finishing a task:
  - Verify behavior against `INFO.md`
  - Run relevant checks/tests when available
  - Report what was changed, what was validated, and any open risks
