import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  listProjects,
  getIDEFiles,
  getIDEFileContent,
  saveIDEFile,
  getIDEFileChanges,
  runSecurityScan,
  getAIAssist,
  detectConflicts,
  simulateConflict,
  resolveConflict,
  createSecurityQuest,
  verifySecurityQuest,
  listSecurityQuests,
  postInsight,
  searchInsights,
  sendTeamMessage,
  listTeamMessages,
  getRoomMembers,
  getContextPack,
} from "../api/client";
import "./IDE.css";

export default function IDE({ activeProject, currentUser, currentTeam }) {
  const navigate = useNavigate();

  // Project selection
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(activeProject?.id || "");
  const [selectedProjectName, setSelectedProjectName] = useState(activeProject?.name || "OneContext Project");

  // Panel widths and collapse state
  const [leftWidth, setLeftWidth] = useState(250);
  const [rightWidth, setRightWidth] = useState(320);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // File explorer state
  const [fileTree, setFileTree] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState({ "": true, "onecontext": true, "onecontext/backend": true });
  const [folderContents, setFolderContents] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [recentChanges, setRecentChanges] = useState([]);

  // Editor state
  const [openTabs, setOpenTabs] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [fileContents, setFileContents] = useState({});
  const [dirtyFiles, setDirtyFiles] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");

  // AI assistant / Vibe Copilot state
  const [copilotTargetFile, setCopilotTargetFile] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiThinking, setAiThinking] = useState(false);
  const [aiResult, setAiResult] = useState(null);

  // Security scanner state
  const [securityFindings, setSecurityFindings] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [securityQuests, setSecurityQuests] = useState([]);

  // Conflict state
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [activeConflict, setActiveConflict] = useState(null);
  const [resolvingConflict, setResolvingConflict] = useState(false);
  const [conflictResolution, setConflictResolution] = useState(null);

  // Right panel tabs: "activity", "security", "conflicts", "insights", "chat"
  const [rightTab, setRightTab] = useState("activity");

  // Chat & Insights state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [insights, setInsights] = useState([]);
  const [insightQuery, setInsightQuery] = useState("");
  const [members, setMembers] = useState([]);

  // Context pack modal state
  const [contextPackModal, setContextPackModal] = useState(false);
  const [generatedPack, setGeneratedPack] = useState(null);
  const [packLoading, setPackLoading] = useState(false);
  const [packTask, setPackTask] = useState("");
  const [packFormat, setPackFormat] = useState("codex");
  const [packTimeRange, setPackTimeRange] = useState("all");

  const userName = currentUser || localStorage.getItem("onecontext_user") || "Developer";

  // Load project list on mount
  useEffect(() => {
    async function initProjects() {
      try {
        const list = await listProjects();
        setProjects(list);
        if (list.length > 0 && !selectedProjectId) {
          const defaultProj = activeProject?.id ? list.find(p => p.id === activeProject.id) || list[0] : list[0];
          setSelectedProjectId(defaultProj.id);
          setSelectedProjectName(defaultProj.name);
        }
      } catch (err) {
        console.error("Failed to load projects:", err);
      }
    }
    initProjects();
  }, [activeProject]);

  // Load files when project changes
  useEffect(() => {
    if (!selectedProjectId) return;
    loadFiles("");
    loadRecentChanges();
    loadQuests();
    loadInsightsData();

    // Setup poll interval for changes and presence
    const interval = setInterval(() => {
      loadRecentChanges();
      loadQuests();
    }, 4000);

    return () => clearInterval(interval);
  }, [selectedProjectId]);

  // Sync Copilot target file with active tab
  useEffect(() => {
    if (activeTab) {
      setCopilotTargetFile(activeTab);
    }
  }, [activeTab]);

  // Load room chat if team available
  useEffect(() => {
    if (!currentTeam?.id) return;
    async function syncTeam() {
      try {
        const [mems, msgs] = await Promise.all([
          getRoomMembers(currentTeam.id),
          listTeamMessages(currentTeam.id, 40),
        ]);
        setMembers(mems);
        setChatMessages(msgs);
      } catch (e) {
        console.warn("Team sync warning:", e);
      }
    }
    syncTeam();
    const intv = setInterval(syncTeam, 3000);
    return () => clearInterval(intv);
  }, [currentTeam]);

  async function loadFiles(path) {
    if (!selectedProjectId) return;
    try {
      const res = await getIDEFiles(selectedProjectId, path);
      if (path === "") {
        setFileTree(res.entries);
      } else {
        setFolderContents(prev => ({ ...prev, [path]: res.entries }));
      }
    } catch (err) {
      console.error("Error loading files for path", path, err);
    }
  }

  async function loadRecentChanges() {
    if (!selectedProjectId) return;
    try {
      const res = await getIDEFileChanges(selectedProjectId, "", 60);
      setRecentChanges(res.changes || []);
    } catch (e) {
      console.warn("Error loading changes:", e);
    }
  }

  async function loadQuests() {
    if (!selectedProjectId) return;
    try {
      const res = await listSecurityQuests(selectedProjectId);
      setSecurityQuests(res.quests || []);
    } catch (e) {
      console.warn("Error loading security quests:", e);
    }
  }

  async function loadInsightsData() {
    if (!selectedProjectId) return;
    try {
      const res = await searchInsights(selectedProjectId, insightQuery, "all");
      setInsights(res.insights || []);
    } catch (e) {
      console.warn("Error loading insights:", e);
    }
  }

  // Open file in editor
  async function handleOpenFile(path, fileName) {
    if (!openTabs.includes(path)) {
      setOpenTabs(prev => [...prev, path]);
    }
    setActiveTab(path);

    if (fileContents[path] === undefined) {
      try {
        const res = await getIDEFileContent(selectedProjectId, path);
        setFileContents(prev => ({ ...prev, [path]: res.content }));
      } catch (err) {
        console.error("Failed to read file:", err);
      }
    }
  }

  function handleCloseTab(e, path) {
    e.stopPropagation();
    const updated = openTabs.filter(t => t !== path);
    setOpenTabs(updated);
    if (activeTab === path) {
      setActiveTab(updated.length > 0 ? updated[updated.length - 1] : null);
    }
  }

  function handleCodeChange(val) {
    if (!activeTab) return;
    setFileContents(prev => ({ ...prev, [activeTab]: val }));
    setDirtyFiles(prev => ({ ...prev, [activeTab]: true }));
  }

  async function handleSave() {
    if (!activeTab || !selectedProjectId) return;
    setSaving(true);
    setSaveStatus("Saving...");
    try {
      const content = fileContents[activeTab];
      await saveIDEFile(selectedProjectId, {
        path: activeTab,
        content: content,
        author: userName,
      });

      setDirtyFiles(prev => ({ ...prev, [activeTab]: false }));
      setSaveStatus("✓ Saved to project disk");
      loadRecentChanges();
      setTimeout(() => setSaveStatus(""), 2500);

      // Check for conflicts after save
      const conflictRes = await detectConflicts(selectedProjectId, {
        path: activeTab,
        author: userName,
      });
      if (conflictRes.conflicts && conflictRes.conflicts.length > 0) {
        setRightTab("conflicts");
      }
    } catch (err) {
      setSaveStatus("Save failed: " + (err.response?.data?.detail || err.message));
    } finally {
      setSaving(false);
    }
  }

  // Run AI Code Assist with Hindsight
  async function handleRunAIAssist() {
    if (!aiPrompt.trim() || !selectedProjectId) return;
    const target = copilotTargetFile || activeTab || "";
    setAiThinking(true);
    setAiResult(null);
    try {
      let currentCode = "";
      if (target) {
        if (fileContents[target] !== undefined) {
          currentCode = fileContents[target];
        } else {
          try {
            const fileData = await getIDEFileContent(selectedProjectId, target);
            currentCode = fileData.content || "";
            setFileContents(prev => ({ ...prev, [target]: currentCode }));
          } catch {
            currentCode = "";
          }
        }
      }

      const res = await getAIAssist(selectedProjectId, {
        prompt: aiPrompt,
        file_path: target || "workspace",
        file_content: currentCode,
        context: `User: ${userName}, Project: ${selectedProjectName}`,
      });
      setAiResult(res);

      // Record this interaction as an insight event
      await postInsight(selectedProjectId, {
        event_type: "decision",
        description: `Vibe Copilot edit for ${target || "workspace"}: ${aiPrompt.slice(0, 100)}`,
        source: "ai_assist",
      });
      loadInsightsData();
    } catch (err) {
      setAiResult({
        explanation: "Error generating assist: " + (err.response?.data?.detail || err.message),
        suggestion: "",
        memories_used: [],
      });
    } finally {
      setAiThinking(false);
    }
  }

  async function handleApplyAISuggestion() {
    if (!aiResult?.suggestion) return;
    const target = copilotTargetFile || activeTab;
    if (!target) {
      alert("Please open or select a target file first.");
      return;
    }

    setFileContents(prev => ({ ...prev, [target]: aiResult.suggestion }));
    if (!openTabs.includes(target)) {
      setOpenTabs(prev => [...prev, target]);
    }
    setActiveTab(target);

    try {
      await saveIDEFile(selectedProjectId, {
        path: target,
        content: aiResult.suggestion,
        author: `${userName} (via Copilot)`,
      });
      setDirtyFiles(prev => ({ ...prev, [target]: false }));
      setSaveStatus(`✓ Saved ${target} to project disk`);
      loadRecentChanges();
      alert(`✅ Changes applied and saved to ${target}!`);
    } catch (err) {
      alert("Failed to save changes to file: " + err.message);
    }
  }

  // Security scan current file
  async function handleRunSecurityScan() {
    if (!activeTab || !selectedProjectId) return;
    setScanning(true);
    try {
      const content = fileContents[activeTab] || "";
      const res = await runSecurityScan(selectedProjectId, {
        path: activeTab,
        content: content,
      });
      setSecurityFindings(res.findings || []);
      setRightTab("security");
    } catch (err) {
      console.error("Security scan error:", err);
    } finally {
      setScanning(false);
    }
  }

  // Convert finding to quest
  async function handleCreateQuestFromFinding(f) {
    if (!selectedProjectId) return;
    try {
      const res = await createSecurityQuest(selectedProjectId, {
        path: activeTab || "unknown",
        rule: f.rule,
        severity: f.severity,
        line: f.line,
        message: f.message,
        snippet: f.snippet,
        xp_reward: f.severity === "high" ? 250 : 150,
      });
      loadQuests();
      setRightTab("security");
      alert(`⚔️ Security quest created: ${f.rule}! Earn +${res.quest.xp_reward} XP by fixing the issue and clicking Verify.`);
    } catch (err) {
      alert("Failed to create quest: " + err.message);
    }
  }

  // Verify security quest
  async function handleVerifyQuest(quest) {
    if (!selectedProjectId) return;
    try {
      const currentContent = fileContents[quest.path] !== undefined
        ? fileContents[quest.path]
        : (await getIDEFileContent(selectedProjectId, quest.path)).content;

      const res = await verifySecurityQuest(selectedProjectId, {
        quest_id: quest.id,
        path: quest.path,
        current_content: currentContent,
        user_id: userName,
      });

      if (res.verified) {
        alert(`🎉 ${res.message} Awarded +${res.xp_awarded} XP to ${res.user_id}!`);
        loadQuests();
        loadInsightsData();
      } else {
        alert(`❌ ${res.message}`);
      }
    } catch (err) {
      alert("Verification check failed: " + err.message);
    }
  }

  // Simulate or trigger conflict test
  async function handleSimulateConflict() {
    if (!activeTab || !selectedProjectId) return;
    const currentCode = fileContents[activeTab] || "";
    let simulatedOtherCode = "";
    try {
      const simRes = await simulateConflict(selectedProjectId, {
        path: activeTab,
        current_content: currentCode,
        author: "Alice",
      });
      simulatedOtherCode = simRes.simulated_content || "";
    } catch (err) {
      console.warn("Simulation API fallback:", err);
      simulatedOtherCode = currentCode + "\n\n// Concurrent update from Alice\n";
    }

    await saveIDEFile(selectedProjectId, {
      path: activeTab,
      content: simulatedOtherCode,
      author: "Alice",
    });
    // Immediately detect conflict
    const res = await detectConflicts(selectedProjectId, {
      path: activeTab,
      author: userName,
    });
    setActiveConflict({
      path: activeTab,
      other_author: "Alice",
      their_timestamp: new Date().toISOString(),
      current_content: currentCode,
      incoming_content: simulatedOtherCode,
    });
    setConflictModalOpen(true);
  }

  // Execute conflict resolution
  async function handleResolveConflict(strategy = "ai_merge") {
    if (!activeConflict || !selectedProjectId) return;
    setResolvingConflict(true);
    try {
      const res = await resolveConflict(selectedProjectId, {
        path: activeConflict.path,
        current_content: activeConflict.current_content,
        incoming_content: activeConflict.incoming_content,
        author: userName,
        other_author: activeConflict.other_author,
        strategy: strategy,
      });
      setConflictResolution(res);
    } catch (err) {
      alert("Resolution error: " + err.message);
    } finally {
      setResolvingConflict(false);
    }
  }

  async function handleApplyResolvedCode() {
    if (!conflictResolution?.resolved_content || !activeConflict) return;
    handleCodeChange(conflictResolution.resolved_content);
    await handleSave();
    setConflictModalOpen(false);
    setActiveConflict(null);
    setConflictResolution(null);
    alert("✅ Merge applied successfully to active workspace!");
  }

  // Context Pack Generation
  async function handleGenerateContextPack() {
    if (!selectedProjectId || !packTask.trim()) return;
    setPackLoading(true);
    try {
      const res = await getContextPack(selectedProjectId, {
        task: packTask,
        target: packFormat,
        time_range: packTimeRange,
        max_chars: 4000,
      });
      setGeneratedPack(res);
    } catch (err) {
      alert("Failed to generate context pack: " + err.message);
    } finally {
      setPackLoading(false);
    }
  }

  // Folder toggling in explorer
  function toggleFolder(path) {
    const isExpanded = !!expandedFolders[path];
    setExpandedFolders(prev => ({ ...prev, [path]: !isExpanded }));
    if (!isExpanded && !folderContents[path]) {
      loadFiles(path);
    }
  }

  // File icons helper
  function getFileIcon(name, isDir) {
    if (isDir) return "📁";
    if (name.endsWith(".py")) return "🐍";
    if (name.endsWith(".jsx") || name.endsWith(".js")) return "⚛️";
    if (name.endsWith(".json")) return "⚙️";
    if (name.endsWith(".css")) return "🎨";
    if (name.endsWith(".md")) return "📄";
    if (name.endsWith(".html")) return "🌐";
    if (name.endsWith(".sql")) return "🗄️";
    return "📝";
  }

  // Filtered files for search
  const filteredTree = fileTree.filter(item =>
    !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="ide-workspace-root">
      {/* Top IDE Ribbon Bar */}
      <div className="ide-top-ribbon">
        <div className="ide-ribbon-left">
          <div className="ide-window-dots">
            <span className="ide-dot red" />
            <span className="ide-dot yellow" />
            <span className="ide-dot green" />
          </div>
          <div className="ide-title-badge">
            <span>💻 OneContext Collaborative IDE</span>
            <span className="ide-project-pill">
              Project: <strong>{selectedProjectName}</strong>
            </span>
            <span style={{ fontSize: "11px", color: "#8b949e" }}>
              Logged in as: <strong style={{ color: "#58a6ff" }}>{userName}</strong>
            </span>
          </div>
        </div>

        <div className="ide-ribbon-right">
          {/* Quick Project Switcher */}
          <select
            value={selectedProjectId}
            onChange={(e) => {
              const p = projects.find(proj => proj.id === e.target.value);
              if (p) {
                setSelectedProjectId(p.id);
                setSelectedProjectName(p.name);
              }
            }}
            style={{
              backgroundColor: "#21262d",
              border: "1px solid #30363d",
              color: "#c9d1d9",
              padding: "4px 8px",
              borderRadius: "4px",
              fontSize: "12px",
            }}
          >
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
            ))}
          </select>

          <button
            className="ide-btn-secondary"
            onClick={() => setContextPackModal(true)}
            title="Generate task-specific context pack with Hindsight"
          >
            📦 Context Pack
          </button>

          <button
            className="ide-btn-secondary"
            onClick={handleSimulateConflict}
            title="Simulate two developers modifying the same file to test conflict resolution"
          >
            ⚡ Test Conflict Detection
          </button>

          <button
            className="ide-btn-secondary"
            onClick={() => navigate("/arena")}
          >
            ⚔️ Open Arena
          </button>
        </div>
      </div>

      {/* Main 3-Panel Layout */}
      <div
        className="ide-grid-container"
        style={{
          gridTemplateColumns: `${leftCollapsed ? "40px" : `${leftWidth}px`} 1fr ${rightCollapsed ? "40px" : `${rightWidth}px`}`,
        }}
      >
        {/* LEFT PANEL: Project Explorer */}
        <div className="ide-left-panel">
          <div className="ide-panel-header">
            <span>{leftCollapsed ? "📁" : "PROJECT EXPLORER"}</span>
            <button
              onClick={() => setLeftCollapsed(!leftCollapsed)}
              style={{ background: "none", border: "none", color: "#8b949e", cursor: "pointer" }}
            >
              {leftCollapsed ? "▶" : "◀"}
            </button>
          </div>

          {!leftCollapsed && (
            <>
              <div className="ide-search-box">
                <input
                  type="text"
                  placeholder="Search project files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="ide-search-input"
                />
              </div>

              <div className="ide-file-tree">
                {filteredTree.length === 0 ? (
                  <div style={{ padding: "12px", fontSize: "12px", color: "#8b949e" }}>Loading files...</div>
                ) : (
                  filteredTree.map(item => (
                    <div key={item.path}>
                      <div
                        className={`ide-tree-node ${activeTab === item.path ? "active" : ""}`}
                        onClick={() => {
                          if (item.type === "dir") toggleFolder(item.path);
                          else handleOpenFile(item.path, item.name);
                        }}
                      >
                        <span className="ide-node-icon">
                          {getFileIcon(item.name, item.type === "dir")}
                        </span>
                        <span className="ide-node-label">{item.name}</span>
                        {recentChanges.some(c => c.path === item.path) && (
                          <span className="ide-modified-dot" title="Recently modified" />
                        )}
                      </div>

                      {/* Expanded Subdirectory */}
                      {item.type === "dir" && expandedFolders[item.path] && (
                        <div style={{ paddingLeft: "16px" }}>
                          {(folderContents[item.path] || []).map(subItem => (
                            <div
                              key={subItem.path}
                              className={`ide-tree-node ${activeTab === subItem.path ? "active" : ""}`}
                              onClick={() => {
                                if (subItem.type === "dir") toggleFolder(subItem.path);
                                else handleOpenFile(subItem.path, subItem.name);
                              }}
                            >
                              <span className="ide-node-icon">
                                {getFileIcon(subItem.name, subItem.type === "dir")}
                              </span>
                              <span className="ide-node-label">{subItem.name}</span>
                              {recentChanges.some(c => c.path === subItem.path) && (
                                <span className="ide-modified-dot" title="Recently modified" />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {/* CENTER PANEL: Code Editor & AI Workspace */}
        <div className="ide-center-panel">
          {/* Tabs bar */}
          <div className="ide-tabs-bar">
            {openTabs.length === 0 ? (
              <div style={{ padding: "8px 14px", fontSize: "12px", color: "#8b949e" }}>
                Select a file from the explorer on the left to start editing.
              </div>
            ) : (
              openTabs.map(tabPath => {
                const name = tabPath.split("/").pop();
                const isDirty = dirtyFiles[tabPath];
                return (
                  <div
                    key={tabPath}
                    className={`ide-tab ${activeTab === tabPath ? "active" : ""}`}
                    onClick={() => setActiveTab(tabPath)}
                  >
                    <span>{getFileIcon(name, false)}</span>
                    <span>{name}{isDirty ? " •" : ""}</span>
                    <button
                      className="ide-tab-close"
                      onClick={(e) => handleCloseTab(e, tabPath)}
                    >
                      ×
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Active File Editor */}
          {activeTab ? (
            <div className="ide-editor-container">
              {/* Toolbar */}
              <div className="ide-editor-toolbar">
                <div className="ide-editor-toolbar-left">
                  <span>📄 {activeTab}</span>
                  {saveStatus && (
                    <span style={{ color: saveStatus.includes("✓") ? "#3fb950" : "#d29922", fontWeight: 600 }}>
                      {saveStatus}
                    </span>
                  )}
                </div>

                <div className="ide-editor-toolbar-right">
                  <button
                    className="ide-btn-secondary"
                    onClick={handleRunSecurityScan}
                    disabled={scanning}
                    title="Scan current file for security vulnerabilities"
                  >
                    {scanning ? "Scanning..." : "🛡️ Security Scan"}
                  </button>

                  <button
                    className="ide-btn-primary"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "💾 Save File"}
                  </button>
                </div>
              </div>

              {/* Monospace Code Editor */}
              <textarea
                className="ide-code-textarea"
                value={fileContents[activeTab] || ""}
                onChange={(e) => handleCodeChange(e.target.value)}
                placeholder="File content..."
                spellCheck="false"
              />
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#8b949e" }}>
              <div style={{ textAlign: "center" }}>
                <span style={{ fontSize: "40px" }}>💻</span>
                <p>No file selected</p>
                <p style={{ fontSize: "12px" }}>Open a file from the explorer on the left or create one.</p>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL: Collaboration, Conflicts, Security, and Insights */}
        <div className="ide-right-panel">
          <div className="ide-panel-header">
            <span>{rightCollapsed ? "👥" : "COLLABORATION"}</span>
            <button
              onClick={() => setRightCollapsed(!rightCollapsed)}
              style={{ background: "none", border: "none", color: "#8b949e", cursor: "pointer" }}
            >
              {rightCollapsed ? "◀" : "▶"}
            </button>
          </div>

          {!rightCollapsed && (
            <>
              {/* Right panel sub-tabs */}
              <div className="ide-collab-tabs">
                <button
                  className={`ide-collab-tab ${rightTab === "activity" ? "active" : ""}`}
                  onClick={() => setRightTab("activity")}
                >
                  Activity
                </button>
                <button
                  className={`ide-collab-tab ${rightTab === "security" ? "active" : ""}`}
                  onClick={() => setRightTab("security")}
                >
                  Security {securityFindings.length > 0 ? `(${securityFindings.length})` : ""}
                </button>
                <button
                  className={`ide-collab-tab ${rightTab === "conflicts" ? "active" : ""}`}
                  onClick={() => setRightTab("conflicts")}
                >
                  Conflicts
                </button>
                <button
                  className={`ide-collab-tab ${rightTab === "insights" ? "active" : ""}`}
                  onClick={() => setRightTab("insights")}
                >
                  Insights
                </button>
                <button
                  className={`ide-collab-tab ${rightTab === "chat" ? "active" : ""}`}
                  onClick={() => setRightTab("chat")}
                >
                  Chat
                </button>
              </div>

              <div className="ide-collab-content">
                {/* 1. Activity Tab */}
                {rightTab === "activity" && (
                  <>
                    <div className="ide-collab-card">
                      <div className="ide-card-header">
                        <span>👥 Team Presence</span>
                        <span className="ide-badge-verified">Live</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px" }}>
                        <div>👤 <strong>{userName}</strong> (You)</div>
                        <div>👤 Alice (Security Engineer) • online</div>
                        <div>👤 Bob (Core Backend) • online</div>
                        <div style={{ color: "#a371f7" }}>🤖 Groq Vibe Agent • active</div>
                        <div style={{ color: "#58a6ff" }}>🛡️ Security Agent • active</div>
                      </div>
                    </div>

                    <div className="ide-collab-card">
                      <div className="ide-card-header">
                        <span>⏱️ Recent Workspace Changes</span>
                        <span style={{ fontSize: "10px", color: "#8b949e" }}>Last 60m</span>
                      </div>
                      {recentChanges.length === 0 ? (
                        <div style={{ color: "#8b949e", fontSize: "11px" }}>No recent file edits logged.</div>
                      ) : (
                        recentChanges.slice(0, 8).map(c => (
                          <div key={c.id || c.timestamp} style={{ borderBottom: "1px solid #21262d", padding: "4px 0", fontSize: "11px" }}>
                            <div><strong>{c.author}</strong> edited <code>{c.path}</code></div>
                            <div style={{ color: "#8b949e", fontSize: "10px" }}>{new Date(c.timestamp).toLocaleTimeString()}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}

                {/* 2. Security Tab */}
                {rightTab === "security" && (
                  <>
                    <div className="ide-collab-card">
                      <div className="ide-card-header">
                        <span>🛡️ Active File Findings</span>
                        <button
                          className="ide-btn-secondary"
                          style={{ padding: "2px 6px", fontSize: "10px" }}
                          onClick={handleRunSecurityScan}
                        >
                          Re-scan
                        </button>
                      </div>

                      {securityFindings.length === 0 ? (
                        <div style={{ color: "#3fb950", fontSize: "12px" }}>
                          ✓ No vulnerabilities detected in currently open file.
                        </div>
                      ) : (
                        securityFindings.map((f, i) => (
                          <div key={i} style={{ borderBottom: "1px solid #21262d", padding: "8px 0" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                              <span className={f.severity === "high" ? "ide-badge-high" : "ide-badge-medium"}>
                                {f.severity.toUpperCase()}
                              </span>
                              <span style={{ fontSize: "11px", color: "#8b949e" }}>Line {f.line}</span>
                            </div>
                            <div style={{ fontWeight: 600, fontSize: "12px", color: "#f0f6fc" }}>{f.message}</div>
                            <code style={{ fontSize: "11px", color: "#d29922", display: "block", margin: "4px 0" }}>
                              {f.snippet}
                            </code>
                            <button
                              className="ide-btn-secondary"
                              style={{ width: "100%", marginTop: "6px", fontSize: "11px", justifyContent: "center" }}
                              onClick={() => handleCreateQuestFromFinding(f)}
                            >
                              ⚔️ Convert to Quest (+150 XP)
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="ide-collab-card">
                      <div className="ide-card-header">
                        <span>⚔️ Security Quests</span>
                        <span style={{ fontSize: "10px", color: "#58a6ff" }}>Verified XP</span>
                      </div>
                      {securityQuests.length === 0 ? (
                        <div style={{ color: "#8b949e", fontSize: "11px" }}>No active security quests.</div>
                      ) : (
                        securityQuests.map(q => (
                          <div key={q.id} style={{ borderBottom: "1px solid #21262d", padding: "6px 0" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontWeight: 600 }}>{q.rule}</span>
                              <span className={q.status === "verified" ? "ide-badge-verified" : "ide-badge-medium"}>
                                {q.status === "verified" ? "✓ VERIFIED" : `+${q.xp_reward} XP`}
                              </span>
                            </div>
                            <div style={{ fontSize: "11px", color: "#8b949e" }}>{q.path} (line {q.line})</div>
                            {q.status !== "verified" && (
                              <button
                                className="ide-btn-secondary"
                                style={{ width: "100%", marginTop: "4px", fontSize: "11px", justifyContent: "center" }}
                                onClick={() => handleVerifyQuest(q)}
                              >
                                ✓ Verify Fix & Claim XP
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}

                {/* 3. Conflicts Tab */}
                {rightTab === "conflicts" && (
                  <div className="ide-collab-card">
                    <div className="ide-card-header">
                      <span>⚡ Code Conflicts</span>
                      <button
                        className="ide-btn-secondary"
                        style={{ padding: "2px 6px", fontSize: "10px" }}
                        onClick={handleSimulateConflict}
                      >
                        Simulate
                      </button>
                    </div>

                    <p style={{ fontSize: "11px", color: "#8b949e" }}>
                      OneContext tracks overlapping modifications across developers and external AI assistants (Codex, Gemini, Cursor).
                    </p>

                    <button
                      className="ide-btn-primary"
                      style={{ width: "100%", marginTop: "8px", justifyContent: "center" }}
                      onClick={handleSimulateConflict}
                    >
                      ⚡ Detect & Resolve Conflict
                    </button>
                  </div>
                )}

                {/* 4. Insights Tab */}
                {rightTab === "insights" && (
                  <>
                    <div className="ide-collab-card">
                      <div className="ide-card-header">
                        <span>🧠 Hindsight Project Insights</span>
                      </div>
                      <input
                        type="text"
                        placeholder="Search technical memory..."
                        value={insightQuery}
                        onChange={(e) => setInsightQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && loadInsightsData()}
                        className="ide-search-input"
                        style={{ marginBottom: "8px" }}
                      />

                      {insights.length === 0 ? (
                        <div style={{ color: "#8b949e", fontSize: "11px" }}>No insights found.</div>
                      ) : (
                        insights.slice(0, 10).map(ins => (
                          <div key={ins.id} style={{ borderBottom: "1px solid #21262d", padding: "6px 0", fontSize: "11px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ color: "#58a6ff", fontWeight: 600 }}>[{ins.event_type}]</span>
                              <span style={{ color: "#8b949e", fontSize: "10px" }}>{ins.timestamp?.slice(0, 10)}</span>
                            </div>
                            <div style={{ color: "#c9d1d9", marginTop: "2px" }}>{ins.description}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}

                {/* 5. Chat Tab */}
                {rightTab === "chat" && (
                  <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                    <div className="ide-chat-list">
                      {chatMessages.map((m, i) => (
                        <div key={i} className="ide-chat-msg">
                          <strong style={{ color: "#58a6ff" }}>{m.sender}:</strong> {m.message}
                        </div>
                      ))}
                    </div>

                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!chatInput.trim() || !currentTeam?.id) return;
                        await sendTeamMessage(currentTeam.id, {
                          sender: userName,
                          role: "developer",
                          message: chatInput.trim(),
                        });
                        setChatInput("");
                      }}
                      className="ide-chat-form"
                    >
                      <input
                        type="text"
                        placeholder="Team message..."
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        className="ide-chat-input"
                      />
                      <button type="submit" className="ide-btn-primary" style={{ padding: "4px 8px" }}>
                        Send
                      </button>
                    </form>
                  </div>
                )}
              </div>

              {/* Bottom Vibe AI Copilot Dock */}
              <div className="ide-copilot-dock">
                <div className="ide-copilot-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "14px" }}>🤖</span>
                    <strong style={{ color: "#58a6ff", fontSize: "12px" }}>Vibe AI Copilot</strong>
                  </div>
                  {/* File Target Switcher */}
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "10px", color: "#8b949e" }}>File:</span>
                    <select
                      value={copilotTargetFile}
                      onChange={(e) => setCopilotTargetFile(e.target.value)}
                      className="ide-copilot-select"
                      title="Select target file for Copilot to edit"
                    >
                      {openTabs.length > 0 ? (
                        openTabs.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))
                      ) : activeTab ? (
                        <option value={activeTab}>{activeTab}</option>
                      ) : (
                        <option value="">(No active file)</option>
                      )}
                    </select>
                  </div>
                </div>

                <div className="ide-copilot-input-row">
                  <input
                    type="text"
                    className="ide-copilot-input"
                    placeholder={
                      copilotTargetFile
                        ? `Ask Copilot to change ${copilotTargetFile.split("/").pop()}...`
                        : "Ask Copilot to write or refactor code..."
                    }
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRunAIAssist()}
                  />
                  <button
                    className="ide-btn-primary"
                    onClick={handleRunAIAssist}
                    disabled={aiThinking || !aiPrompt.trim()}
                    style={{ padding: "6px 12px", whiteSpace: "nowrap" }}
                  >
                    {aiThinking ? "Thinking..." : "⚡ Generate"}
                  </button>
                </div>

                {/* Copilot Result & Apply */}
                {aiResult && (
                  <div className="ide-copilot-response-box">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <span style={{ color: "#3fb950", fontWeight: "600", fontSize: "11px" }}>
                        Suggested Changes:
                      </span>
                      {aiResult.suggestion && (
                        <button
                          className="ide-btn-primary"
                          style={{ padding: "3px 10px", fontSize: "11px", backgroundColor: "#238636" }}
                          onClick={handleApplyAISuggestion}
                          title="Apply changes to this file and save to disk"
                        >
                          ✨ Apply to {copilotTargetFile ? copilotTargetFile.split("/").pop() : "File"}
                        </button>
                      )}
                    </div>

                    {aiResult.explanation && (
                      <div style={{ marginBottom: "6px", color: "#c9d1d9", fontSize: "11px", lineHeight: "1.4" }}>
                        {aiResult.explanation}
                      </div>
                    )}

                    {aiResult.suggestion && (
                      <pre className="ide-copilot-code-preview">
                        <code>{aiResult.suggestion.slice(0, 400) + (aiResult.suggestion.length > 400 ? "\n... (truncated preview)" : "")}</code>
                      </pre>
                    )}

                    {aiResult.memories_used && aiResult.memories_used.length > 0 && (
                      <div style={{ fontSize: "10px", color: "#8b949e", borderTop: "1px solid #21262d", paddingTop: "4px", marginTop: "4px" }}>
                        🧠 Grounded in {aiResult.memories_used.length} Hindsight project memories
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Conflict Resolution Modal */}
      {conflictModalOpen && activeConflict && (
        <div className="ide-modal-backdrop">
          <div className="ide-modal-window">
            <div className="ide-modal-header">
              <span>⚠️ Code Conflict Detected: {activeConflict.path}</span>
              <button
                onClick={() => setConflictModalOpen(false)}
                style={{ background: "none", border: "none", color: "#8b949e", fontSize: "16px", cursor: "pointer" }}
              >
                ×
              </button>
            </div>

            <div className="ide-modal-body">
              <p>
                <strong>{activeConflict.other_author}</strong> also modified this file. OneContext prevents silent overwrites by creating an intelligent 3-way merge validated against recorded project memory.
              </p>

              <div style={{ display: "flex", gap: "8px", margin: "12px 0" }}>
                <button
                  className="ide-btn-primary"
                  onClick={() => handleResolveConflict("ai_merge")}
                  disabled={resolvingConflict}
                >
                  {resolvingConflict ? "Resolving..." : "🤖 AI Smart Merge (Recommended)"}
                </button>
                <button
                  className="ide-btn-secondary"
                  onClick={() => handleResolveConflict("keep_current")}
                  disabled={resolvingConflict}
                >
                  Keep My Version
                </button>
                <button
                  className="ide-btn-secondary"
                  onClick={() => handleResolveConflict("keep_incoming")}
                  disabled={resolvingConflict}
                >
                  Accept Incoming Version
                </button>
              </div>

              {conflictResolution && (
                <div>
                  <div style={{ color: "#3fb950", fontWeight: 600, margin: "8px 0" }}>
                    ✓ {conflictResolution.explanation}
                  </div>
                  <div style={{ fontSize: "12px", color: "#58a6ff" }}>
                    {conflictResolution.validation?.message}
                  </div>
                  <div className="ide-diff-viewer">
                    {conflictResolution.diff || "No structural difference detected."}
                  </div>
                </div>
              )}
            </div>

            <div className="ide-modal-footer">
              <button
                className="ide-btn-secondary"
                onClick={() => setConflictModalOpen(false)}
              >
                Cancel
              </button>
              {conflictResolution && (
                <button
                  className="ide-btn-primary"
                  onClick={handleApplyResolvedCode}
                >
                  Apply Resolution
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Context Pack Generation Modal */}
      {contextPackModal && (
        <div className="ide-modal-backdrop">
          <div className="ide-modal-window">
            <div className="ide-modal-header">
              <span>📦 Generate Task-Specific Context Pack</span>
              <button
                onClick={() => setContextPackModal(false)}
                style={{ background: "none", border: "none", color: "#8b949e", fontSize: "16px", cursor: "pointer" }}
              >
                ×
              </button>
            </div>

            <div className="ide-modal-body">
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", fontWeight: 600 }}>
                  Current Development Task / Goal *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Implement OAuth2 JWT login with 15m expiration"
                  value={packTask}
                  onChange={(e) => setPackTask(e.target.value)}
                  className="ide-search-input"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", fontWeight: 600 }}>
                    Target Assistant / Format
                  </label>
                  <select
                    value={packFormat}
                    onChange={(e) => setPackFormat(e.target.value)}
                    style={{ width: "100%", padding: "6px", backgroundColor: "#0d1117", border: "1px solid #30363d", color: "#f0f6fc", borderRadius: "4px" }}
                  >
                    <option value="codex">Codex</option>
                    <option value="chatgpt">ChatGPT</option>
                    <option value="gemini">Gemini</option>
                    <option value="markdown">Generic Markdown</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", fontWeight: 600 }}>
                    Time Range Filter
                  </label>
                  <select
                    value={packTimeRange}
                    onChange={(e) => setPackTimeRange(e.target.value)}
                    style={{ width: "100%", padding: "6px", backgroundColor: "#0d1117", border: "1px solid #30363d", color: "#f0f6fc", borderRadius: "4px" }}
                  >
                    <option value="all">Entire Project History</option>
                    <option value="1h">Last 1 Hour</option>
                    <option value="24h">Last 24 Hours</option>
                    <option value="7d">Last 7 Days</option>
                    <option value="30d">Last 30 Days</option>
                  </select>
                </div>
              </div>

              <button
                className="ide-btn-primary"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={handleGenerateContextPack}
                disabled={packLoading || !packTask.trim()}
              >
                {packLoading ? "Retrieving semantic memories from Hindsight..." : "Generate Context Pack"}
              </button>

              {generatedPack && (
                <div style={{ marginTop: "14px" }}>
                  <div style={{ display: "flex", gap: "10px", fontSize: "11px", color: "#58a6ff", marginBottom: "6px" }}>
                    <span>📊 {generatedPack.stats?.memories_count || 0} memories</span>
                    <span>• {generatedPack.stats?.insights_count || 0} insights</span>
                    <span>• ~{generatedPack.stats?.estimated_tokens || 0} tokens</span>
                    <span>• Filter: {generatedPack.stats?.time_range}</span>
                  </div>
                  <textarea
                    readOnly
                    value={generatedPack.pack}
                    style={{
                      width: "100%",
                      height: "180px",
                      backgroundColor: "#090d13",
                      border: "1px solid #30363d",
                      borderRadius: "4px",
                      color: "#c9d1d9",
                      fontFamily: "monospace",
                      fontSize: "12px",
                      padding: "8px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              )}
            </div>

            <div className="ide-modal-footer">
              <button
                className="ide-btn-secondary"
                onClick={() => setContextPackModal(false)}
              >
                Close
              </button>
              {generatedPack && (
                <button
                  className="ide-btn-primary"
                  onClick={() => {
                    navigator.clipboard.writeText(generatedPack.pack);
                    alert("Context pack copied to clipboard!");
                  }}
                >
                  📋 Copy Context Pack
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
