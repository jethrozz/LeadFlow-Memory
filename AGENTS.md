# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Git 规范

所有 git commit message 必须使用中文。

## Project Overview

LeadFlow Memory is a verifiable long-term memory system for real estate sales agents, built on Walrus (artifact storage) and MemWal (semantic memory). It connects two agent workflows: **Lead Discovery Agent** (finds and qualifies leads) and **Lead Conversion Agent** (manages multi-touch follow-up with persistent memory).

## Repository Structure

```
LeadFlow-Memory/
├── docs/proposals/           # Project proposals (zh/en)
├── leadflow-memory-prototype/ # Current prototype (React + Vite)
│   ├── src/
│   ├── AGENTS.md             # Prototype-specific instructions
│   └── package.json
└── LICENSE
```

## Development Commands

All commands run from `leadflow-memory-prototype/`:

```bash
# Install dependencies
npm install

# Start dev server (http://127.0.0.1:5173)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Tech Stack

- **Frontend**: React 19 + Vite 6
- **Language**: JavaScript (JSX)
- **Module system**: ESM (`"type": "module"`)

## Key Architecture Concepts

**Memory Flow**:
1. Discovery Agent extracts buying intent from leads (budget, location, layout, concerns)
2. Intent written to MemWal as semantic memory
3. Source evidence and scoring reports stored on Walrus
4. Conversion Agent recalls memory, generates personalized follow-up
5. Customer replies update MemWal memory
6. Worker handoffs preserve context via MemWal

**MVP Demo Scenario**: Real estate lead → extract profile → store memory → personalized follow-up → simulated customer reply → memory update → worker handoff → dashboard visualization

## Prototype Notes

The `leadflow-memory-prototype/AGENTS.md` file contains important instructions:
- Run the dev server directly rather than giving users startup instructions
- Use the Product Design plugin's `get-context` skill before making visual changes
- Record design feedback and preferences in `AGENTS.md`
- When implementing from a mock, treat the image as source of truth for layout, spacing, color, typography, and content

## Design Preferences

- Device live / device feed section headings should use explicit wording and stronger visual hierarchy so the section purpose is obvious at a glance.
- Lead detail panels should avoid abrupt jump-cuts on selection changes; prefer stable-height loading states and smooth motion when switching leads.

## Project Documents

- `docs/proposals/leadflow-memory-proposal-zh.md` - Chinese proposal with full project scope
- `docs/proposals/leadflow-memory-proposal-en.md` - English proposal

These contain the complete feature specifications, technical architecture, and MVP scope. Read them for context before implementing features.
