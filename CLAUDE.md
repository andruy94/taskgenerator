# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**TaskBoard** is an educational task generation SPA for teachers. Teachers can upload textbook/worksheet images, use AI to extract exercises, manually edit them, and publish shareable task links for students. Students open tasks by ID, answer interactively, and receive scores.

The entire application lives in a single file: `index.html`. There is no build step, no package manager, and no compilation — edit and open in a browser.

## Running the App

Open `index.html` directly in a browser. The app requires network access to the backend API at `https://api.aiaistudio.org`. Teachers provide their API key through the UI; it is stored in `localStorage` (with a cookie fallback) and sent as the `X-Client-Key` header.

## Architecture

### Single-file SPA
All HTML, CSS (~800 lines in `<style>`), and JavaScript (~600 lines in `<script>`) are embedded in `index.html`. There are no external JS/CSS files (only Google Fonts via CDN).

### Routing
Hash-based routing via `routeHash()`. Two pages toggled by CSS class:
- `#page-teacher` — create/publish tasks, view dashboard and results
- `#page-student` — open task by ID, answer questions, see score

### Backend API (external, `https://api.aiaistudio.org`)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/tasks/generate` | AI analysis of uploaded image → task JSON |
| POST | `/api/v1/tasks/publish` | Publish a task, returns task ID |
| GET  | `/api/v1/dashboard/tasks` | List teacher's published tasks (auth required) |
| GET  | `/api/v1/tasks/{id}/answers` | Fetch student answers (auth required) |
| POST | `/api/v1/tasks/{id}/answers` | Submit student answers |
| GET  | `/static/tasks/{id}.json` | Fetch task definition by ID |

### Question Types
Five types with distinct rendering and scoring logic: `fill` (fill-in-gaps), `choice` (multiple choice), `truefalse`, `order` (word ordering), `open` (free text graded by backend).

### Key Function Groups (all in `index.html`)
- **Storage/Auth** (~line 296): `lsGet`, `lsSet`, `getKey`, `applyKey`
- **Navigation** (~line 329): `showPage`, `routeHash`
- **Upload/AI** (~line 350): `handleFile`, `analyzeImage`
- **Task Editor** (~line 395): `loadEditor`, `renderEditor`, `syncEditor`, `addQ`, `rmQ`
- **Publishing** (~line 489): `publishTask`, `copyUrl`
- **Teacher Dashboard** (~line 565): `loadDashboardTasks`, `loadResults`, `scoreQuestion`
- **Student Interface** (~line 690): `openByCode`, `startTask`, `renderStudTask`, `checkAnswers`

## Deployment

### GitHub Pages
Push to `main` triggers the pages deploy. The student link always points to the backend-defined URL (see commit history for context on `student link always points to backend`).

### Production server (api.aiaistudio.org)
The teacher UI is also served directly from the backend at `https://api.aiaistudio.org/taskboard`. nginx serves the file via alias — no server restart needed.

Deploy with one SCP command:

```bash
scp -i ~/.ssh/ssh-key-1775318455999 -o StrictHostKeyChecking=no \
  /c/Users/Akimy/IdeaProjects/taskgenerator/index.html \
  root1@158.160.207.247:/opt/ai-backend/static/taskboard.html
```

After upload the change is live immediately at `https://api.aiaistudio.org/taskboard`.
