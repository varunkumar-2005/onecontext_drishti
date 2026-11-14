import React, { useEffect, useState } from "react";
import { listAgents, registerAgent, runAgent, validateDraft, listProjects } from "../api/client";
import MemoryCard from "../components/MemoryCard";

export default function Agents({ activeProject, setActiveProject }) {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(activeProject?.id || "");
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [taskInput, setTaskInput] = useState("");
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [validationResult, setValidationResult] = useState(null);

  // New agent form state
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("Planner");
  const [showNewModal, setShowNewModal] = useState(false);
  const [error, setError] = useState(null);

  // 1. Load projects list if needed
  useEffect(() => {
    async function fetchProjects() {
      try {
        const data = await listProjects();
        setProjects(data);
        if (!selectedProjectId && data.length > 0) {
          const initial = activeProject?.id || data[0].id;
          setSelectedProjectId(initial);
          if (setActiveProject && !activeProject) {
            const p = data.find((x) => x.id === initial) || data[0];
            setActiveProject(p);
          }
        }
      } catch (err) {
        console.error("Failed to load projects", err);
      }
    }
    fetchProjects();
  }, [activeProject]);

  // 2. Load agents when selected project changes
  useEffect(() => {
    if (selectedProjectId) {
      loadAgents(selectedProjectId);
    }
  }, [selectedProjectId]);

  const loadAgents = async (projId) => {
    try {
      setError(null);
      const list = await listAgents(projId);
      setAgents(list);
      if (list.length > 0) {
        setSelectedAgent((prev) => (list.some((a) => a.id === prev) ? prev : list[0].id));
      }
    } catch (err) {
      console.error("Failed to load agents", err);
      setError(err.response?.data?.detail || err.message);
    }
  };

  const handleProjectSelect = (e) => {
    const pid = e.target.value;
    setSelectedProjectId(pid);
    const p = projects.find((x) => x.id === pid);
    if (p && setActiveProject) {
      setActiveProject(p);
    }
    setRunResult(null);
    setValidationResult(null);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!newName || !selectedProjectId) return;
    try {
      await registerAgent(selectedProjectId, {
        id: newId || undefined,
        name: newName,
        role: newRole,
      });
      setShowNewModal(false);
      setNewId("");
      setNewName("");
      loadAgents(selectedProjectId);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    }
  };

  const handleRunTask = async () => {
    if (!taskInput.trim() || !selectedAgent || !selectedProjectId) return;
    setRunning(true);
    setError(null);
    setRunResult(null);
    setValidationResult(null);

    const isValidator = (selectedAgent || "").toLowerCase().includes("validator");

    try {
      if (isValidator) {
        const valRes = await validateDraft(selectedProjectId, { draft: taskInput });
        setValidationResult(valRes);
      } else {
        const res = await runAgent(selectedProjectId, selectedAgent, { task: taskInput });
        setRunResult(res);
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setRunning(false);
    }
  };

  const currentProjectName =
    projects.find((p) => p.id === selectedProjectId)?.name || activeProject?.name || "OneContext Project";

  const selectedAgentObj = agents.find((a) => a.id === selectedAgent);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
            <h1 style={styles.title}>AI Agent Playground</h1>
            <span style={styles.statusBadge}>Groq LLM + Hindsight Shared Memory</span>
          </div>
          <p style={styles.desc}>
            Autonomous multi-agent execution environment. Agents share the same project memory graph to eliminate
            context fragmentation and hallucinated contradictions.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {projects.length > 0 && (
            <select
              value={selectedProjectId}
              onChange={handleProjectSelect}
              style={styles.projectSelect}
              aria-label="Active Project"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  📁 {p.name}
                </option>
              ))}
            </select>
          )}
          <button onClick={() => setShowNewModal(true)} style={styles.addBtn}>
            + Register Custom Agent
          </button>
        </div>
      </div>

      {error && <div style={styles.errorBox}>⚠️ {error}</div>}

      {/* Agents Roster */}
      <div style={styles.rosterGrid}>
        {agents.map((a) => {
          const isSelected = selectedAgent === a.id;
          const roleLower = (a.role || "").toLowerCase();
          const icon = roleLower.includes("planner")
            ? "📐"
            : roleLower.includes("builder") || roleLower.includes("coder")
            ? "⚡"
            : roleLower.includes("validator")
            ? "🛡️"
            : "🤖";

          return (
            <div
              key={a.id}
              onClick={() => setSelectedAgent(a.id)}
              style={{
                ...styles.agentCard,
                borderColor: isSelected ? "#3b82f6" : "#27272a",
                backgroundColor: isSelected ? "#1e293b" : "#18181b",
              }}
            >
              <div style={styles.agentAvatar}>{icon}</div>
              <div style={{ flex: 1 }}>
                <div style={styles.agentName}>{a.name}</div>
                <div style={styles.agentRole}>{a.role || "General"}</div>
                <div style={styles.agentIdTag}>{a.id}</div>
              </div>
              {isSelected && <span style={styles.activeCheck}>Active</span>}
            </div>
          );
        })}
      </div>

      {/* Interactive Execution Console */}
      <div style={styles.consoleBox}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <h3 style={styles.consoleTitle}>
            Run Agent Task:{" "}
            <span style={{ color: "#60a5fa" }}>
              {selectedAgentObj ? `${selectedAgentObj.name} (${selectedAgentObj.role})` : selectedAgent || "Select Agent"}
            </span>
          </h3>
          <span style={{ fontSize: "12px", color: "#a1a1aa" }}>Project: {currentProjectName}</span>
        </div>

        {/* Quick Suggestion Chips */}
        <div style={styles.suggestionsRow}>
          <span style={{ fontSize: "12px", color: "#71717a", fontWeight: "600" }}>Quick prompts:</span>
          {(selectedAgent || "").toLowerCase().includes("validator") ? (
            <>
              <button
                type="button"
                style={styles.suggestionChip}
                onClick={() =>
                  setTaskInput(
                    "PROPOSAL: Standardize public endpoints on GraphQL instead of REST APIs without auth tokens."
                  )
                }
              >
                Validate GraphQL proposal (Test contradiction check)
              </button>
              <button
                type="button"
                style={styles.suggestionChip}
                onClick={() =>
                  setTaskInput(
                    "All public API requests require RS256 Bearer JWT tokens and Redis session storage."
                  )
                }
              >
                Validate compliant JWT policy
              </button>
            </>
          ) : (selectedAgent || "").toLowerCase().includes("planner") ? (
            <>
              <button
                type="button"
                style={styles.suggestionChip}
                onClick={() =>
                  setTaskInput(
                    "Architect a scalable distributed caching and token validation strategy adhering to project standards."
                  )
                }
              >
                Plan distributed caching strategy
              </button>
              <button
                type="button"
                style={styles.suggestionChip}
                onClick={() =>
                  setTaskInput("Propose an error handling and auditing policy for all API endpoints.")
                }
              >
                Plan API audit policy
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                style={styles.suggestionChip}
                onClick={() =>
                  setTaskInput(
                    "Draft the authentication middleware repository and token verification pipeline."
                  )
                }
              >
                Build auth middleware guidance
              </button>
              <button
                type="button"
                style={styles.suggestionChip}
                onClick={() =>
                  setTaskInput("Generate code instructions for the real-time event streaming pipeline.")
                }
              >
                Build streaming pipeline
              </button>
            </>
          )}
        </div>

        <div style={styles.taskForm}>
          <textarea
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            placeholder={
              (selectedAgent || "").toLowerCase().includes("validator")
                ? "Paste a PR description or architectural claim to validate against project memory..."
                : (selectedAgent || "").toLowerCase().includes("planner")
                ? "Enter architecture requirement (e.g. 'Standardize caching and session persistence')..."
                : "Enter implementation task (e.g. 'Implement async auth service repository')..."
            }
            rows={3}
            style={styles.taskInput}
          />
          <button onClick={handleRunTask} disabled={running || !taskInput.trim()} style={styles.runBtn}>
            {running ? "🚀 Running Agent via Groq..." : "Execute Agent Task"}
          </button>
        </div>

        {/* Validator Results */}
        {validationResult && (
          <div
            style={{
              ...styles.resultBox,
              borderLeft: validationResult.valid ? "4px solid #22c55e" : "4px solid #ef4444",
            }}
          >
            <div style={styles.valHeader}>
              <span
                style={{
                  ...styles.valStatus,
                  backgroundColor: validationResult.valid ? "#14532d" : "#7f1d1d",
                  color: validationResult.valid ? "#4ade80" : "#f87171",
                }}
              >
                {validationResult.valid ? "✅ VALID (COMPLIANT WITH MEMORY)" : "⚠️ CONTRADICTION DETECTED"}
              </span>
            </div>

            {validationResult.contradictions?.length > 0 && (
              <div style={styles.contradictionsList}>
                <strong>Contradictions Caught by Memory Check:</strong>
                <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                  {validationResult.contradictions.map((c, i) => (
                    <li key={i} style={{ color: "#fca5a5", marginTop: "4px" }}>
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div style={styles.outputText}>
              <strong>Analysis:</strong>
              <div style={{ marginTop: "6px" }}>{validationResult.analysis}</div>
            </div>

            {validationResult.citations?.length > 0 && (
              <div style={styles.sourcesSection}>
                <div style={styles.sourcesHeading}>Citations from Hindsight Memory:</div>
                {validationResult.citations.map((c, i) => (
                  <MemoryCard key={c.id || i} item={c} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Planner / Builder Output */}
        {runResult && (
          <div style={styles.resultBox}>
            <div style={styles.resultHeader}>
              <span>
                Agent: <strong>{runResult.role}</strong>
              </span>
              <span>
                Project: <strong>{runResult.project_id}</strong>
              </span>
            </div>

            <div style={styles.outputText}>{runResult.output}</div>

            {runResult.memories_retained?.length > 0 && (
              <div style={styles.retainedBanner}>
                🧠 Retained into Hindsight Shared Memory:{" "}
                <strong>{runResult.memories_retained.join(", ")}</strong>
              </div>
            )}

            {runResult.memories_recalled?.length > 0 && (
              <div style={styles.sourcesSection}>
                <div style={styles.sourcesHeading}>
                  Memories Recalled by Agent ({runResult.memories_recalled.length}):
                </div>
                {runResult.memories_recalled.map((m, i) => (
                  <MemoryCard key={m.id || i} item={m} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal to Register Agent */}
      {showNewModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3 style={{ margin: "0 0 16px 0" }}>Register Custom Agent</h3>
            <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <input
                type="text"
                placeholder="Agent ID (e.g. security-audit-bot, test-runner)"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                style={styles.modalInput}
              />
              <input
                type="text"
                placeholder="Agent Display Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={styles.modalInput}
                required
              />
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                style={styles.modalInput}
              >
                <option value="Planner">Planner (Architecture & Decisions)</option>
                <option value="Builder">Builder (Code & Implementation)</option>
                <option value="Validator">Validator (Policy & Contradiction Guard)</option>
                <option value="Auditor">Auditor (Security & Dependency Review)</option>
              </select>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button type="button" onClick={() => setShowNewModal(false)} style={styles.cancelBtn}>
                  Cancel
                </button>
                <button type="submit" style={styles.submitBtn}>
                  Register Agent
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "32px 24px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "28px",
    gap: "20px",
    flexWrap: "wrap",
  },
  title: {
    fontSize: "26px",
    fontWeight: "700",
    color: "#f4f4f5",
    margin: 0,
  },
  statusBadge: {
    backgroundColor: "#1e3a5f",
    color: "#60a5fa",
    border: "1px solid #2563eb40",
    fontSize: "11px",
    fontWeight: "600",
    padding: "2px 8px",
    borderRadius: "12px",
  },
  desc: {
    color: "#a1a1aa",
    fontSize: "14px",
    marginTop: "6px",
    maxWidth: "700px",
    lineHeight: "1.5",
  },
  projectSelect: {
    backgroundColor: "#18181b",
    color: "#f4f4f5",
    border: "1px solid #3f3f46",
    borderRadius: "6px",
    padding: "8px 12px",
    fontSize: "13px",
    outline: "none",
    cursor: "pointer",
  },
  addBtn: {
    backgroundColor: "#2563eb",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    padding: "8px 16px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
  errorBox: {
    backgroundColor: "#ef444420",
    border: "1px solid #ef4444",
    color: "#f87171",
    padding: "12px 16px",
    borderRadius: "8px",
    marginBottom: "20px",
    fontSize: "14px",
  },
  rosterGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "14px",
    marginBottom: "28px",
  },
  agentCard: {
    border: "1px solid #27272a",
    borderRadius: "10px",
    padding: "16px",
    display: "flex",
    alignItems: "center",
    gap: "14px",
    cursor: "pointer",
    transition: "all 0.15s ease",
    position: "relative",
  },
  agentAvatar: {
    fontSize: "28px",
    backgroundColor: "#27272a",
    width: "48px",
    height: "48px",
    borderRadius: "10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  agentName: {
    fontSize: "15px",
    fontWeight: "600",
    color: "#f4f4f5",
  },
  agentRole: {
    fontSize: "13px",
    color: "#60a5fa",
    marginTop: "2px",
  },
  agentIdTag: {
    fontSize: "11px",
    color: "#71717a",
    marginTop: "2px",
    fontFamily: "monospace",
  },
  activeCheck: {
    position: "absolute",
    top: "10px",
    right: "12px",
    fontSize: "10px",
    color: "#60a5fa",
    backgroundColor: "#1e3a5f",
    padding: "2px 6px",
    borderRadius: "4px",
    fontWeight: "600",
  },
  consoleBox: {
    backgroundColor: "#18181b",
    border: "1px solid #27272a",
    borderRadius: "12px",
    padding: "24px",
  },
  consoleTitle: {
    fontSize: "18px",
    fontWeight: "600",
    color: "#f4f4f5",
    margin: 0,
  },
  suggestionsRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
    marginBottom: "14px",
  },
  suggestionChip: {
    backgroundColor: "#27272a",
    color: "#cbd5e1",
    border: "1px solid #3f3f46",
    borderRadius: "16px",
    padding: "4px 12px",
    fontSize: "12px",
    cursor: "pointer",
    transition: "background 0.15s ease",
  },
  taskForm: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    marginBottom: "24px",
  },
  taskInput: {
    backgroundColor: "#09090b",
    border: "1px solid #3f3f46",
    borderRadius: "8px",
    padding: "12px",
    color: "#f4f4f5",
    fontSize: "14px",
    fontFamily: "inherit",
    resize: "vertical",
    outline: "none",
  },
  runBtn: {
    alignSelf: "flex-end",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    padding: "10px 20px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
  resultBox: {
    backgroundColor: "#09090b",
    border: "1px solid #27272a",
    borderRadius: "10px",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  resultHeader: {
    display: "flex",
    justifyContent: "space-between",
    color: "#a1a1aa",
    fontSize: "12px",
    paddingBottom: "8px",
    borderBottom: "1px solid #27272a",
  },
  valHeader: {
    marginBottom: "4px",
  },
  valStatus: {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: "4px",
    fontSize: "12px",
    fontWeight: "700",
    letterSpacing: "0.5px",
  },
  contradictionsList: {
    backgroundColor: "#7f1d1d20",
    border: "1px solid #ef444430",
    padding: "12px 16px",
    borderRadius: "8px",
    fontSize: "13px",
  },
  outputText: {
    color: "#e4e4e7",
    fontSize: "14px",
    lineHeight: "1.6",
    whiteSpace: "pre-wrap",
  },
  retainedBanner: {
    backgroundColor: "#14532d30",
    color: "#4ade80",
    border: "1px solid #22c55e40",
    padding: "10px 14px",
    borderRadius: "6px",
    fontSize: "13px",
  },
  sourcesSection: {
    marginTop: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  sourcesHeading: {
    fontSize: "12px",
    fontWeight: "700",
    color: "#38bdf8",
    textTransform: "uppercase",
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.75)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: "#18181b",
    border: "1px solid #3f3f46",
    borderRadius: "12px",
    padding: "24px",
    width: "400px",
    color: "#f4f4f5",
  },
  modalInput: {
    backgroundColor: "#09090b",
    border: "1px solid #3f3f46",
    borderRadius: "6px",
    padding: "10px 12px",
    color: "#f4f4f5",
    fontSize: "14px",
    outline: "none",
  },
  cancelBtn: {
    backgroundColor: "transparent",
    color: "#a1a1aa",
    border: "1px solid #3f3f46",
    borderRadius: "6px",
    padding: "8px 14px",
    cursor: "pointer",
  },
  submitBtn: {
    backgroundColor: "#2563eb",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    padding: "8px 16px",
    fontWeight: "600",
    cursor: "pointer",
  },
};
