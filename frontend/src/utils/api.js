import axios from 'axios';

// Empty string = relative URLs (follows page origin).
// Dev: Vite proxy forwards /api → localhost:3001.
// Prod / localtunnel: Express handles /api directly.
const BASE = import.meta.env.VITE_API_URL ?? '';

export const api = axios.create({
  baseURL: BASE,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Stream content generation via backend SSE proxy.
 * Backend calls Pollinations (no browser CORS restrictions).
 * @returns {AbortController} — call .abort() to cancel
 */
export function streamGenerate(payload, { onChunk, onDone, onError }) {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${BASE}/api/generate`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify(payload),
        signal:      controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown server error' }));
        onError?.(err.error || `Server error ${res.status}`);
        return;
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') { onDone?.(); return; }
          try {
            const { text, error } = JSON.parse(raw);
            if (error) { onError?.(error); return; }
            if (text)  onChunk?.(text);
          } catch { /* partial JSON — skip */ }
        }
      }
      onDone?.();
    } catch (err) {
      if (err.name !== 'AbortError') onError?.(err.message);
    }
  })();

  return controller;
}

/** Analyze a LinkedIn profile → returns inferred style preferences + style DNA */
export async function analyzeProfile(payload) {
  const { data } = await api.post('/api/analyze', payload);
  return data;
}

/** Persist user preferences to the server session */
export async function savePreferences(prefs) {
  const { data } = await api.post('/api/save-preferences', prefs);
  return data;
}
