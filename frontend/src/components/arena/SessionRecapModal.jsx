import React from "react";

export default function SessionRecapModal({ recap, onClose }) {
  if (!recap) return null;

  const { summary, verified_quests, defeated_bosses, leaderboard, timeline } = recap;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div>
            <h2 style={{ margin: 0, fontSize: "20px", color: "#f8fafc" }}>
              📊 Engineering Session Recap Report
            </h2>
            <div style={{ color: "#94a3b8", fontSize: "13px", marginTop: "4px" }}>
              Project: <strong>{recap.project_name}</strong> • Theme: <strong>{recap.game_theme}</strong>
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        {/* Highlights Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", margin: "16px 0" }}>
          <div style={metricBoxStyle}>
            <div style={{ fontSize: "11px", color: "#94a3b8" }}>Quests Verified</div>
            <div style={{ fontSize: "22px", fontWeight: "bold", color: "#10b981", marginTop: "4px" }}>
              {summary?.quests_verified || 0}
            </div>
          </div>
          <div style={metricBoxStyle}>
            <div style={{ fontSize: "11px", color: "#94a3b8" }}>Bosses Defeated</div>
            <div style={{ fontSize: "22px", fontWeight: "bold", color: "#38bdf8", marginTop: "4px" }}>
              {summary?.bosses_defeated || 0}
            </div>
          </div>
          <div style={metricBoxStyle}>
            <div style={{ fontSize: "11px", color: "#94a3b8" }}>Total Team XP</div>
            <div style={{ fontSize: "22px", fontWeight: "bold", color: "#eab308", marginTop: "4px" }}>
              {summary?.total_team_xp || 0}
            </div>
          </div>
          <div style={metricBoxStyle}>
            <div style={{ fontSize: "11px", color: "#94a3b8" }}>Team Size</div>
            <div style={{ fontSize: "22px", fontWeight: "bold", color: "#c084fc", marginTop: "4px" }}>
              {summary?.total_members || 1}
            </div>
          </div>
        </div>

        {/* Verified Quests Section */}
        <div style={{ marginTop: "16px" }}>
          <h4 style={{ margin: "0 0 8px 0", color: "#f8fafc", fontSize: "14px" }}>
            ✅ Verified Engineering Achievements
          </h4>
          {verified_quests && verified_quests.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {verified_quests.map((q) => (
                <div key={q.id} style={itemStyle}>
                  <div>
                    <strong style={{ color: "#f8fafc" }}>{q.themed_title}</strong>
                    <div style={{ fontSize: "11px", color: "#94a3b8" }}>
                      Issue: {q.original_title}
                    </div>
                  </div>
                  <span style={{ color: "#eab308", fontSize: "12px", fontWeight: "bold" }}>
                    +{q.xp_reward} XP
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: "#64748b", fontSize: "12px" }}>No verified quests in this session.</div>
          )}
        </div>

        {/* Boss Remediation Section */}
        <div style={{ marginTop: "16px" }}>
          <h4 style={{ margin: "0 0 8px 0", color: "#f8fafc", fontSize: "14px" }}>
            👾 Security Vulnerabilities Remediated
          </h4>
          {defeated_bosses && defeated_bosses.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {defeated_bosses.map((b) => (
                <div key={b.id} style={itemStyle}>
                  <div>
                    <strong style={{ color: "#f8fafc" }}>{b.themed_name}</strong>
                    <div style={{ fontSize: "11px", color: "#94a3b8" }}>
                      Finding: {b.original_finding}
                    </div>
                  </div>
                  <span style={{ color: "#10b981", fontSize: "12px", fontWeight: "bold" }}>
                    Remediated (+{b.xp_reward} XP)
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: "#64748b", fontSize: "12px" }}>No bosses defeated yet.</div>
          )}
        </div>

        {/* Leaderboard */}
        <div style={{ marginTop: "16px" }}>
          <h4 style={{ margin: "0 0 8px 0", color: "#f8fafc", fontSize: "14px" }}>
            🏆 Team XP Leaderboard
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {leaderboard && leaderboard.map((l, i) => (
              <div key={l.user_id || i} style={itemStyle}>
                <span style={{ color: "#f8fafc" }}>
                  #{i + 1} {l.user_name || l.user_id}
                </span>
                <span style={{ color: "#eab308", fontWeight: "bold" }}>
                  {l.total_xp} XP ({l.events_count} contributions)
                </span>
              </div>
            ))}
          </div>
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
  maxWidth: "640px",
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

const metricBoxStyle = {
  background: "#1e293b",
  padding: "10px",
  borderRadius: "8px",
  border: "1px solid #334155",
  textAlign: "center",
};

const itemStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  background: "#1e293b",
  padding: "10px 14px",
  borderRadius: "6px",
  border: "1px solid #334155",
  fontSize: "13px",
};
