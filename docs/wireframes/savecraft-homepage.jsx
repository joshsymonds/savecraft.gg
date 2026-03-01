import { useState, useEffect, useRef } from "react";

const PIXEL_FONT = "'Press Start 2P', monospace";
const BODY_FONT = "'VT323', monospace";

// FF-style blue gradient panel component
function Panel({ children, className = "", gold = false, hover = false, style = {} }) {
  return (
    <div
      className={`relative ${className}`}
      style={{
        background: gold
          ? "linear-gradient(135deg, #1a1508 0%, #2a2010 50%, #1a1508 100%)"
          : "linear-gradient(135deg, #0a0e2e 0%, #111b47 50%, #0a0e2e 100%)",
        border: gold ? "2px solid #c8a84e" : "2px solid #4a5aad",
        borderRadius: "4px",
        boxShadow: gold
          ? "inset 0 0 20px rgba(200, 168, 78, 0.1), 0 0 15px rgba(200, 168, 78, 0.15)"
          : "inset 0 0 30px rgba(30, 40, 100, 0.3), 0 0 15px rgba(74, 90, 173, 0.15)",
        transition: hover ? "all 0.3s ease" : "none",
        ...style,
      }}
      onMouseEnter={(e) => {
        if (hover) {
          e.currentTarget.style.borderColor = gold ? "#e8c86e" : "#7a8aed";
          e.currentTarget.style.boxShadow = gold
            ? "inset 0 0 20px rgba(200, 168, 78, 0.2), 0 0 25px rgba(200, 168, 78, 0.25)"
            : "inset 0 0 30px rgba(30, 40, 100, 0.4), 0 0 25px rgba(74, 90, 173, 0.3)";
        }
      }}
      onMouseLeave={(e) => {
        if (hover) {
          e.currentTarget.style.borderColor = gold ? "#c8a84e" : "#4a5aad";
          e.currentTarget.style.boxShadow = gold
            ? "inset 0 0 20px rgba(200, 168, 78, 0.1), 0 0 15px rgba(200, 168, 78, 0.15)"
            : "inset 0 0 30px rgba(30, 40, 100, 0.3), 0 0 15px rgba(74, 90, 173, 0.15)";
        }
      }}
    >
      {/* Corner decorations */}
      <div style={{
        position: "absolute", top: "-1px", left: "-1px", width: "8px", height: "8px",
        borderTop: `2px solid ${gold ? "#e8c86e" : "#7a8aed"}`,
        borderLeft: `2px solid ${gold ? "#e8c86e" : "#7a8aed"}`,
      }} />
      <div style={{
        position: "absolute", top: "-1px", right: "-1px", width: "8px", height: "8px",
        borderTop: `2px solid ${gold ? "#e8c86e" : "#7a8aed"}`,
        borderRight: `2px solid ${gold ? "#e8c86e" : "#7a8aed"}`,
      }} />
      <div style={{
        position: "absolute", bottom: "-1px", left: "-1px", width: "8px", height: "8px",
        borderBottom: `2px solid ${gold ? "#e8c86e" : "#7a8aed"}`,
        borderLeft: `2px solid ${gold ? "#e8c86e" : "#7a8aed"}`,
      }} />
      <div style={{
        position: "absolute", bottom: "-1px", right: "-1px", width: "8px", height: "8px",
        borderBottom: `2px solid ${gold ? "#e8c86e" : "#7a8aed"}`,
        borderRight: `2px solid ${gold ? "#e8c86e" : "#7a8aed"}`,
      }} />
      {children}
    </div>
  );
}

// Blinking cursor for the typing effect
function Cursor() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const interval = setInterval(() => setVisible((v) => !v), 530);
    return () => clearInterval(interval);
  }, []);
  return (
    <span style={{ 
      opacity: visible ? 1 : 0, 
      color: "#c8a84e",
      fontFamily: BODY_FONT,
      fontSize: "24px",
      marginLeft: "2px",
    }}>▌</span>
  );
}

// Typing text effect
function TypeWriter({ text, delay = 0, speed = 40, onComplete, style = {} }) {
  const [displayed, setDisplayed] = useState("");
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(timeout);
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    if (displayed.length < text.length) {
      const timeout = setTimeout(() => {
        setDisplayed(text.slice(0, displayed.length + 1));
      }, speed);
      return () => clearTimeout(timeout);
    } else {
      setDone(true);
      onComplete?.();
    }
  }, [started, displayed, text, speed, onComplete]);

  return (
    <span style={style}>
      {displayed}
      {started && !done && <Cursor />}
    </span>
  );
}

// Animated stat bar
function StatBar({ label, value, max, color = "#4a9aea", delay = 0 }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const timeout = setTimeout(() => setWidth((value / max) * 100), delay);
    return () => clearTimeout(timeout);
  }, [value, max, delay]);
  
  return (
    <div style={{ marginBottom: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
        <span style={{ fontFamily: BODY_FONT, fontSize: "18px", color: "#b8c4e8" }}>{label}</span>
        <span style={{ fontFamily: BODY_FONT, fontSize: "18px", color }}>
          {value}/{max}
        </span>
      </div>
      <div style={{ 
        height: "8px", 
        background: "rgba(10, 14, 46, 0.8)", 
        borderRadius: "2px",
        border: "1px solid rgba(74, 90, 173, 0.3)",
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${width}%`,
          background: `linear-gradient(90deg, ${color}, ${color}cc)`,
          borderRadius: "1px",
          transition: "width 1.5s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: `0 0 8px ${color}66`,
        }} />
      </div>
    </div>
  );
}

// Floating pixel particles
function Particles() {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 8,
    duration: 6 + Math.random() * 8,
    size: 2 + Math.random() * 3,
    opacity: 0.15 + Math.random() * 0.25,
  }));

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            bottom: "-10px",
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: "#c8a84e",
            opacity: p.opacity,
            animation: `floatUp ${p.duration}s ${p.delay}s linear infinite`,
            imageRendering: "pixelated",
          }}
        />
      ))}
      <style>{`
        @keyframes floatUp {
          0% { transform: translateY(0) translateX(0); opacity: 0; }
          10% { opacity: var(--particle-opacity, 0.2); }
          90% { opacity: var(--particle-opacity, 0.2); }
          100% { transform: translateY(-110vh) translateX(${Math.random() > 0.5 ? '' : '-'}30px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// Scanline overlay
function Scanlines() {
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      pointerEvents: "none",
      zIndex: 1000,
      background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
      mixBlendMode: "multiply",
    }} />
  );
}

// Menu selector arrow
function MenuArrow({ active }) {
  return (
    <span style={{
      display: "inline-block",
      width: "16px",
      fontFamily: PIXEL_FONT,
      fontSize: "10px",
      color: "#c8a84e",
      opacity: active ? 1 : 0,
      transition: "opacity 0.2s",
      marginRight: "8px",
      animation: active ? "menuBlink 1s step-end infinite" : "none",
    }}>
      ▶
    </span>
  );
}

// Game support card
function GameCard({ name, format, status, statusColor, icon, delay = 0 }) {
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
        transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Panel hover>
        <div style={{ padding: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
            <span style={{ fontSize: "28px", imageRendering: "pixelated" }}>{icon}</span>
            <div>
              <div style={{ fontFamily: PIXEL_FONT, fontSize: "9px", color: "#e8e0d0", lineHeight: "1.6" }}>{name}</div>
              <div style={{ fontFamily: BODY_FONT, fontSize: "16px", color: "#8890b8", marginTop: "2px" }}>{format}</div>
            </div>
          </div>
          <div style={{
            display: "inline-block",
            fontFamily: BODY_FONT,
            fontSize: "15px",
            color: statusColor,
            background: `${statusColor}15`,
            border: `1px solid ${statusColor}40`,
            borderRadius: "2px",
            padding: "2px 10px",
          }}>
            {status}
          </div>
        </div>
      </Panel>
    </div>
  );
}

// Main navigation menu item
function MenuItem({ children, active, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        padding: "6px 0",
        fontFamily: PIXEL_FONT,
        fontSize: "9px",
        color: hovered || active ? "#e8c86e" : "#8890b8",
        transition: "color 0.2s",
        letterSpacing: "1px",
      }}
    >
      <MenuArrow active={hovered || active} />
      {children}
    </button>
  );
}

// Conversation demo
function ConversationDemo() {
  const [step, setStep] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);

  const conversation = [
    { role: "user", text: "What's my Hammerdin wearing?" },
    { role: "ai", text: "Your level 89 Paladin has Enigma (Mage Plate), Harlequin Crest, and Arachnid Mesh equipped. Your FCR is 125% — you're hitting the max breakpoint. Nice build." },
    { role: "user", text: "What should I upgrade next?" },
    { role: "ai", text: "Your biggest gap is the weapon slot — you're running a Spirit Sword in a Crystal Sword base. A Heart of the Oak in a Flail would give you +3 skills, 40% FCR, and +10-20 resist all. The runes you need: Ko + Vex + Pul + Thul." },
  ];

  useEffect(() => {
    if (!autoPlay || step >= conversation.length) return;
    const delay = step === 0 ? 2000 : 4000;
    const t = setTimeout(() => setStep((s) => s + 1), delay);
    return () => clearTimeout(t);
  }, [step, autoPlay]);

  return (
    <Panel style={{ padding: "24px", maxWidth: "600px" }}>
      <div style={{ 
        fontFamily: PIXEL_FONT, 
        fontSize: "8px", 
        color: "#c8a84e", 
        marginBottom: "16px",
        letterSpacing: "2px",
        textTransform: "uppercase",
      }}>
        Live Demo
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {conversation.slice(0, step).map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: "10px",
              animation: "fadeSlideIn 0.4s ease-out",
            }}
          >
            <div style={{
              fontFamily: PIXEL_FONT,
              fontSize: "7px",
              color: msg.role === "user" ? "#5abe8a" : "#c8a84e",
              minWidth: "50px",
              paddingTop: "3px",
              textAlign: "right",
            }}>
              {msg.role === "user" ? "YOU" : "CLAUDE"}
            </div>
            <div style={{
              fontFamily: BODY_FONT,
              fontSize: "18px",
              lineHeight: "1.4",
              color: "#d8d0c0",
              flex: 1,
            }}>
              {msg.text}
            </div>
          </div>
        ))}
        {step < conversation.length && step > 0 && (
          <div style={{ display: "flex", gap: "10px" }}>
            <div style={{
              fontFamily: PIXEL_FONT,
              fontSize: "7px",
              color: conversation[step].role === "user" ? "#5abe8a" : "#c8a84e",
              minWidth: "50px",
              paddingTop: "3px",
              textAlign: "right",
            }}>
              {conversation[step].role === "user" ? "YOU" : "CLAUDE"}
            </div>
            <div style={{
              fontFamily: BODY_FONT,
              fontSize: "18px",
              color: "#d8d0c0",
              flex: 1,
            }}>
              <Cursor />
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

export default function SavecraftHomepage() {
  const [loaded, setLoaded] = useState(false);
  const [heroReady, setHeroReady] = useState(false);
  const [activeSection, setActiveSection] = useState("home");

  useEffect(() => {
    // Load fonts
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    
    const t = setTimeout(() => setLoaded(true), 300);
    const t2 = setTimeout(() => setHeroReady(true), 800);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #05071a 0%, #0a0e2e 30%, #0d1235 60%, #05071a 100%)",
      color: "#e8e0d0",
      overflow: "hidden",
      position: "relative",
    }}>
      <Particles />
      <Scanlines />

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes menuBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: #c8a84e33; color: #e8c86e; }
        html { scroll-behavior: smooth; }
      `}</style>

      {/* ===== NAV ===== */}
      <nav style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        padding: "16px 32px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: "linear-gradient(180deg, #05071acc, transparent)",
        animation: loaded ? "slideDown 0.6s ease-out" : "none",
        opacity: loaded ? 1 : 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Pixel save icon */}
          <svg width="28" height="28" viewBox="0 0 16 16" style={{ imageRendering: "pixelated" }}>
            <rect x="2" y="1" width="12" height="14" fill="#4a5aad" stroke="#7a8aed" strokeWidth="0.5"/>
            <rect x="4" y="1" width="8" height="5" fill="#0a0e2e" stroke="#4a5aad" strokeWidth="0.3"/>
            <rect x="6" y="2" width="4" height="3" fill="#c8a84e"/>
            <rect x="4" y="10" width="8" height="4" rx="0.5" fill="#111b47" stroke="#4a5aad" strokeWidth="0.3"/>
          </svg>
          <span style={{ fontFamily: PIXEL_FONT, fontSize: "11px", color: "#e8e0d0", letterSpacing: "2px" }}>
            SAVECRAFT
          </span>
        </div>
        <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
          <MenuItem active={activeSection === "home"} onClick={() => setActiveSection("home")}>HOME</MenuItem>
          <MenuItem onClick={() => {}}>GAMES</MenuItem>
          <MenuItem onClick={() => {}}>DOCS</MenuItem>
          <a
            href="#"
            style={{
              fontFamily: PIXEL_FONT,
              fontSize: "8px",
              color: "#05071a",
              background: "linear-gradient(135deg, #c8a84e, #e8c86e)",
              padding: "8px 20px",
              border: "none",
              borderRadius: "2px",
              textDecoration: "none",
              letterSpacing: "1px",
              transition: "all 0.2s",
              boxShadow: "0 0 15px rgba(200, 168, 78, 0.3)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = "0 0 25px rgba(200, 168, 78, 0.5)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "0 0 15px rgba(200, 168, 78, 0.3)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            GET STARTED
          </a>
        </div>
      </nav>

      {/* ===== HERO ===== */}
      <section style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        padding: "120px 32px 80px",
        position: "relative",
        zIndex: 1,
      }}>
        {/* Decorative grid lines */}
        <div style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(74, 90, 173, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(74, 90, 173, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
          pointerEvents: "none",
        }} />

        <div style={{
          opacity: heroReady ? 1 : 0,
          transform: heroReady ? "translateY(0)" : "translateY(20px)",
          transition: "all 1s cubic-bezier(0.4, 0, 0.2, 1)",
        }}>
          <div style={{
            fontFamily: PIXEL_FONT,
            fontSize: "9px",
            color: "#c8a84e",
            letterSpacing: "6px",
            marginBottom: "24px",
            animation: "glowPulse 3s ease-in-out infinite",
          }}>
            ✦ YOUR SAVES, YOUR AI, YOUR EDGE ✦
          </div>

          <h1 style={{
            fontFamily: PIXEL_FONT,
            fontSize: "clamp(24px, 4vw, 42px)",
            color: "#e8e0d0",
            lineHeight: "1.6",
            marginBottom: "12px",
            textShadow: "0 0 30px rgba(200, 168, 78, 0.15)",
          }}>
            SAVECRAFT
          </h1>

          <div style={{
            fontFamily: BODY_FONT,
            fontSize: "28px",
            color: "#8890b8",
            maxWidth: "640px",
            margin: "0 auto 48px",
            lineHeight: "1.4",
          }}>
            Your game saves, parsed and served to AI.
            <br />
            Ask Claude about your actual build. Get real answers.
          </div>

          <Panel gold style={{ 
            display: "inline-block", 
            padding: "14px 40px",
            cursor: "pointer",
          }} hover>
            <span style={{
              fontFamily: PIXEL_FONT,
              fontSize: "10px",
              color: "#e8c86e",
              letterSpacing: "2px",
            }}>
              ▶ START YOUR JOURNEY
            </span>
          </Panel>
        </div>

        {/* Down arrow indicator */}
        <div style={{
          position: "absolute",
          bottom: "40px",
          animation: "floatBounce 2s ease-in-out infinite",
        }}>
          <span style={{ fontFamily: PIXEL_FONT, fontSize: "12px", color: "#4a5aad" }}>▼</span>
        </div>
        <style>{`
          @keyframes floatBounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(8px); }
          }
        `}</style>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section style={{
        padding: "80px 32px 100px",
        maxWidth: "1100px",
        margin: "0 auto",
        position: "relative",
        zIndex: 1,
      }}>
        <div style={{ textAlign: "center", marginBottom: "60px" }}>
          <div style={{
            fontFamily: PIXEL_FONT,
            fontSize: "8px",
            color: "#c8a84e",
            letterSpacing: "4px",
            marginBottom: "16px",
          }}>
            SYSTEM OVERVIEW
          </div>
          <h2 style={{
            fontFamily: PIXEL_FONT,
            fontSize: "16px",
            color: "#e8e0d0",
            lineHeight: "1.8",
          }}>
            HOW IT WORKS
          </h2>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "24px",
        }}>
          {[
            {
              num: "01",
              title: "INSTALL DAEMON",
              desc: "Background service watches your save files. Runs on PC, Mac, Steam Deck. Zero config for supported games.",
              icon: "⬡",
              color: "#5abe8a",
            },
            {
              num: "02",
              title: "AUTO PARSE",
              desc: "WASM plugins parse saves into structured JSON. Sandboxed. Signed. Cannot touch your filesystem.",
              icon: "◈",
              color: "#4a9aea",
            },
            {
              num: "03",
              title: "ASK YOUR AI",
              desc: "Claude, ChatGPT, or Gemini reads your actual game state. Real data, real advice, real answers.",
              icon: "✦",
              color: "#c8a84e",
            },
          ].map((step, i) => (
            <Panel key={i} hover>
              <div style={{ padding: "28px 24px" }}>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "20px",
                }}>
                  <span style={{
                    fontFamily: PIXEL_FONT,
                    fontSize: "24px",
                    color: step.color,
                    opacity: 0.3,
                  }}>
                    {step.num}
                  </span>
                  <span style={{ fontSize: "24px", color: step.color }}>{step.icon}</span>
                </div>
                <h3 style={{
                  fontFamily: PIXEL_FONT,
                  fontSize: "9px",
                  color: "#e8e0d0",
                  marginBottom: "12px",
                  lineHeight: "1.6",
                }}>
                  {step.title}
                </h3>
                <p style={{
                  fontFamily: BODY_FONT,
                  fontSize: "19px",
                  color: "#8890b8",
                  lineHeight: "1.4",
                }}>
                  {step.desc}
                </p>
              </div>
            </Panel>
          ))}
        </div>
      </section>

      {/* ===== DEMO SECTION ===== */}
      <section style={{
        padding: "60px 32px 100px",
        maxWidth: "1100px",
        margin: "0 auto",
        position: "relative",
        zIndex: 1,
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "40px",
          alignItems: "start",
        }}>
          <div>
            <div style={{
              fontFamily: PIXEL_FONT,
              fontSize: "8px",
              color: "#c8a84e",
              letterSpacing: "4px",
              marginBottom: "16px",
            }}>
              IN ACTION
            </div>
            <h2 style={{
              fontFamily: PIXEL_FONT,
              fontSize: "14px",
              color: "#e8e0d0",
              lineHeight: "1.8",
              marginBottom: "24px",
            }}>
              YOUR AI KNOWS<br />YOUR BUILD
            </h2>
            <p style={{
              fontFamily: BODY_FONT,
              fontSize: "22px",
              color: "#8890b8",
              lineHeight: "1.5",
              marginBottom: "32px",
            }}>
              Savecraft gives AI assistants access to your structured
              save data via MCP. Not screenshots. Not memory dumps.
              The full state — items, skills, quests, everything the
              save file knows.
            </p>

            {/* Fake stat block */}
            <Panel style={{ padding: "20px" }}>
              <div style={{
                fontFamily: PIXEL_FONT,
                fontSize: "7px",
                color: "#c8a84e",
                letterSpacing: "2px",
                marginBottom: "14px",
              }}>
                CHARACTER STATUS
              </div>
              <StatBar label="HP" value={1847} max={2200} color="#e85a5a" delay={1200} />
              <StatBar label="MP" value={412} max={580} color="#4a9aea" delay={1400} />
              <StatBar label="EXP" value={72} max={100} color="#c8a84e" delay={1600} />
              <StatBar label="Completion" value={64} max={100} color="#5abe8a" delay={1800} />
            </Panel>
          </div>

          <div style={{ paddingTop: "48px" }}>
            <ConversationDemo />
          </div>
        </div>
      </section>

      {/* ===== SUPPORTED GAMES ===== */}
      <section style={{
        padding: "80px 32px 100px",
        maxWidth: "1100px",
        margin: "0 auto",
        position: "relative",
        zIndex: 1,
      }}>
        <div style={{ textAlign: "center", marginBottom: "60px" }}>
          <div style={{
            fontFamily: PIXEL_FONT,
            fontSize: "8px",
            color: "#c8a84e",
            letterSpacing: "4px",
            marginBottom: "16px",
          }}>
            PLUGIN REGISTRY
          </div>
          <h2 style={{
            fontFamily: PIXEL_FONT,
            fontSize: "16px",
            color: "#e8e0d0",
            lineHeight: "1.8",
          }}>
            SUPPORTED GAMES
          </h2>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "16px",
        }}>
          <GameCard name="Diablo II: Resurrected" format=".d2s binary" status="✓ AVAILABLE" statusColor="#5abe8a" icon="⚔" delay={0} />
          <GameCard name="Stardew Valley" format="XML save" status="✓ AVAILABLE" statusColor="#5abe8a" icon="🌾" delay={100} />
          <GameCard name="Stellaris" format="Clausewitz" status="IN PROGRESS" statusColor="#c8a84e" icon="✧" delay={200} />
          <GameCard name="Baldur's Gate 3" format=".lsv Larian" status="PLANNED" statusColor="#4a9aea" icon="🎲" delay={300} />
          <GameCard name="Elden Ring" format=".sl2 binary" status="PLANNED" statusColor="#4a9aea" icon="🗡" delay={400} />
          <GameCard name="Civilization VI" format=".Civ6Save" status="PLANNED" statusColor="#4a9aea" icon="🏛" delay={500} />
        </div>

        <div style={{ textAlign: "center", marginTop: "40px" }}>
          <Panel gold style={{ display: "inline-block", padding: "12px 32px", cursor: "pointer" }} hover>
            <span style={{ fontFamily: PIXEL_FONT, fontSize: "8px", color: "#c8a84e", letterSpacing: "1px" }}>
              ▶ WRITE A PLUGIN
            </span>
          </Panel>
        </div>
      </section>

      {/* ===== SECURITY ===== */}
      <section style={{
        padding: "80px 32px 100px",
        maxWidth: "900px",
        margin: "0 auto",
        position: "relative",
        zIndex: 1,
      }}>
        <Panel style={{ padding: "40px" }}>
          <div style={{
            fontFamily: PIXEL_FONT,
            fontSize: "8px",
            color: "#5abe8a",
            letterSpacing: "4px",
            marginBottom: "20px",
          }}>
            SECURITY MODEL
          </div>
          <h2 style={{
            fontFamily: PIXEL_FONT,
            fontSize: "13px",
            color: "#e8e0d0",
            lineHeight: "1.8",
            marginBottom: "20px",
          }}>
            YOUR DATA STAYS YOURS
          </h2>
          <div style={{
            fontFamily: BODY_FONT,
            fontSize: "21px",
            color: "#8890b8",
            lineHeight: "1.5",
          }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              {[
                { label: "WASM Sandboxed", desc: "Plugins can't touch your filesystem or network. stdin in, JSON out." },
                { label: "Ed25519 Signed", desc: "Every plugin binary is cryptographically signed. Tampered = refused." },
                { label: "Read-Only Daemon", desc: "Cannot modify your saves. Kernel-enforced on Linux. Open source." },
                { label: "No Filesystem Exposure", desc: "AI sees structured JSON, never your local paths or files." },
              ].map((item, i) => (
                <div key={i} style={{ padding: "12px 0" }}>
                  <div style={{
                    fontFamily: PIXEL_FONT,
                    fontSize: "7px",
                    color: "#5abe8a",
                    marginBottom: "6px",
                    letterSpacing: "1px",
                  }}>
                    ✓ {item.label}
                  </div>
                  <div style={{ fontFamily: BODY_FONT, fontSize: "18px", color: "#8890b8" }}>
                    {item.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section style={{
        padding: "80px 32px 120px",
        textAlign: "center",
        position: "relative",
        zIndex: 1,
      }}>
        <div style={{
          fontFamily: PIXEL_FONT,
          fontSize: "20px",
          color: "#e8e0d0",
          marginBottom: "20px",
          lineHeight: "1.8",
          textShadow: "0 0 30px rgba(200, 168, 78, 0.15)",
        }}>
          READY?
        </div>
        <div style={{
          fontFamily: BODY_FONT,
          fontSize: "26px",
          color: "#8890b8",
          marginBottom: "40px",
        }}>
          Install in 30 seconds. Works with Claude, ChatGPT, and Gemini.
        </div>

        <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
          <Panel gold style={{ display: "inline-block", padding: "14px 36px", cursor: "pointer" }} hover>
            <span style={{ fontFamily: PIXEL_FONT, fontSize: "9px", color: "#e8c86e", letterSpacing: "1px" }}>
              ▶ INSTALL DAEMON
            </span>
          </Panel>
          <Panel style={{ display: "inline-block", padding: "14px 36px", cursor: "pointer" }} hover>
            <span style={{ fontFamily: PIXEL_FONT, fontSize: "9px", color: "#7a8aed", letterSpacing: "1px" }}>
              READ THE DOCS
            </span>
          </Panel>
        </div>

        {/* Install one-liner */}
        <div style={{ marginTop: "32px" }}>
          <Panel style={{ display: "inline-block", padding: "12px 24px" }}>
            <code style={{
              fontFamily: BODY_FONT,
              fontSize: "20px",
              color: "#5abe8a",
            }}>
              curl -sSL https://install.savecraft.gg | bash
            </code>
          </Panel>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer style={{
        padding: "32px",
        borderTop: "1px solid rgba(74, 90, 173, 0.2)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        position: "relative",
        zIndex: 1,
        maxWidth: "1100px",
        margin: "0 auto",
      }}>
        <div style={{
          fontFamily: BODY_FONT,
          fontSize: "16px",
          color: "#4a5aad",
        }}>
          savecraft.gg — by @joshsymonds
        </div>
        <div style={{ display: "flex", gap: "20px" }}>
          {["GitHub", "Discord", "Docs"].map((link) => (
            <a key={link} href="#" style={{
              fontFamily: PIXEL_FONT,
              fontSize: "7px",
              color: "#4a5aad",
              textDecoration: "none",
              letterSpacing: "1px",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = "#7a8aed"}
            onMouseLeave={(e) => e.currentTarget.style.color = "#4a5aad"}
            >
              {link.toUpperCase()}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}
