# Kestrel

A personal AI desktop assistant for macOS with context awareness, meeting recording, and multi-model comparison.

Built with Electron, React 19, TypeScript, and a native Swift helper for reading your active application context via macOS Accessibility APIs.

## Features

- **Context-Aware AI Chat** — Knows what you're working on by reading your active app, browser tabs, and window content via native macOS Accessibility APIs
- **Multi-Model Support** — Access Claude, GPT, Gemini, DeepSeek, Llama, Grok, and more through EvalOps LLM Gateway
- **Arena Mode** — Compare 2-4 AI model responses side by side with voting
- **Meeting Assistant** — Auto-detect meetings (Zoom, Google Meet, Teams), record audio, transcribe via Whisper, generate AI summaries
- **AI Journal** — Auto-generated daily journal entries from your activity and context
- **Quick Access Overlay** — Global hotkey (Cmd+Shift+Space) slides in an AI panel from the screen edge
- **Privacy Controls** — Exclude specific apps, websites, or entire categories (banking, health, etc.) from context capture
- **MCP Integration** — Connect any Model Context Protocol server for extensible tool support (Claude Desktop-compatible config)
- **Dark & Light Mode** — Clean minimal design with system preference detection

## How It Works

Kestrel combines three systems to create a context-aware AI assistant:

**1. Screen Context Reading (ContextKit)**
A native Swift CLI binary runs alongside the Electron app, communicating over JSON-RPC 2.0 on stdin/stdout. It uses macOS Accessibility APIs (`AXUIElement`) to read the UI hierarchy of whatever app is in the foreground — extracting window titles, text content, and UI element values. For browsers (Chrome, Safari, Arc), it reads the active tab URL via AppleScript. This context is fed into AI conversations so the model knows what you're looking at.

**2. AI Chat with Streaming**
Chat messages are sent to EvalOps LLM Gateway, which provides managed access to every major AI model (Claude, GPT, Gemini, DeepSeek, Llama, Grok) through platform identity, provider refs, policy, and metering. Responses stream back via Server-Sent Events and render token-by-token with full markdown support. The Arena mode sends the same prompt to multiple models simultaneously and displays their responses side by side.

**3. MCP Tool Extensibility**
Kestrel implements the Model Context Protocol client spec, letting you connect any MCP server (filesystem, GitHub, databases, etc.) using the same JSON config format as Claude Desktop. Connected servers expose tools that the AI can call during conversations, extending its capabilities without modifying the app.

All data (chat threads, meetings, journal entries, settings) is stored locally in SQLite with WAL mode. Managed AI traffic is routed through EvalOps LLM Gateway, and Whisper transcription still uses OpenAI when configured.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ Electron Main Process                               │
│  ├── SQLite (better-sqlite3 + Drizzle ORM)          │
│  ├── EvalOps LLM Gateway (streaming SSE)            │
│  ├── ContextKit Client (JSON-RPC over stdin/stdout) │
│  ├── MCP Server Manager                             │
│  └── Meeting Detection + Whisper Transcription      │
├─────────────────────────────────────────────────────┤
│ Renderer Windows (React 19 + shadcn/ui + Tailwind)  │
│  ├── Main Window (chat, meetings, journal, arena)   │
│  ├── Overlay Panel (quick-access side panel)        │
│  └── Meeting Status (floating recording indicator)  │
├─────────────────────────────────────────────────────┤
│ Native Swift CLI (ContextKit)                       │
│  ├── AXUIElement tree walker                        │
│  ├── Browser URL reader (AppleScript)               │
│  └── JSON-RPC 2.0 server                           │
└─────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Install dependencies
npm install

# Build the native Swift context helper
npm run contextkit:build

# Start development
npm run dev
```

## Setup

1. **EvalOps Sign In** — Required for managed AI chat and platform services. Sign in from Settings > EvalOps.
2. **OpenAI API Key** — Optional, for Whisper meeting transcription. Get one at [platform.openai.com](https://platform.openai.com).
3. **Accessibility Permission** — Grant in System Settings > Privacy & Security > Accessibility to enable context reading.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Electron 34 + electron-vite 5 |
| UI | React 19 + shadcn/ui + Tailwind CSS 4 |
| State | MobX + mobx-react-lite |
| Database | SQLite (better-sqlite3 + Drizzle ORM) |
| AI | EvalOps LLM Gateway + OpenAI Whisper |
| Context | Native Swift CLI via JSON-RPC |
| Extensions | Model Context Protocol (MCP) |
| Markdown | react-markdown + remark-gfm + shiki |

## Project Structure

```
src/
  main/           # Electron main process
    ai/           # EvalOps LLM Gateway streaming client
    db/           # SQLite + Drizzle schema
    ipc/          # IPC handlers
    mcp/          # MCP server manager
    meetings/     # Meeting detection, transcription, summarization
    journal/      # Journal generation
    native/       # ContextKit Node.js client
    privacy/      # Privacy rule enforcement
    windows/      # Window factories (main, overlay, status)
  preload/        # Preload scripts (contextBridge)
  renderer/
    main/         # Main window React app
    overlay/      # Quick-access side panel
    status/       # Meeting status floating panel
  shared/         # Type-safe IPC definitions
native/
  contextkit/     # Swift CLI for macOS Accessibility APIs
```

## License

MIT
