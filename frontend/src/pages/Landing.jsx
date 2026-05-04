import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Linkedin, Zap, ArrowRight, User, Briefcase, Globe, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const FEATURES = [
  { icon: '👑', title: 'Executive Mode',   desc: 'CEO-level strategic posts. Zero fluff. Pure authority.' },
  { icon: '🎯', title: 'Style Cloning',    desc: 'AI learns your exact tone, rhythm, and sentence patterns.' },
  { icon: '🧠', title: 'Psych Triggers',   desc: 'Every post uses proven psychological engagement hooks.' },
  { icon: '📅', title: '7-Day Calendar',   desc: 'Full content calendar generated in seconds.' },
  { icon: '🔁', title: 'Post Rewriter',    desc: 'Transform weak posts into scroll-stopping content.' },
  { icon: '⚡', title: 'Viral Hooks',      desc: '15 scroll-stopping hooks generated per topic.' },
  { icon: '💬', title: 'Smart Replies',    desc: 'Human-like comment replies that build community.' },
  { icon: '📊', title: 'Impact Score',     desc: 'Score any post and get specific improvement steps.' },
  { icon: '🎨', title: 'Style Analyzer',   desc: 'Extract your writing DNA from your own posts.' },
];

export default function Landing() {
  const { loginLinkedIn, loginManual } = useAuth();
  const navigate = useNavigate();
  const [params]  = useSearchParams();
  const authError  = params.get('auth_error');

  const [manual,  setManual]  = useState(false);
  const [form,    setForm]    = useState({ name: '', headline: '', profileUrl: '' });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(authError);

  const handleManual = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setLoading(true);
    try {
      await loginManual(form);
      navigate('/dashboard');
    } catch (err) {
      setError(err?.response?.data?.error || 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1117] flex flex-col pb-20 md:pb-0">

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-40 border-b border-border px-4 sm:px-6 py-3.5 flex items-center justify-between bg-[#0d1117]/95 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-li rounded-lg flex items-center justify-center flex-shrink-0">
            <Zap size={16} className="text-white" />
          </div>
          <div>
            <span className="font-bold text-base text-white">LinkedAI</span>
            <span className="hidden sm:inline text-xs text-slate-500 ml-2">8 AI Modes</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] sm:text-xs text-slate-500 hidden xs:block">Free Forever</span>
          <button
            onClick={() => setManual(true)}
            className="text-xs font-semibold text-white bg-li hover:bg-blue-600 px-3 py-1.5 rounded-lg transition-colors"
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-10 sm:py-16 animate-fade-in">
        <div className="inline-flex items-center gap-2 bg-surface-2 border border-border rounded-full px-4 py-1.5 text-xs text-slate-400 mb-5 sm:mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse-slow flex-shrink-0" />
          <span>Powered by Pollinations AI · Free Forever</span>
        </div>

        <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold text-center leading-tight mb-4 max-w-3xl px-2">
          LinkedIn content that sounds{' '}
          <span className="text-li">exactly like you.</span>
        </h1>
        <p className="text-slate-400 text-center text-base sm:text-lg max-w-xl mb-3 px-2">
          Not generic AI slop. Your tone. Your rhythm. Your voice — optimized for virality.
        </p>
        <p className="text-slate-500 text-center text-sm max-w-sm mb-8 px-2 sm:hidden">
          Executive Mode · Style Cloning · 8 AI Modes
        </p>

        {error && (
          <div className="mb-6 px-4 py-3 bg-red-900/30 border border-red-700/50 rounded-lg text-red-400 text-sm max-w-sm w-full text-center">
            {error === 'no_linkedin_credentials'
              ? 'LinkedIn OAuth not configured. Use manual setup below.'
              : `Auth error: ${error}`}
          </div>
        )}

        {/* ── Auth card ── */}
        {!manual ? (
          <div className="w-full max-w-sm space-y-3 px-2 sm:px-0">
            <button onClick={loginLinkedIn}
              className="w-full flex items-center justify-center gap-3 bg-li hover:bg-blue-600
                         text-white font-semibold py-4 rounded-xl transition-all duration-200
                         shadow-lg shadow-blue-900/30 hover:shadow-blue-800/40 text-sm sm:text-base min-h-[52px]">
              <Linkedin size={20} />
              Connect with LinkedIn
            </button>

            <div className="flex items-center gap-3 text-slate-600 text-xs">
              <hr className="flex-1 border-border" />
              or
              <hr className="flex-1 border-border" />
            </div>

            <button onClick={() => setManual(true)}
              className="w-full flex items-center justify-center gap-2 btn-ghost py-3.5 min-h-[48px] text-sm">
              <User size={16} />
              Set up manually — it takes 10 seconds
              <ChevronRight size={14} className="text-slate-500" />
            </button>

            <p className="text-center text-xs text-slate-600 pt-1 px-2">
              No account required · No credit card · 100% free
            </p>
          </div>
        ) : (
          <form onSubmit={handleManual} className="w-full max-w-sm card space-y-4 animate-slide-up mx-2 sm:mx-0">
            <div className="flex items-center gap-2 mb-1">
              <User size={16} className="text-li" />
              <h3 className="font-semibold text-sm">Quick Setup</h3>
              <span className="text-xs text-slate-500 ml-auto">10 seconds</span>
            </div>

            <div>
              <label className="label">Your Name *</label>
              <input className="input" placeholder="e.g. Alex Johnson"
                value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
            </div>

            <div>
              <label className="label"><Briefcase size={11} className="inline mr-1" />LinkedIn Headline</label>
              <input className="input" placeholder="e.g. Founder | SaaS Growth | 50K+ Followers"
                value={form.headline} onChange={e => setForm(p => ({ ...p, headline: e.target.value }))} />
            </div>

            <div>
              <label className="label"><Globe size={11} className="inline mr-1" />LinkedIn Profile URL</label>
              <input className="input" type="url" placeholder="https://linkedin.com/in/your-profile"
                value={form.profileUrl} onChange={e => setForm(p => ({ ...p, profileUrl: e.target.value }))} />
              <p className="text-xs text-slate-500 mt-1">Helps the AI match your personal brand.</p>
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => { setManual(false); setError(null); }}
                className="btn-ghost flex-1 py-3 text-sm min-h-[44px]">Back</button>
              <button type="submit" disabled={loading}
                className="btn-primary flex-1 py-3 text-sm flex items-center justify-center gap-2 min-h-[44px]">
                {loading
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <>Start Creating <ArrowRight size={14} /></>}
              </button>
            </div>
          </form>
        )}
      </main>

      {/* ── Features grid ── */}
      <section className="border-t border-border px-4 py-10 sm:py-12">
        <p className="text-center text-xs text-slate-500 uppercase tracking-widest mb-6 sm:mb-8">What you get</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 max-w-3xl mx-auto">
          {FEATURES.map(f => (
            <div key={f.title}
              className="flex sm:flex-col items-start gap-3 sm:gap-0 card hover:border-slate-600 transition-colors duration-200 p-3.5 sm:p-4">
              <div className="text-2xl flex-shrink-0 sm:mb-2">{f.icon}</div>
              <div className="min-w-0">
                <h4 className="font-semibold text-sm text-white mb-0.5 sm:mb-1">{f.title}</h4>
                <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border px-6 py-4 text-center text-xs text-slate-600">
        LinkedAI · Built for elite LinkedIn creators · 8 AI modes · Free forever
      </footer>

      {/* ── Mobile sticky CTA ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0d1117]/97 backdrop-blur-sm border-t border-border px-4 py-3">
        <button
          onClick={() => setManual(true)}
          className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400
                     text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2
                     shadow-lg shadow-blue-900/40 transition-all duration-200 text-sm min-h-[50px]">
          <Zap size={16} />
          Start Creating Free — No Sign-Up Needed
          <ArrowRight size={14} />
        </button>
      </div>

    </div>
  );
}
