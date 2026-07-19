"use client";

import { useEffect, useState, useRef } from "react";

const LINES = [
  "initializing build pipeline...",
  "compiling modules............",
  "resolving dependencies.......",
  "bundling assets..............",
  "running final checks.........",
];

const GLITCH_CHARS = "!<>-_\\/[]{}—=+*^?#";

function useGlitch(text: string, active: boolean) {
  const [display, setDisplay] = useState(text);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      setDisplay(text);
      return;
    }
    let iteration = 0;
    const max = text.length * 3;

    const tick = () => {
      setDisplay(
        text
          .split("")
          .map((char, i) => {
            if (char === " ") return " ";
            if (i < iteration / 3) return text[i];
            return GLITCH_CHARS[
              Math.floor(Math.random() * GLITCH_CHARS.length)
            ];
          })
          .join(""),
      );
      iteration++;
      if (iteration < max) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(text);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [text, active]);

  return display;
}

function GlitchHeading() {
  const [hovered, setHovered] = useState(false);
  const text = "UNDER CONSTRUCTION";
  const display = useGlitch(text, hovered);

  return (
    <h1
      className="glitch-heading"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-text={text}
    >
      {display}
    </h1>
  );
}

function TerminalLog() {
  const [visibleLines, setVisibleLines] = useState<string[]>([]);
  const [currentLine, setCurrentLine] = useState(0);
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (currentLine >= LINES.length) {
      setTimeout(() => setDone(true), 400);
      return;
    }

    const line = LINES[currentLine];
    let i = 0;
    setTyped("");

    const interval = setInterval(() => {
      i++;
      setTyped(line.slice(0, i));
      if (i >= line.length) {
        clearInterval(interval);
        setTimeout(() => {
          setVisibleLines((prev) => [...prev, line]);
          setTyped("");
          setCurrentLine((c) => c + 1);
        }, 180);
      }
    }, 28);

    return () => clearInterval(interval);
  }, [currentLine]);

  return (
    <div className="terminal">
      <div className="terminal-bar">
        <span className="dot red" />
        <span className="dot yellow" />
        <span className="dot green" />
        <span className="terminal-title">build.log</span>
      </div>
      <div className="terminal-body">
        <div className="prompt-line">
          <span className="prompt">❯</span>
          <span className="cmd">npm run build</span>
        </div>
        {visibleLines.map((l, i) => (
          <div key={i} className="log-line done">
            <span className="tick">✓</span> {l}
          </div>
        ))}
        {!done && (
          <div className="log-line active">
            <span className="spinner" /> {typed}
            <span className="cursor">▋</span>
          </div>
        )}
        {done && (
          <div className="log-line success">
            <span className="tick">✦</span> awaiting deploy...
          </div>
        )}
      </div>
    </div>
  );
}

export default function UnderProgress() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTimeout(() => setMounted(true), 80);
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Serif+Display:ital@0;1&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #0a0a0f;
          color: #e2e2e6;
          font-family: 'Space Mono', monospace;
          min-height: 100vh;
          overflow-x: hidden;
        }

        .page {
          min-height: 100vh;
          min-height: 100dvh;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: clamp(1rem, 5vw, 2rem);
          position: relative;
          gap: 2rem;
          opacity: 0;
          transform: translateY(18px);
          transition: opacity 0.7s ease, transform 0.7s ease;
        }
        .page.visible {
          opacity: 1;
          transform: translateY(0);
        }

        /* Grid background */
        .page::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 40px 40px;
          pointer-events: none;
          z-index: 0;
        }

        /* Vignette */
        .page::after {
          content: '';
          position: fixed;
          inset: 0;
          background: radial-gradient(ellipse at 50% 50%, transparent 40%, #0a0a0f 100%);
          pointer-events: none;
          z-index: 0;
        }

        .content {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: clamp(1.5rem, 4vw, 2.8rem);
          width: 100%;
          max-width: min(640px, 100%);
        }

        /* Header */
        .header {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }

        .eyebrow {
          font-size: 0.65rem;
          letter-spacing: 0.35em;
          text-transform: uppercase;
          color: #6366f1;
          border: 1px solid rgba(99,102,241,0.3);
          padding: 0.3rem 0.9rem;
          border-radius: 2px;
        }

        .glitch-heading {
          font-family: 'DM Serif Display', serif;
          font-size: clamp(2.2rem, 6vw, 3.8rem);
          font-weight: 400;
          letter-spacing: -0.01em;
          color: #f4f4f5;
          cursor: default;
          position: relative;
          line-height: 1;
        }
        .glitch-heading::before,
        .glitch-heading::after {
          content: attr(data-text);
          position: absolute;
          inset: 0;
          opacity: 0;
          pointer-events: none;
        }
        .glitch-heading:hover::before {
          opacity: 0.7;
          color: #6366f1;
          clip-path: polygon(0 20%, 100% 20%, 100% 40%, 0 40%);
          transform: translateX(-3px);
          animation: glitch-slice 0.35s steps(1) infinite;
        }
        .glitch-heading:hover::after {
          opacity: 0.5;
          color: #f43f5e;
          clip-path: polygon(0 60%, 100% 60%, 100% 80%, 0 80%);
          transform: translateX(3px);
          animation: glitch-slice 0.4s steps(1) infinite reverse;
        }
        @keyframes glitch-slice {
          0%   { clip-path: polygon(0 15%, 100% 15%, 100% 35%, 0 35%); }
          25%  { clip-path: polygon(0 55%, 100% 55%, 100% 70%, 0 70%); }
          50%  { clip-path: polygon(0 5%, 100% 5%, 100% 20%, 0 20%); }
          75%  { clip-path: polygon(0 75%, 100% 75%, 100% 90%, 0 90%); }
          100% { clip-path: polygon(0 40%, 100% 40%, 100% 55%, 0 55%); }
        }

        .subtitle {
          font-size: clamp(0.68rem, 2.5vw, 0.78rem);
          color: #71717a;
          letter-spacing: 0.05em;
          max-width: min(320px, 90%);
          text-align: center;
          line-height: 1.7;
        }

        /* Terminal */
        .terminal {
          width: 100%;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 8px;
          overflow: hidden;
          background: rgba(255,255,255,0.02);
          backdrop-filter: blur(6px);
        }
        .terminal-bar {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 14px;
          background: rgba(255,255,255,0.04);
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .dot {
          width: 10px; height: 10px;
          border-radius: 50%;
        }
        .dot.red    { background: #f43f5e; }
        .dot.yellow { background: #eab308; }
        .dot.green  { background: #22c55e; }
        .terminal-title {
          margin-left: auto;
          font-size: 0.65rem;
          color: #52525b;
          letter-spacing: 0.1em;
        }
        .terminal-body {
          padding: clamp(12px, 3vw, 18px) clamp(14px, 4vw, 20px);
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-height: clamp(140px, 30vw, 180px);
        }
        .prompt-line {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
        }
        .prompt { color: #6366f1; }
        .cmd    { color: #a1a1aa; }
        .log-line {
          font-size: clamp(0.62rem, 2vw, 0.72rem);
          color: #52525b;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: color 0.2s;
        }
        .log-line.done   { color: #71717a; }
        .log-line.active { color: #a1a1aa; }
        .log-line.success{ color: #6366f1; }
        .tick { font-size: 0.7rem; }
        .log-line.done .tick   { color: #22c55e; }
        .log-line.success .tick{ color: #6366f1; }
        .cursor {
          display: inline-block;
          animation: blink 0.9s step-end infinite;
          color: #6366f1;
        }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }

        .spinner {
          display: inline-block;
          animation: spin 0.8s linear infinite;
          font-size: 0.65rem;
          color: #6366f1;
        }
        .spinner::before { content: '◌'; }
        @keyframes spin { to { transform: rotate(360deg); } }


        /* Footer */
        .footer {
          position: relative;
          z-index: 1;
          font-size: 0.58rem;
          color: #3f3f46;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }

        /* Floating orbs */
        .orb {
          position: fixed;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
          z-index: 0;
          animation: drift 18s ease-in-out infinite alternate;
        }
        .orb-1 {
          width: 320px; height: 320px;
          background: rgba(99,102,241,0.12);
          top: -80px; left: -80px;
        }
        .orb-2 {
          width: 260px; height: 260px;
          background: rgba(244,63,94,0.07);
          bottom: -60px; right: -60px;
          animation-delay: -9s;
        }
        @keyframes drift {
          from { transform: translate(0,0) scale(1); }
          to   { transform: translate(40px, 30px) scale(1.1); }
        }
      `}</style>

      <div className={`page${mounted ? " visible" : ""}`}>
        <div className="orb orb-1" />
        <div className="orb orb-2" />

        <div className="content">
          <div className="header">
            <span className="eyebrow">status · in progress</span>
            <GlitchHeading />
            <p className="subtitle">
              something is being assembled here — check back soon or watch the
              terminal below.
            </p>
          </div>

          <TerminalLog />
        </div>

        <footer className="footer">© 2025 · work in progress</footer>
      </div>
    </>
  );
}
