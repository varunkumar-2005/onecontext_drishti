import React from "react";

export default function RegionDetailModal({ region, quests, bosses, onClose, onSelectQuest, onSelectBoss }) {
  if (!region) return null;

  const relatedQuests = quests.filter((q) => q.region_id === region.region_id);
  const relatedBosses = bosses.filter((b) => b.region_id === region.region_id);

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div>
            <h2 style={{ margin: 0, fontSize: "20px", color: "#f8fafc" }}>
              🏰 {region.themed_name}
            </h2>
            <div style={{ color: "#94a3b8", fontSize: "13px", marginTop: "4px" }}>
              Original Module: <strong>{region.original_name}</strong> • Path: <code>{region.module_id}</code>
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        {/* Region Health & Metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "16px" }}>
          <div style={statBoxStyle}>
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>Health Score</span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
              <span style={{ fontSize: "22px", fontWeight: "bold", color: region.health > 80 ? "#10b981" : "#ef4444" }}>
                {region.health}%
              </span>
              <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                {region.health >= 100 ? "(Pristine)" : "(Needs Remediation)"}
              </span>
            </div>
          </div>
          <div style={statBoxStyle}>
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>Active Objectives</span>
            <div style={{ fontSize: "22px", fontWeight: "bold", color: "#38bdf8", marginTop: "4px" }}>
              {relatedQuests.length} Quests • {relatedBosses.length} Bosses
            </div>
          </div>
        </div>

        {/* Real Security Bosses */}
        {relatedBosses.length > 0 && (
          <div style={{ marginTop: "20px" }}>
            <h4 style={{ color: "#ef4444", margin: "0 0 10px 0", fontSize: "14px" }}>
              👾 Bosses in Region ({relatedBosses.length})
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {relatedBosses.map((b) => (
                <div
                  key={b.boss_id}
                  onClick={() => onSelectBoss(b)}
                  style={{
                    ...cardStyle,
                    borderColor: b.status === "defeated" ? "#334155" : "#ef4444",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ color: "#f8fafc" }}>{b.themed_name}</strong>
                    <span style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "4px", background: "#7f1d1d", color: "#fca5a5" }}>
                      {b.status.toUpperCase()}
                    </span>
                  </div>
                  <p style={{ margin: "6px 0 0 0", fontSize: "12px", color: "#cbd5e1" }}>
                    {b.original_finding}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Real Engineering Quests */}
        <div style={{ marginTop: "20px" }}>
          <h4 style={{ color: "#38bdf8", margin: "0 0 10px 0", fontSize: "14px" }}>
            ⚔️ Regional Quests & Tasks ({relatedQuests.length})
          </h4>
          {relatedQuests.length === 0 ? (
            <div style={{ color: "#64748b", fontSize: "13px" }}>No open quests in this module.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {relatedQuests.map((q) => (
                <div
                  key={q.quest_id}
                  onClick={() => onSelectQuest(q)}
                  style={{
                    ...cardStyle,
                    borderColor: q.status === "verified" ? "#10b981" : "#3b82f6",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ color: "#f8fafc" }}>{q.themed_title}</strong>
                    <span style={{ fontSize: "11px", color: "#eab308" }}>+{q.xp_reward} XP</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
                    Status: <span style={{ color: q.status === "verified" ? "#10b981" : "#38bdf8" }}>{q.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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
  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
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

const statBoxStyle = {
  background: "#1e293b",
  padding: "12px",
  borderRadius: "8px",
  border: "1px solid #334155",
};

const cardStyle = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: "8px",
  padding: "12px",
};
