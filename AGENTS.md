# Kestrel Agent Notes

## Scope

Kestrel is a local-first macOS desktop assistant built with Electron, React, TypeScript, SQLite, and a Swift ContextKit helper that reads active-app context through macOS Accessibility APIs.

## Process Hygiene

- Start from a fresh `origin/main` branch and pull before pushing; multiple agents may work here concurrently.
- Do not run unbounded GitHub watchers or shell polling loops. Use one-shot `gh` queries and bounded reruns.
- PR descriptions must include a test plan.
- Keep app, native helper, and SDK changes scoped unless the feature genuinely crosses those boundaries.
- Do not enable CodeQL, GitHub default code scanning, or blanket long-running scanners in this repo.

## Verification

- Install and build with the package manager implied by the checked-in lockfile.
- Main app changes: run the relevant `npm` scripts from `package.json`.
- ContextKit changes: run `npm run contextkit:build` and any Swift-specific checks exposed by the repo.
- SDK changes: validate from `sdk/js/` using the scripts in that package.
- UI changes should be checked in both light and dark mode when practical.

## Product And Privacy Constraints

- Preserve the local-first data model. Chat history, meetings, journal entries, and settings should stay local unless a feature explicitly routes through EvalOps services.
- Treat captured app/window/browser context as sensitive. Do not add logging, analytics, prompts, or crash output that leak raw context by default.
- Respect privacy exclusions for apps, websites, categories, and meeting capture before sending context to any model provider.
- EvalOps LLM Gateway is the primary managed AI path. OpenAI is optional for Whisper transcription only when configured.
- Keep Accessibility, AppleScript, microphone, and filesystem permission flows clear for non-technical users.
