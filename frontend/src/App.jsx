/**
 * frontend/src/App.jsx
 * Root application shell for OneContext.
 * Features:
 * - Unified Live Team Room at "/"
 * - Real-time SSE / Polling connection status indicator (Live / Reconnecting)
 * - Headline: "One project. One memory. Every AI assistant."
 * - "More" dropdown menu retaining all secondary views (Dashboard, Memory Explorer, Audit Trail, Simulated Assistants)
 */

import React, { useState, useEffect, useRef } from "react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import LiveRoom from "./pages/LiveRoom";
import Dashboard from "./pages/Dashboard";
import ProjectCreate from "./pages/ProjectCreate";
import Agents from "./pages/Agents";
import MemoryExplorer from "./pages/MemoryExplorer";
import SearchHistory from "./pages/SearchHistory";
import Team from "./pages/Team";
import ContextPack from "./pages/ContextPack";
import Arena from "./pages/Arena";
import World from "./pages/World";
import IDE from "./pages/IDE";

export default function App() {
  const [activeProject, setActiveProject] = useState(null);
  const [currentTeam, setCurrentTeam] = useState(null);
  const [currentUser, setCurrentUser] = useState("Developer");
  const [connectionStatus, setConnectionStatus] = useState("live");
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const location = useLocation();
  const moreMenuRef = useRef(null);

  useEffect(() => {
    if (!showMoreMenu) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!moreMenuRef.current?.contains(event.target)) setShowMoreMenu(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setShowMoreMenu(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [showMoreMenu]);

  // Restore room and user from localStorage on refresh
  useEffect(() => {
    try {
      const savedRoom = localStorage.getItem("onecontext_room");
      const savedUser = localStorage.getItem("onecontext_user");
      if (savedRoom) {
        const teamObj = JSON.parse(savedRoom);
        setCurrentTeam(teamObj);
        setActiveProject({ id: teamObj.project_id, name: teamObj.name });
      }
      if (savedUser) {
        setCurrentUser(savedUser);
      }
    } catch (e) {
      console.warn("Could not restore session from localStorage:", e);
    }
  }, []);

  return (
    <div style={styles.appWrapper}>
      {/* Top Navbar */}
      <nav style={styles.navbar}>
        <div style={styles.navInner}>
          {/* Logo & Headline */}
          <div style={styles.logoGroup}>
            <Link to="/" style={styles.logo}>
              <span style={styles.logoIcon}>🧠</span>
              <span style={styles.logoText}>OneContext</span>
            </Link>
            <span style={styles.headline}>One project. One memory. Every AI assistant.</span>
          </div>

          {/* Right Header Controls */}
          <div style={styles.rightControls}>
            {/* Live Connection Indicator */}
            {(location.pathname === "/" || location.pathname === "/team") && currentTeam && (
              <div style={styles.statusIndicator} aria-live="polite">
                <span
                  style={{
                    ...styles.statusDot,
                    backgroundColor: connectionStatus === "live" ? "#10b981" : "#f59e0b",
                    boxShadow: connectionStatus === "live" ? "0 0 8px #10b981" : "none",
                  }}
                />
                <span style={styles.statusText}>
                  Team room {connectionStatus === "live" ? "Live" : "Reconnecting"}
                </span>
              </div>
            )}

            {/* Active Room Pill */}
            {currentTeam && (
              <div style={styles.activeRoomBadge}>
                <span>Room: <strong>{currentTeam.name}</strong></span>
                <span style={styles.joinCodePill}>{currentTeam.join_code}</span>
              </div>
            )}

            {/* Main Nav: Team Room */}
            <Link
              to="/"
              style={{
                ...styles.navLink,
                backgroundColor: location.pathname === "/" ? "#27272a" : "transparent",
                color: location.pathname === "/" ? "#ffffff" : "#a1a1aa",
              }}
            >
              Team Room
            </Link>

            {/* OneContext Arena Game World */}
            <Link
              to="/arena"
              style={{
                ...styles.navLink,
                backgroundColor: location.pathname === "/arena" ? "#1e1b4b" : "transparent",
                color: location.pathname === "/arena" ? "#38bdf8" : "#93c5fd",
                border: "1px solid #0284c7",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontWeight: "bold",
              }}
            >
              <span>⚔️ Arena</span>
            </Link>
            <Link to="/world" style={{ ...styles.navLink, backgroundColor: location.pathname === "/world" ? "#164e63" : "transparent", color: "#67e8f9", border: "1px solid #155e75" }}>
              ◈ World
            </Link>

            {/* Collaborative IDE Quick Button */}
            <Link
              to="/ide"
              style={{
                ...styles.navLink,
                backgroundColor: location.pathname === "/ide" ? "#2563eb" : "#1e1b4b",
                color: location.pathname === "/ide" ? "#ffffff" : "#a5b4fc",
                border: "1px solid #4338ca",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>💻 Open IDE</span>
            </Link>

            {/* "More" Dropdown Menu */}
            <div style={styles.moreMenuWrapper} ref={moreMenuRef}>
              <button
                type="button"
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                style={styles.moreBtn}
                aria-expanded={showMoreMenu}
                aria-haspopup="menu"
                aria-controls="more-navigation-menu"
              >
                Project tools ▾
              </button>

              {showMoreMenu && (
                <div id="more-navigation-menu" role="menu" aria-label="Project tools" style={styles.dropdown}>
                  <div style={styles.dropdownHeading}>Project tools</div>
                  {[
                    ["/dashboard", "Project overview", "Project selection, service health, and memory demo"],
                    ["/memory", "Project memory", "Search, save, and correct shared project decisions"],
                    ["/history", "Memory activity log", "Review recorded searches and memory changes"],
                    ["/agents", "AI agent playground", "Run experimental planner, builder, and validator agents"],
                    ["/context-pack", "Context pack builder", "Prepare project context for an external AI assistant"],
                  ].map(([to, label, description]) => (
                    <Link
                      key={to}
                      to={to}
                      role="menuitem"
                      aria-current={location.pathname === to ? "page" : undefined}
                      style={{
                        ...styles.dropdownItem,
                        ...(location.pathname === to ? styles.dropdownItemActive : {}),
                      }}
                      onClick={() => setShowMoreMenu(false)}
                    >
                      <strong>{label}</strong>
                      <span style={styles.dropdownDescription}>{description}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main App Content */}
      <main style={styles.mainContent}>
        <Routes>
          <Route
            path="/"
            element={
              <LiveRoom
                currentTeam={currentTeam}
                setCurrentTeam={setCurrentTeam}
                activeProject={activeProject}
                setActiveProject={setActiveProject}
                currentUser={currentUser}
                setCurrentUser={setCurrentUser}
                connectionStatus={connectionStatus}
                setConnectionStatus={setConnectionStatus}
              />
            }
          />
          <Route
            path="/arena"
            element={
              <Arena
                activeProject={activeProject}
                currentUser={currentUser}
              />
            }
          />
          <Route path="/world" element={<World />} />
          <Route
            path="/dashboard"
            element={<Dashboard activeProject={activeProject} setActiveProject={setActiveProject} />}
          />
          <Route
            path="/context-pack"
            element={<ContextPack activeProject={activeProject} setActiveProject={setActiveProject} />}
          />
          <Route
            path="/projects/new"
            element={<ProjectCreate setActiveProject={setActiveProject} />}
          />
          <Route
            path="/agents"
            element={<Agents activeProject={activeProject} />}
          />
          <Route
            path="/memory"
            element={<MemoryExplorer activeProject={activeProject} />}
          />
          <Route
            path="/history"
            element={<SearchHistory activeProject={activeProject} />}
          />
          <Route
            path="/team"
            element={
              <Team
                activeProject={activeProject}
                setActiveProject={setActiveProject}
                currentTeam={currentTeam}
                setCurrentTeam={setCurrentTeam}
              />
            }
          />
          <Route
            path="/ide"
            element={
              <IDE
                activeProject={activeProject}
                currentUser={currentUser}
                currentTeam={currentTeam}
              />
            }
          />
        </Routes>
      </main>
    </div>
  );
}

const styles = {
  appWrapper: {
    minHeight: "100vh",
    backgroundColor: "#09090b",
    color: "#f4f4f5",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  navbar: {
    backgroundColor: "#121215",
    borderBottom: "1px solid #27272a",
    position: "sticky",
    top: 0,
    zIndex: 50,
  },
  navInner: {
    width: "100%",
    padding: "0 20px",
    height: "60px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    boxSizing: "border-box",
  },
  logoGroup: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    textDecoration: "none",
  },
  logoIcon: {
    fontSize: "22px",
  },
  logoText: {
    color: "#f4f4f5",
    fontSize: "19px",
    fontWeight: "800",
    letterSpacing: "-0.5px",
  },
  headline: {
    fontSize: "13px",
    color: "#71717a",
    borderLeft: "1px solid #27272a",
    paddingLeft: "14px",
    display: "none", // responsive hide on small screens
    "@media (min-width: 800px)": {
      display: "inline",
    },
  },
  rightControls: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  statusIndicator: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "#18181b",
    border: "1px solid #27272a",
    borderRadius: "14px",
    padding: "4px 10px",
  },
  statusDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
  },
  statusText: {
    fontSize: "12px",
    fontWeight: "600",
    color: "#d4d4d8",
  },
  activeRoomBadge: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "12px",
    color: "#a1a1aa",
    backgroundColor: "#18181b",
    border: "1px solid #27272a",
    padding: "4px 10px",
    borderRadius: "6px",
  },
  joinCodePill: {
    backgroundColor: "#1e1b4b",
    color: "#818cf8",
    fontFamily: "monospace",
    fontWeight: "700",
    padding: "2px 6px",
    borderRadius: "4px",
    letterSpacing: "1px",
  },
  navLink: {
    textDecoration: "none",
    fontSize: "13px",
    fontWeight: "600",
    padding: "6px 12px",
    borderRadius: "6px",
  },
  moreMenuWrapper: {
    position: "relative",
  },
  moreBtn: {
    backgroundColor: "#18181b",
    border: "1px solid #27272a",
    color: "#a1a1aa",
    borderRadius: "6px",
    padding: "6px 12px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
  dropdown: {
    position: "absolute",
    right: 0,
    top: "38px",
    backgroundColor: "#18181b",
    border: "1px solid #3f3f46",
    borderRadius: "8px",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
    width: "min(310px, calc(100vw - 24px))",
    padding: "6px 0",
    zIndex: 100,
    display: "flex",
    flexDirection: "column",
  },
  dropdownItem: {
    padding: "10px 14px",
    color: "#d4d4d8",
    fontSize: "13px",
    textDecoration: "none",
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    transition: "background 0.15s ease",
  },
  dropdownItemActive: {
    backgroundColor: "#27272a",
    color: "#ffffff",
  },
  dropdownHeading: {
    padding: "8px 14px",
    color: "#71717a",
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  dropdownDescription: {
    color: "#a1a1aa",
    fontSize: "11px",
    lineHeight: 1.35,
  },
  mainContent: {
    width: "100%",
    margin: 0,
    padding: 0,
  },
};
