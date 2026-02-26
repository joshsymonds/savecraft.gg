import { useState, useEffect } from "react";

const PIXEL_FONT = "'Press Start 2P', monospace";
const BODY_FONT = "'VT323', monospace";

const COLORS = {
  bg: "#05071a",
  panelBg: "linear-gradient(135deg, #0a0e2e 0%, #111b47 50%, #0a0e2e 100%)",
  border: "#4a5aad",
  borderLight: "#7a8aed",
  gold: "#c8a84e",
  goldLight: "#e8c86e",
  green: "#5abe8a",
  red: "#e85a5a",
  yellow: "#e8c44e",
  blue: "#4a9aea",
  text: "#e8e0d0",
  textDim: "#8890b8",
  textMuted: "#4a5080",
};

function Panel({ children, accent, style = {} }) {
  const borderColor = accent || COLORS.border;
  const hoverBorder = accent || COLORS.borderLight;
  return (
    <div style={{
      position: "relative",
      background: COLORS.panelBg,
      border: `2px solid ${borderColor}`, borderRadius: "4px",
      boxShadow: `inset 0 0 20px rgba(30,40,100,0.2), 0 0 12px ${borderColor}18`,
      ...style,
    }}>
      {[{ v:"top",h:"left",bv:"Top",bh:"Left" },{ v:"top",h:"right",bv:"Top",bh:"Right" },{ v:"bottom",h:"left",bv:"Bottom",bh:"Left" },{ v:"bottom",h:"right",bv:"Bottom",bh:"Right" }].map((c,i) => (
        <div key={i} style={{ position:"absolute",[c.v]:"-1px",[c.h]:"-1px",width:"6px",height:"6px",[`border${c.bv}`]:`2px solid ${hoverBorder}`,[`border${c.bh}`]:`2px solid ${hoverBorder}` }} />
      ))}
      {children}
    </div>
  );
}

function StatusDot({ status, size = 8 }) {
  const color = status === "online" ? COLORS.green : status === "error" ? COLORS.yellow : COLORS.textMuted;
  return (
    <span style={{ position: "relative", display: "inline-block", width: size, height: size }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color, boxShadow: status === "online" ? `0 0 8px ${color}88` : "none" }} />
      {status === "online" && <span style={{ position: "absolute", inset: "-3px", borderRadius: "50%", border: `1px solid ${color}44`, animation: "pingPulse 2s ease-out infinite" }} />}
    </span>
  );
}

// ── Parent chip (clickable, button-like) ──
function ParentChip({ icon, label, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: "5px",
        padding: "4px 9px",
        background: hovered ? "rgba(74,90,173,0.22)" : "rgba(74,90,173,0.1)",
        border: `1px solid ${hovered ? "rgba(74,90,173,0.4)" : "rgba(74,90,173,0.18)"}`,
        borderRadius: "3px",
        cursor: "pointer",
        transition: "all 0.12s",
        userSelect: "none",
      }}
    >
      {icon && <span style={{ fontSize: "12px", lineHeight: 1 }}>{icon}</span>}
      <span style={{
        fontFamily: PIXEL_FONT, fontSize: "6px",
        color: hovered ? COLORS.text : COLORS.textDim,
        letterSpacing: "0.5px", transition: "color 0.12s",
      }}>{label}</span>
    </div>
  );
}

// ── Unified title bar ──
function WindowTitleBar({ parents, activeIcon, activeLabel, activeSublabel, statusDot, right }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 14px",
      background: "rgba(5,7,26,0.4)",
      borderBottom: "1px solid rgba(74,90,173,0.12)",
      minHeight: "52px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, flexWrap: "wrap" }}>
        {/* Parent chips */}
        {parents.map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <ParentChip icon={p.icon} label={p.label} onClick={p.onClick} />
            <span style={{ fontFamily: PIXEL_FONT, fontSize: "6px", color: COLORS.textMuted }}>▸</span>
          </div>
        ))}

        {/* Active label (not a button — just text) */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {activeIcon && <span style={{ fontSize: "18px", lineHeight: 1 }}>{activeIcon}</span>}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
              <span style={{
                fontFamily: PIXEL_FONT, fontSize: "9px", color: COLORS.text,
                letterSpacing: "0.5px", lineHeight: 1.4,
              }}>{activeLabel}</span>
              {statusDot && <StatusDot status={statusDot} size={7} />}
            </div>
            {activeSublabel && (
              <span style={{
                fontFamily: BODY_FONT, fontSize: "15px", color: COLORS.textDim,
                lineHeight: 1.2, display: "block", marginTop: "1px",
              }}>{activeSublabel}</span>
            )}
          </div>
        </div>
      </div>
      <div style={{ flexShrink: 0, marginLeft: "12px" }}>{right}</div>
    </div>
  );
}

// ── Game Card ──
function GameCard({ game, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const statusColor =
    game.status === "watching" ? COLORS.green
    : game.status === "error" ? COLORS.yellow
    : game.status === "detected" ? COLORS.blue
    : COLORS.textMuted;
  const dimmed = game.status === "not_found";
  const isActive = hovered && !dimmed;

  return (
    <div
      onClick={() => !dimmed && onSelect?.()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: "12px 10px 10px", borderRadius: "4px",
        background: isActive ? "rgba(74,90,173,0.12)" : "rgba(74,90,173,0.03)",
        border: `1px solid ${isActive ? "rgba(74,90,173,0.25)" : "rgba(74,90,173,0.06)"}`,
        transition: "all 0.15s",
        cursor: dimmed ? "default" : "pointer",
        opacity: dimmed ? 0.3 : 1, minWidth: "110px",
      }}
    >
      <div style={{ position: "relative", lineHeight: 1, marginBottom: "6px" }}>
        <span style={{ fontSize: "30px", imageRendering: "pixelated" }}>{game.icon}</span>
        {game.status !== "not_found" && (
          <div style={{
            position: "absolute", top: "-3px", right: "-8px",
            width: "14px", height: "14px", borderRadius: "50%", background: COLORS.bg,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{
              width: "10px", height: "10px", borderRadius: "50%", background: statusColor,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "6px", fontFamily: PIXEL_FONT, color: COLORS.bg, fontWeight: "bold",
              boxShadow: game.status === "watching" ? `0 0 6px ${statusColor}88` : "none",
            }}>{game.status === "error" ? "!" : ""}</div>
          </div>
        )}
      </div>
      <div style={{
        fontFamily: PIXEL_FONT, fontSize: "6px",
        color: isActive ? COLORS.text : COLORS.textDim,
        textAlign: "center", lineHeight: 1.5, letterSpacing: "0.5px", marginBottom: "4px",
      }}>{game.shortName}</div>
      {game.status !== "not_found" ? (
        <div style={{ textAlign: "center", width: "100%" }}>
          <div style={{ fontFamily: BODY_FONT, fontSize: "15px", color: statusColor, lineHeight: 1.3, marginBottom: "1px" }}>
            {game.statusLine}
          </div>
          {game.saveNames?.map((name, i) => (
            <div key={i} style={{
              fontFamily: BODY_FONT, fontSize: "14px", color: COLORS.textMuted, lineHeight: 1.3,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{name}</div>
          ))}
        </div>
      ) : (
        <div style={{ fontFamily: BODY_FONT, fontSize: "14px", color: COLORS.textMuted }}>not installed</div>
      )}
    </div>
  );
}

// ── Save row ──
function SaveRow({ save, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px",
        background: hovered ? "rgba(74,90,173,0.1)" : "transparent",
        borderBottom: "1px solid rgba(74,90,173,0.06)",
        transition: "background 0.1s", cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
        <span style={{
          color: save.status === "success" ? COLORS.green : save.status === "error" ? COLORS.yellow : COLORS.blue,
          fontFamily: PIXEL_FONT, fontSize: "7px", minWidth: "14px", textAlign: "center",
        }}>{save.status === "success" ? "✓" : save.status === "error" ? "⚠" : "↑"}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: BODY_FONT, fontSize: "20px", color: COLORS.text, lineHeight: 1.2 }}>{save.name}</div>
          <div style={{ fontFamily: BODY_FONT, fontSize: "15px", color: COLORS.textDim, lineHeight: 1.3 }}>{save.details}</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
        {save.notes?.length > 0 && (
          <span style={{
            fontFamily: BODY_FONT, fontSize: "14px", color: COLORS.gold,
            background: `${COLORS.gold}12`, border: `1px solid ${COLORS.gold}25`,
            borderRadius: "2px", padding: "1px 6px",
          }}>📝 {save.notes.length}</span>
        )}
        <span style={{ fontFamily: BODY_FONT, fontSize: "14px", color: COLORS.textMuted }}>{save.lastParsed}</span>
        <span style={{
          fontFamily: PIXEL_FONT, fontSize: "7px", color: COLORS.textMuted,
          opacity: hovered ? 1 : 0.3, transition: "opacity 0.15s",
        }}>▶</span>
      </div>
    </div>
  );
}

// ── Note card ──
function NoteCard({ note, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirmDelete(false); }}
      style={{
        padding: "12px 14px",
        background: hovered ? "rgba(200,168,78,0.04)" : "rgba(74,90,173,0.04)",
        border: `1px solid ${hovered ? `${COLORS.gold}30` : "rgba(74,90,173,0.1)"}`,
        borderRadius: "4px", transition: "all 0.15s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
        <div style={{ fontFamily: PIXEL_FONT, fontSize: "7px", color: COLORS.gold, lineHeight: 1.6, letterSpacing: "0.5px" }}>
          {note.title}
        </div>
        {!confirmDelete ? (
          <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }} style={{
            background: "none", border: "none", cursor: "pointer",
            fontFamily: PIXEL_FONT, fontSize: "6px", color: COLORS.textMuted,
            opacity: hovered ? 0.7 : 0, transition: "opacity 0.15s", padding: "2px 4px", marginLeft: "12px",
          }}>✕</button>
        ) : (
          <div style={{ display: "flex", gap: "4px", marginLeft: "12px", animation: "fadeIn 0.15s ease-out" }}>
            <button onClick={(e) => { e.stopPropagation(); onDelete(note.id); }} style={{
              background: `${COLORS.red}20`, border: `1px solid ${COLORS.red}40`,
              borderRadius: "2px", padding: "2px 8px", cursor: "pointer",
              fontFamily: PIXEL_FONT, fontSize: "5px", color: COLORS.red, letterSpacing: "0.5px",
            }}>DELETE</button>
            <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }} style={{
              background: "rgba(74,90,173,0.1)", border: "1px solid rgba(74,90,173,0.25)",
              borderRadius: "2px", padding: "2px 8px", cursor: "pointer",
              fontFamily: PIXEL_FONT, fontSize: "5px", color: COLORS.textDim, letterSpacing: "0.5px",
            }}>KEEP</button>
          </div>
        )}
      </div>
      <div style={{
        fontFamily: BODY_FONT, fontSize: "16px", color: COLORS.textDim,
        lineHeight: 1.4, maxHeight: "66px", overflow: "hidden",
        display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
      }}>{note.preview}</div>
      <div style={{ display: "flex", gap: "12px", marginTop: "6px" }}>
        <span style={{ fontFamily: BODY_FONT, fontSize: "13px", color: COLORS.textMuted }}>{note.source}</span>
        <span style={{ fontFamily: BODY_FONT, fontSize: "13px", color: COLORS.textMuted }}>{note.size}</span>
        <span style={{ fontFamily: BODY_FONT, fontSize: "13px", color: COLORS.textMuted }}>{note.updated}</span>
      </div>
    </div>
  );
}

function TinyButton({ label }) {
  return (
    <button style={{
      background: "rgba(74,90,173,0.08)", border: "1px solid rgba(74,90,173,0.2)",
      borderRadius: "3px", padding: "4px 9px", cursor: "pointer",
      fontFamily: PIXEL_FONT, fontSize: "6px", color: COLORS.textMuted,
      letterSpacing: "1px", transition: "all 0.15s",
    }}
    onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.borderLight; e.currentTarget.style.color = COLORS.text; }}
    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(74,90,173,0.2)"; e.currentTarget.style.color = COLORS.textMuted; }}
    >{label}</button>
  );
}

// ══════════════════════════════════════════
// DEVICE WINDOW
// ══════════════════════════════════════════
function DeviceWindow({ device }) {
  const [navGame, setNavGame] = useState(null);
  const [navSave, setNavSave] = useState(null);
  const gameData = navGame ? device.games.find(g => g.shortName === navGame) : null;
  const saveData = navSave && gameData ? gameData.saves.find(s => s.id === navSave) : null;

  const deviceIcon = device.type === "steamdeck" ? "🎮" : device.type === "windows" ? "🖥" : "🐧";
  const deviceSublabel = `${device.os} · v${device.daemonVersion}${device.online ? "" : ` · last seen ${device.lastSeen}`}`;

  // Build title bar props based on depth
  let parents = [];
  let activeIcon, activeLabel, activeSublabel, statusDot, rightContent;

  if (saveData && gameData) {
    // Save level
    parents = [
      { icon: deviceIcon, label: device.name, onClick: () => { setNavGame(null); setNavSave(null); } },
      { icon: gameData.icon, label: gameData.shortName, onClick: () => setNavSave(null) },
    ];
    activeLabel = saveData.name;
    activeSublabel = saveData.details;
    rightContent = (
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{
          color: saveData.status === "success" ? COLORS.green : COLORS.yellow,
          fontFamily: PIXEL_FONT, fontSize: "7px",
        }}>{saveData.status === "success" ? "✓" : "⚠"}</span>
        <span style={{ fontFamily: BODY_FONT, fontSize: "14px", color: COLORS.textMuted }}>parsed {saveData.lastParsed}</span>
      </div>
    );
  } else if (gameData) {
    // Game level
    parents = [
      { icon: deviceIcon, label: device.name, onClick: () => setNavGame(null) },
    ];
    activeIcon = gameData.icon;
    activeLabel = gameData.name;
    activeSublabel = gameData.statusLine;
    const sc = gameData.status === "watching" ? COLORS.green : gameData.status === "error" ? COLORS.yellow : COLORS.blue;
    rightContent = (
      <span style={{
        fontFamily: PIXEL_FONT, fontSize: "6px", color: sc,
        background: `${sc}12`, border: `1px solid ${sc}30`,
        borderRadius: "2px", padding: "3px 8px", letterSpacing: "1px",
      }}>
        {gameData.status === "watching" ? "● WATCHING" : gameData.status === "error" ? "⚠ ERROR" : "✓ DETECTED"}
      </span>
    );
  } else {
    // Device level (root)
    activeIcon = deviceIcon;
    activeLabel = device.name;
    activeSublabel = deviceSublabel;
    statusDot = device.online ? "online" : "offline";
    rightContent = (
      <div style={{ display: "flex", gap: "5px" }}>
        <TinyButton label="RESCAN" />
        <TinyButton label="CONFIG" />
      </div>
    );
  }

  return (
    <Panel accent={device.online ? COLORS.green + "40" : undefined} style={{ overflow: "hidden" }}>
      <WindowTitleBar
        parents={parents}
        activeIcon={activeIcon}
        activeLabel={activeLabel}
        activeSublabel={activeSublabel}
        statusDot={statusDot}
        right={rightContent}
      />

      {saveData ? (
        <SaveDetailContent save={saveData} />
      ) : gameData ? (
        <GameDetailContent game={gameData} onSelectSave={(id) => setNavSave(id)} />
      ) : (
        <GameGridContent games={device.games} onSelectGame={(sn) => setNavGame(sn)} />
      )}
    </Panel>
  );
}

// ═══ Content areas ═══

function GameGridContent({ games, onSelectGame }) {
  return (
    <div style={{ padding: "14px 12px 12px", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "start" }}>
      {games.map((game, i) => (
        <GameCard key={i} game={game} onSelect={() => onSelectGame(game.shortName)} />
      ))}
    </div>
  );
}

function GameDetailContent({ game, onSelectSave }) {
  return (
    <div style={{ animation: "fadeIn 0.18s ease-out" }}>
      <div style={{ padding: "4px 0" }}>
        {game.saves?.map((save, i) => (
          <SaveRow key={i} save={save} onClick={() => onSelectSave(save.id)} />
        ))}
      </div>
      {game.error && (
        <div style={{
          margin: "4px 14px 8px", padding: "8px 12px",
          background: `${COLORS.yellow}0a`, border: `1px solid ${COLORS.yellow}20`, borderRadius: "3px",
        }}>
          <div style={{ fontFamily: PIXEL_FONT, fontSize: "6px", color: COLORS.yellow, letterSpacing: "1px", marginBottom: "4px" }}>⚠ ERROR</div>
          <div style={{ fontFamily: BODY_FONT, fontSize: "17px", color: COLORS.yellow }}>{game.error}</div>
        </div>
      )}
      {game.path && (
        <div style={{ padding: "8px 16px 12px", borderTop: "1px solid rgba(74,90,173,0.08)", marginTop: "4px" }}>
          <span style={{ fontFamily: BODY_FONT, fontSize: "14px", color: COLORS.textMuted }}>📁 {game.path}</span>
        </div>
      )}
    </div>
  );
}

function SaveDetailContent({ save }) {
  const [notes, setNotes] = useState(save.notes || []);
  const [showAddNote, setShowAddNote] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");

  const handleDelete = (noteId) => setNotes(notes.filter(n => n.id !== noteId));
  const handleAdd = () => {
    if (!newTitle.trim()) return;
    setNotes([{
      id: `note-${Date.now()}`, title: newTitle,
      preview: newContent.slice(0, 200) || "Empty note", content: newContent,
      source: "user", size: `${new Blob([newContent]).size} bytes`, updated: "just now",
    }, ...notes]);
    setNewTitle(""); setNewContent(""); setShowAddNote(false);
  };

  return (
    <div style={{ animation: "fadeIn 0.18s ease-out" }}>
      <div style={{ padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <div style={{ fontFamily: PIXEL_FONT, fontSize: "7px", color: COLORS.gold, letterSpacing: "2px" }}>
            NOTES ({notes.length}/10)
          </div>
          {!showAddNote && notes.length < 10 && (
            <button onClick={() => setShowAddNote(true)} style={{
              background: `${COLORS.gold}12`, border: `1px solid ${COLORS.gold}30`,
              borderRadius: "3px", padding: "5px 12px", cursor: "pointer",
              fontFamily: PIXEL_FONT, fontSize: "6px", color: COLORS.gold,
              letterSpacing: "1px", transition: "all 0.15s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = `${COLORS.gold}20`}
            onMouseLeave={(e) => e.currentTarget.style.background = `${COLORS.gold}12`}
            >+ ADD NOTE</button>
          )}
        </div>

        {showAddNote && (
          <div style={{
            padding: "14px", marginBottom: "12px",
            background: `${COLORS.gold}06`, border: `1px solid ${COLORS.gold}20`,
            borderRadius: "4px", animation: "fadeIn 0.15s ease-out",
          }}>
            <input
              type="text" placeholder="Note title..."
              value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
              style={{
                width: "100%", background: "rgba(5,7,26,0.6)",
                border: "1px solid rgba(74,90,173,0.3)", borderRadius: "3px",
                padding: "8px 10px", marginBottom: "8px",
                fontFamily: PIXEL_FONT, fontSize: "7px", color: COLORS.text,
                outline: "none", letterSpacing: "0.5px",
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = COLORS.gold}
              onBlur={(e) => e.currentTarget.style.borderColor = "rgba(74,90,173,0.3)"}
            />
            <textarea
              placeholder="Paste build guide, farming goals, notes..."
              value={newContent} onChange={(e) => setNewContent(e.target.value)}
              rows={5}
              style={{
                width: "100%", background: "rgba(5,7,26,0.6)",
                border: "1px solid rgba(74,90,173,0.3)", borderRadius: "3px",
                padding: "8px 10px", marginBottom: "8px", resize: "vertical",
                fontFamily: BODY_FONT, fontSize: "17px", color: COLORS.text,
                outline: "none", lineHeight: 1.4,
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = COLORS.gold}
              onBlur={(e) => e.currentTarget.style.borderColor = "rgba(74,90,173,0.3)"}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: BODY_FONT, fontSize: "14px", color: COLORS.textMuted }}>
                {new Blob([newContent]).size.toLocaleString()} / 50,000 bytes
              </span>
              <div style={{ display: "flex", gap: "6px" }}>
                <button onClick={() => { setShowAddNote(false); setNewTitle(""); setNewContent(""); }} style={{
                  background: "rgba(74,90,173,0.1)", border: "1px solid rgba(74,90,173,0.25)",
                  borderRadius: "3px", padding: "5px 12px", cursor: "pointer",
                  fontFamily: PIXEL_FONT, fontSize: "6px", color: COLORS.textDim, letterSpacing: "1px",
                }}>CANCEL</button>
                <button onClick={handleAdd} style={{
                  background: `${COLORS.gold}20`, border: `1px solid ${COLORS.gold}40`,
                  borderRadius: "3px", padding: "5px 12px", cursor: "pointer",
                  fontFamily: PIXEL_FONT, fontSize: "6px", color: COLORS.gold, letterSpacing: "1px",
                  opacity: newTitle.trim() ? 1 : 0.4,
                }}>SAVE NOTE</button>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} onDelete={handleDelete} />
          ))}
        </div>

        {notes.length === 0 && !showAddNote && (
          <div style={{
            textAlign: "center", padding: "32px 16px",
            border: "1px dashed rgba(74,90,173,0.2)", borderRadius: "4px",
          }}>
            <div style={{ fontFamily: BODY_FONT, fontSize: "20px", color: COLORS.textMuted, marginBottom: "6px" }}>No notes yet</div>
            <div style={{ fontFamily: BODY_FONT, fontSize: "16px", color: COLORS.textMuted }}>
              Add build guides, farming goals, or let Claude create notes in chat.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Activity event ──
function ActivityEvent({ event, isNew = false }) {
  const iconMap = {
    parse_success: { icon: "✓", color: COLORS.green },
    parse_error: { icon: "⚠", color: COLORS.yellow },
    watching: { icon: "→", color: COLORS.blue },
    game_detected: { icon: "◈", color: COLORS.green },
    daemon_online: { icon: "▶", color: COLORS.green },
    daemon_offline: { icon: "■", color: COLORS.red },
    plugin_updated: { icon: "↑", color: COLORS.gold },
    config_push: { icon: "⟳", color: COLORS.blue },
  };
  const cfg = iconMap[event.type] || { icon: "·", color: COLORS.textDim };
  return (
    <div style={{
      display: "flex", gap: "8px", padding: "7px 14px",
      borderBottom: "1px solid rgba(74,90,173,0.06)",
      animation: isNew ? "fadeSlideIn 0.35s ease-out" : "none",
      alignItems: "flex-start",
    }}>
      <span style={{ fontFamily: PIXEL_FONT, fontSize: "8px", color: cfg.color, minWidth: "14px", textAlign: "center", paddingTop: "3px" }}>{cfg.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: BODY_FONT, fontSize: "17px", color: COLORS.text, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.message}</div>
        {event.detail && <div style={{ fontFamily: BODY_FONT, fontSize: "14px", color: COLORS.textMuted, marginTop: "1px" }}>{event.detail}</div>}
      </div>
      <span style={{ fontFamily: BODY_FONT, fontSize: "13px", color: COLORS.textMuted, whiteSpace: "nowrap", paddingTop: "2px" }}>{event.time}</span>
    </div>
  );
}

function NavItem({ label, active }) {
  const [hovered, setHovered] = useState(false);
  return (
    <span
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        fontFamily: PIXEL_FONT, fontSize: "8px",
        color: active || hovered ? COLORS.goldLight : COLORS.textDim,
        cursor: "pointer", padding: "4px 0",
        borderBottom: active ? `2px solid ${COLORS.gold}` : "2px solid transparent",
        transition: "all 0.15s", letterSpacing: "1px",
      }}
    >{label}</span>
  );
}

// ══════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════
export default function DeviceStatusPage() {
  const [liveCount, setLiveCount] = useState(0);

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    const t1 = setTimeout(() => setLiveCount(1), 2000);
    const t2 = setTimeout(() => setLiveCount(2), 4200);
    const t3 = setTimeout(() => setLiveCount(3), 6800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const liveEvents = [
    { type: "parse_success", message: "Parsed Hammerdin — 42KB", detail: "Level 89 Paladin · Hell", time: "now" },
    { type: "plugin_updated", message: "D2R plugin updated to v1.2.0", time: "3s" },
    { type: "watching", message: "Re-watching 5 files in D2R saves", time: "5s" },
  ];
  const staticEvents = [
    { type: "parse_success", message: "Parsed Sunrise Farm — Luna (18KB)", detail: "Year 3 · Fall 14 · 64% Perfection", time: "4h" },
    { type: "daemon_online", message: "STEAM-DECK connected", detail: "v0.1.0 · SteamOS 3.5", time: "4h" },
    { type: "parse_error", message: "SharedStash.d2i — unsupported format", detail: "version 0x62", time: "4h" },
    { type: "daemon_offline", message: "DESKTOP-PC disconnected", time: "3h" },
    { type: "parse_success", message: "Parsed Dovahkiin (86KB)", detail: "Nord · Level 52", time: "6h" },
    { type: "parse_success", message: "Parsed Tarnished (124KB)", detail: "Level 145 · NG+", time: "1d" },
    { type: "config_push", message: "Config pushed to DESKTOP-PC", time: "1d" },
  ];

  const devices = [
    {
      name: "STEAM-DECK", type: "steamdeck", os: "SteamOS 3.5", daemonVersion: "0.1.0", online: true, lastSeen: null,
      games: [
        {
          name: "Diablo II: Resurrected", icon: "⚔", shortName: "D2R",
          status: "watching", statusLine: "3 characters loaded",
          saveNames: ["Hammerdin", "BlizzSorc", "SharedStash"],
          path: "~/.local/share/Diablo II Resurrected/Save",
          saves: [
            { id: "s1", name: "Hammerdin", details: "Paladin · Level 89 · Hell", lastParsed: "2m ago", status: "success",
              notes: [
                { id: "n1", title: "Maxroll Blessed Hammer Build", preview: "## Gear Priority\n\nHelm: Harlequin Crest (Shako) — +2 skills, DR, MF. BiS.\nArmor: Enigma in Mage Plate — Teleport, +2 skills...", source: "user", size: "8.2 KB", updated: "2d ago" },
                { id: "n2", title: "Farming Goals", preview: "Need: Ber rune, 3os Mage Plate\nFound: Jah rune (2/24), Vex (2/20)\n\nBest spots: Travincal, Chaos Sanctuary, Cows", source: "user", size: "340 B", updated: "1d ago" },
              ],
            },
            { id: "s2", name: "BlizzSorc", details: "Sorceress · Level 76 · Nightmare", lastParsed: "1d ago", status: "success", notes: [] },
            { id: "s3", name: "SharedStash", details: "Shared stash file", lastParsed: "2m ago", status: "error", notes: [] },
          ],
          error: "SharedStash.d2i — unsupported format version 0x62",
        },
        {
          name: "Stardew Valley", icon: "🌾", shortName: "STARDEW",
          status: "watching", statusLine: "1 farm found", saveNames: ["Sunrise Farm"],
          path: "~/.config/StardewValley/Saves",
          saves: [
            { id: "s4", name: "Sunrise Farm — Luna", details: "Year 3 · Fall · 64% Perfection", lastParsed: "4h ago", status: "success",
              notes: [{ id: "n3", title: "Perfection Checklist", preview: "Missing: Golden Clock ($10M), 4 Obelisks\nShipping: 6 items remaining\nMonster Slayer: 120 more dust sprites", source: "user", size: "1.1 KB", updated: "3d ago" }],
            },
          ],
        },
        {
          name: "Stellaris", icon: "✧", shortName: "STELLARIS",
          status: "watching", statusLine: "2 empires found", saveNames: ["UN of Earth", "Tzynn Empire"],
          path: "~/.local/share/Paradox Interactive/Stellaris",
          saves: [
            { id: "s5", name: "United Nations of Earth", details: "Year 2340 · Federation Builder", lastParsed: "2d ago", status: "success", notes: [] },
            { id: "s6", name: "Tzynn Empire", details: "Year 2280 · Militarist Xenophobe", lastParsed: "5d ago", status: "success", notes: [] },
          ],
        },
        { name: "Baldur's Gate 3", icon: "🎲", shortName: "BG3", status: "not_found", statusLine: null, saveNames: [], saves: [] },
      ],
    },
    {
      name: "DESKTOP-PC", type: "windows", os: "Windows 11", daemonVersion: "0.1.0", online: false, lastSeen: "3 hours ago",
      games: [
        {
          name: "Diablo II: Resurrected", icon: "⚔", shortName: "D2R",
          status: "watching", statusLine: "2 characters loaded", saveNames: ["Hammerdin", "JavaZon"],
          path: "C:\\Users\\me\\Saved Games\\Diablo II Resurrected",
          saves: [
            { id: "s7", name: "Hammerdin", details: "Paladin · Level 89 · Hell", lastParsed: "3h ago", status: "success",
              notes: [
                { id: "n4", title: "Maxroll Blessed Hammer Build", preview: "## Gear Priority\nHelm: Harlequin Crest (Shako)...", source: "user", size: "8.2 KB", updated: "2d ago" },
                { id: "n5", title: "Farming Goals", preview: "Need: Ber rune, 3os Mage Plate...", source: "user", size: "340 B", updated: "1d ago" },
              ],
            },
            { id: "s8", name: "JavaZon", details: "Amazon · Level 82 · Hell", lastParsed: "3h ago", status: "success",
              notes: [{ id: "n6", title: "Lightning Fury Build Guide", preview: "Titan's Revenge, Griffon's Eye, Infinity on merc...", source: "user", size: "5.4 KB", updated: "5d ago" }],
            },
          ],
        },
        {
          name: "Elden Ring", icon: "🗡", shortName: "ELDEN RING",
          status: "detected", statusLine: "1 tarnished found", saveNames: ["Tarnished"],
          path: "C:\\Users\\me\\AppData\\Roaming\\EldenRing",
          saves: [{ id: "s9", name: "Tarnished", details: "Level 145 · NG+ · 82 hours", lastParsed: "1d ago", status: "success", notes: [] }],
        },
        {
          name: "Skyrim", icon: "🧙", shortName: "SKYRIM",
          status: "watching", statusLine: "5 characters loaded", saveNames: ["Dovahkiin", "Shadow", "Elara", "+2 more"],
          path: "C:\\Users\\me\\Documents\\My Games\\Skyrim\\Saves",
          saves: [
            { id: "s10", name: "Dovahkiin", details: "Nord · Level 52 · Main Quest", lastParsed: "6h ago", status: "success",
              notes: [{ id: "n7", title: "Quest Tracker", preview: "Main Quest: Season Unending next\nCompanions: Complete\nThieves Guild: Not started", source: "user", size: "620 B", updated: "1w ago" }],
            },
            { id: "s11", name: "Shadow", details: "Khajiit · Level 31 · Thieves Guild", lastParsed: "2d ago", status: "success", notes: [] },
            { id: "s12", name: "Elara", details: "High Elf · Level 44 · Mage College", lastParsed: "3d ago", status: "success", notes: [] },
            { id: "s13", name: "Grunt", details: "Orc · Level 18 · Companions", lastParsed: "1w ago", status: "success", notes: [] },
            { id: "s14", name: "Whisper", details: "Wood Elf · Level 9 · Fresh start", lastParsed: "2w ago", status: "success", notes: [] },
          ],
        },
        {
          name: "Fallout 4", icon: "🔫", shortName: "FALLOUT",
          status: "error", statusLine: "parse error", saveNames: ["Sole Survivor"],
          path: "C:\\Users\\me\\Documents\\My Games\\Fallout4\\Saves",
          saves: [{ id: "s15", name: "Sole Survivor", details: "Level 38 · 45 hours", lastParsed: "1d ago", status: "error", notes: [] }],
          error: "Plugin crash — parser returned malformed JSON",
        },
        { name: "Civilization VI", icon: "🏛", shortName: "CIV VI", status: "not_found", statusLine: null, saveNames: [], saves: [] },
      ],
    },
  ];

  const totalSaves = devices.reduce((a, d) => a + d.games.reduce((a2, g) => a2 + (g.saves?.length || 0), 0), 0);
  const onlineCount = devices.filter(d => d.online).length;

  return (
    <div style={{
      minHeight: "100vh",
      background: `linear-gradient(180deg, ${COLORS.bg} 0%, #0a0e2e 50%, ${COLORS.bg} 100%)`,
      color: COLORS.text,
    }}>
      <style>{`
        @keyframes fadeSlideIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes pingPulse { 0% { transform:scale(1); opacity:0.6; } 100% { transform:scale(2.2); opacity:0; } }
        * { box-sizing:border-box; margin:0; padding:0; }
        ::selection { background:#c8a84e33; color:#e8c86e; }
        ::-webkit-scrollbar { width:6px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(74,90,173,0.3); border-radius:3px; }
        input:focus, textarea:focus { outline: none; }
      `}</style>

      <nav style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 32px",
        borderBottom: "1px solid rgba(74,90,173,0.15)",
        background: "rgba(5,7,26,0.7)", backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="22" height="22" viewBox="0 0 16 16" style={{ imageRendering: "pixelated" }}>
              <rect x="2" y="1" width="12" height="14" fill="#4a5aad" stroke="#7a8aed" strokeWidth="0.5"/>
              <rect x="4" y="1" width="8" height="5" fill="#0a0e2e" stroke="#4a5aad" strokeWidth="0.3"/>
              <rect x="6" y="2" width="4" height="3" fill="#c8a84e"/>
              <rect x="4" y="10" width="8" height="4" rx="0.5" fill="#111b47" stroke="#4a5aad" strokeWidth="0.3"/>
            </svg>
            <span style={{ fontFamily: PIXEL_FONT, fontSize: "9px", color: COLORS.text, letterSpacing: "2px" }}>SAVECRAFT</span>
          </div>
          <div style={{ display: "flex", gap: "20px" }}>
            <NavItem label="DEVICES" active />
            <NavItem label="SETTINGS" />
            <NavItem label="DOCS" />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ fontFamily: BODY_FONT, fontSize: "16px", color: COLORS.textDim }}>
            {onlineCount}/{devices.length} online · {totalSaves} saves
          </span>
          <div style={{
            fontFamily: PIXEL_FONT, fontSize: "6px", color: COLORS.gold,
            background: `${COLORS.gold}12`, border: `1px solid ${COLORS.gold}25`,
            borderRadius: "2px", padding: "3px 8px", letterSpacing: "1px",
          }}>PRO</div>
        </div>
      </nav>

      <div style={{ display: "flex", minHeight: "calc(100vh - 53px)" }}>
        <div style={{ flex: 1, padding: "24px 28px", overflow: "auto" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "820px" }}>
            {devices.map((device, i) => <DeviceWindow key={i} device={device} />)}
          </div>
        </div>
        <div style={{
          width: "340px", borderLeft: "1px solid rgba(74,90,173,0.12)",
          display: "flex", flexDirection: "column",
          background: "rgba(5,7,26,0.3)", flexShrink: 0,
        }}>
          <div style={{
            padding: "16px 18px", borderBottom: "1px solid rgba(74,90,173,0.12)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontFamily: PIXEL_FONT, fontSize: "7px", color: COLORS.gold, letterSpacing: "2px" }}>ACTIVITY</span>
            <span style={{ fontFamily: PIXEL_FONT, fontSize: "6px", color: COLORS.green, display: "flex", alignItems: "center", gap: "5px" }}>
              <StatusDot status="online" size={5} /> LIVE
            </span>
          </div>
          <div style={{ flex: 1, overflow: "auto" }}>
            {liveEvents.slice(0, liveCount).map((ev, i) => (
              <ActivityEvent key={`live-${i}`} event={ev} isNew={i === liveCount - 1} />
            ))}
            {staticEvents.map((ev, i) => <ActivityEvent key={i} event={ev} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
