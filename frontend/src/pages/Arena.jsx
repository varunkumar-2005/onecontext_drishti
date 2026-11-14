import React, { useState, useEffect, useRef } from "react";
import {
  listArenaSessions,
  createArenaSession,
  getArenaSession,
  joinArenaSession,
  sendArenaHeartbeat,
  claimArenaQuest,
  proposeArenaBossFix,
  approveArenaBossFix,
  switchArenaTheme,
  getArenaRecap,
  getArenaActivity,
  listProjects,
  importArenaRepository,
  importArenaTasks,
  BASE_URL,
} from "../api/client";

import ArenaWorkspace from "../components/arena/ArenaWorkspace";
import RegionDetailModal from "../components/arena/RegionDetailModal";
import QuestBoardModal from "../components/arena/QuestBoardModal";
import BossBattleModal from "../components/arena/BossBattleModal";
import LoreLibraryModal from "../components/arena/LoreLibraryModal";
import ThemeSwitcherModal from "../components/arena/ThemeSwitcherModal";
import SessionRecapModal from "../components/arena/SessionRecapModal";

export default function Arena({ activeProject, currentUser }) {
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [sessionDetails, setSessionDetails] = useState(null);
  const [activity, setActivity] = useState(null);
  const [activityState, setActivityState] = useState("loading");
  const [activityError, setActivityError] = useState("");
  const [arenaConnectionStatus, setArenaConnectionStatus] = useState("connecting");
  const [workspaceError, setWorkspaceError] = useState(null);
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Creation wizard state
  const [selectedProjectId, setSelectedProjectId] = useState(activeProject?.id || "");
  const [gameName, setGameName] = useState("Minecraft");
  const [gameDesc, setGameDesc] = useState("");
  const [objective, setObjective] = useState("Eliminate critical security findings and verify release v0.2.0");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [tasksFile, setTasksFile] = useState(null);
  const [onboardingError, setOnboardingError] = useState("");
  const [onboardingMessage, setOnboardingMessage] = useState("");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Active modals
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [selectedQuest, setSelectedQuest] = useState(null);
  const [selectedBoss, setSelectedBoss] = useState(null);
  const [showQuestBoard, setShowQuestBoard] = useState(false);
  const [showBossModal, setShowBossModal] = useState(false);
  const [showLoreModal, setShowLoreModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showRecapModal, setShowRecapModal] = useState(false);
  const [recapData, setRecapData] = useState(null);
  const [copyCodeSuccess, setCopyCodeSuccess] = useState(false);
  const [showArenaMenu, setShowArenaMenu] = useState(false);
  const arenaMenuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (arenaMenuRef.current && !arenaMenuRef.current.contains(e.target)) {
        setShowArenaMenu(false);
      }
    }
    if (showArenaMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showArenaMenu]);

  const eventSourceRef = useRef(null);

  // Initial load: fetch projects and available arena sessions
  useEffect(() => {
    async function loadInit() {
      try {
        const prjs = await listProjects();
        setProjects(prjs);
        if (prjs.length > 0 && !selectedProjectId) {
          setSelectedProjectId(prjs[0].id);
        }

        const arenaSessions = await listArenaSessions();
        setSessions(arenaSessions || []);

        let savedRoom = null;
        try {
          savedRoom = localStorage.getItem("onecontext_room") ? JSON.parse(localStorage.getItem("onecontext_room")) : null;
        } catch (e) {}
        const currentProjectId = activeProject?.id || savedRoom?.project_id;
        if (currentProjectId && !selectedProjectId) {
          setSelectedProjectId(currentProjectId);
        }

        // Check if saved session in localStorage
        const savedSessionId = localStorage.getItem("onecontext_arena_session_id");
        let activeSessionFound = false;
        if (savedSessionId) {
          try {
            const details = await getArenaSession(savedSessionId);
            if (details?.session) {
              setSessionDetails(details);
              setCurrentSession(details.session);
              activeSessionFound = true;
            }
          } catch (e) {
            // Keep going to fallback
          }
        }

        // If no active session, auto-enter the session for current project or latest active session
        if (!activeSessionFound && arenaSessions && arenaSessions.length > 0) {
          const match = currentProjectId
            ? arenaSessions.find((s) => s.project_id === currentProjectId) || arenaSessions[0]
            : arenaSessions[0];
          if (match) {
            try {
              if (match.join_code) {
                const joinRes = await joinArenaSession({
                  join_code: match.join_code,
                  user_name: currentUser || "Developer",
                });
                if (joinRes.arena_token) {
                  localStorage.setItem("onecontext_arena_token", joinRes.arena_token);
                }
              }
              const details = await getArenaSession(match.id);
              if (details?.session) {
                setSessionDetails(details);
                setCurrentSession(details.session);
                localStorage.setItem("onecontext_arena_session_id", match.id);
              }
            } catch (e) {
              console.warn("Could not auto-enter realm:", e);
            }
          }
        }
      } catch (err) {
        console.error("Error loading Arena initialization:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadInit();
  }, []);

  // Set up real-time SSE stream & heartbeats when inside an active session
  useEffect(() => {
    if (!currentSession) return;

    // Connect SSE stream
    const token = localStorage.getItem("onecontext_arena_token");
    if (!token) return undefined;
    const sseUrl = `${BASE_URL}/arena/sessions/${currentSession.id}/stream?access_token=${encodeURIComponent(token)}`;
    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;
    es.onopen = () => setArenaConnectionStatus("live");
    es.onerror = () => setArenaConnectionStatus("reconnecting");

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (
          data.type === "arena_quest_updated" ||
          data.type === "arena_quest_verified" ||
          data.type === "arena_boss_updated" ||
          data.type === "arena_boss_defeated" ||
          data.type === "arena_theme_switched" ||
          data.type === "arena_member_joined" ||
          data.type === "arena_asset_ready"
        ) {
          // Refresh session details to reflect verified state
          refreshSessionDetails(currentSession.id);
        }
      } catch (e) {
        // keep-alive ping or parse error
      }
    };

    // Presence heartbeat interval every 25s
    const hbInterval = setInterval(() => {
      sendArenaHeartbeat(
        currentSession.id,
        currentUser || "Developer",
        selectedRegion?.region_id || null,
        selectedQuest?.quest_id || null
      ).catch(() => {});
    }, 25000);

    return () => {
      es.close();
      clearInterval(hbInterval);
      setArenaConnectionStatus("connecting");
    };
  }, [currentSession?.id, selectedRegion, selectedQuest]);

  const refreshSessionDetails = async (sessionId) => {
    try {
      const details = await getArenaSession(sessionId);
      setSessionDetails(details);
      setCurrentSession(details.session);
      setWorkspaceError(null);
    } catch (requestError) {
      setWorkspaceError(requestError.response?.data?.detail || "Session data could not be refreshed.");
    }
    refreshActivity(sessionId);
  };

  const refreshActivity = async (sessionId) => {
    try {
      const recentActivity = await getArenaActivity(sessionId);
      setActivity(recentActivity);
      setActivityError("");
      setActivityState("ready");
    } catch (requestError) {
      const status = requestError.response?.status;
      setActivityError(requestError.response?.data?.detail || (status
        ? `The API returned HTTP ${status}.`
        : "The backend is unreachable or the request was blocked."));
      setActivityState("error");
    }
  };

  useEffect(() => {
    if (currentSession?.id) {
      setActivityState("loading");
      refreshActivity(currentSession.id);
    }
  }, [currentSession?.id]);

  const handleCreateSession = async (e) => {
    e.preventDefault();
    setOnboardingError("");
    setOnboardingMessage("");
    if (!selectedProjectId) {
      setOnboardingError("Please select a connected project.");
      return;
    }
    if (repositoryUrl.trim()) {
      try {
        const parsed = new URL(repositoryUrl.trim());
        if (parsed.protocol !== "https:" || !["github.com", "www.github.com"].includes(parsed.hostname)) {
          throw new Error();
        }
      } catch {
        setOnboardingError("Enter an HTTPS GitHub repository URL.");
        return;
      }
    }
    if (tasksFile) {
      const isMarkdown = /\.md$/i.test(tasksFile.name)
        || ["text/markdown", "text/plain"].includes(tasksFile.type);
      if (!isMarkdown) {
        setOnboardingError("Choose a Markdown task file (.md).");
        return;
      }
      if (tasksFile.size > 1_000_000) {
        setOnboardingError("Markdown task files must be 1 MB or smaller.");
        return;
      }
    }
    setIsCreating(true);
    let createdSession = false;
    try {
      const details = await createArenaSession({
        project_id: selectedProjectId,
        game_name: gameName,
        game_description: gameDesc || undefined,
        objective: objective,
        host_name: currentUser || "Lead Architect",
      });
      createdSession = true;
      setSessionDetails(details);
      setCurrentSession(details.session);
      setWorkspaceError(null);
      localStorage.setItem("onecontext_arena_session_id", details.session.id);
      setSessions([details.session]);
      const imported = [];
      if (repositoryUrl.trim()) {
        await importArenaRepository(details.session.id, repositoryUrl.trim());
        imported.push("repository");
      }
      if (tasksFile) {
        const markdown = await tasksFile.text();
        await importArenaTasks(details.session.id, markdown);
        imported.push("tasks");
      }
      if (imported.length) {
        const refreshed = await getArenaSession(details.session.id);
        setSessionDetails(refreshed);
        setCurrentSession(refreshed.session);
        setOnboardingMessage(`Imported ${imported.join(" and ")} successfully.`);
      }
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || "Arena setup failed.";
      setOnboardingError(createdSession
        ? `Arena started, but onboarding failed: ${detail}`
        : detail);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinSession = async (e) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) return;
    try {
      const res = await joinArenaSession({
        join_code: joinCodeInput.trim().toUpperCase(),
        user_name: currentUser || "Teammate",
        avatar_style: "explorer",
      });
      const details = await getArenaSession(res.session.id);
      setSessionDetails(details);
      setCurrentSession(details.session);
      setWorkspaceError(null);
      localStorage.setItem("onecontext_arena_session_id", res.session.id);
    } catch (err) {
      alert(err.response?.data?.detail || err.message || "Invalid join code.");
    }
  };

  const handleClaimQuest = async (questId) => {
    await claimArenaQuest(currentSession.id, questId, {
      userId: currentUser || "Developer",
      userName: currentUser || "Developer",
    });
    await refreshSessionDetails(currentSession.id);
  };

  const handleProposeFix = async (bossId, payload) => {
    await proposeArenaBossFix(currentSession.id, bossId, payload);
    refreshSessionDetails(currentSession.id);
  };

  const handleApproveFix = async (bossId, payload) => {
    await approveArenaBossFix(currentSession.id, bossId, payload);
    refreshSessionDetails(currentSession.id);
  };

  const handleSwitchTheme = async (payload) => {
    const updated = await switchArenaTheme(currentSession.id, payload);
    setSessionDetails(updated);
    setCurrentSession(updated.session);
  };

  const handleOpenRecap = async () => {
    try {
      const recap = await getArenaRecap(currentSession.id);
      setRecapData(recap);
      setShowRecapModal(true);
    } catch (e) {
      alert("Failed to load recap report.");
    }
  };

  const handleCopyCode = () => {
    if (currentSession?.join_code) {
      navigator.clipboard.writeText(currentSession.join_code);
      setCopyCodeSuccess(true);
      setTimeout(() => setCopyCodeSuccess(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
        Loading OneContext Arena...
      </div>
    );
  }

  // --- LOBBY / ENTRY VIEW ---
  if (!currentSession) {
    return (
      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "30px 20px" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontSize: "42px", marginBottom: "8px" }}>⚔️ 🌍 🎮</div>
          <h1 style={{ fontSize: "28px", color: "#f8fafc", margin: 0 }}>
            OneContext Arena
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "15px", marginTop: "8px" }}>
            Transform real software engineering projects into interactive, game-themed multiplayer worlds.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "24px" }}>
          {/* Create Session Wizard */}
          <div style={panelStyle}>
            <h3 style={{ margin: "0 0 16px 0", color: "#f8fafc", fontSize: "18px" }}>
              ✨ Launch New Arena Realm
            </h3>
            {selectedProjectId && (
              <div style={{ backgroundColor: "#1e1b4b", border: "1px solid #0284c7", borderRadius: "6px", padding: "10px 12px", fontSize: "12px", color: "#93c5fd", marginBottom: "14px" }}>
                🔗 <strong>Single Input Synced:</strong> Your project files and tasks uploaded in the Team Room are automatically shared with Arena. You do not need to re-upload files unless overriding them.
              </div>
            )}
            <form onSubmit={handleCreateSession} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={labelStyle}>Select Project</label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  style={inputStyle}
                  required
                >
                  <option value="" disabled>-- Choose a connected project --</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle} htmlFor="arena-repository-url">GitHub repo URL (optional)</label>
                <input
                  id="arena-repository-url"
                  type="url"
                  value={repositoryUrl}
                  onChange={(e) => setRepositoryUrl(e.target.value)}
                  placeholder="https://github.com/owner/repository"
                  style={inputStyle}
                />
                <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
                  Imports repository paths only. Public repositories work without credentials; private repositories require GITHUB_TOKEN on the backend.
                </div>
              </div>

              <div>
                <label style={labelStyle} htmlFor="arena-tasks-file">Upload tasks file (optional)</label>
                <input
                  id="arena-tasks-file"
                  type="file"
                  accept=".md,text/markdown,text/plain"
                  onChange={(e) => setTasksFile(e.target.files?.[0] || null)}
                  style={inputStyle}
                />
                <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
                  Markdown checklist items and headings become quests. Maximum 1 MB; task text is parsed, not executed.
                </div>
              </div>

              <div>
                <label style={labelStyle}>Game Theme Universe</label>
                <input
                  value={gameName}
                  onChange={(e) => setGameName(e.target.value)}
                  placeholder="e.g. Minecraft, Swordigo, GTA V, Pokémon, Zelda..."
                  style={inputStyle}
                  required
                />
                <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
                  Supported archetypes: Voxel, Platformer, Urban District, Fantasy, Strategy, and Custom.
                </div>
              </div>

              <div>
                <label style={labelStyle}>Session Mission / Objective</label>
                <input
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  placeholder="What is the team's engineering goal?"
                  style={inputStyle}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isCreating}
                style={{ ...btnPrimaryStyle, padding: "12px", marginTop: "8px" }}
              >
                {isCreating ? "Compiling Game Bible & Constructing World..." : "🚀 Generate & Launch Realm"}
              </button>
              {onboardingError && <p role="alert" style={{ color: "#ff8a7d", margin: 0 }}>{onboardingError}</p>}
              {onboardingMessage && <p role="status" style={{ color: "#7bf0a0", margin: 0 }}>{onboardingMessage}</p>}
            </form>
          </div>

          {/* Join By Code & Active Sessions */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={panelStyle}>
              <h3 style={{ margin: "0 0 12px 0", color: "#f8fafc", fontSize: "16px" }}>
                🔑 Join via Room Code
              </h3>
              <form onSubmit={handleJoinSession} style={{ display: "flex", gap: "8px" }}>
                <input
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value)}
                  placeholder="Enter 8-char code"
                  maxLength={8}
                  style={{ ...inputStyle, textTransform: "uppercase", letterSpacing: "2px", fontWeight: "bold" }}
                />
                <button type="submit" style={btnPrimaryStyle}>Join</button>
              </form>
            </div>

            {/* Active Sessions List */}
            <div style={panelStyle}>
              <h4 style={{ margin: "0 0 10px 0", color: "#94a3b8", fontSize: "13px" }}>
                ACTIVE REALMS ({sessions.length})
              </h4>
              {sessions.length === 0 ? (
                <div style={{ color: "#64748b", fontSize: "12px" }}>No active sessions yet. Create one!</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "220px", overflowY: "auto" }}>
                  {sessions.map((s) => (
                    <div
                      key={s.id}
                      onClick={async () => {
                        try {
                          if (s.join_code) {
                            const joinRes = await joinArenaSession({
                              join_code: s.join_code,
                              user_name: currentUser || "Developer",
                            });
                            if (joinRes.arena_token) {
                              localStorage.setItem("onecontext_arena_token", joinRes.arena_token);
                            }
                          }
                        } catch (e) {}
                        const d = await getArenaSession(s.id);
                        setSessionDetails(d);
                        setCurrentSession(d.session);
                        localStorage.setItem("onecontext_arena_session_id", s.id);
                      }}
                      style={sessionCardStyle}
                    >
                      <div>
                        <strong style={{ color: "#f8fafc", fontSize: "13px" }}>{s.game_name}</strong>
                        <div style={{ fontSize: "11px", color: "#94a3b8" }}>{s.project_name}</div>
                      </div>
                      <span style={{ fontSize: "11px", color: "#38bdf8", padding: "2px 6px", background: "#0c4a6e", borderRadius: "4px" }}>
                        {s.join_code}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- ACTIVE MULTIPLAYER ARENA VIEW ---
  const entities = sessionDetails?.entities || { regions: [], quests: [], bosses: [], checkpoints: [] };
  const gameBible = sessionDetails?.game_bible;
  const assets = sessionDetails?.assets || [];

  return (
    <ArenaWorkspace
      currentSession={currentSession}
      currentUser={currentUser}
      sessionDetails={sessionDetails}
      error={workspaceError}
      onClaimQuest={handleClaimQuest}
      onSelectRegion={setSelectedRegion}
      onLeave={() => {
        if (window.confirm("Are you sure you want to leave this Arena session?")) {
          localStorage.removeItem("onecontext_arena_session_id");
          localStorage.removeItem("onecontext_arena_token");
          setCurrentSession(null);
        }
      }}
      activity={activity}
      activityState={activityState}
      activityError={activityError}
      connectionStatus={arenaConnectionStatus}
      onRetryActivity={() => refreshActivity(currentSession.id)}
      toolbar={(
        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", position: "relative" }}>
          {onboardingError && <span role="alert" style={{ color: "#ff8a7d", fontSize: "11px" }}>{onboardingError}</span>}
          {onboardingMessage && <span role="status" style={{ color: "#7bf0a0", fontSize: "11px" }}>{onboardingMessage}</span>}
          <button type="button" onClick={handleCopyCode} title="Copy join code">
            {copyCodeSuccess ? "✓ Copied" : `Invite ${currentSession.join_code}`}
          </button>

          <div ref={arenaMenuRef} style={{ position: "relative", display: "inline-block" }}>
            <button
              type="button"
              onClick={() => setShowArenaMenu((prev) => !prev)}
              aria-expanded={showArenaMenu}
              aria-haspopup="menu"
              style={{ fontWeight: "700" }}
            >
              Realm Tools ▾
            </button>
            {showArenaMenu && (
              <div className="arena-dropdown-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="arena-dropdown-item"
                  onClick={() => {
                    setShowArenaMenu(false);
                    setShowQuestBoard(true);
                  }}
                >
                  <span>📋</span> Quest Board
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="arena-dropdown-item"
                  onClick={() => {
                    setShowArenaMenu(false);
                    if (entities.bosses.length) setSelectedBoss(entities.bosses[0]);
                    setShowBossModal(true);
                  }}
                >
                  <span>👾</span> Boss Battles
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="arena-dropdown-item"
                  onClick={() => {
                    setShowArenaMenu(false);
                    setShowLoreModal(true);
                  }}
                >
                  <span>📜</span> World Lore
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="arena-dropdown-item"
                  onClick={() => {
                    setShowArenaMenu(false);
                    setShowThemeModal(true);
                  }}
                >
                  <span>🎨</span> Switch Theme
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="arena-dropdown-item"
                  onClick={() => {
                    setShowArenaMenu(false);
                    handleOpenRecap();
                  }}
                >
                  <span>📊</span> Session Recap
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    >
      {selectedRegion && (
        <RegionDetailModal
          region={selectedRegion}
          quests={entities.quests}
          bosses={entities.bosses}
          onClose={() => setSelectedRegion(null)}
          onSelectQuest={(quest) => {
            setSelectedRegion(null);
            setSelectedQuest(quest);
            setShowQuestBoard(true);
          }}
          onSelectBoss={(boss) => {
            setSelectedRegion(null);
            setSelectedBoss(boss);
            setShowBossModal(true);
          }}
        />
      )}
      {showQuestBoard && (
        <QuestBoardModal
          quests={entities.quests}
          currentUser={currentUser}
          onClose={() => setShowQuestBoard(false)}
          onClaimQuest={handleClaimQuest}
        />
      )}
      {showBossModal && (
        <BossBattleModal
          boss={selectedBoss || entities.bosses[0]}
          currentUser={currentUser}
          assets={assets}
          onClose={() => setShowBossModal(false)}
          onProposeFix={handleProposeFix}
          onApproveFix={handleApproveFix}
        />
      )}
      {showLoreModal && (
        <LoreLibraryModal
          sessionId={currentSession.id}
          gameBible={gameBible}
          onClose={() => setShowLoreModal(false)}
        />
      )}
      {showThemeModal && (
        <ThemeSwitcherModal
          currentGame={currentSession.game_name}
          onClose={() => setShowThemeModal(false)}
          onSwitchTheme={handleSwitchTheme}
        />
      )}
      {showRecapModal && <SessionRecapModal recap={recapData} onClose={() => setShowRecapModal(false)} />}
    </ArenaWorkspace>
  );
}

const panelStyle = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: "12px",
  padding: "24px",
};

const labelStyle = {
  display: "block",
  fontSize: "12px",
  color: "#94a3b8",
  marginBottom: "6px",
  fontWeight: "bold",
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
};

const btnPrimaryStyle = {
  padding: "10px 18px",
  background: "#2563eb",
  color: "#ffffff",
  border: "none",
  borderRadius: "6px",
  fontWeight: "bold",
  fontSize: "13px",
  cursor: "pointer",
};

const sessionCardStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  background: "#1e293b",
  padding: "10px 12px",
  borderRadius: "6px",
  border: "1px solid #334155",
  cursor: "pointer",
};
