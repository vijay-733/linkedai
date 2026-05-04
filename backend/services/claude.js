/**
 * AI service — powered by Pollinations.ai
 * 100% free · no API key · no account
 * https://pollinations.ai
 */
const { buildPrompt } = require('./prompts');

const POLLINATIONS = 'https://text.pollinations.ai/';
const SYSTEM = 'Follow the instructions in the user message exactly. Output only what is requested — no extra commentary outside the specified format.';

const MODELS = ['openai', 'openai-large', 'mistral'];
let lastSuccessIdx = 0; // sticky — last working model tried first next request

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Three-phase retry strategy:
 *   Phase 1 — instant: try all 3 models with no delay (handles normal + light rate-limiting)
 *   Phase 2 — 6 s wait: all models were busy; wait for the quota window to reset, retry all 3
 *   Phase 3 — 6 s wait: still busy; one final sweep before giving up
 *
 * Worst-case timeline: 12 s of waiting → success (proven: manual retry after ~10 s always worked)
 */
async function fetchWithRetry(body) {
  async function trySweep() {
    for (let i = 0; i < MODELS.length; i++) {
      const idx   = (lastSuccessIdx + i) % MODELS.length;
      const model = MODELS[idx];
      try {
        const res = await fetch(POLLINATIONS, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ ...body, model }),
        });
        if (res.ok) {
          lastSuccessIdx = idx;
          console.log(`[AI] ✓  model=${model}`);
          return res;
        }
        console.warn(`[AI] ✗  model=${model} → HTTP ${res.status}`);
        if (res.status !== 429 && res.status < 500) return res; // real 4xx — stop
      } catch (err) {
        console.warn(`[AI] ✗  model=${model} → ${err.message}`);
      }
    }
    return null; // all 3 returned 429 / 5xx
  }

  // Phase 1 — instant
  const r1 = await trySweep();
  if (r1) return r1;

  // Phase 2 — wait 6 s, retry
  console.log('[AI] all models busy — waiting 6 s…');
  await sleep(6000);
  const r2 = await trySweep();
  if (r2) return r2;

  // Phase 3 — wait another 6 s, final sweep
  console.log('[AI] still busy — final retry in 6 s…');
  await sleep(6000);
  const r3 = await trySweep();
  if (r3) return r3;

  return { ok: false, status: 429 };
}

function sendError(res, message) {
  if (!res.writableEnded) {
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
}

// ── Writing Style DNA Analyser ────────────────────────────────────────────────
async function analyzeUserStyle(posts) {
  if (!posts || !posts.trim()) return null;

  const prompt = `You are a world-class writing style analyst trained to reverse-engineer a person's exact writing voice from examples.

Analyse the LinkedIn posts below and extract a precise, evidence-based style DNA profile.

POSTS TO ANALYSE:
---
${posts}
---

Return ONLY a raw JSON object — no markdown fences, no explanation, nothing else:
{
  "tone": "3–5 words describing the emotional tone (e.g. casual and direct / warm but authoritative)",
  "voice": "describe the narrative voice — first/third person, formal/informal, confident/humble",
  "sentence_pattern": "describe typical sentence length and structure with specifics",
  "paragraph_rhythm": "how paragraphs are structured — length, pacing, white space habits",
  "vocabulary_complexity": "specific description of word choice",
  "hook_technique": "describe exactly how this writer opens posts — with evidence from the samples",
  "cta_style": "how this writer typically ends posts",
  "emoji_frequency": "None / Minimal (1–2) / Moderate (3–5) / Heavy — and how they use them",
  "formatting_patterns": "specific formatting habits: line breaks, lists, spacing, bold, caps",
  "emotional_register": "the emotional depth and approach",
  "signature_moves": ["recurring pattern 1", "recurring pattern 2", "recurring pattern 3"],
  "banned_elements": ["something this writer never does 1", "something they never do 2"],
  "writing_dna": "1–2 sentences capturing the single most distinctive quality of this writer's voice"
}

RULES:
- Every field must be backed by evidence from the actual posts
- If you cannot determine a field, write "Not enough samples to determine"`;

  const res = await fetchWithRetry({
    messages: [
      { role: 'system', content: 'You are a writing style analyst. Return only raw JSON. No markdown. No explanation.' },
      { role: 'user',   content: prompt },
    ],
    stream: false,
  });

  if (!res.ok) throw new Error(`Style analysis failed (${res.status})`);

  const raw     = (await res.text()).trim();
  const jsonStr = raw.startsWith('{') ? raw : (raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
  return JSON.parse(jsonStr);
}

// ── Stream generation ─────────────────────────────────────────────────────────
async function streamGenerate(variables, res) {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  const prompt = buildPrompt(variables);

  try {
    const upstream = await fetchWithRetry({
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user',   content: prompt },
      ],
      stream: true,
      seed:   Math.floor(Math.random() * 999999),
    });

    if (!upstream.ok) {
      sendError(res, 'The AI service is temporarily busy. Please wait a moment and try again.');
      return;
    }

    const reader  = upstream.body.getReader();
    const decoder = new TextDecoder();
    let   buf     = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();

        if (raw === '[DONE]') {
          if (!res.writableEnded) { res.write('data: [DONE]\n\n'); res.end(); }
          return;
        }

        try {
          const chunk = JSON.parse(raw);
          const text  = chunk.choices?.[0]?.delta?.content;
          if (text && !res.writableEnded) {
            res.write(`data: ${JSON.stringify({ text })}\n\n`);
          }
        } catch { /* skip malformed chunk */ }
      }
    }

    if (!res.writableEnded) { res.write('data: [DONE]\n\n'); res.end(); }

  } catch (err) {
    console.error('[AI] stream error:', err.message);
    sendError(res, 'Generation failed. Check your internet connection and try again.');
  }
}

// ── Profile analysis (one-shot, no stream) ────────────────────────────────────
async function analyzeProfile(profileData) {
  const analyzePrompt = `Analyze this LinkedIn profile and infer optimal content generation settings.

Name: ${profileData.name || 'Unknown'}
Headline: ${profileData.headline || 'Not provided'}
Industry: ${profileData.industry || 'Not provided'}
Profile URL: ${profileData.url || 'Not provided'}
Writing samples / recent posts:
${profileData.posts || 'None provided'}

Return ONLY a raw JSON object (no markdown fences, no explanation):
{
  "niche": "specific niche based on headline/industry",
  "audience": "most likely target audience",
  "goal": "primary LinkedIn goal inferred",
  "tone": "one of: Professional / Conversational / Inspirational / Educational / Bold & Direct / Storytelling",
  "sentence_style": "describe sentence length and rhythm",
  "hook_type": "one of: Bold statement / Curiosity question / Contrarian take / Shocking stat / Personal story opener",
  "emoji_usage": "one of: None / Minimal (1–2) / Moderate (3–5) / Heavy",
  "vocab_level": "one of: Technical / Expert / Accessible / Mixed / Simple / Broad",
  "content_themes": ["theme1", "theme2", "theme3"],
  "suggested_topics": ["topic1", "topic2", "topic3"]
}`;

  const res = await fetchWithRetry({
    messages: [
      { role: 'system', content: 'You are a LinkedIn content analyst. Return only raw JSON, no markdown.' },
      { role: 'user',   content: analyzePrompt },
    ],
    stream: false,
  });

  if (!res.ok) throw new Error(`Profile analysis failed (${res.status})`);

  const raw     = (await res.text()).trim();
  const jsonStr = raw.startsWith('{') ? raw : (raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
  return JSON.parse(jsonStr);
}

module.exports = { streamGenerate, analyzeProfile, analyzeUserStyle };
