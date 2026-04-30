# Frodigy Agent Instructions

Use this file as default guidance for all coding tasks in this workspace.

## Mission
Build Frodigy v1 as defined in `INFO.md`: an offline Windows desktop Electron app with tasks, calendar notes, timers, and settings.

## Non-Negotiable Rules
- Maintainability first: readable, modular, and simple code.
- Scope control: implement only requested v1 features from `INFO.md`.
- No guessing: if uncertain, ask the user before implementing.
- Honest status: report blockers immediately instead of forcing workarounds.
- Efficient execution: concise communication and minimal, high-impact edits.

## Implementation Priorities
1. Electron shell with tray/background behavior
2. SQLite persistence and schema setup
3. IPC boundaries between main and renderer
4. First vertical slice: Today tasks (create, carry-over, complete)

## Behavioral Expectations for Agents
- Confirm assumptions before significant architecture changes.
- Do not invent extra pages, animations, or settings.
- Keep date-based logic accurate (recurring reset, one-time carry-over, daily note uniqueness).
- Prefer root-cause fixes over temporary patches.

## Completion Checklist
- Behavior matches `INFO.md`.
- Relevant checks/tests run when available.
- Summary includes changes made, validations done, and remaining risks.
