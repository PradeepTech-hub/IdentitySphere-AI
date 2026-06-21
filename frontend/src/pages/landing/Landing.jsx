import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/* ───────────────────────────────────────────
   Canvas Particle Background (red/dark theme)
   ─────────────────────────────────────────── */
function useParticleCanvas() {
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
        this.vx = (Math.random() - 0.5) * 0.4;
        this.vy = (Math.random() - 0.5) * 0.4;
        this.r = Math.random() * 2 + 0.5;
        this.isRed = Math.random() > 0.4;
        this.opacity = Math.random() * 0.5 + 0.2;
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
          : `rgba(139,16,38,${this.opacity * 0.7})`;
        ctx.fill();
      }
    }

    resize();
    window.addEventListener('resize', resize);
    for (let i = 0; i < 120; i++) particles.push(new Particle());

    function drawConnections() {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 140) {
            const alpha = (1 - dist / 140) * 0.15;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(227,25,55,${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }
    }

    function animate() {
      ctx.clearRect(0, 0, W, H);
      drawConnections();
      particles.forEach(p => { p.update(); p.draw(); });
      animId = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return canvasRef;
}

/* ───────────────────────────────────────────
   Counter Animation Hook
   ─────────────────────────────────────────── */
function useCounterAnimation(targetRef, target, suffix = '', duration = 2000) {
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          let start = null;
          const step = ts => {
            if (!start) start = ts;
            const progress = Math.min((ts - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.floor(eased * target).toLocaleString() + suffix;
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
          observer.disconnect();
        }
      });
    }, { threshold: 0.3 });

    observer.observe(el);
    return () => observer.disconnect();
  }, [targetRef, target, suffix, duration]);
}

function StatCounter({ target, suffix, label, color }) {
  const ref = useRef(null);
  useCounterAnimation(ref, target, suffix);
  return (
    <div className="rounded-2xl py-7 px-5 text-center transition-all duration-300 hover:-translate-y-1"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(227,25,55,0.12)',
        boxShadow: '0 4px 30px rgba(0,0,0,0.3)',
      }}>
      <div ref={ref} className="font-orbitron text-3xl font-black mb-1.5" style={{ color }}>0</div>
      <div className="text-xs text-white/50 tracking-wide">{label}</div>
    </div>
  );
}

/* ───────────────────────────────────────────
   SVG Icons
   ─────────────────────────────────────────── */
function NetworkIcon() {
  return (
    <svg className="network-svg" width="40" height="40" viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="5" fill="#3b82f6" />
      <circle cx="10" cy="20" r="4" fill="#60a5fa" />
      <circle cx="54" cy="16" r="3.5" fill="#60a5fa" />
      <circle cx="12" cy="50" r="3.5" fill="#60a5fa" />
      <circle cx="52" cy="48" r="4" fill="#60a5fa" />
      <line x1="32" y1="32" x2="10" y2="20" stroke="#3b82f6" strokeWidth="1.5" strokeOpacity="0.7" />
      <line x1="32" y1="32" x2="54" y2="16" stroke="#3b82f6" strokeWidth="1.5" strokeOpacity="0.7" />
      <line x1="32" y1="32" x2="12" y2="50" stroke="#3b82f6" strokeWidth="1.5" strokeOpacity="0.7" />
      <line x1="32" y1="32" x2="52" y2="48" stroke="#3b82f6" strokeWidth="1.5" strokeOpacity="0.7" />
      <circle cx="32" cy="32" r="14" stroke="#3b82f6" strokeWidth="0.7" strokeOpacity="0.35" fill="none" />
      <circle cx="32" cy="32" r="22" stroke="#3b82f6" strokeWidth="0.5" strokeOpacity="0.18" fill="none" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 64 64" fill="none">
      <path className="shield-outer" d="M32 6L10 16v16c0 14 12 22 22 26 10-4 22-12 22-26V16L32 6z"
        stroke="#E31937" strokeWidth="2.5" fill="rgba(227,25,55,0.08)" />
      <path d="M32 10L14 18v14c0 11.5 10 18.5 18 22 8-3.5 18-10.5 18-22V18L32 10z"
        stroke="#E31937" strokeWidth="1" strokeOpacity="0.4" fill="none" />
      <rect x="26" y="32" width="12" height="10" rx="2" fill="#E31937" opacity="0.85" />
      <path d="M28 32v-3a4 4 0 018 0v3" stroke="#E31937" strokeWidth="2" fill="none" />
      <circle cx="32" cy="37" r="1.5" fill="#fff" />
    </svg>
  );
}

function AttackIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 64 64" fill="none">
      <circle cx="8" cy="32" r="5" fill="#C1122F" />
      <circle cx="56" cy="32" r="5" fill="#E31937" />
      <path className="atk-line" d="M13 32 Q24 10 32 20 Q40 30 51 32" stroke="#FF3355" strokeWidth="2" fill="none" />
      <path className="atk-line" d="M13 32 Q24 54 32 44 Q40 34 51 32" stroke="#E31937" strokeWidth="1.5" fill="none" />
      <path className="atk-line" d="M13 32 L51 32" stroke="#FF3355" strokeWidth="1.2" fill="none" />
      <polygon points="51,28 58,32 51,36" fill="#E31937" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 64 64" fill="none">
      <g className="gear-icon">
        <path d="M32 20a12 12 0 100 24 12 12 0 000-24z" stroke="#3b82f6" strokeWidth="2" fill="rgba(59,130,246,0.1)" />
        <path d="M32 14v4M32 46v4M18.3 18.3l2.8 2.8M42.9 42.9l2.8 2.8M14 32h4M46 32h4M18.3 45.7l2.8-2.8M42.9 21.1l2.8-2.8"
          stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="32" cy="32" r="4" fill="#3b82f6" />
      </g>
      <circle className="spark" cx="46" cy="18" r="2" fill="#60a5fa" style={{ '--tx': '8px', '--ty': '-12px' }} />
      <circle className="spark" cx="50" cy="24" r="1.5" fill="#93c5fd" style={{ '--tx': '10px', '--ty': '-8px' }} />
      <circle className="spark" cx="48" cy="14" r="1.5" fill="#bfdbfe" style={{ '--tx': '6px', '--ty': '-14px' }} />
      <circle className="spark" cx="52" cy="20" r="1" fill="#60a5fa" style={{ '--tx': '12px', '--ty': '-10px' }} />
      <circle className="spark" cx="44" cy="16" r="1" fill="#93c5fd" style={{ '--tx': '4px', '--ty': '-16px' }} />
    </svg>
  );
}

/* ───────────────────────────────────────────
   Feature Cards Config
   ─────────────────────────────────────────── */
const FEATURES = [
  {
    Icon: NetworkIcon,
    title: 'Detect Identity Sprawl',
    desc: 'Real-time network graph analysis identifies orphaned accounts, duplicate identities, and over-provisioned access across your entire enterprise ecosystem.',
    tag: 'NETWORK INTELLIGENCE',
    cardBg: 'rgba(8,10,24,0.75)',
    borderColor: 'rgba(59,130,246,0.25)',
    hoverShadow: '0 0 60px rgba(59,130,246,0.22), 0 20px 60px rgba(0,0,0,0.5)',
    glowBg: 'radial-gradient(circle at 50% 110%, rgba(59,130,246,0.18) 0%, transparent 65%)',
    iconBg: 'rgba(59,130,246,0.12)',
    iconBorder: 'rgba(59,130,246,0.35)',
    tagBg: 'rgba(59,130,246,0.15)',
    tagColor: '#60a5fa',
    tagBorder: 'rgba(59,130,246,0.3)',
  },
  {
    Icon: ShieldIcon,
    title: 'Prevent Privileged Access Abuse',
    desc: 'AI-driven behavioral analytics continuously monitors privileged accounts, flagging anomalous access patterns before they escalate to critical breaches.',
    tag: 'THREAT PREVENTION',
    cardBg: 'rgba(15,5,8,0.78)',
    borderColor: 'rgba(227,25,55,0.22)',
    hoverShadow: '0 0 60px rgba(227,25,55,0.28), 0 20px 60px rgba(0,0,0,0.5)',
    glowBg: 'radial-gradient(circle at 50% 110%, rgba(227,25,55,0.15) 0%, transparent 65%)',
    iconBg: 'rgba(227,25,55,0.1)',
    iconBorder: 'rgba(227,25,55,0.35)',
    tagBg: 'rgba(227,25,55,0.12)',
    tagColor: '#FF3355',
    tagBorder: 'rgba(227,25,55,0.3)',
  },
  {
    Icon: AttackIcon,
    title: 'Simulate Attack Paths',
    desc: 'Advanced adversarial simulation maps lateral movement routes and credential-based attack chains, exposing hidden vulnerabilities before attackers do.',
    tag: 'RED TEAM AI',
    cardBg: 'rgba(15,5,10,0.78)',
    borderColor: 'rgba(193,18,47,0.30)',
    hoverShadow: '0 0 60px rgba(193,18,47,0.28), 0 20px 60px rgba(0,0,0,0.5)',
    glowBg: 'radial-gradient(circle at 50% 110%, rgba(193,18,47,0.18) 0%, transparent 65%)',
    iconBg: 'rgba(193,18,47,0.12)',
    iconBorder: 'rgba(193,18,47,0.38)',
    tagBg: 'rgba(193,18,47,0.14)',
    tagColor: '#FF3355',
    tagBorder: 'rgba(193,18,47,0.35)',
  },
  {
    Icon: GearIcon,
    title: 'Automate Governance',
    desc: 'Policy-driven automation enforces access certifications, SoD controls, and regulatory compliance workflows across hybrid multi-cloud environments continuously.',
    tag: 'POLICY AUTOMATION',
    cardBg: 'rgba(5,10,24,0.78)',
    borderColor: 'rgba(59,130,246,0.28)',
    hoverShadow: '0 0 60px rgba(59,130,246,0.26), 0 20px 60px rgba(0,0,0,0.5)',
    glowBg: 'radial-gradient(circle at 50% 110%, rgba(59,130,246,0.2) 0%, transparent 65%)',
    iconBg: 'rgba(59,130,246,0.1)',
    iconBorder: 'rgba(59,130,246,0.32)',
    tagBg: 'rgba(59,130,246,0.12)',
    tagColor: '#93c5fd',
    tagBorder: 'rgba(59,130,246,0.28)',
  },
];

const TRUST_ITEMS = [
  { label: 'Global Bank', icon: <svg viewBox="0 0 28 28" fill="none"><rect x="2" y="2" width="24" height="24" rx="6" stroke="currentColor" strokeWidth="1.5"/><path d="M8 14h12M14 8v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
  { label: 'Fintech Corp', icon: <svg viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="12" stroke="currentColor" strokeWidth="1.5"/><path d="M14 6v8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
  { label: 'SecureOps', icon: <svg viewBox="0 0 28 28" fill="none"><path d="M14 3L4 8v6c0 5.5 4.3 10.7 10 12 5.7-1.3 10-6.5 10-12V8L14 3z" stroke="currentColor" strokeWidth="1.5"/></svg> },
  { label: 'PrivateBank', icon: <svg viewBox="0 0 28 28" fill="none"><rect x="4" y="6" width="20" height="16" rx="3" stroke="currentColor" strokeWidth="1.5"/><path d="M4 10h20" stroke="currentColor" strokeWidth="1.5"/></svg> },
  { label: 'InfraSec', icon: <svg viewBox="0 0 28 28" fill="none"><polygon points="14,3 25,9.5 25,20.5 14,27 3,20.5 3,9.5" stroke="currentColor" strokeWidth="1.5" fill="none"/><circle cx="14" cy="14" r="4" stroke="currentColor" strokeWidth="1.5"/></svg> },
];

/* ───────────────────────────────────────────
   Landing Component
   ─────────────────────────────────────────── */
export default function Landing() {
  const nav = useNavigate();
  const canvasRef = useParticleCanvas();
  const heroCardRef = useRef(null);
  const [hoveredFeature, setHoveredFeature] = useState(null);

  /* Mouse-tracking 3D tilt on hero card */
  const handleMouseMove = useCallback((e) => {
    if (!heroCardRef.current) return;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const rx = (e.clientY - cy) / cy * -8;
    const ry = (e.clientX - cx) / cx * 8;
    heroCardRef.current.style.transform = `translateY(-10px) rotateX(${rx}deg) rotateY(${ry}deg)`;
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (heroCardRef.current) heroCardRef.current.style.transform = '';
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [handleMouseMove, handleMouseLeave]);

  return (
    <div className="min-h-screen overflow-hidden" style={{ background: '#05060d', fontFamily: "'Inter', sans-serif" }}>
      {/* Particle Canvas */}
      <canvas ref={canvasRef} style={{
        position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none',
      }} />

      {/* BG Overlay - red radial glow */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 50% 20%, rgba(227,25,55,0.06) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(139,16,38,0.04) 0%, transparent 50%)',
      }} />

      {/* Page Wrap */}
      <div className="relative z-10 min-h-screen flex flex-col">

        {/* ─── NAVIGATION ─── */}
        <nav className="flex items-center justify-between px-6 md:px-12 py-4 sticky top-0 z-[100]"
          style={{
            background: 'rgba(5,6,13,0.65)',
            backdropFilter: 'blur(18px)',
            borderBottom: '1px solid rgba(227,25,55,0.18)',
          }}>
          <div className="flex items-center gap-3.5">
            <div className="flex items-center rounded-xl px-3 py-1.5"
              style={{
                background: 'linear-gradient(135deg, #C1122F 0%, #E31937 100%)',
                boxShadow: '0 0 0 1px rgba(227,25,55,0.35), 0 4px 20px rgba(227,25,55,0.25), 0 0 30px rgba(227,25,55,0.12)',
              }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M12 2L3 7v5c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z" />
              </svg>
              <span className="ml-2 text-white font-bold text-sm tracking-wide">IS</span>
            </div>
            <span className="font-bold text-white text-sm tracking-wide hidden sm:inline" style={{ fontFamily: "'Orbitron', sans-serif" }}>
              IdentitySphere AI
            </span>
          </div>

          <span className="hidden md:inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold tracking-wider text-white/70"
            style={{ background: 'rgba(227,25,55,0.12)', border: '1px solid rgba(227,25,55,0.3)' }}>
            <span className="w-2 h-2 rounded-full animate-blink" style={{ background: '#E31937' }} />
            LIVE THREAT MONITORING
          </span>

          <button onClick={() => nav('/login')}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer border-none transition-all duration-200 hover:opacity-90"
            style={{
              background: 'linear-gradient(135deg, #C1122F, #E31937)',
              boxShadow: '0 0 20px rgba(227,25,55,0.25)',
            }}>
            Sign In
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </nav>

        {/* ─── HERO ─── */}
        <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20" style={{ perspective: '1200px' }}>
          <div
            ref={heroCardRef}
            className="relative w-full max-w-[780px] rounded-[28px] px-6 sm:px-12 py-14 sm:py-16 transition-transform duration-200"
            style={{
              background: 'rgba(5,6,13,0.6)',
              backdropFilter: 'blur(22px)',
              border: '1px solid rgba(227,25,55,0.25)',
              boxShadow: '0 0 60px rgba(227,25,55,0.15), 0 0 120px rgba(139,16,38,0.08), inset 0 1px 0 rgba(255,255,255,0.08)',
              animation: 'float3d 6s ease-in-out infinite',
            }}>
            {/* Corner decorators */}
            <div style={{
              position: 'absolute', top: -1, left: -1, width: 40, height: 40,
              borderTop: '3px solid #E31937', borderLeft: '3px solid #E31937', borderTopLeftRadius: 10,
            }} />
            <div style={{
              position: 'absolute', bottom: -1, right: -1, width: 40, height: 40,
              borderBottom: '3px solid #E31937', borderRight: '3px solid #E31937', borderBottomRightRadius: 10,
            }} />

            {/* Scan line */}
            <div className="scan-line" />

            {/* Badge */}
            <div className="badge-pulse inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold tracking-wider uppercase text-white/85 mb-7"
              style={{ background: 'rgba(227,25,55,0.15)', border: '1px solid rgba(227,25,55,0.4)' }}>
              <span className="w-2 h-2 rounded-full animate-blink" style={{ background: '#E31937' }} />
              AI-Powered Identity Intelligence
            </div>

            {/* Title */}
            <h1 className="font-orbitron font-black text-white mb-5 leading-none"
              style={{
                fontSize: 'clamp(2.4rem, 6vw, 4.4rem)',
                textShadow: '0 0 40px rgba(227,25,55,0.6), 0 0 80px rgba(227,25,55,0.25), 0 2px 0 rgba(0,0,0,0.8)',
                animation: 'titleReveal 0.8s cubic-bezier(0.22,1,0.36,1) both',
              }}>
              Identity<span className="sphere-icon" />Sphere AI
            </h1>

            {/* Tagline */}
            <p className="text-white/70 tracking-wide mb-10"
              style={{
                fontSize: 'clamp(0.95rem, 2.2vw, 1.2rem)',
                animation: 'titleReveal 0.8s cubic-bezier(0.22,1,0.36,1) 0.15s both',
              }}>
              <span style={{ color: '#FF3355', fontWeight: 600 }}>AI-Powered</span> Identity Intelligence Platform
            </p>

            {/* CTA Buttons */}
            <div className="flex gap-4 justify-center flex-wrap"
              style={{ animation: 'titleReveal 0.8s cubic-bezier(0.22,1,0.36,1) 0.3s both' }}>
              <button onClick={() => nav('/login')}
                className="inline-flex items-center gap-2.5 px-9 py-4 rounded-xl font-bold text-white cursor-pointer border-none transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.03]"
                style={{
                  background: 'linear-gradient(135deg, #C1122F 0%, #E31937 50%, #FF3355 100%)',
                  boxShadow: '0 0 0 1px rgba(227,25,55,0.4), 0 8px 32px rgba(227,25,55,0.45)',
                  fontFamily: "'Inter', sans-serif",
                }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" /><path d="M12 8l4 4-4 4M8 12h8" />
                </svg>
                Get Started
              </button>
              <button onClick={() => window.open('https://youtu.be/demo-video-link', '_blank')}
                className="inline-flex items-center gap-2.5 px-9 py-4 rounded-xl font-bold cursor-pointer border-none transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.03]"
                style={{
                  background: 'rgba(255,255,255,0.95)',
                  color: '#111',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                  fontFamily: "'Inter', sans-serif",
                }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
                Demo Video
              </button>
            </div>
          </div>
        </section>

        {/* ─── FEATURES ─── */}
        <section className="px-6 py-16 max-w-[1280px] mx-auto w-full">
          <p className="text-center text-xs font-bold tracking-[0.18em] uppercase mb-2.5" style={{ color: '#E31937' }}>
            Core Capabilities
          </p>
          <h2 className="text-center font-extrabold text-white mb-14" style={{ fontSize: 'clamp(1.5rem, 3vw, 2.1rem)' }}>
            Enterprise-Grade Identity Security
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-7">
            {FEATURES.map((f, i) => (
              <div key={i}
                className="relative rounded-[20px] p-8 overflow-hidden cursor-default transition-all duration-300 hover:-translate-y-2.5 hover:scale-[1.02]"
                style={{
                  background: f.cardBg,
                  backdropFilter: 'blur(20px)',
                  border: `1px solid ${hoveredFeature === i ? f.tagColor : f.borderColor}`,
                  boxShadow: hoveredFeature === i ? f.hoverShadow : '0 4px 30px rgba(0,0,0,0.3)',
                  animation: `cardIn 0.7s cubic-bezier(0.22,1,0.36,1) ${0.1 + i * 0.15}s both`,
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={() => setHoveredFeature(i)}
                onMouseLeave={() => setHoveredFeature(null)}>
                {/* Glow background */}
                <div className="absolute inset-0 pointer-events-none" style={{ background: f.glowBg }} />

                {/* Icon */}
                <div className="relative w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                  style={{ background: f.iconBg, border: `1.5px solid ${f.iconBorder}` }}>
                  <f.Icon />
                </div>

                <div className="relative">
                  <h3 className="text-[1.08rem] font-bold text-white mb-2.5">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-white/60">{f.desc}</p>
                  <span className="inline-block mt-4 px-3 py-1 rounded-full text-[0.72rem] font-bold tracking-wide uppercase"
                    style={{ background: f.tagBg, color: f.tagColor, border: `1px solid ${f.tagBorder}` }}>
                    {f.tag}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── STATS ROW ─── */}
        <section className="max-w-[1100px] mx-auto mb-16 px-6 w-full">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCounter target={2400000} suffix="+" label="Identities Scanned" color="#E31937" />
            <StatCounter target={99800} suffix="+" label="Threats Blocked" color="#FF3355" />
            <StatCounter target={99} suffix="%" label="Compliance Score" color="#22c55e" />
            <StatCounter target={12500} suffix="+" label="Policies Automated" color="#f59e0b" />
          </div>
        </section>

        {/* ─── TRUST BAR ─── */}
        <div className="text-center px-6 py-9">
          <div className="w-[120px] h-px mx-auto mb-5"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(227,25,55,0.6), transparent)' }} />
          <p className="text-xs font-semibold tracking-[0.22em] uppercase text-white/55 mb-5">
            Trusted By Enterprise Security Teams
          </p>
          <div className="flex justify-center items-center gap-10 flex-wrap">
            {TRUST_ITEMS.map((t, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5 opacity-45 hover:opacity-[0.85] transition-opacity text-xs font-semibold tracking-wide uppercase text-white/60">
                <div className="w-7 h-7">{t.icon}</div>
                {t.label}
              </div>
            ))}
          </div>
        </div>

        {/* ─── FOOTER ─── */}
        <footer className="text-center py-5 text-xs text-white/25 tracking-wide"
          style={{ borderTop: '1px solid rgba(227,25,55,0.1)' }}>
          IdentitySphere AI - AI-Powered Identity Intelligence Platform
        </footer>
      </div>
    </div>
  );
}
