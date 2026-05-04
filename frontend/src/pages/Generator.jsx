import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Zap, LogOut, Copy, Check, RefreshCw, ChevronDown, ChevronUp,
  User, Linkedin, Sparkles, Calendar, RotateCcw, MessageSquare,
  Flame, Settings, BookOpen, X, Loader, ExternalLink, AlertCircle,
  CheckCircle, Crown, BarChart2, Palette, Brain,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { streamGenerate, analyzeProfile, savePreferences } from '../utils/api';

// ── Demo data ─────────────────────────────────────────────────────────────────
const DEMO_DATA = {
  niche:    'B2B SaaS / Tech Leadership',
  audience: 'Startup founders and senior engineers',
  goal:     'Build thought leadership and generate inbound leads',
  topic:    'What I learned building my first startup',
  samplePost:
`I used to think growth was about hacks.

I spent 18 months chasing viral loops and "proven frameworks".

The result? 12% month-over-month growth that looked great in decks.

But I was building on sand.

Then we lost 3 enterprise clients in the same week.

That's when I learned: real growth is boring.

→ Call every churned customer personally
→ Fix the product before adding features
→ Talk to 5 customers before writing a line of code

The companies that win aren't the ones with the best hacks.

They're the ones with the deepest understanding of their customers.

What's the most counter-intuitive growth lesson you've learned?`,
};

const LOADING_STEPS = [
  'Analyzing your writing style…',
  'Generating high-performing content…',
  'Optimizing for engagement…',
  'Applying quality checks…',
  'Finalizing your content…',
];

const MODES = [
  { id: 'executive_mode',   label: 'Executive',      icon: Crown,         desc: '2–3 CEO-level strategic posts',            badge: '🔥', group: 'premium',  color: 'amber'  },
  { id: 'thinking_mode',    label: 'Thinking',       icon: Brain,         desc: 'AI thinks through your idea step by step', badge: '🧠', group: 'premium',  color: 'indigo' },
  { id: 'generate_posts',   label: 'Generate Posts', icon: Sparkles,      desc: '10 high-performing posts',                 group: 'advanced' },
  { id: 'viral_hooks',      label: 'Viral Hooks',    icon: Flame,         desc: '15 scroll-stopping hooks',                 group: 'advanced' },
  { id: 'comment_replies',  label: 'Replies',        icon: MessageSquare, desc: '10 human-like comment replies',            group: 'advanced' },
  { id: 'content_calendar', label: 'Calendar',       icon: Calendar,      desc: '7-day content plan',                       group: 'advanced' },
  { id: 'rewrite_post',     label: 'Rewrite',        icon: RotateCcw,     desc: 'Make your post go viral',                  group: 'advanced' },
  { id: 'impact_score',     label: 'Impact Score',   icon: BarChart2,     desc: 'Score & improve any post',                 group: 'advanced' },
  { id: 'style_analyzer',   label: 'Style Analyzer', icon: Palette,       desc: 'Extract your writing DNA',                 group: 'advanced' },
];

const TONE_OPTIONS  = ['Professional', 'Conversational', 'Inspirational', 'Educational', 'Bold & Direct', 'Storytelling'];
const EMOJI_OPTIONS = ['None', 'Minimal (1–2)', 'Moderate (3–5)', 'Heavy'];
const VOCAB_OPTIONS = ['Technical / Expert', 'Accessible / Mixed', 'Simple / Broad'];
const CONTENT_TYPES = ['auto', 'story', 'list', 'opinion', 'insight'];
const HOOK_OPTIONS  = ['Bold statement', 'Curiosity question', 'Contrarian take', 'Shocking stat', 'Personal story opener'];
const CTA_OPTIONS   = ['Ask a question', 'Invite opinions', 'Call to share', 'Soft DM invite', 'Comment prompt'];

// ── Parse thinking output line by line ───────────────────────────────────────
function parseThinkingSections(text) {
  const DEFS = [
    { key: 'understanding', re: /^(?:#+\s*)?(?:UNDERSTANDING|ANALYZING)/i },
    { key: 'diagnosis',     re: /^(?:#+\s*)?DIAGNOSIS/i },
    { key: 'ideas',         re: /^(?:#+\s*)?(?:IMPROVED\s+)?(?:IDEAS?|ANGLES?|OPTIONS?)/i },
    { key: 'final',         re: /^(?:#+\s*)?(?:FINAL\s+(?:CONTENT|POST)|SELECTED\s+POST)/i },
    { key: 'why',           re: /^(?:#+\s*)?WHY\s+(?:IT|THIS)\s+WORKS?/i },
    { key: 'next',          re: /^(?:#+\s*)?NEXT\s+STEPS?/i },
  ];

  const lines      = text.split('\n');
  const sections   = {};
  let   curKey     = null;
  let   curLines   = [];

  for (const line of lines) {
    const stripped = line.replace(/^[#*\-\s]+/, '').trim();
    const found    = DEFS.find(d => d.re.test(stripped));

    if (found) {
      if (curKey && curLines.join('').trim()) {
        sections[curKey] = curLines.join('\n').trim();
      }
      curKey   = found.key;
      curLines = [];
    } else if (curKey) {
      curLines.push(line);
    }
  }
  if (curKey && curLines.join('').trim()) {
    sections[curKey] = curLines.join('\n').trim();
  }

  return Object.keys(sections).length >= 2 ? sections : null;
}

// ── Parse full AI output into typed structure ─────────────────────────────────
function parseOutput(text, mode) {
  if (!text) return null;

  if (mode === 'executive_mode') {
    const parts = text.split(/\n---\n/).map(s => s.trim()).filter(Boolean);

    let whyThisWorks = null;
    let posts        = parts;
    if (parts.length > 1) {
      const last  = parts[parts.length - 1];
      const isWhy = /why|strategy|works|impact/i.test(last.slice(0, 80));
      if (isWhy && last.length < 900) { whyThisWorks = last; posts = parts.slice(0, -1); }
    }

    if (posts.length > 1) {
      return { type: 'executive', bestPost: posts[0], alternatives: posts.slice(1), whyThisWorks, full: text };
    }

    const blocks = [...text.matchAll(/(?:POST\s+[1-9][^\n]*\n)([\s\S]*?)(?=POST\s+[2-9]|STRATEGY|WHY THIS WORKS|NEXT ACTIONS|$)/gi)];
    if (blocks.length > 1) {
      const strat = text.match(/(?:STRATEGY|WHY THIS WORKS)[^\n]*\n([\s\S]*)$/i);
      return {
        type: 'executive',
        bestPost:     blocks[0][0].trim(),
        alternatives: blocks.slice(1).map(m => m[0].trim()),
        whyThisWorks: strat ? strat[1].trim() : null,
        full: text,
      };
    }

    return { type: 'single', content: text };
  }

  if (mode === 'thinking_mode') {
    const sections = parseThinkingSections(text);
    if (sections) {
      return { type: 'thinking', sections, bestPost: sections.final || null, full: text };
    }
    const finalM = text.match(/(?:FINAL CONTENT|FINAL POST)[^\n]*\n([\s\S]*?)(?=WHY IT WORKS|WHY THIS WORKS|NEXT STEPS|---|$)/i);
    const whyM   = text.match(/(?:WHY IT WORKS|WHY THIS WORKS)[^\n]*\n([\s\S]*?)(?=NEXT STEPS|---|$)/i);
    if (finalM) {
      return {
        type: 'thinking',
        sections: { final: finalM[1].trim(), ...(whyM ? { why: whyM[1].trim() } : {}) },
        bestPost: finalM[1].trim(),
        full: text,
      };
    }
    return { type: 'single', content: text };
  }

  const parts = text.split(/\n---\n/).map(s => s.trim()).filter(Boolean);
  if (parts.length > 1) return { type: 'multi', bestPost: parts[0], alternatives: parts.slice(1) };
  return { type: 'single', content: text };
}

// ── LoadingExperience ─────────────────────────────────────────────────────────
function LoadingExperience({ mode }) {
  const [stepIdx, setStepIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStepIdx(i => Math.min(i + 1, LOADING_STEPS.length - 1)), 2200);
    return () => clearInterval(id);
  }, []);

  const isExec  = mode === 'executive_mode';
  const isThink = mode === 'thinking_mode';
  const icon    = isExec ? 'text-amber-400'  : isThink ? 'text-indigo-400' : 'text-blue-400';
  const bg      = isExec ? 'bg-amber-500/10' : isThink ? 'bg-indigo-500/10': 'bg-blue-500/10';
  const bar     = isExec ? 'bg-amber-500'    : isThink ? 'bg-indigo-500'   : 'bg-blue-500';
  const dot     = isExec ? 'bg-amber-400'    : isThink ? 'bg-indigo-400'   : 'bg-blue-400';
  const progress = ((stepIdx + 1) / LOADING_STEPS.length) * 100;

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 min-h-[360px]">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <div className={`w-16 h-16 rounded-2xl ${bg} flex items-center justify-center`}>
            <Loader size={28} className={`animate-spin ${icon}`} />
          </div>
        </div>
        <div className="text-center">
          <p className="text-white font-semibold text-base">{LOADING_STEPS[stepIdx]}</p>
          <p className="text-slate-500 text-sm mt-1.5">Usually takes 10–20 seconds</p>
        </div>
        <div>
          <div className="w-full bg-surface-2 rounded-full h-1.5 overflow-hidden mb-3">
            <div className={`h-full rounded-full transition-all duration-700 ease-out ${bar}`} style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between px-0.5">
            {LOADING_STEPS.map((_, i) => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${i <= stepIdx ? dot : 'bg-surface-3'}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Mobile bottom navigation ──────────────────────────────────────────────────
function MobileBottomNav({ mobileTab, setMobileTab, onGenerate, streaming, hasOutput, mode }) {
  const isExec  = mode === 'executive_mode';
  const isThink = mode === 'thinking_mode';
  const btnBg   = streaming
    ? 'bg-red-700'
    : isExec  ? 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-amber-500/30'
    : isThink ? 'bg-gradient-to-r from-indigo-600 to-purple-600 shadow-indigo-500/30'
    :           'bg-gradient-to-r from-blue-600 to-blue-500 shadow-blue-500/20';

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0d1117]/97 backdrop-blur-sm border-t border-border">
      <div className="flex items-stretch h-16">

        {/* Setup */}
        <button onClick={() => setMobileTab('setup')}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors
            ${mobileTab === 'setup' ? 'text-white' : 'text-slate-500'}`}>
          <div className={`p-1.5 rounded-lg transition-colors ${mobileTab === 'setup' ? 'bg-surface-2' : ''}`}>
            <Settings size={19} />
          </div>
          <span className="text-[10px] font-medium">Setup</span>
        </button>

        {/* Generate — center CTA */}
        <div className="flex-[1.5] flex items-center justify-center px-2 py-2">
          <button onClick={onGenerate}
            className={`w-full h-full rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold text-white shadow-lg transition-all ${btnBg}`}>
            {streaming ? <><X size={14} /> Stop</> : <><Zap size={14} /> Generate</>}
          </button>
        </div>

        {/* Results */}
        <button onClick={() => setMobileTab('output')}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors relative
            ${mobileTab === 'output' ? 'text-white' : 'text-slate-500'}`}>
          <div className={`p-1.5 rounded-lg relative transition-colors ${mobileTab === 'output' ? 'bg-surface-2' : ''}`}>
            <Sparkles size={19} />
            {hasOutput && mobileTab !== 'output' && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400 border border-[#0d1117]" />
            )}
          </div>
          <span className="text-[10px] font-medium">Results</span>
        </button>

      </div>
    </nav>
  );
}

// ── MoreToolsDropdown ─────────────────────────────────────────────────────────
function MoreToolsDropdown({ modes, activeMode, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const isActive = modes.some(m => m.id === activeMode);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all
          ${isActive ? 'bg-surface-2 text-white border border-border' : 'text-slate-400 hover:text-white hover:bg-surface-2 border border-transparent'}`}>
        <Settings size={13} />
        <span className="hidden sm:inline">More Tools</span>
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 w-60 bg-surface border border-border rounded-xl shadow-2xl z-50 py-1 animate-slide-up">
          {modes.map(m => {
            const Icon   = m.icon;
            const active = activeMode === m.id;
            return (
              <button key={m.id} onClick={() => { onSelect(m.id); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-left transition-colors
                  ${active ? 'bg-surface-2 text-white' : 'text-slate-400 hover:text-white hover:bg-surface-2'}`}>
                <Icon size={13} className={active ? 'text-li' : 'text-slate-500'} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium leading-none mb-0.5">{m.label}</div>
                  <div className="text-slate-600 text-[10px] truncate">{m.desc}</div>
                </div>
                {active && <Check size={11} className="text-li flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── CopyButton ────────────────────────────────────────────────────────────────
function CopyButton({ text, size = 14 }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <button onClick={copy} title="Copy" className="p-1.5 rounded-md hover:bg-surface-3 text-slate-500 hover:text-slate-300 transition-colors">
      {copied ? <Check size={size} className="text-green-400" /> : <Copy size={size} />}
    </button>
  );
}

// ── SelectField ───────────────────────────────────────────────────────────────
function SelectField({ label, value, onChange, options }) {
  return (
    <div>
      <label className="label">{label}</label>
      <select className="select" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// ── ProfileDropdown ───────────────────────────────────────────────────────────
function ProfileDropdown({ user, onLogout, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute top-full right-0 mt-2 w-72 bg-surface border border-border rounded-xl shadow-2xl z-50 overflow-hidden animate-slide-up">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3">
          {user?.picture
            ? <img src={user.picture} alt="" className="w-12 h-12 rounded-full border-2 border-li flex-shrink-0" />
            : <div className="w-12 h-12 rounded-full bg-surface-2 border-2 border-li flex items-center justify-center text-xl font-bold text-li flex-shrink-0">{user?.name?.[0]?.toUpperCase() || '?'}</div>}
          <div className="min-w-0">
            <p className="font-semibold text-white text-sm truncate">{user?.name || 'User'}</p>
            {user?.headline && <p className="text-xs text-slate-400 truncate mt-0.5">{user.headline}</p>}
            {user?.email    && <p className="text-xs text-slate-500 truncate mt-0.5">{user.email}</p>}
          </div>
        </div>
        <div className="mt-3">
          {user?.linkedinConnected
            ? <span className="inline-flex items-center gap-1.5 text-xs text-green-400 bg-green-400/10 border border-green-400/20 rounded-full px-2.5 py-1"><Linkedin size={10} /> LinkedIn Connected</span>
            : <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 bg-surface-2 border border-border rounded-full px-2.5 py-1"><User size={10} /> Manual Setup</span>}
        </div>
      </div>
      <div className="p-2">
        {user?.profileUrl && (
          <a href={user.profileUrl} target="_blank" rel="noopener noreferrer" onClick={onClose}
            className="flex items-center gap-2 text-sm text-li hover:bg-surface-2 rounded-lg px-3 py-2 transition-colors">
            <ExternalLink size={13} /> View LinkedIn Profile
          </a>
        )}
        <button onClick={() => { onLogout(); onClose(); }}
          className="w-full flex items-center gap-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg px-3 py-2 transition-colors mt-1">
          <LogOut size={13} /> Sign out
        </button>
      </div>
    </div>
  );
}

// ── ProfileSection ────────────────────────────────────────────────────────────
function ProfileSection({ prefs, setPrefs, user, onAnalyze, analyzing, analyzeStatus, demoPosts }) {
  const [open,  setOpen]  = useState(false);
  const [posts, setPosts] = useState(demoPosts || '');

  return (
    <div className="card">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-sm font-semibold text-white mb-1">
        <span className="flex items-center gap-2"><User size={14} className="text-li" /> Your Profile</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="mt-3 space-y-3 animate-fade-in">
          <div>
            <label className="label">Niche / Industry</label>
            <input className="input" placeholder="e.g. B2B SaaS, Personal Finance, Tech Leadership"
              value={prefs.niche} onChange={e => setPrefs(p => ({ ...p, niche: e.target.value }))} />
          </div>
          <div>
            <label className="label">Target Audience</label>
            <input className="input" placeholder="e.g. Startup founders, Marketing managers"
              value={prefs.audience} onChange={e => setPrefs(p => ({ ...p, audience: e.target.value }))} />
          </div>
          <div>
            <label className="label">Your Goal</label>
            <input className="input" placeholder="e.g. Grow followers, Generate leads, Build authority"
              value={prefs.goal} onChange={e => setPrefs(p => ({ ...p, goal: e.target.value }))} />
          </div>

          {/* Style cloning CTA */}
          <div className="rounded-lg bg-violet-500/5 border border-violet-500/20 p-3 space-y-2">
            <p className="text-xs font-semibold text-violet-300 flex items-center gap-1.5">
              <Brain size={12} /> Personality Cloning
            </p>
            <p className="text-[11px] text-slate-400">Paste 2–3 of your previous LinkedIn posts so the AI writes in your exact style.</p>
            <textarea className="textarea text-xs" rows={4}
              placeholder="Paste your LinkedIn posts here…&#10;&#10;The AI will learn your tone, rhythm, and sentence patterns."
              value={posts} onChange={e => setPosts(e.target.value)} />
            <p className="text-[10px] text-violet-400/70 italic">✦ AI will learn your tone and write exactly like you</p>

            {analyzeStatus && (
              <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${analyzeStatus.type === 'success' ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
                {analyzeStatus.type === 'success' ? <CheckCircle size={12} className="mt-0.5 flex-shrink-0" /> : <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />}
                {analyzeStatus.message}
              </div>
            )}

            <button onClick={() => onAnalyze(posts)} disabled={analyzing}
              className="w-full btn-ghost text-xs py-2 flex items-center justify-center gap-2 border border-violet-500/30 hover:border-violet-400/50">
              {analyzing ? <><Loader size={12} className="animate-spin" /> Analyzing…</> : <><Sparkles size={12} className="text-violet-400" /> Analyze My Style</>}
            </button>
          </div>

          {user?.linkedinConnected && (
            <div className="flex items-center gap-1.5 text-xs text-green-400">
              <Linkedin size={11} /> LinkedIn connected — profile data included
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── StyleSection ──────────────────────────────────────────────────────────────
function StyleSection({ prefs, setPrefs }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-sm font-semibold text-white">
        <span className="flex items-center gap-2"><Settings size={14} className="text-slate-400" /> Style Preferences</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="mt-3 grid grid-cols-1 gap-3 animate-fade-in">
          <SelectField label="Tone"        value={prefs.tone}        onChange={v => setPrefs(p => ({ ...p, tone: v }))}        options={TONE_OPTIONS} />
          <SelectField label="Hook Type"   value={prefs.hook_type}   onChange={v => setPrefs(p => ({ ...p, hook_type: v }))}   options={HOOK_OPTIONS} />
          <SelectField label="CTA Style"   value={prefs.cta}         onChange={v => setPrefs(p => ({ ...p, cta: v }))}         options={CTA_OPTIONS} />
          <SelectField label="Emoji Usage" value={prefs.emoji_usage} onChange={v => setPrefs(p => ({ ...p, emoji_usage: v }))} options={EMOJI_OPTIONS} />
          <SelectField label="Vocab Level" value={prefs.vocab_level} onChange={v => setPrefs(p => ({ ...p, vocab_level: v }))} options={VOCAB_OPTIONS} />
          <div>
            <label className="label">Sentence Style</label>
            <input className="input" placeholder="e.g. Short punchy sentences, occasional long ones"
              value={prefs.sentence_style} onChange={e => setPrefs(p => ({ ...p, sentence_style: e.target.value }))} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── ContentSection ────────────────────────────────────────────────────────────
function ContentSection({ prefs, setPrefs, mode }) {
  const isComment  = mode === 'comment_replies';
  const isRewrite  = mode === 'rewrite_post';
  const isCalendar = mode === 'content_calendar';
  const isHooks    = mode === 'viral_hooks';
  const isImpact   = mode === 'impact_score';
  const isStyle    = mode === 'style_analyzer';
  const isExec     = mode === 'executive_mode';
  const isThink    = mode === 'thinking_mode';

  return (
    <div className="card space-y-3">
      <p className="text-sm font-semibold text-white flex items-center gap-2">
        <BookOpen size={14} className="text-slate-400" /> Content Request
      </p>

      {isExec && (
        <>
          <div>
            <label className="label">Strategic Topic</label>
            <input className="input" placeholder="e.g. Why most leadership advice is wrong"
              value={prefs.topic} onChange={e => setPrefs(p => ({ ...p, topic: e.target.value }))} />
          </div>
          <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-400/90">
            <Crown size={11} className="inline mr-1" />
            <strong>Executive Mode</strong> — Authoritative defaults applied. Style overridden for maximum impact.
          </div>
        </>
      )}

      {isThink && (
        <>
          <div>
            <label className="label">Your Idea or Challenge</label>
            <input className="input" placeholder="e.g. I want to write about failing forward but not sure how to angle it"
              value={prefs.topic} onChange={e => setPrefs(p => ({ ...p, topic: e.target.value }))} />
          </div>
          <div>
            <label className="label">Existing Post to Improve (optional)</label>
            <textarea className="textarea" rows={4}
              placeholder="Paste a post you want the AI to diagnose…"
              value={prefs.input_post} onChange={e => setPrefs(p => ({ ...p, input_post: e.target.value }))} />
          </div>
          <div className="p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/20 text-xs text-indigo-400/90">
            <Brain size={11} className="inline mr-1" />
            <strong>Thinking Mode</strong> — AI diagnoses, generates 3 angles, picks the best, writes the final post, explains why it works.
          </div>
        </>
      )}

      {!isComment && !isRewrite && !isImpact && !isStyle && !isExec && !isThink && (
        <div>
          <label className="label">{isCalendar ? 'Topic Focus (optional)' : 'Topic'}</label>
          <input className="input"
            placeholder={isCalendar ? 'e.g. Career growth, Leadership' : 'e.g. How I grew from 0 to 10K followers'}
            value={prefs.topic} onChange={e => setPrefs(p => ({ ...p, topic: e.target.value }))} />
        </div>
      )}

      {!isComment && !isRewrite && !isCalendar && !isHooks && !isImpact && !isStyle && !isExec && !isThink && (
        <SelectField label="Content Type" value={prefs.content_type}
          onChange={v => setPrefs(p => ({ ...p, content_type: v }))} options={CONTENT_TYPES} />
      )}

      {isComment && (
        <div><label className="label">Comment to Reply To</label>
          <textarea className="textarea" rows={3} placeholder="Paste the LinkedIn comment…"
            value={prefs.comment} onChange={e => setPrefs(p => ({ ...p, comment: e.target.value }))} />
        </div>
      )}
      {isRewrite && (
        <div><label className="label">Post to Rewrite</label>
          <textarea className="textarea" rows={6} placeholder="Paste the post to make more viral…"
            value={prefs.input_post} onChange={e => setPrefs(p => ({ ...p, input_post: e.target.value }))} />
        </div>
      )}
      {isImpact && (
        <div><label className="label">Post to Analyse</label>
          <textarea className="textarea" rows={6} placeholder="Paste the post to score…"
            value={prefs.input_post} onChange={e => setPrefs(p => ({ ...p, input_post: e.target.value }))} />
        </div>
      )}
      {isStyle && (
        <div>
          <label className="label">Your Writing Samples</label>
          <textarea className="textarea" rows={8}
            placeholder="Paste 2–5 of your LinkedIn posts. The AI will extract your exact style…"
            value={prefs.input_post} onChange={e => setPrefs(p => ({ ...p, input_post: e.target.value }))} />
          <p className="text-xs text-slate-500 mt-1">More samples = more accurate style profile.</p>
        </div>
      )}

      {!isImpact && !isStyle && (
        <div><label className="label">Content History (optional)</label>
          <textarea className="textarea" rows={2} placeholder="Topics to avoid repeating…"
            value={prefs.content_history} onChange={e => setPrefs(p => ({ ...p, content_history: e.target.value }))} />
        </div>
      )}
    </div>
  );
}

// ── OutputPanel ───────────────────────────────────────────────────────────────
function OutputPanel({ output, streaming, error, mode, onClear }) {
  const [altExpanded,  setAltExpanded]  = useState(false);
  const [fullExpanded, setFullExpanded] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (streaming) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output, streaming]);

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-[300px]">
        <div className="w-full max-w-lg space-y-3">
          <div className="bg-red-900/20 border border-red-700/40 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div><p className="font-semibold text-red-300 text-sm mb-1">Generation Error</p>
              <p className="text-xs text-red-400/90 break-words">{error}</p></div>
          </div>
          <button onClick={onClear} className="w-full btn-ghost text-sm py-2 flex items-center justify-center gap-2 text-slate-400">
            <X size={13} /> Dismiss
          </button>
        </div>
      </div>
    );
  }

  if (streaming && !output) return <LoadingExperience mode={mode} />;

  if (!output && !streaming) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 min-h-[400px]">
        <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-4">
          <Sparkles size={28} className="text-slate-600" />
        </div>
        <p className="text-slate-400 font-semibold">Hit "Generate My Post 🚀" to get started</p>
        <p className="text-slate-600 text-sm mt-1.5">Your AI-generated content appears here, structured and ready to post.</p>
      </div>
    );
  }

  if (streaming) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-2 mb-3 flex-shrink-0">
          <Loader size={14} className="animate-spin text-li" />
          <span className="text-sm font-semibold text-white">Generating…</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="card"><pre className="post-content text-slate-200 whitespace-pre-wrap cursor-blink">{output}</pre></div>
          <div ref={bottomRef} />
        </div>
      </div>
    );
  }

  const parsed  = parseOutput(output, mode);
  const isExec  = mode === 'executive_mode';
  const isThink = mode === 'thinking_mode';
  const hlBorder = isExec ? 'border-amber-500/30'  : isThink ? 'border-indigo-500/30'  : 'border-blue-500/30';
  const hlBg     = isExec ? 'bg-amber-500/5'        : isThink ? 'bg-indigo-500/5'        : 'bg-blue-500/5';
  const hlDivide = isExec ? 'border-amber-500/20'   : isThink ? 'border-indigo-500/20'   : 'border-blue-500/20';
  const hlLabel  = isExec ? 'text-amber-300'         : isThink ? 'text-indigo-300'         : 'text-blue-300';

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <span className="text-sm font-semibold text-white flex items-center gap-2">
          <Check size={14} className="text-green-400" /> Content Ready
        </span>
        <div className="flex items-center gap-1">
          <CopyButton text={output} size={14} />
          <button onClick={onClear} className="p-1.5 rounded-md hover:bg-surface-3 text-slate-500 hover:text-red-400 transition-colors" title="Clear">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">

        {/* ── Thinking mode — structured sections ── */}
        {parsed?.type === 'thinking' && (
          <>
            {[
              { key: 'understanding', emoji: '🧠', label: 'Understanding',   highlight: false },
              { key: 'diagnosis',     emoji: '🔍', label: 'Diagnosis',        highlight: false },
              { key: 'ideas',         emoji: '💡', label: 'Improved Ideas',   highlight: false },
              { key: 'final',         emoji: '🚀', label: 'Final Content',    highlight: true  },
              { key: 'why',           emoji: '📊', label: 'Why It Works',     highlight: false },
              { key: 'next',          emoji: '🎯', label: 'Next Steps',       highlight: false },
            ].filter(s => parsed.sections?.[s.key]).map(s => (
              <div key={s.key} className={`rounded-xl border overflow-hidden ${s.highlight ? `${hlBorder} ${hlBg}` : 'border-border bg-surface'}`}>
                <div className={`flex items-center justify-between px-4 py-2.5 border-b ${s.highlight ? hlDivide : 'border-border'}`}>
                  <span className={`text-xs font-semibold flex items-center gap-1.5 ${s.highlight ? hlLabel : 'text-slate-300'}`}>
                    {s.emoji} {s.label}
                  </span>
                  <CopyButton text={parsed.sections[s.key]} size={13} />
                </div>
                <div className="p-4">
                  <pre className="post-content text-slate-200 whitespace-pre-wrap text-sm leading-relaxed">{parsed.sections[s.key]}</pre>
                </div>
              </div>
            ))}

            {/* Fallback: no sections parsed */}
            {!parsed.sections && (
              <div className="card">
                <pre className="post-content text-slate-200 whitespace-pre-wrap">{parsed.full}</pre>
              </div>
            )}

            {parsed.sections && (
              <>
                <button onClick={() => setFullExpanded(o => !o)}
                  className="w-full text-xs text-slate-500 hover:text-slate-300 flex items-center justify-center gap-1.5 py-1 transition-colors">
                  {fullExpanded ? <><ChevronUp size={12} /> Hide full analysis</> : <><ChevronDown size={12} /> View full analysis</>}
                </button>
                {fullExpanded && <div className="card animate-fade-in"><pre className="post-content text-slate-400 whitespace-pre-wrap text-sm">{parsed.full}</pre></div>}
              </>
            )}
          </>
        )}

        {/* ── Executive / Multi — Best Post + Alternatives + Why ── */}
        {(parsed?.type === 'executive' || parsed?.type === 'multi') && (
          <>
            <div className={`rounded-xl border ${hlBorder} ${hlBg} overflow-hidden`}>
              <div className={`flex items-center justify-between px-4 py-2.5 border-b ${hlDivide}`}>
                <span className={`text-xs font-semibold ${hlLabel} flex items-center gap-1.5`}>
                  {isExec ? '🔥' : '⭐'} Best Post
                </span>
                <CopyButton text={parsed.bestPost} size={13} />
              </div>
              <div className="p-4">
                <pre className="post-content text-slate-200 whitespace-pre-wrap">{parsed.bestPost}</pre>
              </div>
            </div>

            {parsed.alternatives?.length > 0 && (
              <div className="rounded-xl border border-border bg-surface overflow-hidden">
                <button onClick={() => setAltExpanded(o => !o)}
                  className="w-full flex items-center justify-between px-4 py-2.5 border-b border-border hover:bg-surface-2 transition-colors">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    ✨ Alternative Versions ({parsed.alternatives.length})
                  </span>
                  {altExpanded ? <ChevronUp size={12} className="text-slate-500" /> : <ChevronDown size={12} className="text-slate-500" />}
                </button>
                {altExpanded && (
                  <div className="divide-y divide-border animate-fade-in">
                    {parsed.alternatives.map((alt, i) => (
                      <div key={i} className="p-4 group relative">
                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <CopyButton text={alt} size={13} />
                        </div>
                        <p className="text-[10px] text-slate-500 mb-2 uppercase tracking-wide font-medium">Version {i + 2}</p>
                        <pre className="post-content text-slate-300 whitespace-pre-wrap pr-8">{alt}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {parsed.whyThisWorks && (
              <div className="rounded-xl border border-border bg-surface overflow-hidden">
                <div className="flex items-center px-4 py-2.5 border-b border-border gap-2">
                  <span className="text-xs font-semibold text-slate-300">📊 Why This Works</span>
                </div>
                <div className="p-4">
                  <pre className="post-content text-slate-400 whitespace-pre-wrap text-sm">{parsed.whyThisWorks}</pre>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Single output ── */}
        {parsed?.type === 'single' && (
          <div className="card">
            <pre className="post-content text-slate-200 whitespace-pre-wrap">{parsed.content}</pre>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ── Main Generator ────────────────────────────────────────────────────────────
export default function Generator() {
  const { user, logout, updateUser } = useAuth();
  const hasUserPrefs = !!(user?.niche);

  const [mode,          setMode]          = useState('executive_mode');
  const [output,        setOutput]        = useState('');
  const [streaming,     setStreaming]     = useState(false);
  const [genError,      setGenError]      = useState(null);
  const [analyzing,     setAnalyzing]     = useState(false);
  const [analyzeStatus, setAnalyzeStatus] = useState(null);
  const [savingMsg,     setSavingMsg]     = useState('');
  const [profileOpen,   setProfileOpen]   = useState(false);
  const [styleProfile,  setStyleProfile]  = useState(null);
  const [isDemoMode,    setIsDemoMode]    = useState(!hasUserPrefs);
  const [mobileTab,     setMobileTab]     = useState('setup');
  const abortRef = useRef(null);

  const [prefs, setPrefs] = useState({
    niche:           user?.niche          || DEMO_DATA.niche,
    audience:        user?.audience       || DEMO_DATA.audience,
    goal:            user?.goal           || DEMO_DATA.goal,
    tone:            user?.tone           || 'Professional',
    hook_type:       user?.hook_type      || 'Bold statement',
    cta:             user?.cta            || 'Ask a question',
    emoji_usage:     user?.emoji_usage    || 'Minimal (1–2)',
    vocab_level:     user?.vocab_level    || 'Accessible / Mixed',
    sentence_style:  user?.sentence_style || '',
    topic:           hasUserPrefs ? '' : DEMO_DATA.topic,
    content_type:    'auto',
    content_history: '',
    comment:         '',
    input_post:      '',
  });

  const setPrefsTracked = useCallback(updater => {
    setPrefs(updater);
    setIsDemoMode(false);
  }, []);

  const clearDemo = () => {
    setPrefs(p => ({ ...p, niche: '', audience: '', goal: '', topic: '' }));
    setIsDemoMode(false);
  };

  const switchMode = newMode => {
    setMode(newMode);
    setOutput('');
    setGenError(null);
    abortRef.current?.abort();
    setStreaming(false);
  };

  const generate = useCallback(() => {
    if (streaming) { abortRef.current?.abort(); setStreaming(false); return; }

    setOutput('');
    setGenError(null);
    setStreaming(true);

    abortRef.current = streamGenerate(
      { ...prefs, mode },
      {
        onChunk: text => setOutput(prev => prev + text),
        onDone:  ()   => {
          setStreaming(false);
          if (window.innerWidth < 768) setMobileTab('output');
        },
        onError: err  => { setGenError(err); setStreaming(false); setOutput(''); },
      }
    );
  }, [prefs, mode, streaming]);

  const handleAnalyze = async posts => {
    setAnalyzing(true);
    setAnalyzeStatus(null);
    try {
      const { analysis, style_profile } = await analyzeProfile({ name: user?.name, headline: user?.headline, url: user?.profileUrl, posts });
      if (analysis) {
        const patch = {
          niche: analysis.niche || prefs.niche, audience: analysis.audience || prefs.audience,
          goal: analysis.goal || prefs.goal, tone: analysis.tone || prefs.tone,
          sentence_style: analysis.sentence_style || prefs.sentence_style,
          hook_type: analysis.hook_type || prefs.hook_type,
          emoji_usage: analysis.emoji_usage || prefs.emoji_usage,
          vocab_level: analysis.vocab_level || prefs.vocab_level,
        };
        setPrefsTracked(p => ({ ...p, ...patch }));
        updateUser(patch);
        if (style_profile?.writing_dna) {
          setStyleProfile(style_profile);
          setAnalyzeStatus({ type: 'success', message: `Style cloned ✓ — "${style_profile.writing_dna}"` });
        } else {
          setAnalyzeStatus({ type: 'success', message: 'Style analyzed! Preferences updated.' });
        }
      } else {
        setAnalyzeStatus({ type: 'error', message: 'Could not parse profile analysis. Add more post samples.' });
      }
    } catch (err) {
      setAnalyzeStatus({ type: 'error', message: err?.response?.data?.details || err?.message || 'Analysis failed' });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSavePrefs = async () => {
    await savePreferences(prefs);
    setSavingMsg('✓ Saved');
    setTimeout(() => setSavingMsg(''), 2000);
  };

  const clearOutput = () => {
    setOutput(''); setGenError(null);
    abortRef.current?.abort(); setStreaming(false);
  };

  const activeMode    = MODES.find(m => m.id === mode);
  const premiumModes  = MODES.filter(m => m.group === 'premium');
  const advancedModes = MODES.filter(m => m.group === 'advanced');
  const isExecMode    = mode === 'executive_mode';
  const isThinkMode   = mode === 'thinking_mode';

  const btnClasses = streaming
    ? 'bg-red-700 hover:bg-red-600 text-white'
    : isExecMode  ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-lg shadow-amber-500/25'
    : isThinkMode ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-500/25'
    :               'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-lg shadow-blue-500/20';

  const btnLabel = streaming
    ? <><X size={16} /> Stop</>
    : isThinkMode
      ? <><Brain size={16} /> Think Through This</>
      : <><Zap size={16} /> Generate My Post 🚀</>;

  return (
    <div className="h-screen flex flex-col bg-[#0d1117] overflow-hidden">

      {/* ── Top header ── */}
      <header className="border-b border-border px-3 sm:px-4 py-2.5 flex items-center shrink-0 gap-2">

        {/* Logo — icon only on mobile, text on sm+ */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-7 h-7 bg-li rounded-md flex items-center justify-center">
            <Zap size={14} className="text-white" />
          </div>
          <div className="hidden sm:block">
            <span className="font-bold text-white text-sm">LinkedAI</span>
            <p className="text-[9px] text-slate-500 leading-none">This AI writes LinkedIn posts in your exact style.</p>
          </div>
        </div>

        {/* Mode pills — both always visible, compact on mobile */}
        <div className="flex items-center gap-1 flex-1 justify-center">
          {premiumModes.map(m => {
            const Icon    = m.icon;
            const active  = mode === m.id;
            const isIndig = m.color === 'indigo';
            return (
              <button key={m.id} onClick={() => switchMode(m.id)} title={m.label}
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all
                  ${active
                    ? isIndig ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30' : 'bg-amber-500 text-white shadow-sm shadow-amber-500/30'
                    : isIndig ? 'text-indigo-400 hover:text-white hover:bg-indigo-500/20 border border-indigo-500/30' : 'text-amber-400 hover:text-white hover:bg-amber-500/20 border border-amber-500/30'}`}>
                <Icon size={13} />
                <span className="hidden sm:inline">{m.label}</span>
                {m.badge && <span className="text-[11px] leading-none">{m.badge}</span>}
              </button>
            );
          })}
        </div>

        {/* Right controls — More Tools + Profile, always visible */}
        <div className="flex items-center gap-1 shrink-0">
          <MoreToolsDropdown modes={advancedModes} activeMode={mode} onSelect={switchMode} />
          <div className="relative">
            <button onClick={() => setProfileOpen(o => !o)}
              className="flex items-center gap-0.5 hover:bg-surface-2 rounded-lg p-1.5 transition-colors">
              {user?.picture
                ? <img src={user.picture} alt="" className="w-7 h-7 rounded-full border-2 border-li" />
                : <div className="w-7 h-7 rounded-full bg-surface-2 border-2 border-li flex items-center justify-center text-xs font-bold text-li">{user?.name?.[0]?.toUpperCase() || '?'}</div>}
              <ChevronDown size={11} className={`text-slate-500 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
            </button>
            {profileOpen && <ProfileDropdown user={user} onLogout={logout} onClose={() => setProfileOpen(false)} />}
          </div>
        </div>
      </header>

      {/* ── Tagline strip (mobile) ── */}
      <div className="sm:hidden px-4 py-1.5 border-b border-border/40 bg-[#0d1117]">
        <p className="text-center text-[10px] text-slate-600">✦ This AI writes LinkedIn posts in your exact style ✦</p>
      </div>

      {/* ── Main layout ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Left / Setup panel */}
        <aside className={`
          w-full md:w-80 xl:w-96 shrink-0
          border-r border-border overflow-y-auto
          flex flex-col
          ${mobileTab === 'setup' ? 'flex' : 'hidden'} md:flex
          pb-20 md:pb-0
        `}>
          <div className="p-4 space-y-3 flex-1">

            {/* Mode badge + style clone status */}
            <div className="flex items-center gap-2 flex-wrap">
              <activeMode.icon size={14} className={activeMode.color === 'amber' ? 'text-amber-400' : activeMode.color === 'indigo' ? 'text-indigo-400' : 'text-li'} />
              <p className="text-sm font-semibold text-white">{activeMode.label}</p>
              <span className="text-xs text-slate-500 hidden sm:inline">— {activeMode.desc}</span>
              {styleProfile && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-violet-500/15 border border-violet-500/30 text-violet-300 rounded-full px-2 py-0.5">
                  <Brain size={9} /> Style Clone Active
                </span>
              )}
            </div>

            {/* Demo banner */}
            {isDemoMode && (
              <div className="flex items-center justify-between text-[10px] bg-blue-500/5 border border-blue-500/15 rounded-lg px-3 py-2">
                <span className="text-blue-400/80">Demo data loaded — hit Generate to see it in action</span>
                <button onClick={clearDemo} className="text-blue-400 hover:text-white font-medium ml-2 transition-colors whitespace-nowrap">Clear →</button>
              </div>
            )}

            <ProfileSection
              prefs={prefs}
              setPrefs={setPrefsTracked}
              user={user}
              onAnalyze={handleAnalyze}
              analyzing={analyzing}
              analyzeStatus={analyzeStatus}
              demoPosts={isDemoMode ? DEMO_DATA.samplePost : ''}
            />

            {mode !== 'executive_mode' && mode !== 'thinking_mode' && (
              <StyleSection prefs={prefs} setPrefs={setPrefsTracked} />
            )}

            <ContentSection prefs={prefs} setPrefs={setPrefsTracked} mode={mode} />

            {/* Desktop generate button */}
            <div className="pt-1 space-y-2 pb-4 hidden md:block">
              <button onClick={generate}
                className={`w-full font-bold py-4 rounded-xl flex items-center justify-center gap-2 text-sm transition-all duration-200 ${btnClasses}`}>
                {btnLabel}
              </button>
              <button onClick={handleSavePrefs}
                className="w-full btn-ghost text-xs py-2 flex items-center justify-center gap-1.5">
                {savingMsg ? <span className="text-green-400">{savingMsg}</span> : <><RefreshCw size={11} /> Save Preferences</>}
              </button>
            </div>

          </div>
        </aside>

        {/* Right / Output panel */}
        <main className={`
          flex-1 overflow-y-auto p-4
          flex flex-col
          ${mobileTab === 'output' ? 'flex' : 'hidden'} md:flex
          pb-24 md:pb-4
        `}>
          <OutputPanel
            output={output}
            streaming={streaming}
            error={genError}
            mode={mode}
            onClear={clearOutput}
          />
        </main>

      </div>

      {/* ── Mobile bottom nav ── */}
      <MobileBottomNav
        mobileTab={mobileTab}
        setMobileTab={setMobileTab}
        onGenerate={generate}
        streaming={streaming}
        hasOutput={!!output}
        mode={mode}
      />

    </div>
  );
}
