# LinkedAI — Elite LinkedIn Content Generator

Unified full-stack app merging the best of both projects.  
**8 AI modes · Free forever · No API key needed**

---

## Modes

| Mode | Description |
|---|---|
| 👑 Executive Mode | 2–3 CEO-level strategic posts. Zero fluff. |
| ✨ Generate Posts | 10 high-performing LinkedIn posts |
| ⚡ Viral Hooks | 15 scroll-stopping hooks |
| 💬 Comment Replies | 10 human-like comment replies |
| 📅 Content Calendar | 7-day strategic content plan |
| 🔁 Rewrite Post | Make any post go viral |
| 📊 Impact Score | Score & improve any post (0–100) |
| 🎨 Style Analyzer | Extract your writing DNA |

---

## Quick Start

### 1. Backend
```bash
cd backend
cp ../.env.example .env
# Edit .env — LinkedIn OAuth is optional
npm install
npm run dev
# Runs on http://localhost:3001
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:5173
```

### 3. Production (single port)
```bash
cd frontend && npm run build
cd ../backend && npm start
# Full app served on http://localhost:3001
```

---

## Architecture

```
/backend
  /routes
    auth.js        — LinkedIn OAuth + manual setup
    generate.js    — SSE streaming for all 8 modes
    admin.js       — API key management
  /services
    claude.js      — Pollinations.ai SSE client
    prompts.js     — All 8 mode prompts
  server.js
  package.json

/frontend
  /src
    /pages
      Generator.jsx  — Main dashboard with all modes
      Landing.jsx    — Auth / onboarding page
    /context
      AuthContext.jsx
    /utils
      api.js
    App.jsx
    main.jsx
    index.css
  index.html
  package.json
  vite.config.js
  tailwind.config.js

.env.example
```

---

## AI Provider

Uses **Pollinations.ai** — completely free, no API key, no account.  
All prompts route through `services/prompts.js` → `services/claude.js` → SSE stream.
