const express = require('express');
const { streamGenerate, analyzeProfile, analyzeUserStyle } = require('../services/claude');
const { buildPrompt } = require('../services/prompts');

const router = express.Router();

const SYSTEM = 'Follow the instructions in the user message exactly. Output only what is requested — no extra commentary outside the specified format.';

// All supported modes
const VALID_MODES = new Set([
  'generate_posts',
  'viral_hooks',
  'comment_replies',
  'content_calendar',
  'rewrite_post',
  'executive_mode',
  'thinking_mode',
  'impact_score',
  'style_analyzer',
]);

// Executive Mode defaults — authoritative C-suite voice
const EXECUTIVE_DEFAULTS = {
  audience:       'C-suite executives, founders, and senior leaders',
  tone:           'Authoritative, strategic, and confident',
  sentence_style: 'Concise and decisive — no filler, every word earns its place',
  hook_type:      'Bold statement or industry-disrupting insight',
  cta:            'Invite strategic discussion or provoke peer-level thinking',
  emoji_usage:    'None — pure authority',
  vocab_level:    'Expert — precise, industry-native language',
};

// Thinking Mode defaults — mentor voice, analytical depth
const THINKING_DEFAULTS = {
  tone:           'Thoughtful, analytical, and mentoring',
  sentence_style: 'Varies — expansive for analysis, short and sharp for conclusions',
  hook_type:      'Curiosity-driven question or challenge to assumptions',
  cta:            'Invite the audience to reflect and share their own perspective',
  emoji_usage:    'Minimal — section markers only',
  vocab_level:    'Intelligent but accessible — no unnecessary jargon',
};

// ── Shared variable-merge logic ───────────────────────────────────────────────
function prepareVariables(req) {
  const variables = { ...req.body };

  if (variables.mode && !VALID_MODES.has(variables.mode)) {
    variables.mode = 'generate_posts';
  }

  if (req.session?.user) {
    const { niche, audience, goal, tone, sentence_style,
            hook_type, cta, emoji_usage, vocab_level } = req.session.user;
    if (!variables.niche          && niche)          variables.niche          = niche;
    if (!variables.audience       && audience)       variables.audience       = audience;
    if (!variables.goal           && goal)           variables.goal           = goal;
    if (!variables.tone           && tone)           variables.tone           = tone;
    if (!variables.sentence_style && sentence_style) variables.sentence_style = sentence_style;
    if (!variables.hook_type      && hook_type)      variables.hook_type      = hook_type;
    if (!variables.cta            && cta)            variables.cta            = cta;
    if (!variables.emoji_usage    && emoji_usage)    variables.emoji_usage    = emoji_usage;
    if (!variables.vocab_level    && vocab_level)    variables.vocab_level    = vocab_level;
  }

  if (req.session?.user?.style_profile && !variables.style_profile) {
    variables.style_profile = req.session.user.style_profile;
  }

  switch (variables.mode) {
    case 'executive_mode':
      for (const [key, val] of Object.entries(EXECUTIVE_DEFAULTS)) {
        if (!variables[key]) variables[key] = val;
      }
      break;
    case 'thinking_mode':
      for (const [key, val] of Object.entries(THINKING_DEFAULTS)) {
        if (!variables[key]) variables[key] = val;
      }
      break;
  }

  return variables;
}

// ── Build prompt only (browser will call Pollinations directly) ───────────────
router.post('/build-prompt', (req, res) => {
  try {
    const variables = prepareVariables(req);
    const prompt    = buildPrompt(variables);
    res.json({ prompt, system: SYSTEM });
  } catch (err) {
    console.error('Build-prompt error:', err);
    res.status(500).json({ error: 'Failed to build prompt', details: err.message });
  }
});

// ── Generate content via server-side streaming (kept as fallback) ─────────────
router.post('/generate', async (req, res) => {
  try {
    const variables = prepareVariables(req);
    await streamGenerate(variables, res);
  } catch (err) {
    console.error('Generation error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Generation failed', details: err.message });
    }
  }
});

// ── Analyze LinkedIn profile + extract writing style DNA ─────────────────────
router.post('/analyze', async (req, res) => {
  try {
    const { profileUrl, posts, name, headline, industry } = req.body;

    // Run both analyses in parallel — profile fields + deep style DNA
    const [analysis, style_profile] = await Promise.all([
      analyzeProfile({ url: profileUrl, posts, name, headline, industry }),
      posts?.trim() ? analyzeUserStyle(posts) : Promise.resolve(null),
    ]);

    if (!analysis) {
      return res.status(500).json({ error: 'Could not parse profile analysis' });
    }

    if (req.session) {
      req.session.user = req.session.user
        ? { ...req.session.user, ...analysis, style_profile }
        : { ...analysis, style_profile };
    }

    res.json({ success: true, analysis, style_profile });
  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ error: 'Analysis failed', details: err.message });
  }
});

// ── Save / update profile preferences ────────────────────────────────────────
router.post('/save-preferences', (req, res) => {
  if (!req.session) return res.status(500).json({ error: 'Session not available' });
  if (!req.session.user) req.session.user = {};
  req.session.user = { ...req.session.user, ...req.body };
  res.json({ success: true });
});

// ── Get saved preferences ─────────────────────────────────────────────────────
router.get('/preferences', (req, res) => {
  res.json({ preferences: req.session?.user || null });
});

module.exports = router;
