import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listProjects, getHealth } from "../api/client";
import BeforeAfterPanel from "../components/BeforeAfterPanel";

export default function Dashboard({ activeProject, setActiveProject }) {
  const [projects, setProjects] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [projList, healthStatus] = await Promise.all([
        listProjects(),
        getHealth().catch(() => null),
      ]);
      setProjects(projList);
      setHealth(healthStatus);
      if (projList.length > 0 && !activeProject) {
        setActiveProject(projList[0]);
      }
    } catch (err) {
      setLoadError(err.response?.data?.detail || err.message || "Could not load projects.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Top Banner & Project Selector */}
      <div style={styles.topBar}>
        <div>
          <h1 style={styles.heading}>OneContext Dashboard</h1>
          <p style={styles.subheading}>One project. One memory. Every AI assistant.</p>
        </div>

        <div style={styles.projectSelectorBox}>
          <label style={styles.label}>Active Memory Bank:</label>
          <select
            value={activeProject?.id || ""}
            onChange={(e) => {
              const selected = projects.find((p) => p.id === e.target.value);
              setActiveProject(selected);
            }}
            style={styles.select}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.id})
              </option>
            ))}
          </select>
          <Link to="/projects/new" style={styles.newBtn} title="Create a new project memory bank">
            <span>+</span> Create Project
          </Link>
        </div>
      </div>

      {loading && <p role="status" style={styles.notice}>Loading projects and service health…</p>}
      {loadError && (
        <div role="alert" style={styles.errorNotice}>
          <span>{loadError}</span>
          <button type="button" onClick={loadData} style={styles.retryBtn}>Retry</button>
        </div>
      )}

      {/* Metrics Row */}
      <div style={styles.metricsGrid}>
        <div style={styles.metricCard}>
          <div style={styles.metricLabel}>ACTIVE PROJECT</div>
          <div style={styles.metricValue}>{activeProject ? activeProject.name : "None"}</div>
          <div style={styles.metricSub}>Bank ID: {activeProject?.bank_id || "N/A"}</div>
        </div>

        <div style={styles.metricCard}>
          <div style={styles.metricLabel}>HINDSIGHT CLOUD</div>
          <div style={{ ...styles.metricValue, color: health?.hindsight === "connected" ? "#4ade80" : "#fbbf24" }}>
            {health ? (health.hindsight === "connected" ? "Connected" : "Disconnected") : "Unknown"}
          </div>
          <div style={styles.metricSub}>Vectorize Multi-Strategy Memory</div>
        </div>

        <div style={styles.metricCard}>
          <div style={styles.metricLabel}>GROQ INFERENCE</div>
          <div style={{ ...styles.metricValue, color: "#38bdf8" }}>
            {health ? (health.groq === "connected" ? "Groq available" : "Disconnected") : "Unknown"}
          </div>
          <div style={styles.metricSub}>Chat model service</div>
        </div>

        <div style={styles.metricCard}>
          <div style={styles.metricLabel}>TOTAL PROJECTS</div>
          <div style={styles.metricValue}>{loading ? "…" : projects.length}</div>
          <div style={styles.metricSub}>Isolated Memory Banks</div>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div style={styles.navCardsRow}>
        <Link to="/memory" style={styles.navCard}>
          <div style={styles.navCardTitle}>🔍 Memory Explorer</div>
          <div style={styles.navCardDesc}>Search recalled decisions and retain new facts with metadata.</div>
        </Link>
        <Link to="/agents" style={styles.navCard}>
          <div style={styles.navCardTitle}>🤖 Multi-Agent Console</div>
          <div style={styles.navCardDesc}>Planner, Builder, and Validator agents sharing project context.</div>
        </Link>
        <Link to="/history" style={styles.navCard}>
          <div style={styles.navCardTitle}>📜 Audit Trail</div>
          <div style={styles.navCardDesc}>Chronological log of every retain, recall, and validation action.</div>
        </Link>
      </div>

      {/* Before / After Demo Centerpiece */}
      <div style={styles.demoSection}>
        <BeforeAfterPanel projectId={activeProject?.id} />
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "32px",
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "16px",
    borderBottom: "1px solid #27272a",
    paddingBottom: "24px",
  },
  heading: {
    color: "#f4f4f5",
    fontSize: "32px",
    fontWeight: "800",
    margin: "0 0 6px 0",
  },
  subheading: {
    color: "#a1a1aa",
    fontSize: "15px",
    margin: "0",
  },
  projectSelectorBox: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    backgroundColor: "#18181b",
    border: "1px solid #27272a",
    padding: "8px 14px",
    borderRadius: "10px",
  },
  label: {
    color: "#71717a",
    fontSize: "13px",
    fontWeight: "600",
  },
  select: {
    backgroundColor: "#09090b",
    color: "#f4f4f5",
    border: "1px solid #3f3f46",
    borderRadius: "6px",
    padding: "8px 12px",
    fontSize: "14px",
    cursor: "pointer",
  },
  newBtn: {
    backgroundColor: "#2563eb",
    color: "#ffffff",
    textDecoration: "none",
    padding: "8px 16px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "700",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    boxShadow: "0 2px 4px rgba(37, 99, 235, 0.35)",
    whiteSpace: "nowrap",
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "18px",
  },
  metricCard: {
    backgroundColor: "#18181b",
    border: "1px solid #27272a",
    borderRadius: "12px",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  metricLabel: {
    color: "#71717a",
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.5px",
  },
  metricValue: {
    color: "#f4f4f5",
    fontSize: "20px",
    fontWeight: "700",
  },
  metricSub: {
    color: "#a1a1aa",
    fontSize: "12px",
  },
  navCardsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "18px",
  },
  navCard: {
    backgroundColor: "#18181b",
    border: "1px solid #27272a",
    borderRadius: "12px",
    padding: "20px",
    textDecoration: "none",
    transition: "border 0.2s",
  },
  navCardTitle: {
    color: "#f4f4f5",
    fontSize: "16px",
    fontWeight: "700",
    marginBottom: "6px",
  },
  navCardDesc: {
    color: "#a1a1aa",
    fontSize: "13px",
    lineHeight: "1.4",
  },
  demoSection: {
    backgroundColor: "#0f0f12",
    border: "1px solid #27272a",
    borderRadius: "16px",
    padding: "32px",
  },
  notice: {
    margin: 0,
    color: "#a1a1aa",
    backgroundColor: "#18181b",
    border: "1px solid #27272a",
    borderRadius: "8px",
    padding: "12px 16px",
  },
  errorNotice: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    color: "#fca5a5",
    backgroundColor: "#7f1d1d40",
    border: "1px solid #ef444450",
    borderRadius: "8px",
    padding: "12px 16px",
  },
  retryBtn: {
    backgroundColor: "#18181b",
    color: "#e4e4e7",
    border: "1px solid #3f3f46",
    borderRadius: "6px",
    padding: "6px 12px",
    cursor: "pointer",
  },
};
