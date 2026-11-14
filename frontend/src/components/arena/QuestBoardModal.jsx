import React, { useState } from "react";

export default function QuestBoardModal({
  quests,
  currentUser,
  onClose,
  onClaimQuest,
}) {
  const [selectedQuest, setSelectedQuest] = useState(null);
  const [filter, setFilter] = useState("all");
  const filteredQuests = quests.filter((q) => {
    if (filter === "available") return q.status === "available";
    if (filter === "claimed") return q.status === "claimed";
    if (filter === "verified") return q.status === "verified";
    return true;
  });


  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div>
            <h2 style={{ margin: 0, fontSize: "20px", color: "#f8fafc" }}>
              📜 Real GitHub Quest Board
            </h2>
            <div style={{ color: "#94a3b8", fontSize: "13px", marginTop: "4px" }}>
              Actual GitHub issues and tasks mapped directly into game objectives.
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        {/* Filter Pills */}
        <div style={{ display: "flex", gap: "8px", margin: "16px 0" }}>
          {["all", "available", "claimed", "verified"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                ...pillStyle,
                background: filter === f ? "#2563eb" : "#1e293b",
                color: filter === f ? "#ffffff" : "#94a3b8",
              }}
            >
              {f.toUpperCase()} ({quests.filter((q) => f === "all" || q.status === f).length})
            </button>
          ))}
        </div>

        {/* Quest List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "360px", overflowY: "auto" }}>
          {filteredQuests.map((q) => (
            <div
              key={q.quest_id}
              onClick={() => setSelectedQuest(q)}
              style={{
                ...cardStyle,
                borderColor: selectedQuest?.quest_id === q.quest_id ? "#38bdf8" : "#334155",
                background: q.status === "verified" ? "rgba(6, 95, 70, 0.2)" : "#1e293b",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: "bold", color: "#f8fafc", fontSize: "14px" }}>
                    {q.themed_title}
                  </div>
                  <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
                    GitHub Issue: <strong>{q.original_title}</strong>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: "12px", color: "#eab308", fontWeight: "bold" }}>
                    +{q.xp_reward} XP
                  </span>
                  <div
                    style={{
                      fontSize: "11px",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      marginTop: "4px",
                      background: q.status === "verified" ? "#065f46" : q.status === "claimed" ? "#854d0e" : "#1e3a8a",
                      color: "#f8fafc",
                    }}
                  >
                    {q.status}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Detail & Claim / Verify Drawer */}
        {selectedQuest && (
          <div style={drawerStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h4 style={{ margin: 0, color: "#f8fafc" }}>Quest Actions: {selectedQuest.themed_title}</h4>
              <button onClick={() => setSelectedQuest(null)} style={closeBtnStyle}>✕</button>
            </div>
            <p style={{ fontSize: "13px", color: "#cbd5e1", margin: "8px 0" }}>
              {selectedQuest.description}
            </p>
            <div style={{ fontSize: "12px", color: "#94a3b8" }}>
              Verification Rule: <code>{selectedQuest.verification_requirements}</code>
            </div>

            {selectedQuest.status === "available" && (
              <button
                onClick={() => onClaimQuest(selectedQuest.quest_id)}
                style={actionBtnStyle}
              >
                ⚔️ Claim Quest (+{selectedQuest.xp_reward} XP on merge)
              </button>
            )}

            {selectedQuest.status === "claimed" && (
              <div style={{ marginTop: "14px", borderTop: "1px solid #334155", paddingTop: "12px" }}>
                <div style={{ fontSize: "12px", fontWeight: "bold", color: "#38bdf8", marginBottom: "8px" }}>
                  Verification is server-side only
                </div>
                <div style={{ fontSize: "12px", color: "#cbd5e1", lineHeight: "1.5" }}>
                  Link and merge the real PR, then wait for the signed GitHub event and required CI result. Only the server can award XP.
                </div>
              </div>
            )}

            {selectedQuest.status === "verified" && (
              <div style={{ marginTop: "12px", padding: "10px", background: "#065f46", borderRadius: "6px" }}>
                <div style={{ color: "#dcfce7", fontWeight: "bold", fontSize: "13px" }}>
                  ✓ Verified & Settled in Ledger
                </div>
                <div style={{ color: "#bbf7d0", fontSize: "11px", marginTop: "2px" }}>
                  PR merged and CI passed. Regional health restored.
                </div>
              </div>
            )}
          </div>
        )}
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
  maxWidth: "680px",
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

const pillStyle = {
  padding: "6px 12px",
  borderRadius: "6px",
  border: "1px solid #334155",
  fontSize: "12px",
  cursor: "pointer",
  fontWeight: "bold",
};

const cardStyle = {
  border: "1px solid #334155",
  borderRadius: "8px",
  padding: "12px",
  cursor: "pointer",
  transition: "all 0.15s ease",
};

const drawerStyle = {
  marginTop: "16px",
  padding: "16px",
  background: "#1e293b",
  border: "1px solid #475569",
  borderRadius: "8px",
};

const labelStyle = {
  display: "block",
  fontSize: "11px",
  color: "#94a3b8",
  marginBottom: "4px",
};

const inputStyle = {
  width: "100%",
  padding: "6px 8px",
  borderRadius: "4px",
  border: "1px solid #475569",
  background: "#0f172a",
  color: "#f8fafc",
  fontSize: "12px",
  boxSizing: "border-box",
};

const actionBtnStyle = {
  width: "100%",
  padding: "10px",
  background: "#2563eb",
  color: "#ffffff",
  border: "none",
  borderRadius: "6px",
  fontWeight: "bold",
  fontSize: "13px",
  cursor: "pointer",
  marginTop: "12px",
};
