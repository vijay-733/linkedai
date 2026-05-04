const express = require('express');
const fs      = require('fs');
const path    = require('path');
const router  = express.Router();

const ENV_PATH = path.join(__dirname, '..', '.env');

function isConfigured() {
  const k = process.env.ANTHROPIC_API_KEY;
  return !!(k && k !== 'your_anthropic_api_key_here' && k.startsWith('sk-ant-'));
}

// ── Check whether the API key is configured ───────────────────────────────────
router.get('/status', (_req, res) => {
  res.json({
    apiKeyConfigured: isConfigured(),
    model: 'pollinations-openai',
  });
});

// ── Save API key — updates .env on disk AND process.env immediately ───────────
router.post('/configure', (req, res) => {
  const { apiKey } = req.body;

  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(400).json({ error: 'apiKey is required' });
  }
  if (!apiKey.startsWith('sk-ant-')) {
    return res.status(400).json({ error: 'Invalid key — Anthropic API keys start with sk-ant-' });
  }

  try {
    let content = '';
    if (fs.existsSync(ENV_PATH)) {
      content = fs.readFileSync(ENV_PATH, 'utf8');
    }

    if (/^ANTHROPIC_API_KEY=.*/m.test(content)) {
      content = content.replace(/^ANTHROPIC_API_KEY=.*/m, `ANTHROPIC_API_KEY=${apiKey}`);
    } else {
      content += `\nANTHROPIC_API_KEY=${apiKey}\n`;
    }

    fs.writeFileSync(ENV_PATH, content, 'utf8');
    process.env.ANTHROPIC_API_KEY = apiKey;

    console.log('✅  ANTHROPIC_API_KEY updated successfully');
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to write .env:', err);
    res.status(500).json({ error: 'Could not write to .env file', details: err.message });
  }
});

module.exports = router;
