import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const DEMO_ACCOUNTS = [
  {
    email: 'admin@identitysphere.ai',
    label: 'Security Admin (Pradeep M)',
    desc: 'Full access - detect, investigate, remediate',
    gradient: 'linear-gradient(135deg, #C1122F, #E31937)',
    iconBg: 'rgba(227,25,55,0.15)',
    iconBorder: 'rgba(227,25,55,0.3)',
    hoverBorder: 'rgba(227,25,55,0.4)',
  },
  {
    email: 'employee@identitysphere.ai',
    label: 'Employee (Rahul Sharma)',
    desc: 'Request access, view my permissions',
    gradient: 'linear-gradient(135deg, #0ea5e9, #38bdf8)',
    iconBg: 'rgba(14,165,233,0.15)',
    iconBorder: 'rgba(14,165,233,0.3)',
    hoverBorder: 'rgba(14,165,233,0.4)',
  },
  {
    email: 'auditor@identitysphere.ai',
    label: 'Compliance Auditor (Kavya R)',
    desc: 'Read-only - compliance, evidence, reports',
    gradient: 'linear-gradient(135deg, #6366f1, #818cf8)',
    iconBg: 'rgba(99,102,241,0.15)',
    iconBorder: 'rgba(99,102,241,0.3)',
    hoverBorder: 'rgba(99,102,241,0.4)',
  },
  {
    email: 'executive@identitysphere.ai',
    label: 'Executive (Deepak Hegde)',
    desc: 'Business view - risk posture, trends',
    gradient: 'linear-gradient(135deg, #d97706, #f59e0b)',
    iconBg: 'rgba(245,158,11,0.15)',
    iconBorder: 'rgba(245,158,11,0.3)',
    hoverBorder: 'rgba(245,158,11,0.4)',
  },
  {
    email: 'contractor@identitysphere.ai',
    label: 'Contractor (Carlos Ruiz)',
    desc: 'Limited access - assigned systems only',
    gradient: 'linear-gradient(135deg, #ea580c, #f97316)',
    iconBg: 'rgba(249,115,22,0.15)',
    iconBorder: 'rgba(249,115,22,0.3)',
    hoverBorder: 'rgba(249,115,22,0.4)',
  },
];

const ROLE_ROUTES = {
  admin: '/admin',
  auditor: '/auditor',
  employee: '/employee',
  executive: '/executive',
  contractor: '/contractor',
};

/* ───────────────────────────────────────────
   Lighter Particle Background for Login
   ─────────────────────────────────────────── */
function ParticleBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, animId;
    const particles = [];

    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    }

    class Particle {
      constructor() { this.reset(); }
      reset() {
        this.x = Math.random() * W;
        this.y = Math.random() * H;
        this.vx = (Math.random() - 0.5) * 0.3;
        this.vy = (Math.random() - 0.5) * 0.3;
        this.r = Math.random() * 1.5 + 0.5;
        this.isRed = Math.random() > 0.4;
        this.opacity = Math.random() * 0.35 + 0.08;
      }
      update() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < 0 || this.x > W || this.y < 0 || this.y > H) this.reset();
      }
      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fillStyle = this.isRed
          ? `rgba(227,25,55,${this.opacity})`
          : `rgba(139,16,38,${this.opacity * 0.6})`;
        ctx.fill();
      }
    }

    resize();
    window.addEventListener('resize', resize);
    for (let i = 0; i < 50; i++) particles.push(new Particle());

    function animate() {
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(227,25,55,${(1 - dist / 120) * 0.08})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      particles.forEach(p => { p.update(); p.draw(); });
      animId = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none" />;
}

/* ───────────────────────────────────────────
   Login Component
   ─────────────────────────────────────────── */
export default function Login() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const nav = useNavigate();

  const handleLogin = (e) => {
    e?.preventDefault?.();
    const target = typeof e === 'string' ? e : email;
    if (login(target)) {
      const role = target.split('@')[0];
      nav(ROLE_ROUTES[role] || '/admin');
    } else setError('Invalid credentials');
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: '#05060d' }}>
      <ParticleBackground />

      {/* BG gradient overlay - red tinted */}
      <div className="fixed inset-0 z-1"
        style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(227,25,55,0.06) 0%, transparent 60%)' }} />

      <div className="relative z-10 w-full max-w-md px-6"
        style={{ animation: 'titleReveal 0.6s cubic-bezier(0.22,1,0.36,1) both' }}>

        {/* Main card */}
        <div className="rounded-3xl p-8 relative overflow-hidden"
          style={{
            background: 'rgba(5,6,13,0.7)',
            backdropFilter: 'blur(22px)',
            border: '1px solid rgba(227,25,55,0.18)',
            boxShadow: '0 0 60px rgba(227,25,55,0.08), 0 30px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}>

          {/* Corner decorators - red */}
          <div style={{
            position: 'absolute', top: -1, left: -1, width: 32, height: 32,
            borderTop: '2px solid rgba(227,25,55,0.5)', borderLeft: '2px solid rgba(227,25,55,0.5)',
            borderTopLeftRadius: 8,
          }} />
          <div style={{
            position: 'absolute', bottom: -1, right: -1, width: 32, height: 32,
            borderBottom: '2px solid rgba(227,25,55,0.5)', borderRight: '2px solid rgba(227,25,55,0.5)',
            borderBottomRightRadius: 8,
          }} />
          <div style={{
            position: 'absolute', top: -1, right: -1, width: 32, height: 32,
            borderTop: '2px solid rgba(227,25,55,0.25)', borderRight: '2px solid rgba(227,25,55,0.25)',
            borderTopRightRadius: 8,
          }} />
          <div style={{
            position: 'absolute', bottom: -1, left: -1, width: 32, height: 32,
            borderBottom: '2px solid rgba(227,25,55,0.25)', borderLeft: '2px solid rgba(227,25,55,0.25)',
            borderBottomLeftRadius: 8,
          }} />

          {/* Header */}
          <div className="text-center mb-8">
            {/* Shield icon with red gradient */}
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{
                background: 'linear-gradient(135deg, #8B1026 0%, #C1122F 40%, #E31937 100%)',
                boxShadow: '0 0 30px rgba(227,25,55,0.4), 0 8px 20px rgba(193,18,47,0.3)',
              }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M12 2L3 7v5c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white" style={{
              textShadow: '0 0 20px rgba(227,25,55,0.3)',
            }}>IdentitySphere AI</h1>
            <p className="text-sm mt-1" style={{ color: '#8B949E' }}>Identity Access Gateway</p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="mb-6">
            <div className="relative">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.3)' }}>
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              <input
                type="email" value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                placeholder="Enter email address"
                className="w-full pl-11 pr-4 py-3 rounded-xl text-sm text-white placeholder-white/30 outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(227,25,55,0.18)',
                }}
                onFocus={e => {
                  e.target.style.borderColor = 'rgba(227,25,55,0.5)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(227,25,55,0.1)';
                }}
                onBlur={e => {
                  e.target.style.borderColor = 'rgba(227,25,55,0.18)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>
            {error && (
              <p className="flex items-center gap-1.5 text-xs mt-2" style={{ color: '#ef4444' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </p>
            )}
            <button type="submit"
              className="w-full mt-4 py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200 hover:opacity-90 cursor-pointer border-none"
              style={{
                background: 'linear-gradient(135deg, #8B1026 0%, #C1122F 40%, #E31937 80%, #FF3355 100%)',
                boxShadow: '0 0 0 1px rgba(227,25,55,0.3), 0 8px 24px rgba(227,25,55,0.35)',
              }}>
              Sign In
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </form>

          {/* Quick Access */}
          <div className="space-y-2.5">
            <p className="text-[10px] uppercase tracking-[0.2em] text-center mb-3 font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Quick Access
            </p>
            {DEMO_ACCOUNTS.map(a => (
              <button key={a.email} onClick={() => handleLogin(a.email)}
                className="w-full flex items-center gap-3 p-3 rounded-xl text-left cursor-pointer border-none transition-all duration-200 hover:-translate-y-0.5"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                  e.currentTarget.style.borderColor = a.hoverBorder;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: a.gradient }}>
                  <span className="text-white text-xs font-bold">{a.label[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white/80">{a.label}</p>
                  <p className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>{a.desc}</p>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
