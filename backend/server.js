require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const session = require('express-session');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3001;
const DIST = path.join(__dirname, '..', 'frontend', 'dist');

// ── Serve built frontend ──────────────────────────────────────────────────────
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
}

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: (_origin, cb) => cb(null, true),
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

app.use(session({
  secret:            process.env.SESSION_SECRET || 'linkedai-dev-secret',
  resave:            false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/auth',  require('./routes/auth'));
app.use('/api',   require('./routes/generate'));
app.use('/admin', require('./routes/admin'));

app.get('/health', (_req, res) => res.json({
  status: 'ok',
  ai:     'pollinations',
  modes:  ['generate_posts','viral_hooks','comment_replies','content_calendar',
           'rewrite_post','executive_mode','thinking_mode','impact_score','style_analyzer'],
  ts:     Date.now(),
}));

// ── SPA fallback ──────────────────────────────────────────────────────────────
if (fs.existsSync(DIST)) {
  app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

// ── Start ─────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  const hasDist = fs.existsSync(DIST);
  console.log(`🚀  LinkedAI backend   →  http://localhost:${PORT}`);
  if (hasDist) console.log(`🌐  Full app served   →  http://localhost:${PORT}`);
  else         console.log(`💡  Frontend not built — run: cd ../frontend && npm run build`);
  console.log(`🤖  AI provider       →  Pollinations.ai (free, no key needed)`);
  console.log(`⚡  Modes             →  8 modes active`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌  Port ${PORT} in use. Free it with: npx kill-port ${PORT}\n`);
    process.exit(1);
  } else throw err;
});
