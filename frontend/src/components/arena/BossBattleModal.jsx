import React, { useState } from "react";

export default function BossBattleModal({
  boss,
  currentUser,
  assets,
  onClose,
  onProposeFix,
  onApproveFix,
}) {
  if (!boss) return null;

  const [isProposing, setIsProposing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  // Lookup artwork for this boss
  const bossAsset = assets?.find(
    (a) => a.asset_key === `boss_${boss.boss_id}` || a.asset_key === `boss_${boss.id}`
  );
  const bossArtwork = bossAsset?.image_url;

  const handleProposeFix = async () => {
    setIsProposing(true);
    try {
      const sampleDiff = `--- a/${boss.affected_files?.[0] || "main.py"}\n+++ b/${boss.affected_files?.[0] || "main.py"}\n@@ -1,5 +1,5 @@\n- allow_origins=["*"]\n+ allow_origins=["https://onecontext.vectorize.io"]`;
      await onProposeFix(boss.boss_id || boss.id, {
        agent_id: "agent-builder",
        diff: sampleDiff,
        branch_name: `remediation/${(boss.source_finding_id || "sec").slice(0, 16)}`,
        explanation: `Remediate ${boss.original_finding?.slice(0, 40)} by restricting wildcard permissions.`,
      });
    } catch (e) {
      alert(e.message || "Failed to propose fix.");
    } finally {
      setIsProposing(false);
    }
  };

  const handleApproveFix = async () => {
    setIsApproving(true);
    try {
      await onApproveFix(boss.boss_id || boss.id, {
        approved_by: currentUser || "SeniorSecurityLead",
        run_verification: true,
      });
    } catch (e) {
      alert(e.message || "Failed to approve fix.");
    } finally {
      setIsApproving(false);
    }
  };

  const isDefeated = boss.status === "defeated";
  const hasProposedFix = boss.status === "proposed_fix";

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h2 style={{ margin: 0, fontSize: "20px", color: isDefeated ? "#94a3b8" : "#f87171" }}>
                {isDefeated ? "💀 Defeated:" : "👾 Boss Encounter:"} {boss.themed_name}
              </h2>
              <span
                style={{
                  fontSize: "11px",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  background: boss.severity === "critical" ? "#7f1d1d" : "#991b1b",
                  color: "#fecaca",
                  fontWeight: "bold",
                }}
              >
                {boss.severity.toUpperCase()}
              </span>
            </div>
            <div style={{ color: "#94a3b8", fontSize: "13px", marginTop: "4px" }}>
              Scanner: <strong>{boss.scanner_or_agent}</strong> • Reward: <span style={{ color: "#eab308" }}>+{boss.xp_reward} XP</span>
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        {/* Boss Artwork Banner */}
        {bossArtwork && (
          <div style={{ margin: "16px 0", borderRadius: "8px", overflow: "hidden", border: "1px solid #334155", height: "180px" }}>
            <img
              src={bossArtwork}
              alt={boss.themed_name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        )}

        {/* Boss Health Bar */}
        <div style={{ background: "#1e293b", padding: "12px", borderRadius: "8px", border: "1px solid #334155", margin: "12px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#94a3b8" }}>
            <span>Vulnerability Threat Level / Boss HP</span>
            <span style={{ fontWeight: "bold", color: isDefeated ? "#10b981" : "#ef4444" }}>
              {isDefeated ? "0 / 100 (Remediated)" : `${boss.current_health} / ${boss.max_health} HP`}
            </span>
          </div>
          <div style={{ height: "10px", background: "#334155", borderRadius: "5px", overflow: "hidden", marginTop: "6px" }}>
            <div
              style={{
                width: isDefeated ? "0%" : `${(boss.current_health / boss.max_health) * 100}%`,
                height: "100%",
                background: isDefeated ? "#10b981" : "linear-gradient(90deg, #ef4444, #dc2626)",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>

        {/* Real Engineering Vulnerability Details */}
        <div style={{ background: "#1e293b", padding: "14px", borderRadius: "8px", border: "1px solid #334155" }}>
          <h4 style={{ margin: "0 0 6px 0", color: "#f8fafc", fontSize: "14px" }}>
            🔍 Verified Code Finding:
          </h4>
          <p style={{ margin: 0, fontSize: "13px", color: "#cbd5e1", lineHeight: "1.4" }}>
            {boss.original_finding}
          </p>

          {boss.affected_files && boss.affected_files.length > 0 && (
            <div style={{ marginTop: "10px", fontSize: "12px", color: "#94a3b8" }}>
              Affected Files: {boss.affected_files.map((f, i) => (
                <code key={i} style={{ background: "#0f172a", padding: "2px 6px", borderRadius: "4px", color: "#38bdf8", marginLeft: "4px" }}>
                  {f}
                </code>
              ))}
            </div>
          )}
        </div>

        {/* Remediation Workflows */}
        <div style={{ marginTop: "16px" }}>
          {isDefeated ? (
            <div style={{ padding: "12px", background: "#065f46", borderRadius: "8px", color: "#dcfce7", fontSize: "13px" }}>
              <strong>🏆 Boss Defeated!</strong> Vulnerability remediated with verified test pass. Awarded {boss.xp_reward} XP to team ledger.
            </div>
          ) : hasProposedFix ? (
            <div style={{ background: "#1e293b", padding: "14px", borderRadius: "8px", border: "1px solid #0284c7" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", color: "#38bdf8", fontWeight: "bold" }}>
                  🤖 AI Agent Proposed Fix Ready on Branch: <code>{boss.proposed_fix_branch}</code>
                </span>
              </div>
              <pre
                style={{
                  background: "#090d16",
                  padding: "10px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  color: "#4ade80",
                  overflowX: "auto",
                  margin: "8px 0",
                }}
              >
                {boss.proposed_fix_diff || "--- a/main.py\n+++ b/main.py\n- allow_origins=['*']\n+ allow_origins=['https://app.onecontext.io']"}
              </pre>
              <button
                onClick={handleApproveFix}
                disabled={isApproving}
                style={{ ...actionBtnStyle, background: "#10b981" }}
              >
                {isApproving ? "Recording approval..." : "🛡️ Human Review: Approve Fix for Server Verification"}
              </button>
            </div>
          ) : (
            <button
              onClick={handleProposeFix}
              disabled={isProposing}
              style={{ ...actionBtnStyle, background: "#8b5cf6" }}
            >
              {isProposing ? "Dispatching AI Builder Agent..." : "🤖 Dispatch AI Agent to Propose Fix on Isolated Branch"}
            </button>
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

const actionBtnStyle = {
  width: "100%",
  padding: "10px",
  color: "#ffffff",
  border: "none",
  borderRadius: "6px",
  fontWeight: "bold",
  fontSize: "13px",
  cursor: "pointer",
};
