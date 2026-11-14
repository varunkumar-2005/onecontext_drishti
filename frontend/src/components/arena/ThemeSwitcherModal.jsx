import React, { useState } from "react";

const SUGGESTED_UNIVERSES = [
  { name: "Minecraft", archetype: "Voxel / Isometric", desc: "Blocky biomes, redstone gateways, and enchanted archives." },
  { name: "Swordigo", archetype: "Fantasy Platformer", desc: "Floating castles, ancient gates, and crystal mana vaults." },
  { name: "GTA V", archetype: "Cyberpunk District", desc: "Urban skyscrapers, expressways, and high-stakes syndicate operations." },
  { name: "Pokémon", archetype: "Adventure RPG", desc: "Charming route waypoints, gyms, and trainer challenges." },
  { name: "Zelda", archetype: "Mythic Open-World", desc: "Ancient Sheikah shrines, sprawling valleys, and divine towers." },
];

export default function ThemeSwitcherModal({ currentGame, onClose, onSwitchTheme }) {
  const [selectedGame, setSelectedGame] = useState(currentGame);
  const [customGame, setCustomGame] = useState("");
  const [customDesc, setCustomDesc] = useState("");
  const [isSwitching, setIsSwitching] = useState(false);

  const handleSwitch = async () => {
    const targetGame = customGame.trim() || selectedGame;
    if (!targetGame) return;
    setIsSwitching(true);
    try {
      await onSwitchTheme({
        new_game_name: targetGame,
        new_game_description: customDesc || undefined,
      });
      onClose();
    } catch (e) {
      alert(e.message || "Failed to switch game universe.");
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div>
            <h2 style={{ margin: 0, fontSize: "20px", color: "#f8fafc" }}>
              🌌 Dynamic Game-Theme Switching
            </h2>
            <div style={{ color: "#94a3b8", fontSize: "13px", marginTop: "4px" }}>
              Switch to ANY game universe without losing a single quest, player, PR, or verified XP.
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        {/* State Preservation Guarantee Notice */}
        <div style={guaranteeBoxStyle}>
          <span style={{ fontSize: "16px" }}>🔒</span>
          <div>
            <strong>100% Engineering State Preservation Guarantee:</strong>
            <div style={{ fontSize: "12px", color: "#bbf7d0", marginTop: "2px" }}>
              All GitHub issues, verification evidence, developer assignments, and XP ledgers are permanently preserved.
            </div>
          </div>
        </div>

        {/* Suggested Universes */}
        <div style={{ margin: "16px 0" }}>
          <label style={{ fontSize: "13px", color: "#f8fafc", fontWeight: "bold" }}>
            Choose from Popular Universes:
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "8px" }}>
            {SUGGESTED_UNIVERSES.map((u) => (
              <div
                key={u.name}
                onClick={() => {
                  setSelectedGame(u.name);
                  setCustomGame("");
                }}
                style={{
                  ...cardStyle,
                  borderColor: selectedGame === u.name && !customGame ? "#38bdf8" : "#334155",
                  background: selectedGame === u.name && !customGame ? "rgba(56, 189, 248, 0.15)" : "#1e293b",
                }}
              >
                <div style={{ fontWeight: "bold", color: "#f8fafc", fontSize: "14px" }}>
                  🎮 {u.name}
                </div>
                <div style={{ fontSize: "11px", color: "#38bdf8", marginTop: "2px" }}>
                  {u.archetype}
                </div>
                <p style={{ margin: "6px 0 0 0", fontSize: "11px", color: "#94a3b8" }}>
                  {u.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Custom Game Universe Input */}
        <div style={{ borderTop: "1px solid #1e293b", paddingTop: "14px" }}>
          <label style={{ fontSize: "13px", color: "#f8fafc", fontWeight: "bold" }}>
            Or Enter Any Game Universe:
          </label>
          <input
            value={customGame}
            onChange={(e) => setCustomGame(e.target.value)}
            placeholder="E.g. Doom, Clash of Clans, Cyberpunk, Metroid, Among Us..."
            style={inputStyle}
          />
          <input
            value={customDesc}
            onChange={(e) => setCustomDesc(e.target.value)}
            placeholder="Optional theme description or visual atmospheric notes..."
            style={{ ...inputStyle, marginTop: "8px" }}
          />
        </div>

        <button
          onClick={handleSwitch}
          disabled={isSwitching}
          style={actionBtnStyle}
        >
          {isSwitching ? "Compiling Universe & Remapping..." : `Transform World to ${customGame.trim() || selectedGame}`}
        </button>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.75)",
  backdropFilter: "blur(4px)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 100,
};

const modalStyle = {
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: "12px",
  width: "90%",
  maxWidth: "600px",
  maxHeight: "85vh",
  overflowY: "auto",
  padding: "24px",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  borderBottom: "1px solid #1e293b",
  paddingBottom: "14px",
};

const closeBtnStyle = {
  background: "transparent",
  border: "none",
  color: "#94a3b8",
  fontSize: "20px",
  cursor: "pointer",
};

const guaranteeBoxStyle = {
  display: "flex",
  gap: "10px",
  alignItems: "center",
  background: "rgba(6, 95, 70, 0.2)",
  border: "1px solid #059669",
  borderRadius: "8px",
  padding: "10px 14px",
  margin: "14px 0",
  color: "#dcfce7",
  fontSize: "13px",
};

const cardStyle = {
  border: "1px solid #334155",
  borderRadius: "8px",
  padding: "12px",
  cursor: "pointer",
  transition: "all 0.15s ease",
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "6px",
  border: "1px solid #334155",
  background: "#1e293b",
  color: "#f8fafc",
  fontSize: "13px",
  boxSizing: "border-box",
  marginTop: "6px",
};

const actionBtnStyle = {
  width: "100%",
  padding: "12px",
  background: "#2563eb",
  color: "#ffffff",
  border: "none",
  borderRadius: "6px",
  fontWeight: "bold",
  fontSize: "14px",
  cursor: "pointer",
  marginTop: "18px",
};
