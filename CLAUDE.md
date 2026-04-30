# Kestrel

Personal AI desktop assistant for macOS. Inspired by Littlebird.

## Quick Start
Requires Node.js 22.12.0 or newer.

```bash
npm install
npm run contextkit:build  # Build native Swift helper
npm run dev               # Start Electron dev server
```

## Architecture
- **Electron + React 19 + TypeScript + Vite** (via electron-vite)
- **Multi-window**: Main window, overlay side panel, meeting status panel
- **IPC**: Type-safe via shared `src/shared/ipc.ts` type map
- **Database**: SQLite (better-sqlite3 + Drizzle ORM) in `~/Library/Application Support/kestrel/data/`
- **AI**: OpenRouter API for all models, OpenAI Whisper for transcription
- **Context**: Native Swift CLI (`native/contextkit/`) using macOS Accessibility APIs
- **MCP**: `@modelcontextprotocol/sdk` for extensible tool support
- **State**: MobX stores in `src/renderer/main/src/stores/`
- **UI**: shadcn/ui + Tailwind CSS v4

## Key Directories
- `src/main/` — Electron main process (windows, IPC, DB, AI, meetings, MCP)
- `src/preload/` — Preload scripts (contextBridge)
- `src/renderer/main/` — Main window React app
- `src/renderer/overlay/` — Quick-access side panel
- `src/renderer/status/` — Meeting status floating panel
- `src/shared/` — Shared types (IPC channels)
- `native/contextkit/` — Swift CLI for screen context reading

## Build Commands
- `npm run dev` — Development with HMR
- `npm run build` — Production build
- `npm run contextkit:build` — Build Swift helper
- `npm run db:generate` — Generate Drizzle migrations
