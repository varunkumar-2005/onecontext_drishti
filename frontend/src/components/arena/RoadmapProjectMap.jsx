import React, { useState, useMemo } from "react";
import "./RoadmapProjectMap.css";

// Default archetypes and coordinates for the 5 engineering phases
const DEFAULT_PHASE_CONFIGS = [
  {
    order: 0,
    defaultTitle: "Phase 1: Architecture & Ingestion",
    shortTitle: "Architecture & Ingest",
    archetype: "camp",
    x: 210,
    y: 540,
    signX: 190,
    signY: 670,
    pathX: 200,
    pathY: 580,
  },
  {
    order: 1,
    defaultTitle: "Phase 2: Core Engine & API Services",
    shortTitle: "Core Engine & APIs",
    archetype: "workshop",
    x: 490,
    y: 530,
    signX: 470,
    signY: 640,
    pathX: 460,
    pathY: 560,
  },
  {
    order: 2,
    defaultTitle: "Phase 3: AI Agent Matrix & Validation",
    shortTitle: "Agent Matrix & Rules",
    archetype: "bridge",
    x: 630,
    y: 330,
    signX: 630,
    signY: 420,
    pathX: 650,
    pathY: 370,
  },
  {
    order: 3,
    defaultTitle: "Phase 4: Real-Time Sync & Telemetry",
    shortTitle: "Real-Time Telemetry",
    archetype: "tower",
    x: 940,
    y: 530,
    signX: 920,
    signY: 640,
    pathX: 890,
    pathY: 570,
  },
  {
    order: 4,
    defaultTitle: "Phase 5: Production Deployment & Scale",
    shortTitle: "Production Release",
    archetype: "castle",
    x: 1040,
    y: 190,
    signX: 1000,
    signY: 310,
    pathX: 990,
    pathY: 260,
  },
];

export default function RoadmapProjectMap({
  roadmap,
  currentSession,
  currentUser,
  currentUserId,
  isHost,
  onClaimQuest,
  onSubmitQuest,
  onApproveQuest,
  onOverridePhaseLock,
  onImportTasks,
  onRefresh,
  loading = false,
  error = null,
}) {
  const [selectedPhaseId, setSelectedPhaseId] = useState(null);
  const [showQuestLog, setShowQuestLog] = useState(true);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [evidenceNotes, setEvidenceNotes] = useState({});
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Markdown import state
  const [markdownInput, setMarkdownInput] = useState(
`# Phase 1: Architecture & Ingestion
- [ ] Connect OneContext Hindsight shared memory bank (XP: 100) (Due: 2026-11-20)
- [ ] Ingest repository files & extract AST code blocks (XP: 120) (Due: 2026-11-22)

# Phase 2: Core Engine & API Services
- [ ] Configure Groq dual-model LLM engine with fallback (XP: 150) (Due: 2026-11-25)
- [ ] Build shared context pack generator & AST parser (XP: 140) (Due: 2026-11-27)

# Phase 3: AI Agent Matrix & Validation
- [ ] Initialize Planner, Builder & Validator agent roles (XP: 180) (Due: 2026-11-30)
- [ ] Implement semantic contradiction detector in Hindsight (XP: 200) (Due: 2026-12-02)

# Phase 4: Real-Time Sync & Telemetry
- [ ] Deploy sub-second Server-Sent Events (SSE) telemetry stream (XP: 220) (Due: 2026-12-05)
- [ ] Enable concurrent file edit detection & 3-way LLM merge (XP: 200) (Due: 2026-12-07)

# Phase 5: Production Deployment & Scale
- [ ] Multi-tenant isolation & distributed session clustering (XP: 300) (Due: 2026-12-15)
- [ ] Cloud deployment verification & end-to-end benchmark (XP: 250) (Due: 2026-12-20)`
  );

  const phases = useMemo(() => roadmap?.phases || [], [roadmap]);
  const members = useMemo(() => roadmap?.members || [], [roadmap]);
  const achievements = useMemo(() => roadmap?.achievements || [], [roadmap]);
  const overallProgress = roadmap?.overall_progress || 0;
  const verifiedQuestsCount = roadmap?.verified_quests || 0;
  const totalQuestsCount = roadmap?.total_quests || 0;

  // Calculate total stars earned across phases
  const totalStars = useMemo(() => {
    return phases.reduce((acc, p) => acc + (p.stars || 0), 0);
  }, [phases]);

  // Aggregate all quests for Quest Log
  const { completedQuests, activeQuests } = useMemo(() => {
    const completed = [];
    const active = [];
    phases.forEach((phase) => {
      (phase.quests || []).forEach((quest) => {
        const item = { ...quest, phaseId: phase.id, phaseTitle: phase.title };
        if (quest.status === "verified") {
          completed.push(item);
        } else {
          active.push(item);
        }
      });
    });
    return { completedQuests: completed, activeQuests: active };
  }, [phases]);

  // Find currently selected phase
  const selectedPhase = useMemo(() => {
    if (!selectedPhaseId && phases.length > 0) return null;
    return phases.find((p) => p.id === selectedPhaseId) || null;
  }, [selectedPhaseId, phases]);

  // Map phases to visual layout slots
  const mappedPhases = useMemo(() => {
    if (!phases || phases.length === 0) {
      // Return placeholder phase nodes so the map always looks complete
      return DEFAULT_PHASE_CONFIGS.map((config) => ({
        id: `ph-default-${config.order}`,
        order: config.order,
        title: config.defaultTitle,
        themed_title: config.defaultTitle,
        landmark_archetype: config.archetype,
        locked: config.order > 0,
        stars: 0,
        progress: 0,
        verified_quests: 0,
        total_quests: 0,
        quests: [],
        layout: config,
      }));
    }

    return phases.map((phase, idx) => {
      const config = DEFAULT_PHASE_CONFIGS[idx % DEFAULT_PHASE_CONFIGS.length];
      return {
        ...phase,
        layout: config,
      };
    });
  }, [phases]);

  // Simple client-side preview parser for import markdown
  const parsedPreview = useMemo(() => {
    const lines = markdownInput.split("\n");
    let phaseCount = 0;
    let questCount = 0;
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (/^#+\s+(?:Phase\s+\d+[:\s-]*)?(.+)$/i.test(trimmed)) {
        phaseCount++;
      } else if (/^[-*]\s+\[[ xX]?\]\s+(.+)$/i.test(trimmed)) {
        questCount++;
      }
    });
    return { phaseCount, questCount };
  }, [markdownInput]);

  // Handlers
  const handleSelectPhase = (phaseId) => {
    setSelectedPhaseId(phaseId);
    setActionError("");
    setActionSuccess("");
  };

  const handleClaim = async (questId) => {
    try {
      setIsSubmitting(true);
      setActionError("");
      await onClaimQuest(questId);
      setActionSuccess("Quest claimed successfully!");
    } catch (err) {
      setActionError(err?.response?.data?.detail || err.message || "Failed to claim quest.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (questId) => {
    try {
      setIsSubmitting(true);
      setActionError("");
      const note = evidenceNotes[questId] || "Completed quest evidence submitted";
      await onSubmitQuest(questId, note);
      setActionSuccess("PR / Evidence submitted! Awaiting host approval.");
    } catch (err) {
      setActionError(err?.response?.data?.detail || err.message || "Failed to submit quest.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async (questId) => {
    try {
      setIsSubmitting(true);
      setActionError("");
      const note = evidenceNotes[questId] || "Approved by host";
      await onApproveQuest(questId, note);
      setActionSuccess("Quest approved! Verified XP awarded.");
    } catch (err) {
      setActionError(err?.response?.data?.detail || err.message || "Failed to approve quest.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOverrideUnlock = async (phaseId) => {
    try {
      setIsSubmitting(true);
      setActionError("");
      await onOverridePhaseLock(phaseId, true);
      setActionSuccess("Phase lock overridden by host.");
    } catch (err) {
      setActionError(err?.response?.data?.detail || err.message || "Failed to override unlock.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImportSubmit = async () => {
    try {
      setIsSubmitting(true);
      setActionError("");
      await onImportTasks(markdownInput);
      setShowImportModal(false);
      setActionSuccess("Roadmap tasks imported successfully!");
    } catch (err) {
      setActionError(err?.response?.data?.detail || err.message || "Failed to import tasks.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="roadmap-screen" role="region" aria-label="Project Roadmap Quest Map">
      {error && (
        <div style={{ padding: "6px 14px", background: "rgba(239, 68, 68, 0.2)", border: "1px solid #ef4444", borderRadius: "8px", margin: "0 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#fca5a5", fontSize: "12px" }}>{error}</span>
          <button type="button" onClick={onRefresh} style={{ background: "#f59e0b", border: "none", borderRadius: "4px", padding: "2px 8px", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>Retry</button>
        </div>
      )}
      {/* 1. TOP CARVED WOODEN HEADER BANNER */}
      <div className="roadmap-header-row">
        <div className="roadmap-header-plaque" role="banner">
          <h1 className="roadmap-header-title">Project Roadmap Quest</h1>
        </div>

        <div className="roadmap-header-counters">
          <button
            type="button"
            className="roadmap-counter-badge is-gold"
            onClick={() => setShowAchievements(true)}
            title="Roadmap Stars"
            aria-label={`Earned ${totalStars} stars`}
          >
            <span>⭐</span>
            <span>{totalStars}</span>
          </button>
          <button
            type="button"
            className="roadmap-counter-badge"
            onClick={() => setShowLeaderboard(true)}
            title="View Leaderboard"
            aria-label={`Completed ${verifiedQuestsCount} quests. Click for leaderboard.`}
          >
            <span>🏆</span>
            <span>{verifiedQuestsCount}</span>
          </button>
        </div>
      </div>

      {/* 2. TOP ROADMAP PROGRESS BAR WITH TEAMMATE PINS */}
      <div className="roadmap-progress-bar-wrap" role="progressbar" aria-valuenow={overallProgress} aria-valuemin="0" aria-valuemax="100">
        <span className="roadmap-bar-label">Roadmap</span>
        <span className="roadmap-bar-icon-start" aria-hidden="true">⭐</span>

        <div className="roadmap-track-container">
          <div className="roadmap-track-fill" style={{ width: `${Math.min(100, Math.max(0, overallProgress))}%` }} />

          {/* Teammate pins on the progress bar */}
          {members.map((member, i) => {
            // Compute percentage along track (0% to 100%)
            const memberProgress = member.verified_xp > 0 && roadmap?.verified_xp > 0
              ? Math.min(100, Math.round((member.verified_xp / roadmap.verified_xp) * overallProgress))
              : Math.min(95, (i + 1) * 18);

            return (
              <div
                key={member.user_id || i}
                className="roadmap-bar-pin"
                style={{ left: `${memberProgress}%` }}
                title={`${member.user_name} (${member.verified_xp} XP)`}
                tabIndex={0}
                role="img"
                aria-label={`${member.user_name} progress pin: ${member.verified_xp} XP`}
              >
                <div className="roadmap-pin-avatar">
                  {member.user_name?.slice(0, 2).toUpperCase() || "P"}
                </div>
                <div className="roadmap-pin-pointer" />
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="roadmap-counter-badge is-gold"
          style={{ padding: "3px 10px", fontSize: "12px" }}
          onClick={() => setShowAchievements(true)}
        >
          <span>⭐</span>
          <span>{totalStars}</span>
        </button>
        <span className="roadmap-bar-icon-end" aria-hidden="true">🏆</span>
      </div>

      {/* 3. INTERACTIVE CARTOON ADVENTURE SVG MAP CANVAS */}
      <div className="roadmap-canvas-wrapper">
        {/* Floating Achievements Pill */}
        <div
          className="roadmap-achievements-banner"
          onClick={() => setShowAchievements(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setShowAchievements(true)}
          aria-label="Achievements unlocked"
        >
          <span>📦</span>
          <span>Achievements unlocked</span>
          <span style={{ letterSpacing: "2px" }}>⭐⭐⭐⭐</span>
        </div>

        {/* Floating Left Quest Log Card */}
        <div className={`roadmap-quest-log-overlay${showQuestLog ? "" : " is-minimized"}`} aria-label="Quest Log">
          <div className="roadmap-quest-log-header">
            <h2 className="roadmap-quest-log-title">Quest Log</h2>
            <button
              type="button"
              className="roadmap-quest-log-close"
              onClick={() => setShowQuestLog(!showQuestLog)}
              aria-label={showQuestLog ? "Minimize Quest Log" : "Expand Quest Log"}
              title="Toggle Quest Log"
            >
              {showQuestLog ? "✕" : "📜"}
            </button>
          </div>

          {showQuestLog && (
            <div className="roadmap-quest-log-body">
              <div>
                <h3 className="roadmap-log-section-title">Completed Quests</h3>
                {completedQuests.length === 0 ? (
                  <p style={{ margin: "4px 0", fontSize: "11px", color: "#78350f" }}>No completed quests yet.</p>
                ) : (
                  <ul className="roadmap-log-list">
                    {completedQuests.slice(0, 6).map((q) => (
                      <li
                        key={q.id}
                        className="roadmap-log-item"
                        onClick={() => handleSelectPhase(q.phaseId)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleSelectPhase(q.phaseId)}
                      >
                        <span className="roadmap-log-badge is-done">✓</span>
                        <span className="roadmap-log-text">{q.title}</span>
                        <span className="roadmap-log-xp">+{q.xp}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="roadmap-log-section-title">Active Quests</h3>
                {activeQuests.length === 0 ? (
                  <p style={{ margin: "4px 0", fontSize: "11px", color: "#78350f" }}>All quests completed! Great job!</p>
                ) : (
                  <ul className="roadmap-log-list">
                    {activeQuests.slice(0, 6).map((q) => (
                      <li
                        key={q.id}
                        className="roadmap-log-item"
                        onClick={() => handleSelectPhase(q.phaseId)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleSelectPhase(q.phaseId)}
                      >
                        <span className="roadmap-log-badge is-active">🔒</span>
                        <span className="roadmap-log-text">{q.title}</span>
                        <span className="roadmap-log-xp">+{q.xp}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        {/* SVG MAP */}
        <svg
          className="roadmap-svg"
          viewBox="0 0 1280 720"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Cartoon game world roadmap"
        >
          <defs>
            {/* Sky gradient */}
            <linearGradient id="skyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#4aa3f0" />
              <stop offset="60%" stopColor="#7ac5fc" />
              <stop offset="100%" stopColor="#b4e4ff" />
            </linearGradient>

            {/* Grass terrain gradient */}
            <linearGradient id="grassGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#5ec443" />
              <stop offset="100%" stopColor="#3d9426" />
            </linearGradient>

            {/* Canyon rock gradient */}
            <linearGradient id="canyonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ea580c" />
              <stop offset="50%" stopColor="#c2410c" />
              <stop offset="100%" stopColor="#7c2d12" />
            </linearGradient>

            {/* Snow mountain gradient */}
            <linearGradient id="snowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="50%" stopColor="#cbd5e1" />
              <stop offset="100%" stopColor="#64748b" />
            </linearGradient>

            {/* Winding road dirt gradient */}
            <linearGradient id="roadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="50%" stopColor="#fde047" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>

            {/* Glow filters */}
            <filter id="goldGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#fde047" floodOpacity="0.8" />
            </filter>
            <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#020617" floodOpacity="0.45" />
            </filter>
          </defs>

          {/* 1. SKY BACKGROUND */}
          <rect width="1280" height="720" fill="url(#skyGrad)" />

          {/* Fluffy drifting clouds in the sky */}
          <g className="roadmap-cloud" opacity="0.9">
            <ellipse cx="140" cy="70" rx="90" ry="32" fill="#ffffff" />
            <ellipse cx="190" cy="55" rx="55" ry="38" fill="#ffffff" />
            <ellipse cx="95" cy="75" rx="45" ry="24" fill="#ffffff" />

            <ellipse cx="640" cy="60" rx="110" ry="34" fill="#ffffff" />
            <ellipse cx="690" cy="45" rx="65" ry="40" fill="#ffffff" />

            <ellipse cx="1180" cy="110" rx="80" ry="28" fill="#ffffff" />
          </g>

          {/* 2. BASE TERRAINS */}
          {/* Phase 1 & 2 Grassland (Bottom-Left & Center) */}
          <path
            d="M-40 400 Q150 360 320 410 T680 490 L710 740 L-40 740 Z"
            fill="url(#grassGrad)"
          />

          {/* Turquoise Winding River crossing under bridge */}
          <path
            d="M 120 740 C 220 620, 240 500, 280 430 C 330 350, 230 270, 200 200 L 250 180 C 290 260, 390 340, 340 440 C 300 520, 280 620, 180 740 Z"
            fill="#38bdf8"
            stroke="#0284c7"
            strokeWidth="3"
            filter="url(#softShadow)"
          />

          {/* Phase 3 Red Sandstone Canyon (Center) */}
          <path
            d="M 460 740 L 520 460 L 560 300 L 760 210 L 860 360 L 820 540 L 860 740 Z"
            fill="url(#canyonGrad)"
            stroke="#7c2d12"
            strokeWidth="4"
            filter="url(#softShadow)"
          />
          {/* Canyon stratified plateau ledges */}
          <polygon points="560,300 680,240 760,280 720,360 580,360" fill="#c2410c" stroke="#9a3412" strokeWidth="2" />
          <polygon points="540,430 660,380 730,420 690,480 540,480" fill="#9a3412" />

          {/* Phase 4 Snow Mountain Peaks (Lower-Right) */}
          <path
            d="M 780 740 L 850 490 L 980 320 L 1110 470 L 1290 520 L 1290 740 Z"
            fill="#475569"
            stroke="#334155"
            strokeWidth="4"
          />
          {/* Sharp Snowcaps on peaks */}
          <polygon points="980,320 940,390 965,380 985,410 1005,380 1030,395" fill="url(#snowGrad)" stroke="#e2e8f0" strokeWidth="2" />
          <polygon points="850,490 825,540 845,530 855,550 875,530" fill="url(#snowGrad)" />
          <polygon points="1110,470 1080,520 1105,510 1120,530 1140,515" fill="url(#snowGrad)" />

          {/* Phase 5 Floating Sky Island (Top-Right) */}
          <g filter="url(#softShadow)">
            {/* Island rocky bottom */}
            <path
              d="M 900 240 Q 1040 370 1180 240 Q 1240 180 1200 130 Q 940 130 900 240 Z"
              fill="#334155"
              stroke="#1e293b"
              strokeWidth="3"
            />
            {/* Grassy knoll on top of floating island */}
            <ellipse cx="1060" cy="180" rx="140" ry="46" fill="#4ade80" stroke="#15803d" strokeWidth="3" />
            {/* Cloud puff supporting floating island */}
            <ellipse cx="1060" cy="270" rx="90" ry="30" fill="#ffffff" opacity="0.85" />
            <ellipse cx="980" cy="250" rx="45" ry="25" fill="#ffffff" opacity="0.8" />
            <ellipse cx="1140" cy="250" rx="45" ry="25" fill="#ffffff" opacity="0.8" />
          </g>

          {/* 3. CONTINUOUS WINDING DIRT ROAD */}
          {/* Road shadow */}
          <path
            d="M 190 620 C 230 550, 250 490, 310 430 C 370 370, 440 470, 520 540 C 600 610, 680 490, 640 370 C 610 280, 710 260, 770 330 C 830 400, 760 510, 840 570 C 920 630, 980 570, 970 480 C 960 380, 940 320, 1020 230"
            fill="none"
            stroke="#92400e"
            strokeWidth="34"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.5"
          />
          {/* Main Road Surface */}
          <path
            d="M 190 620 C 230 550, 250 490, 310 430 C 370 370, 440 470, 520 540 C 600 610, 680 490, 640 370 C 610 280, 710 260, 770 330 C 830 400, 760 510, 840 570 C 920 630, 980 570, 970 480 C 960 380, 940 320, 1020 230"
            fill="none"
            stroke="url(#roadGrad)"
            strokeWidth="26"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Road center dashed cobblestones */}
          <path
            d="M 190 620 C 230 550, 250 490, 310 430 C 370 370, 440 470, 520 540 C 600 610, 680 490, 640 370 C 610 280, 710 260, 770 330 C 830 400, 760 510, 840 570 C 920 630, 980 570, 970 480 C 960 380, 940 320, 1020 230"
            fill="none"
            stroke="#d97706"
            strokeWidth="3"
            strokeDasharray="8 12"
            strokeLinecap="round"
          />

          {/* Wooden Bridge crossing river at (280, 440) */}
          <g transform="translate(260, 420) rotate(-24)">
            <rect x="0" y="0" width="60" height="24" rx="3" fill="#78350f" stroke="#451a03" strokeWidth="2" />
            <line x1="12" y1="0" x2="12" y2="24" stroke="#451a03" strokeWidth="2" />
            <line x1="28" y1="0" x2="28" y2="24" stroke="#451a03" strokeWidth="2" />
            <line x1="44" y1="0" x2="44" y2="24" stroke="#451a03" strokeWidth="2" />
            <rect x="-2" y="-4" width="64" height="4" fill="#b45309" stroke="#451a03" />
            <rect x="-2" y="24" width="64" height="4" fill="#b45309" stroke="#451a03" />
          </g>

          {/* Suspension bridge across canyon cleft at (730, 360) */}
          <g transform="translate(710, 350) rotate(28)">
            <path d="M0 0 Q25 10 50 0" stroke="#78350f" strokeWidth="3" fill="none" />
            <path d="M0 20 Q25 30 50 20" stroke="#78350f" strokeWidth="3" fill="none" />
            <line x1="10" y1="3" x2="10" y2="23" stroke="#b45309" strokeWidth="3" />
            <line x1="25" y1="5" x2="25" y2="25" stroke="#b45309" strokeWidth="3" />
            <line x1="40" y1="3" x2="40" y2="23" stroke="#b45309" strokeWidth="3" />
          </g>

          {/* 4. DETAILED LANDMARKS FOR EACH PHASE */}

          {/* PHASE 1: DISCOVERY (Campsite, Tents, Campfire, Kickoff Banner, Start Banner) */}
          <g
            className="roadmap-landmark-group"
            onClick={() => handleSelectPhase(mappedPhases[0]?.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleSelectPhase(mappedPhases[0]?.id)}
            aria-label="Phase 1: Discovery Campsite"
          >
            {/* Evergreen Trees */}
            <polygon points="60,650 35,700 85,700" fill="#15803d" stroke="#052e16" strokeWidth="2" />
            <polygon points="60,630 40,665 80,665" fill="#22c55e" />
            <polygon points="120,600 95,650 145,650" fill="#15803d" stroke="#052e16" strokeWidth="2" />

            {/* Tent 1 (large) */}
            <polygon points="150,530 110,580 190,580" fill="#fef08a" stroke="#ca8a04" strokeWidth="3" />
            <polygon points="150,530 150,580 190,580" fill="#fde047" />
            <polygon points="150,550 135,580 165,580" fill="#451a03" />

            {/* Tent 2 (small) */}
            <polygon points="65,600 35,640 95,640" fill="#fef08a" stroke="#ca8a04" strokeWidth="2" />
            <polygon points="65,600 65,640 95,640" fill="#fde047" />

            {/* Campfire */}
            <ellipse cx="98" cy="640" rx="14" ry="6" fill="#451a03" />
            <polygon points="98,620 92,638 104,638" fill="#ef4444" />
            <polygon points="98,624 94,637 102,637" fill="#f59e0b" />

            {/* Red "Kickoff" Banner */}
            <line x1="68" y1="500" x2="68" y2="550" stroke="#78350f" strokeWidth="4" />
            <line x1="120" y1="500" x2="120" y2="550" stroke="#78350f" strokeWidth="4" />
            <rect x="66" y="500" width="56" height="24" rx="4" fill="#dc2626" stroke="#991b1b" strokeWidth="2" />
            <text x="94" y="516" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="900">Kickoff</text>

            {/* Red "Start" Banner Arch over dirt road */}
            <g transform="translate(170, 580)">
              <line x1="0" y1="0" x2="0" y2="35" stroke="#78350f" strokeWidth="5" />
              <line x1="60" y1="0" x2="60" y2="35" stroke="#78350f" strokeWidth="5" />
              <rect x="-2" y="0" width="64" height="26" rx="6" fill="#ef4444" stroke="#b91c1c" strokeWidth="3" />
              <text x="30" y="18" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="900" letterSpacing="1">START</text>
            </g>
          </g>

          {/* PHASE 2: MVP (Workshop Cottage, Workbench, Beta Testing signs) */}
          <g
            className="roadmap-landmark-group"
            onClick={() => handleSelectPhase(mappedPhases[1]?.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleSelectPhase(mappedPhases[1]?.id)}
            aria-label="Phase 2: MVP Workshop"
          >
            {/* Pine trees around workshop */}
            <polygon points="400,530 380,570 420,570" fill="#15803d" />
            <polygon points="520,510 500,550 540,550" fill="#15803d" />

            {/* Cottage walls */}
            <rect x="440" y="520" width="60" height="42" fill="#fed7aa" stroke="#7c2d12" strokeWidth="3" />
            {/* Cottage stone chimney */}
            <rect x="485" y="495" width="12" height="25" fill="#64748b" stroke="#334155" strokeWidth="2" />
            {/* Chimney smoke */}
            <circle cx="491" cy="488" r="4" fill="#ffffff" opacity="0.6" />
            <circle cx="493" cy="480" r="6" fill="#ffffff" opacity="0.4" />
            {/* Cottage timber shingle roof */}
            <polygon points="430,522 470,485 510,522" fill="#9a3412" stroke="#451a03" strokeWidth="3" />
            {/* Door & Window */}
            <rect x="458" y="538" width="14" height="24" fill="#78350f" />
            <rect x="480" y="530" width="12" height="12" fill="#fef08a" stroke="#ca8a04" strokeWidth="2" />

            {/* Carpenter Workbench */}
            <rect x="365" y="540" width="34" height="14" fill="#b45309" stroke="#451a03" strokeWidth="2" />
            <line x1="370" y1="554" x2="370" y2="564" stroke="#78350f" strokeWidth="3" />
            <line x1="394" y1="554" x2="394" y2="564" stroke="#78350f" strokeWidth="3" />
            {/* Tools on bench */}
            <line x1="372" y1="538" x2="378" y2="538" stroke="#94a3b8" strokeWidth="3" />

            {/* Wooden Beta Testing Gate */}
            <g transform="translate(385, 480)">
              <line x1="0" y1="0" x2="0" y2="30" stroke="#78350f" strokeWidth="4" />
              <line x1="45" y1="0" x2="45" y2="30" stroke="#78350f" strokeWidth="4" />
              <rect x="-2" y="0" width="50" height="16" rx="4" fill="#92400e" stroke="#451a03" strokeWidth="2" />
              <text x="23" y="12" textAnchor="middle" fill="#ffedd5" fontSize="8" fontWeight="800">Beta Testing</text>
            </g>

            {/* Blue Beta Testing Signboard */}
            <g transform="translate(440, 490)">
              <rect x="0" y="0" width="46" height="18" rx="4" fill="#0284c7" stroke="#0369a1" strokeWidth="2" />
              <text x="23" y="13" textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="800">Beta Testing</text>
            </g>
          </g>

          {/* PHASE 3: BETA (Red-Rock Canyon, High Suspension Bridges, Radar Tower) */}
          <g
            className="roadmap-landmark-group"
            onClick={() => handleSelectPhase(mappedPhases[2]?.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleSelectPhase(mappedPhases[2]?.id)}
            aria-label="Phase 3: Beta Canyon Radar"
          >
            {/* Radar Tower Platform */}
            <rect x="615" y="275" width="40" height="12" rx="3" fill="#64748b" stroke="#334155" strokeWidth="2" />
            {/* Metal truss legs */}
            <line x1="620" y1="287" x2="615" y2="320" stroke="#475569" strokeWidth="3" />
            <line x1="650" y1="287" x2="655" y2="320" stroke="#475569" strokeWidth="3" />
            <line x1="620" y1="295" x2="650" y2="310" stroke="#475569" strokeWidth="2" />
            <line x1="650" y1="295" x2="620" y2="310" stroke="#475569" strokeWidth="2" />

            {/* Glowing cyan satellite dish 📡 */}
            <g className="roadmap-radar-pulse" transform="translate(635, 260)">
              <path d="M -16 6 A 18 18 0 0 1 16 6 Z" fill="#0284c7" stroke="#38bdf8" strokeWidth="3" />
              <line x1="0" y1="6" x2="0" y2="-8" stroke="#38bdf8" strokeWidth="3" />
              <circle cx="0" cy="-8" r="4" fill="#a5f3fc" />
              {/* Radio emission arcs */}
              <path d="M -12 -14 A 14 14 0 0 1 12 -14" fill="none" stroke="#67e8f9" strokeWidth="2" strokeDasharray="3 3" />
              <path d="M -20 -20 A 22 22 0 0 1 20 -20" fill="none" stroke="#a5f3fc" strokeWidth="2" strokeDasharray="4 4" />
            </g>
          </g>

          {/* PHASE 4: LAUNCH (Snow Mountain Launchpad, Retro Space Rocket, Bunting, Chest, Key) */}
          <g
            className="roadmap-landmark-group"
            onClick={() => handleSelectPhase(mappedPhases[3]?.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleSelectPhase(mappedPhases[3]?.id)}
            aria-label="Phase 4: Launch Rocket Site"
          >
            {/* Snow pines */}
            <polygon points="870,550 855,590 885,590" fill="#047857" />
            <polygon points="870,550 860,565 880,565" fill="#f8fafc" />
            <polygon points="1080,570 1065,610 1095,610" fill="#047857" />
            <polygon points="1080,570 1070,585 1090,585" fill="#f8fafc" />

            {/* Circular Metallic Launchpad */}
            <ellipse cx="960" cy="580" rx="55" ry="18" fill="#334155" stroke="#64748b" strokeWidth="4" />
            <ellipse cx="960" cy="578" rx="42" ry="12" fill="#1e293b" stroke="#f59e0b" strokeWidth="3" />

            {/* Retro Space Rocket */}
            <g transform="translate(960, 520)" filter="url(#softShadow)">
              {/* White Fuselage */}
              <ellipse cx="0" cy="-10" rx="15" ry="36" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2" />
              {/* Pointed Red Nose Cone */}
              <polygon points="0,-60 -14,-32 14,-32" fill="#ef4444" stroke="#991b1b" strokeWidth="2" />
              {/* Left and Right Red Fins */}
              <polygon points="-15,-4 -30,16 -15,12" fill="#ef4444" stroke="#991b1b" strokeWidth="2" />
              <polygon points="15,-4 30,16 15,12" fill="#ef4444" stroke="#991b1b" strokeWidth="2" />
              {/* Cockpit Porthole window */}
              <circle cx="0" cy="-22" r="7" fill="#38bdf8" stroke="#0284c7" strokeWidth="2" />
              <circle cx="-2" cy="-24" r="2" fill="#ffffff" />
              {/* Rocket thruster booster exhaust glow */}
              <polygon points="-8,18 0,32 8,18" fill="#f59e0b" />
            </g>

            {/* Celebration Bunting Pennant Flags */}
            <g transform="translate(890, 480)">
              <line x1="0" y1="0" x2="0" y2="60" stroke="#78350f" strokeWidth="3" />
              <line x1="140" y1="0" x2="140" y2="60" stroke="#78350f" strokeWidth="3" />
              <path d="M0 10 Q70 30 140 10" fill="none" stroke="#cbd5e1" strokeWidth="2" />
              {/* Triangular bunting pennants */}
              <polygon points="15,16 28,19 22,32" fill="#ef4444" />
              <polygon points="38,21 51,23 45,35" fill="#f59e0b" />
              <polygon points="62,25 75,25 68,38" fill="#38bdf8" />
              <polygon points="86,23 99,21 92,35" fill="#a855f7" />
              <polygon points="110,19 123,16 116,30" fill="#22c55e" />
            </g>

            {/* Blue "Cloud Launch" board */}
            <g transform="translate(985, 500)">
              <rect x="0" y="0" width="34" height="42" fill="#0284c7" stroke="#38bdf8" strokeWidth="2" rx="3" />
              <text x="17" y="16" textAnchor="middle" fill="#ffffff" fontSize="6" fontWeight="900">CLOUD</text>
              <text x="17" y="26" textAnchor="middle" fill="#ffffff" fontSize="6" fontWeight="900">LAUNCH</text>
            </g>

            {/* Treasure Chest 📦 on snow bank */}
            <g transform="translate(1090, 610)">
              <rect x="0" y="0" width="28" height="18" rx="4" fill="#92400e" stroke="#451a03" strokeWidth="2" />
              <line x1="0" y1="7" x2="28" y2="7" stroke="#f59e0b" strokeWidth="2" />
              <circle cx="14" cy="9" r="3" fill="#fde047" stroke="#78350f" />
            </g>

            {/* Golden Key 🗝️ lying on snow */}
            <g transform="translate(1100, 642)">
              <circle cx="6" cy="6" r="5" fill="none" stroke="#f59e0b" strokeWidth="2" />
              <line x1="11" y1="6" x2="22" y2="6" stroke="#f59e0b" strokeWidth="2" />
              <line x1="18" y1="6" x2="18" y2="10" stroke="#f59e0b" strokeWidth="2" />
              <line x1="22" y1="6" x2="22" y2="10" stroke="#f59e0b" strokeWidth="2" />
            </g>
          </g>

          {/* PHASE 5: THE SCALE JOURNEY (Celestial Floating Sky Island, Castle, Skyscrapers, Portals, 5 Stars) */}
          <g
            className="roadmap-landmark-group"
            onClick={() => handleSelectPhase(mappedPhases[4]?.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleSelectPhase(mappedPhases[4]?.id)}
            aria-label="Phase 5: The Scale Journey Sky Castle"
          >
            {/* Fairytale Stone Castle on floating island */}
            <g transform="translate(1040, 70)">
              {/* Castle Main Walls */}
              <rect x="-35" y="30" width="70" height="50" fill="#94a3b8" stroke="#475569" strokeWidth="3" />
              {/* Crenellations */}
              <rect x="-35" y="24" width="10" height="8" fill="#94a3b8" />
              <rect x="-15" y="24" width="10" height="8" fill="#94a3b8" />
              <rect x="5" y="24" width="10" height="8" fill="#94a3b8" />
              <rect x="25" y="24" width="10" height="8" fill="#94a3b8" />
              {/* Center Tower */}
              <rect x="-18" y="0" width="36" height="35" fill="#cbd5e1" stroke="#475569" strokeWidth="2" />
              {/* Conical Red Roof Spire */}
              <polygon points="0,-35 -22,2 22,2" fill="#ef4444" stroke="#991b1b" strokeWidth="3" />
              {/* Golden Pennant Flag */}
              <polygon points="0,-35 18,-42 0,-48" fill="#fbbf24" />
              {/* Left and Right Round Turrets */}
              <rect x="-42" y="14" width="16" height="50" fill="#cbd5e1" stroke="#475569" strokeWidth="2" />
              <polygon points="-34,-4 -44,14 -24,14" fill="#ef4444" stroke="#991b1b" strokeWidth="2" />
              <rect x="26" y="14" width="16" height="50" fill="#cbd5e1" stroke="#475569" strokeWidth="2" />
              <polygon points="34,-4 24,14 44,14" fill="#ef4444" stroke="#991b1b" strokeWidth="2" />
              {/* Castle arched gate */}
              <path d="M -10 80 L -10 60 A 10 10 0 0 1 10 60 L 10 80 Z" fill="#1e293b" />
            </g>

            {/* Modern Glass Cloud Skyscrapers */}
            <g transform="translate(1125, 80)">
              <rect x="0" y="0" width="18" height="70" rx="3" fill="#38bdf8" stroke="#0284c7" strokeWidth="2" opacity="0.9" />
              <line x1="6" y1="0" x2="6" y2="70" stroke="#bae6fd" strokeWidth="1" />
              <line x1="12" y1="0" x2="12" y2="70" stroke="#bae6fd" strokeWidth="1" />
              <rect x="20" y="20" width="14" height="50" rx="3" fill="#60a5fa" stroke="#2563eb" strokeWidth="2" opacity="0.9" />
            </g>

            {/* Two Magical Portals with Stone Stairs */}
            {/* Left Portal: Purple */}
            <g className="roadmap-portal-purple" transform="translate(950, 160)">
              <ellipse cx="0" cy="18" rx="20" ry="6" fill="#475569" />
              <ellipse cx="0" cy="0" rx="16" ry="32" fill="#7e22ce" stroke="#c084fc" strokeWidth="4" />
              <ellipse cx="0" cy="0" rx="10" ry="24" fill="#a855f7" />
              <ellipse cx="0" cy="0" rx="5" ry="14" fill="#f3e8ff" />
            </g>

            {/* Right Portal: Cyan */}
            <g className="roadmap-portal-cyan" transform="translate(1020, 200)">
              <ellipse cx="0" cy="18" rx="20" ry="6" fill="#475569" />
              <ellipse cx="0" cy="0" rx="16" ry="32" fill="#0e7490" stroke="#22d3ee" strokeWidth="4" />
              <ellipse cx="0" cy="0" rx="10" ry="24" fill="#06b6d4" />
              <ellipse cx="0" cy="0" rx="5" ry="14" fill="#cffafe" />
            </g>

            {/* 5 Golden Stars plaque under Phase 5 */}
            <g transform="translate(1015, 290)">
              <rect x="-40" y="-12" width="80" height="22" rx="11" fill="#451a03" stroke="#f59e0b" strokeWidth="2" />
              <text x="0" y="4" textAnchor="middle" fill="#fde047" fontSize="13" letterSpacing="2">⭐⭐⭐⭐⭐</text>
            </g>
          </g>

          {/* 5. INTERACTIVE PHASE MILESTONE SIGNPOSTS */}
          {mappedPhases.map((phase, idx) => {
            const layout = phase.layout || DEFAULT_PHASE_CONFIGS[idx % 5];
            const signX = layout.signX;
            const signY = layout.signY;
            const isPhaseLocked = phase.locked;
            const phaseStars = phase.stars || 0;
            const shortTechTitle = phase.layout?.shortTitle
              || (phase.title ? phase.title.replace(/^Phase\s*\d+\s*:\s*/i, "") : `Phase ${idx + 1}`);

            return (
              <g
                key={phase.id}
                className="roadmap-signboard"
                transform={`translate(${signX}, ${signY})`}
                onClick={() => handleSelectPhase(phase.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleSelectPhase(phase.id)}
                aria-label={`${phase.title || `Phase ${idx + 1}`}. ${isPhaseLocked ? "Locked." : "Unlocked."} ${phaseStars} stars.`}
              >
                {/* Wooden post in ground */}
                <line x1="0" y1="0" x2="0" y2="28" stroke="#451a03" strokeWidth="7" strokeLinecap="round" />
                <line x1="0" y1="0" x2="0" y2="28" stroke="#78350f" strokeWidth="5" strokeLinecap="round" />

                {/* Carved wooden plaque */}
                <rect
                  x="-76"
                  y="-22"
                  width="156"
                  height="34"
                  rx="9"
                  fill="#78350f"
                  stroke="#451a03"
                  strokeWidth="3"
                  filter="url(#softShadow)"
                />
                <rect x="-74" y="-20" width="152" height="30" rx="7" fill="#fef3c7" />

                {/* Number circle: ①..⑤ */}
                <circle cx="-56" cy="-5" r="11" fill="#b45309" stroke="#451a03" strokeWidth="2" />
                <text x="-56" y="-1" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="900">
                  {idx + 1}
                </text>

                {/* Tech Checkpoint Title */}
                <text x="14" y="-1" textAnchor="middle" fill="#451a03" fontSize="10.5" fontWeight="900">
                  {shortTechTitle.length > 20 ? shortTechTitle.slice(0, 19) + "…" : shortTechTitle}
                </text>

                {/* Star badges if completed */}
                {phaseStars > 0 && (
                  <text x="0" y="24" textAnchor="middle" fill="#f59e0b" fontSize="12" letterSpacing="1">
                    {"⭐".repeat(phaseStars)}
                  </text>
                )}

                {/* Locked Padlock badge if locked */}
                {isPhaseLocked && (
                  <g transform="translate(56, -18)">
                    <circle cx="0" cy="0" r="10" fill="#dc2626" stroke="#ffffff" strokeWidth="2" />
                    <text x="0" y="3" textAnchor="middle" fill="#ffffff" fontSize="10">🔒</text>
                  </g>
                )}
              </g>
            );
          })}

          {/* 6. TEAMMATE CHARACTER PINS ON MAP PATH */}
          {members.map((member, i) => {
            // Find current phase for this member or distribute along road
            let pathX = 260 + (i % 5) * 160;
            let pathY = 560 - (i % 5) * 70;

            const targetPhase = mappedPhases.find((p) => p.id === member.current_phase_id)
              || mappedPhases[i % mappedPhases.length];

            if (targetPhase?.layout) {
              pathX = targetPhase.layout.pathX + (i % 2 === 0 ? -15 : 15);
              pathY = targetPhase.layout.pathY + (i % 2 === 0 ? -10 : 10);
            }

            return (
              <g
                key={`map-member-${member.user_id || i}`}
                className="roadmap-bounce"
                transform={`translate(${pathX}, ${pathY})`}
                role="img"
                aria-label={`Adventurer ${member.user_name} on map`}
              >
                {/* Adventurer Pin Marker */}
                {/* Explorer Hat */}
                <ellipse cx="0" cy="-30" rx="14" ry="4" fill="#a16207" stroke="#713f12" strokeWidth="1.5" />
                <path d="M-8 -30 Q0 -40 8 -30 Z" fill="#ca8a04" stroke="#713f12" strokeWidth="1.5" />

                {/* Face & Head */}
                <circle cx="0" cy="-18" r="10" fill="#fed7aa" stroke="#ca8a04" strokeWidth="1.5" />
                <circle cx="-3" cy="-19" r="1.5" fill="#451a03" />
                <circle cx="3" cy="-19" r="1.5" fill="#451a03" />
                <path d="M -3 -15 Q 0 -13 3 -15" stroke="#451a03" strokeWidth="1" fill="none" />

                {/* Explorer Shirt & Backpack */}
                <rect x="-7" y="-8" width="14" height="12" rx="3" fill="#0284c7" stroke="#0369a1" strokeWidth="1.5" />
                <rect x="7" y="-7" width="5" height="10" rx="2" fill="#78350f" />

                {/* Boots */}
                <ellipse cx="-4" cy="5" rx="3" ry="2" fill="#451a03" />
                <ellipse cx="4" cy="5" rx="3" ry="2" fill="#451a03" />

                {/* Teammate Name Tag */}
                <rect x="-30" y="8" width="60" height="14" rx="4" fill="#1e293b" opacity="0.85" />
                <text x="0" y="18" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="800">
                  {member.user_name || "Adventurer"}
                </text>
              </g>
            );
          })}

          {/* 7. FOG OVERLAY FOR LOCKED PHASES */}
          {mappedPhases.map((phase) => {
            if (!phase.locked || !phase.layout) return null;
            return (
              <g key={`fog-${phase.id}`} pointerEvents="none">
                <circle
                  cx={phase.layout.x}
                  cy={phase.layout.y}
                  r="100"
                  fill="#ffffff"
                  opacity="0.35"
                  filter="url(#softShadow)"
                />
                <circle
                  cx={phase.layout.x - 20}
                  cy={phase.layout.y + 10}
                  r="70"
                  fill="#f1f5f9"
                  opacity="0.4"
                />
              </g>
            );
          })}
        </svg>

        {/* BOTTOM FLOATING ACTION DOCK */}
        <div className="roadmap-dock" role="toolbar" aria-label="Roadmap Action Dock">
          <button
            type="button"
            className="roadmap-dock-btn"
            onClick={() => setShowAchievements(true)}
            title="View Achievements"
            aria-label="Achievements"
          >
            📦
          </button>
          <button
            type="button"
            className="roadmap-dock-btn is-primary"
            onClick={() => {
              if (mappedPhases.length > 0) handleSelectPhase(mappedPhases[0].id);
            }}
            title="Level & Quests"
            aria-label="Level and Quests"
          >
            ⭐
          </button>
          <button
            type="button"
            className="roadmap-dock-btn is-purple"
            onClick={() => setShowQuestLog(!showQuestLog)}
            title="Toggle Quest Log"
            aria-label="Toggle Quest Log"
          >
            📜
          </button>
          <button
            type="button"
            className="roadmap-dock-btn is-cyan"
            onClick={() => setShowLeaderboard(true)}
            title="View Leaderboard"
            aria-label="Leaderboard"
          >
            🏆
          </button>
          {isHost && (
            <button
              type="button"
              className="roadmap-dock-btn"
              onClick={() => setShowImportModal(true)}
              title="Host: Import Tasks & Markdown"
              aria-label="Host Import Tasks"
            >
              🗝️
            </button>
          )}
        </div>
      </div>

      {/* 4. PHASE QUEST DRAWER */}
      {selectedPhase && (
        <div className="roadmap-drawer-backdrop" onClick={() => setSelectedPhaseId(null)}>
          <div
            className="roadmap-drawer"
            role="dialog"
            aria-label={`Phase Quests: ${selectedPhase.title}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="roadmap-drawer-header">
              <div className="roadmap-drawer-title-group">
                <h2>{selectedPhase.title}</h2>
                <div className="roadmap-drawer-subtitle">
                  {selectedPhase.themed_title} • Landmark: {selectedPhase.landmark_archetype || "campsite"}
                </div>
              </div>
              <button
                type="button"
                className="roadmap-drawer-close"
                onClick={() => setSelectedPhaseId(null)}
                aria-label="Close phase drawer"
              >
                ✕ Close
              </button>
            </div>

            <div className="roadmap-drawer-body">
              {actionError && <div className="arena-state is-error" role="alert">{actionError}</div>}
              {actionSuccess && <div className="arena-state is-ready" role="status">{actionSuccess}</div>}

              {/* Phase Progress and Stars */}
              <div className="roadmap-drawer-stats-row">
                <div>
                  <div style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase" }}>Completion</div>
                  <div style={{ fontSize: "16px", fontWeight: "800", color: "#4ade80" }}>
                    {selectedPhase.verified_quests} / {selectedPhase.total_quests} ({selectedPhase.progress}%)
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase" }}>Earned Stars</div>
                  <div style={{ fontSize: "18px" }}>
                    {selectedPhase.stars > 0 ? "⭐".repeat(selectedPhase.stars) : "☆☆☆"}
                  </div>
                </div>
              </div>

              {/* Locked Notice & Host Unlock Override */}
              {selectedPhase.locked && (
                <div className="roadmap-lock-alert">
                  <div>
                    🔒 <strong>This phase is locked.</strong> Complete all quests in previous phases to unlock it.
                  </div>
                  {isHost && (
                    <button
                      type="button"
                      className="roadmap-unlock-override-btn"
                      onClick={() => handleOverrideUnlock(selectedPhase.id)}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Unlocking..." : "Host Override: Unlock Phase"}
                    </button>
                  )}
                </div>
              )}

              {/* Quests List */}
              <h3 style={{ margin: "10px 0 0", fontSize: "14px", fontWeight: "800", color: "#f8fafc" }}>
                Phase Quests ({selectedPhase.quests?.length || 0})
              </h3>

              {!selectedPhase.quests || selectedPhase.quests.length === 0 ? (
                <p style={{ color: "#94a3b8", fontSize: "13px" }}>No quests assigned to this phase yet.</p>
              ) : (
                selectedPhase.quests.map((quest) => {
                  const isClaimedByMe = quest.assignee?.id === currentUserId
                    || (currentUser && quest.assignee?.name === currentUser);
                  const isClaimed = !!quest.assignee?.id;
                  const isVerified = quest.status === "verified";
                  const isSubmitted = quest.status === "submitted";
                  const canClaim = !isClaimed && !isVerified;

                  return (
                    <div key={quest.id} className="roadmap-quest-card">
                      <div className="roadmap-quest-header">
                        <div className="roadmap-quest-titles">
                          <h3>{quest.title}</h3>
                          {quest.themed_title && quest.themed_title !== quest.title && (
                            <div className="roadmap-quest-themed">{quest.themed_title}</div>
                          )}
                        </div>
                        <span className="roadmap-quest-xp-badge">+{quest.xp} XP</span>
                      </div>

                      <div className="roadmap-quest-meta">
                        <span className={`roadmap-quest-status-badge is-${quest.status}`}>
                          {quest.status}
                        </span>
                        {quest.due_date && <span>📅 Due {quest.due_date}</span>}
                        {quest.assignee && <span>👤 {quest.assignee.name || "Assigned"}</span>}
                      </div>

                      {/* Evidence Links */}
                      {quest.evidence_links && quest.evidence_links.length > 0 && (
                        <div style={{ fontSize: "11px", color: "#38bdf8" }}>
                          {quest.evidence_links.map((link, idx) => (
                            <a
                              key={idx}
                              href={link}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: "#38bdf8", marginRight: "8px", textDecoration: "underline" }}
                            >
                              Evidence Link #{idx + 1}
                            </a>
                          ))}
                        </div>
                      )}

                      {/* Verified Badge */}
                      {isVerified && (
                        <div className="roadmap-host-approved-badge">
                          ✓ HOST APPROVED • Verified
                        </div>
                      )}

                      {/* Interactive Controls */}
                      <div className="roadmap-quest-action-row">
                        {canClaim && (
                          <button
                            type="button"
                            className="roadmap-btn-claim"
                            onClick={() => handleClaim(quest.id)}
                            disabled={isSubmitting}
                          >
                            Claim Quest
                          </button>
                        )}

                        {isClaimed && !isVerified && !isSubmitted && (isClaimedByMe || isHost) && (
                          <>
                            <input
                              type="text"
                              className="roadmap-evidence-input"
                              placeholder="PR URL or evidence note..."
                              value={evidenceNotes[quest.id] || ""}
                              onChange={(e) => setEvidenceNotes({ ...evidenceNotes, [quest.id]: e.target.value })}
                            />
                            <button
                              type="button"
                              className="roadmap-btn-submit"
                              onClick={() => handleSubmit(quest.id)}
                              disabled={isSubmitting}
                            >
                              Submit PR
                            </button>
                          </>
                        )}

                        {isSubmitted && !isVerified && (
                          <>
                            {isHost ? (
                              <>
                                <input
                                  type="text"
                                  className="roadmap-evidence-input"
                                  placeholder="Host audit note..."
                                  value={evidenceNotes[quest.id] || ""}
                                  onChange={(e) => setEvidenceNotes({ ...evidenceNotes, [quest.id]: e.target.value })}
                                />
                                {isClaimedByMe ? (
                                  <button
                                    type="button"
                                    className="roadmap-btn-approve"
                                    disabled
                                    title="Host cannot approve their own claimed quest"
                                  >
                                    Self-Approval Prohibited
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="roadmap-btn-approve"
                                    onClick={() => handleApprove(quest.id)}
                                    disabled={isSubmitting}
                                  >
                                    HOST APPROVED
                                  </button>
                                )}
                              </>
                            ) : (
                              <span style={{ fontSize: "12px", color: "#a855f7", fontWeight: "700" }}>
                                ⏳ Awaiting Host Approval
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. LEADERBOARD MODAL */}
      {showLeaderboard && (
        <div className="roadmap-modal-backdrop" onClick={() => setShowLeaderboard(false)}>
          <div
            className="roadmap-modal"
            role="dialog"
            aria-label="Verified XP Leaderboard"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="roadmap-modal-header">
              <h2>🏆 Verified Leaderboard</h2>
              <button
                type="button"
                className="roadmap-drawer-close"
                onClick={() => setShowLeaderboard(false)}
              >
                ✕
              </button>
            </div>
            <div className="roadmap-modal-body">
              {members.length === 0 ? (
                <p style={{ color: "#94a3b8" }}>No active teammates yet.</p>
              ) : (
                [...members]
                  .sort((a, b) => (b.verified_xp || 0) - (a.verified_xp || 0))
                  .map((m, rank) => (
                    <div key={m.user_id || rank} className="roadmap-leader-row">
                      <div className="roadmap-leader-rank">
                        {rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : `#${rank + 1}`}
                      </div>
                      <div className="roadmap-leader-info">
                        <div className="roadmap-leader-name">{m.user_name}</div>
                        <div className="roadmap-leader-quests">Verified Engineering Contributor</div>
                      </div>
                      <div className="roadmap-leader-xp">{m.verified_xp || 0} XP</div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. ACHIEVEMENTS MODAL */}
      {showAchievements && (
        <div className="roadmap-modal-backdrop" onClick={() => setShowAchievements(false)}>
          <div
            className="roadmap-modal"
            role="dialog"
            aria-label="Roadmap Achievements"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="roadmap-modal-header">
              <h2>📦 Achievements & Stars</h2>
              <button
                type="button"
                className="roadmap-drawer-close"
                onClick={() => setShowAchievements(false)}
              >
                ✕
              </button>
            </div>
            <div className="roadmap-modal-body">
              <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "24px" }}>⭐</span>
                <div>
                  <div style={{ fontWeight: "800", color: "#fef08a" }}>{totalStars} Total Stars Earned</div>
                  <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                    Earn stars by completing phase quests and meeting verified deadlines.
                  </div>
                </div>
              </div>

              {achievements.map((ach) => (
                <div key={ach.id} className="roadmap-leader-row" style={{ opacity: ach.unlocked ? 1 : 0.6 }}>
                  <div style={{ fontSize: "24px" }}>{ach.unlocked ? "⭐" : "🔒"}</div>
                  <div className="roadmap-leader-info">
                    <div className="roadmap-leader-name">{ach.title}</div>
                    <div className="roadmap-leader-quests">
                      {ach.unlocked ? "Unlocked & Verified" : "Locked - Progress through roadmap"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 7. HOST TASK IMPORT MODAL */}
      {showImportModal && (
        <div className="roadmap-modal-backdrop" onClick={() => setShowImportModal(false)}>
          <div
            className="roadmap-modal"
            style={{ width: "640px" }}
            role="dialog"
            aria-label="Import Tasks into Roadmap"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="roadmap-modal-header">
              <h2>🗝️ Host: Import Roadmap Tasks</h2>
              <button
                type="button"
                className="roadmap-drawer-close"
                onClick={() => setShowImportModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="roadmap-modal-body">
              {actionError && <div className="arena-state is-error" role="alert">{actionError}</div>}
              <p style={{ margin: 0, fontSize: "13px", color: "#94a3b8" }}>
                Paste or edit markdown with phase headings (<code># Phase 1: ...</code>) and checklist items (<code>- [ ] Task (XP: 100)</code>).
              </p>

              <textarea
                className="roadmap-import-textarea"
                value={markdownInput}
                onChange={(e) => setMarkdownInput(e.target.value)}
                placeholder="Enter markdown..."
              />

              <div className="roadmap-preview-box">
                <strong>Live Parser Preview:</strong> Detected <strong>{parsedPreview.phaseCount}</strong> phases and <strong>{parsedPreview.questCount}</strong> tasks.
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="roadmap-drawer-close"
                  onClick={() => setShowImportModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="roadmap-btn-approve"
                  onClick={handleImportSubmit}
                  disabled={isSubmitting || parsedPreview.questCount === 0}
                >
                  {isSubmitting ? "Importing..." : `Import ${parsedPreview.questCount} Tasks`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
