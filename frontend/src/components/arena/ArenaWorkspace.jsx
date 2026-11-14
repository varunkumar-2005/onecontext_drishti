import React, { Component, useCallback, useEffect, useMemo, useState } from "react";
import RoadmapProjectMap from "./RoadmapProjectMap";
import {
  getArenaRoadmap,
  overridePhaseLock,
  submitArenaQuest,
  approveArenaQuest,
  importArenaTasks,
} from "../../api/client";
import "./ArenaWorkspace.css";

const TABS = [
  { id: "roadmap", label: "Project Roadmap", shortLabel: "Roadmap", icon: "🗺" },
  { id: "world", label: "Code Map", shortLabel: "Code Map", icon: "🏝" },
  { id: "quests", label: "Quests", shortLabel: "Quests", icon: "⚔" },
  { id: "team", label: "Team", shortLabel: "Team", icon: "👥" },
  { id: "rewards", label: "Rewards", shortLabel: "Rewards", icon: "🏆" },
];

const EMPTY_ENTITIES = { regions: [], quests: [], bosses: [], checkpoints: [] };
const AVATAR_COLORS = ["#4d8dff", "#f2b705", "#9a5cd6", "#3ecf6a", "#e2473a"];
const ISLAND_SPACING = 380;
const SKIN_TONES = ["#f3c7a2", "#d99b72", "#a96845", "#70452f", "#e7b98d"];
const HAIR_COLORS = ["#372a22", "#191a20", "#7d4a2d", "#d6ac48", "#6a3148", "#c5c9d1"];
const SHIRT_COLORS = ["#4d8dff", "#f2b705", "#9a5cd6", "#3ecf6a", "#e2473a", "#27a7a1"];

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function shortenLabel(value, maxLength = 18) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function getQuestStatus(quest) {
  if (quest.status === "verified") return "Verified";
  if (quest.status === "claimed" || quest.status === "in_progress") return "In review";
  if (quest.status === "closed") return "Closed";
  return "Pending";
}

function questEvidence(quest) {
  const evidence = quest.evidence;
  if (evidence && typeof evidence === "object") {
    const note = evidence.notes || evidence.summary || evidence.highlight;
    if (note) return `Server evidence: ${String(note)}`;
    const details = [
      evidence.ci_status && `CI ${evidence.ci_status}`,
      evidence.pr_number && `PR #${evidence.pr_number}`,
      evidence.commit_sha && `Commit ${evidence.commit_sha}`,
    ].filter(Boolean);
    if (details.length) return `Server evidence: ${details.join(" · ")}`;
  }
  if (quest.description) return `Issue context: ${quest.description}`;
  if (quest.verification_requirements) return `Verification rule: ${quest.verification_requirements}`;
  return "No evidence attached.";
}

function PanelState({ loading, error, empty, children }) {
  if (loading) return <p className="arena-state" role="status">Loading this panel…</p>;
  if (error) return <p className="arena-state is-error" role="alert">{error}</p>;
  if (empty) return <p className="arena-state">Nothing to show yet.</p>;
  return children;
}

class PanelErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <p className="arena-state is-error" role="alert">This panel could not be displayed. Other tabs are still available.</p>;
    }
    return this.props.children;
  }
}

function getRegionStats(region, quests, members, leaderboard) {
  const regionQuests = quests.filter((quest) => quest.region_id === region.region_id);
  const verified = regionQuests.filter((quest) => quest.status === "verified");
  const verifiedXpByMember = new Map();
  verified.forEach((quest) => {
    if (quest.assigned_to) {
      verifiedXpByMember.set(
        quest.assigned_to,
        (verifiedXpByMember.get(quest.assigned_to) || 0) + number(quest.xp_reward),
      );
    }
  });
  const ownerId = [...verifiedXpByMember.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  const owner = members.find((member) => member.user_id === ownerId);
  const completion = regionQuests.length ? Math.round((verified.length / regionQuests.length) * 100) : 0;
  const fogOpacity = getDistrictFogOpacity(verified.length, regionQuests.length);
  const leaderboardIndex = leaderboard.findIndex((entry) => entry.user_id === ownerId);
  return {
    quests: regionQuests,
    verified: verified.length,
    completion,
    fogOpacity,
    owner,
    ownerColor: AVATAR_COLORS[(leaderboardIndex < 0 ? 0 : leaderboardIndex) % AVATAR_COLORS.length],
  };
}

export function getDistrictFogOpacity(verified, total) {
  const progress = total > 0 ? Math.min(1, Math.max(0, number(verified) / number(total))) : 0;
  return Number((0.54 * (1 - progress)).toFixed(3));
}

export function getProgressMarkerX(verifiedXp) {
  const xp = Math.max(0, number(verifiedXp));
  return 30 + (Math.min(xp, 1000) / 1000) * 340;
}

export function computeIslandLayout(regions = [], regionPaths = {}) {
  const count = regions.length;
  const root = regions.find((region) => {
    const path = (regionPaths[region.region_id] || "").trim();
    return path === "." || path === "/" || path.toLowerCase() === "root";
  });
  if (!count) return { positions: new Map(), width: 1200, height: 800 };

  const positions = new Map();
  const ring = root ? regions.filter((region) => region.region_id !== root.region_id) : regions;
  if (root && !ring.length) {
    positions.set(root.region_id, { x: 600, y: 400 });
    return { positions, width: 1200, height: 800 };
  }
  if (ring.length) {
    const radius = ring.length > 1
      ? Math.max(ISLAND_SPACING, ISLAND_SPACING / (2 * Math.sin(Math.PI / ring.length)))
      : ISLAND_SPACING;
    const width = Math.max(1200, Math.ceil(radius * 2 + ISLAND_SPACING));
    const height = Math.max(800, Math.ceil(radius * 2 + ISLAND_SPACING));
    const center = { x: width / 2, y: height / 2 };
    if (root) positions.set(root.region_id, center);
    ring.forEach((region, index) => {
      const seed = stableSeed(region.region_id);
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / ring.length + ((seed % 21) - 10) * 0.0015;
      const variedRadius = radius + (((seed >>> 5) % 17) - 8);
      positions.set(region.region_id, {
        x: center.x + Math.cos(angle) * variedRadius,
        y: center.y + Math.sin(angle) * variedRadius + (((seed >>> 10) % 17) - 8),
      });
    });
    return { positions, width, height };
  }

  return { positions, width: 1200, height: 800 };
}

function stableSeed(value) {
  let seed = 2166136261;
  for (const character of String(value || "")) {
    seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  }
  return seed >>> 0;
}

export function avatarSkinFor(userId) {
  const seed = stableSeed(userId);
  return {
    skin: SKIN_TONES[seed % SKIN_TONES.length],
    hair: HAIR_COLORS[Math.floor(seed / SKIN_TONES.length) % HAIR_COLORS.length],
    shirt: SHIRT_COLORS[Math.floor(seed / (SKIN_TONES.length * HAIR_COLORS.length)) % SHIRT_COLORS.length],
  };
}

export function getMemberRegion(member, activityEvents = [], regionPaths = {}, quests = []) {
  if (member.current_region_id && regionPaths[member.current_region_id]) return member.current_region_id;
  if (member.current_quest_id) {
    const currentQuest = quests.find((quest) => quest.quest_id === member.current_quest_id);
    if (currentQuest?.region_id && regionPaths[currentQuest.region_id]) return currentQuest.region_id;
  }
  const latest = activityEvents
    .filter((event) => event.actor_id === member.user_id && event.path)
    .sort((a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || ""))[0];
  if (!latest) return null;
  return Object.entries(regionPaths)
    .sort((a, b) => b[1].length - a[1].length)
    .find(([, path]) => path && (latest.path === path || latest.path.startsWith(`${path}/`)))?.[0] || null;
}

function PixelAvatar({ userId, name, className = "", ...svgProps }) {
  const colors = avatarSkinFor(userId);
  return (
    <svg
      {...svgProps}
      className={`arena-pixel-avatar-image ${className}`}
      viewBox="0 0 8 8"
      role="img"
      aria-label={`${name} pixel avatar`}
      shapeRendering="crispEdges"
    >
      <rect x="2" y="1" width="4" height="1" fill={colors.hair} />
      <rect x="1" y="2" width="6" height="3" fill={colors.skin} />
      <rect x="1" y="2" width="1" height="2" fill={colors.hair} />
      <rect x="5" y="2" width="2" height="1" fill={colors.hair} />
      <rect x="2" y="3" width="1" height="1" fill="#192033" />
      <rect x="5" y="3" width="1" height="1" fill="#192033" />
      <rect x="2" y="5" width="4" height="1" fill={colors.skin} />
      <rect x="1" y="6" width="6" height="2" fill={colors.shirt} />
    </svg>
  );
}

export function regionActivityCounts(activityEvents = [], regionPaths = {}) {
  const counts = new Map();
  const entries = Object.entries(regionPaths).sort((a, b) => b[1].length - a[1].length);
  activityEvents.forEach((event) => {
    const filePath = event.path || "";
    const regionId = entries.find(([, path]) => {
      return path && (filePath === path || filePath.startsWith(`${path}/`));
    })?.[0];
    if (regionId) counts.set(regionId, (counts.get(regionId) || 0) + 1);
  });
  return counts;
}

export function regionScale(region, quests = [], activityCount = 0) {
  const questCount = quests.filter((quest) => quest.region_id === region.region_id).length;
  const signal = questCount + activityCount;
  if (!signal) return 0.86;
  const maxSignal = Math.max(1, number(region.file_count) / 3, 10);
  return Math.min(1.24, 0.86 + (Math.min(signal, maxSignal) / maxSignal) * 0.38);
}

export function MinecraftProjectMap({ layout, regions = [], quests = [], members = [], leaderboard = [], regionPaths = {}, activityEvents = [], onSelectRegion }) {
  const visibleRegions = regions;
  const mapLayout = useMemo(
    () => computeIslandLayout(visibleRegions, regionPaths),
    [visibleRegions, regionPaths],
  );
  const positions = mapLayout.positions;
  const activityCounts = useMemo(() => regionActivityCounts(activityEvents, regionPaths), [activityEvents, regionPaths]);
  const stats = useMemo(
    () => new Map(visibleRegions.map((region) => [
      region.region_id,
      getRegionStats(region, quests, members, leaderboard),
    ])),
    [visibleRegions, quests, members, leaderboard],
  );
  const paths = layout?.paths || [];
  const memberLocations = members.reduce((locations, member) => {
    const regionId = getMemberRegion(member, activityEvents, regionPaths, quests);
    if (regionId && positions.has(regionId)) {
      locations.set(regionId, [...(locations.get(regionId) || []), member]);
    }
    return locations;
  }, new Map());

  return (
    <div className="arena-sky">
      <div className="arena-map-scroll" tabIndex="0" aria-label="Scrollable world map. Scroll to see all project districts.">
        <svg
          className="arena-map"
          width={mapLayout.width}
          height={mapLayout.height}
          viewBox={`0 0 ${mapLayout.width} ${mapLayout.height}`}
          role="img"
          aria-label="Project world map. Islands show real project folders and quest completion."
        >
          <defs>
            <radialGradient id="arena-sky-glow" cx="30%" cy="0%" r="90%">
              <stop offset="0%" stopColor="#1b2b5c" />
              <stop offset="75%" stopColor="#0a1226" />
            </radialGradient>
            <filter id="arena-island-shadow" x="-30%" y="-30%" width="160%" height="170%">
              <feDropShadow dx="0" dy="13" stdDeviation="9" floodColor="#03050a" floodOpacity=".65" />
            </filter>
          </defs>
          <rect width={mapLayout.width} height={mapLayout.height} fill="url(#arena-sky-glow)" />
          <g className="arena-clouds" aria-hidden="true">
            {[0, 1, 2, 3].map((cloud) => (
              <g key={cloud} className={`arena-cloud arena-cloud-${cloud + 1}`} transform={`translate(${80 + cloud * 270}, ${90 + (cloud % 2) * 90})`}>
                <ellipse cx="0" cy="0" rx="38" ry="12" />
                <ellipse cx="-18" cy="-7" rx="19" ry="13" />
                <ellipse cx="7" cy="-12" rx="24" ry="17" />
                <ellipse cx="25" cy="-4" rx="20" ry="12" />
              </g>
            ))}
          </g>
          <g className="arena-map-paths" aria-label="Project dependencies">
            {paths.map((path, index) => {
              const from = positions.get(path.source_id);
              const to = positions.get(path.target_id);
              if (!from || !to) return null;
              return (
                <path
                  key={`${path.source_id}-${path.target_id}-${index}`}
                  d={`M${from.x} ${from.y} Q${(from.x + to.x) / 2} ${(from.y + to.y) / 2 - 38} ${to.x} ${to.y}`}
                  fill="none"
                  stroke="#f2b705"
                  strokeWidth={Math.min(7, 1.5 + number(path.import_count || path.weight || 1))}
                  strokeDasharray="2 7"
                  opacity=".3"
                />
              );
            })}
          </g>
        {visibleRegions.map((region, index) => {
          const point = positions.get(region.region_id);
          const data = stats.get(region.region_id);
          const actualPath = regionPaths[region.region_id] || region.original_name || region.name || region.region_id;
          const title = actualPath.split(/[\\/]/).filter(Boolean).pop() || actualPath;
          const themedTitle = region.themed_name && region.themed_name !== title
            ? region.themed_name
            : region.original_name && region.original_name !== title
              ? region.original_name
              : null;
          const shape = index % 4;
          return (
            <g
              key={region.region_id}
              className="arena-island"
              transform={`translate(${point.x}, ${point.y}) scale(${regionScale(region, quests, activityCounts.get(region.region_id) || 0)})`}
              role="button"
              tabIndex="0"
              aria-label={`${actualPath} folder, ${data.verified} of ${data.quests.length} quests verified, ${data.completion}% complete`}
              onClick={() => onSelectRegion?.(region)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectRegion?.(region);
                }
              }}
            >
              <ellipse cx="0" cy="36" rx="105" ry="37" fill="#05070f" opacity=".38" />
              <path
                d="M-116 0 Q-84 -62 -22 -49 Q29 -73 102 -30 Q127 3 95 39 Q44 67 -34 51 Q-100 55 -116 0Z"
                fill="#5c4326"
                transform="translate(0 17)"
                filter="url(#arena-island-shadow)"
              />
              <path
                d="M-116 0 Q-84 -62 -22 -49 Q29 -73 102 -30 Q127 3 95 39 Q44 67 -34 51 Q-100 55 -116 0Z"
                fill="#4a8a2e"
              />
              <path
                d="M-108 -5 Q-72 -57 -20 -42 Q34 -66 95 -27 Q111 2 84 28 Q35 50 -30 39 Q-90 43 -108 -5Z"
                fill="#5fb33b"
              />
              <path
                className="arena-island-fog"
                d="M-108 -5 Q-72 -57 -20 -42 Q34 -66 95 -27 Q111 2 84 28 Q35 50 -30 39 Q-90 43 -108 -5Z"
                fill="#dbe8ff"
                opacity={data.fogOpacity}
                aria-label={`${data.completion}% verified progress fog`}
              />
              <rect x="-78" y="-19" width="6" height="19" fill="#6b4a26" />
              <circle cx="-75" cy="-25" r="13" fill="#2f7a30" />
              <rect x="74" y="-11" width="6" height="19" fill="#6b4a26" />
              <circle cx="77" cy="-18" r="12" fill="#2f7a30" />
              <g className="arena-territory-flag" aria-label={data.owner ? `Territory controlled by ${data.owner.user_name}` : "Neutral territory"}>
                <path d="M0 -51 V-83" stroke="#382a1b" strokeWidth="3" />
                <path d="M1 -82 L27 -76 L1 -69 Z" fill={data.owner ? data.ownerColor : "#a8b2c7"} />
              </g>
              {shape === 0 && (
                <g className="arena-block-house">
                  <polygon points="-31,-22 0,-46 31,-22" fill="#7a3a2a" />
                  <rect x="-27" y="-22" width="54" height="35" fill="#c9a06a" />
                  <rect x="-5" y="-4" width="12" height="17" fill="#3a2414" />
                  <rect x="-19" y="-15" width="9" height="9" fill="#75c5e8" />
                  <rect x="10" y="-15" width="9" height="9" fill="#75c5e8" />
                </g>
              )}
              {shape === 1 && (
                <g className="arena-block-house">
                  <rect x="-18" y="-43" width="36" height="56" fill="#8a7a63" />
                  <rect x="-23" y="-49" width="46" height="10" fill="#6a5b47" />
                  <rect x="-5" y="-4" width="10" height="17" fill="#2a1a0f" />
                  <rect x="-13" y="-34" width="8" height="8" fill="#75c5e8" />
                  <rect x="5" y="-34" width="8" height="8" fill="#75c5e8" />
                </g>
              )}
              {shape === 2 && (
                <g className="arena-block-house">
                  <rect x="-28" y="-27" width="56" height="40" fill="#9aa0ab" />
                  <rect x="-28" y="-36" width="56" height="10" fill="#7d838d" />
                  {[-22, -7, 8, 23].map((x) => <rect key={x} x={x} y="-48" width="7" height="15" fill="#7d838d" />)}
                  <rect x="-5" y="-4" width="12" height="17" fill="#2a1a0f" />
                </g>
              )}
              {shape === 3 && (
                <g className="arena-block-house">
                  <rect x="-23" y="-25" width="46" height="38" fill="#c9a06a" />
                  <polygon points="-29,-25 0,-47 29,-25" fill="#4d5966" />
                  <rect x="-5" y="-6" width="12" height="19" fill="#3a2414" />
                  <rect x="-16" y="-17" width="8" height="8" fill="#75c5e8" />
                  <rect x="8" y="-17" width="8" height="8" fill="#75c5e8" />
                </g>
              )}
              {(memberLocations.get(region.region_id) || []).map((member, memberIndex, activeMembers) => {
                const avatarX = (memberIndex - (activeMembers.length - 1) / 2) * 52;
                return (
                  <g key={member.user_id} className="arena-map-player" aria-label={`${member.user_name} active in ${title}`}>
                    <rect x={avatarX - 23} y="25" width="46" height="12" rx="4" fill="#0f1830" stroke="#91b6ff" />
                    <text x={avatarX} y="34" textAnchor="middle">{shortenLabel(member.user_name, 9)}</text>
                    <PixelAvatar userId={member.user_id} name={member.user_name} className="arena-map-avatar" x={avatarX - 11} y="38" width="22" height="22" />
                  </g>
                );
              })}
              {data.owner && (
                <g className="arena-island-owner" aria-label={`Territory owner ${data.owner.user_name}`}>
                  <rect x="-61" y="-64" width="58" height="15" rx="3" fill="#0f1830" opacity=".92" />
                  <text x="-32" y="-53" textAnchor="middle">{data.owner.user_name}</text>
                  <rect x="-58" y="-46" width="22" height="22" rx="3" fill={data.ownerColor} stroke="#fff" strokeWidth="1.5" />
                  <text x="-47" y="-31" textAnchor="middle">{data.owner.user_name.slice(0, 1).toUpperCase()}</text>
                </g>
              )}
              <g className="arena-island-label">
                <rect x="-67" y="72" width="134" height="42" rx="6" fill="#0f1830" stroke="#243154" />
                <text x="0" y="85" textAnchor="middle" className="arena-island-name">{shortenLabel(title)}</text>
                {themedTitle && <text x="0" y="97" textAnchor="middle" className="arena-island-themed">{shortenLabel(themedTitle)}</text>}
                <text x="0" y={themedTitle ? "109" : "101"} textAnchor="middle" className={data.completion === 100 ? "is-complete" : ""}>
                  {data.verified}/{data.quests.length} quests · {data.completion}%
                </text>
              </g>
              <title>{actualPath}: {data.verified} of {data.quests.length} quests verified</title>
            </g>
          );
        })}
        </svg>
      </div>
      <div className="arena-world-hud card">
        <strong>Project Progress</strong>
        <span>{number(leaderboard.reduce((sum, member) => sum + number(member.total_xp), 0))} verified XP</span>
        <svg className="arena-progress-path" viewBox="0 0 400 58" role="img" aria-label="Verified XP progress path">
          <path d="M18 42 C60 42 46 14 100 14 S145 44 194 44 S238 14 286 14 S332 42 382 42" />
          <path className="arena-progress-trail" d="M18 42 C60 42 46 14 100 14 S145 44 194 44 S238 14 286 14 S332 42 382 42" />
          <g className="arena-progress-marker" transform={`translate(${getProgressMarkerX(number(leaderboard.reduce((sum, member) => sum + number(member.total_xp), 0)))}, 0)`}>
            <path d="M0 5 V28" />
            <path d="M1 6 L17 10 L1 15 Z" />
          </g>
          <title>{number(leaderboard.reduce((sum, member) => sum + number(member.total_xp), 0))} verified XP from the server leaderboard</title>
        </svg>
      </div>
    </div>
  );
}

function MemberRows({ members, leaderboard, quests }) {
  const xpByMember = new Map(leaderboard.map((row) => [row.user_id, number(row.total_xp)]));
  return members.map((member, index) => {
    const xp = xpByMember.get(member.user_id) || 0;
    const completed = quests.filter((quest) => quest.assigned_to === member.user_id && quest.status === "verified").length;
    const claimed = quests.filter((quest) => quest.assigned_to === member.user_id && quest.status !== "verified").length;
    return (
      <div className="arena-player" key={member.user_id}>
        <span className="arena-pixel-avatar" style={{ "--avatar-color": AVATAR_COLORS[index % AVATAR_COLORS.length] }}>
          <PixelAvatar userId={member.user_id} name={member.user_name} />
        </span>
        <div className="arena-player-info">
          <strong>{member.user_name}{member.role === "host" ? " 👑" : ""}</strong>
          <span>{member.role}{member.level != null ? ` · Lv.${member.level}` : ""} · {completed} verified quests · {claimed} claimed</span>
          {member.xp_progress_percent != null && (
            <div className="arena-xp-track" aria-label={`${member.xp_progress_percent}% to next level`}>
              <i style={{ width: `${Math.min(100, Math.max(0, number(member.xp_progress_percent)))}%` }} />
            </div>
          )}
        </div>
        <b className="arena-xp-total">{xp} XP</b>
      </div>
    );
  });
}

function ActivityFeed({ activity }) {
  const events = activity?.events || [];
  return (
    <div className="arena-feed">
      {events.slice(0, 6).map((event, index) => (
        <div className="arena-feed-row" key={`${event.id || event.created_at}-${index}`}>
          <time>{event.created_at || "Time unavailable"}</time>
          <strong>{event.type || "Activity"}</strong>
          <span>{event.actor_id || "Unknown actor"} · {event.path || "Project activity"}</span>
          {(event.branch || event.ref) && <small>{[event.branch, event.ref].filter(Boolean).join(" · ")}</small>}
          {event.source === "simulated" && <span className="arena-simulated-tag">SIMULATED</span>}
        </div>
      ))}
    </div>
  );
}

function getActivityVelocity(events) {
  const buckets = Array(10).fill(0);
  const now = Date.now();
  events.forEach((event) => {
    const time = Date.parse(event.created_at || "");
    if (!Number.isFinite(time)) return;
    const ageMinutes = (now - time) / 60000;
    if (ageMinutes < 0 || ageMinutes > 30) return;
    const index = Math.min(9, Math.floor((30 - ageMinutes) / 3));
    buckets[index] += 1;
  });
  return buckets;
}

function WorldTab({ layout, entities, members, leaderboard, regionPaths, activity, activityState, activityError, onRetryActivity, onSelectRegion, loading, error }) {
  const quests = entities.quests || [];
  const regions = entities.regions || [];
  const completed = quests.filter((quest) => quest.status === "verified").length;
  const velocity = getActivityVelocity(activity?.events || []);
  const peakVelocity = Math.max(1, ...velocity);
  return (
    <PanelState loading={loading} error={error} empty={!regions.length}>
      <div className="arena-grid-two">
        <section>
          <MinecraftProjectMap
            layout={layout}
            regions={regions}
            quests={quests}
            members={members}
            leaderboard={leaderboard}
            regionPaths={regionPaths}
            activityEvents={activity?.events || []}
            onSelectRegion={onSelectRegion}
          />
          <div className="arena-card arena-map-legend">
            <h2>Legend</h2>
            <span className="arena-chip is-verified">✔ Verified</span>
            <span className="arena-chip is-pending">! Pending</span>
            <span className="arena-chip is-review">⇄ In review</span>
            <span className="arena-chip is-dependency">⛏ In progress</span>
          </div>
        </section>
        <aside className="arena-side-stack">
          <section className="arena-card">
            <h2>Team</h2>
            <MemberRows members={members} leaderboard={leaderboard} quests={quests} />
            {!members.length && <p className="arena-state">No teammates have joined yet.</p>}
          </section>
          <section className="arena-card">
            <h2>Project Velocity</h2>
            <p className="arena-muted">{activity?.events?.length || 0} real activity events in the selected window</p>
            {activityState === "error"
              ? <p className="arena-state is-error">Velocity unavailable while activity is unreachable.</p>
              : activity?.events?.length
              ? (
                <div className="arena-velocity" aria-label="Recent activity volume">
                  {velocity.map((count, index) => count > 0 && (
                    <i key={index} style={{ height: `${Math.max(10, (count / peakVelocity) * 100)}%` }} title={`${count} events`} />
                  ))}
                </div>
              )
              : <p className="arena-state">No activity yet.</p>}
          </section>
          <section className="arena-card">
            <h2>Recent Activity</h2>
            {activityState === "loading" && <p className="arena-state" role="status">Loading this panel…</p>}
            {activityState === "error" && (
              <>
                <p className="arena-state is-error" role="alert">Activity could not be loaded. {activityError}</p>
                <button type="button" className="arena-activity-retry" onClick={onRetryActivity}>Retry activity</button>
              </>
            )}
            {activityState === "ready" && (activity?.events?.length
              ? <ActivityFeed activity={activity} />
              : <p className="arena-state">No activity yet.</p>)}
          </section>
          <p className="arena-muted">Verified progress: {completed} of {quests.length} quests. XP only comes from server-verified outcomes.</p>
        </aside>
      </div>
    </PanelState>
  );
}

function QuestsTab({ quests, leaderboard, onClaimQuest, loading, error }) {
  const [filter, setFilter] = useState("all");
  const [claiming, setClaiming] = useState(null);
  const [claimError, setClaimError] = useState("");
  const filtered = quests.filter((quest) => {
    if (filter === "available") return quest.status === "available";
    if (filter === "claimed") return quest.status === "claimed" || quest.status === "in_progress";
    if (filter === "verified") return quest.status === "verified";
    if (filter === "pr") return /pull|pr/i.test(quest.source_type || "");
    if (filter === "issue") return /issue/i.test(quest.source_type || "");
    return true;
  });
  const claim = async (questId) => {
    setClaimError("");
    setClaiming(questId);
    try {
      await onClaimQuest(questId);
    } catch (requestError) {
      setClaimError(requestError.response?.data?.detail || requestError.message || "Quest could not be claimed.");
    } finally {
      setClaiming(null);
    }
  };
  return (
    <PanelState loading={loading} error={error} empty={!quests.length}>
      <div className="arena-grid-two arena-quest-layout">
        <section className="arena-card">
          <div className="arena-card-heading">
            <h2>Quest Board · PRs &amp; Issues</h2>
            <div className="arena-filters" role="group" aria-label="Filter quests">
              {["all", "issue", "pr", "available", "claimed", "verified"].map((item) => (
                <button key={item} type="button" className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>
                  {item === "issue" ? "Issues" : item === "pr" ? "PRs" : item}
                </button>
              ))}
            </div>
          </div>
          {claimError && <p className="arena-state is-error" role="alert">{claimError}</p>}
          {!filtered.length
            ? <p className="arena-state">No {filter === "all" ? "" : `${filter} `}quests returned by this session.</p>
            : filtered.map((quest) => {
              const status = getQuestStatus(quest);
              return (
                <article className="arena-quest-row" key={quest.quest_id}>
                  <div className={`arena-quest-icon ${/pull|pr/i.test(quest.source_type || "") ? "is-pr" : ""}`}>
                    {/pull|pr/i.test(quest.source_type || "") ? "⇄" : "!"}
                  </div>
                  <div className="arena-quest-main">
                    <strong>{quest.source_id ? `${quest.source_id} ` : ""}{quest.original_title || quest.themed_title}</strong>
                    <div className="arena-quest-meta">
                      {quest.issue_url
                        ? <a href={quest.issue_url} target="_blank" rel="noreferrer">Open source issue</a>
                        : <span>Source: {quest.source_type || "Arena task"}</span>}
                      {quest.assigned_name && <span>Assigned to {quest.assigned_name}</span>}
                    </div>
                    <p className="arena-agent-line">✦ {questEvidence(quest)}</p>
                  </div>
                  <div className="arena-quest-actions">
                    <span className={`arena-chip ${status === "Verified" ? "is-verified" : status === "In review" ? "is-review" : "is-pending"}`}>{status}</span>
                    {quest.status === "available" && (
                      <button type="button" className="arena-take" disabled={claiming === quest.quest_id} onClick={() => claim(quest.quest_id)}>
                        {claiming === quest.quest_id ? "Claiming…" : "Take Quest"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          <p className="arena-muted">The UI does not verify work or award XP. The server verifies eligible outcomes.</p>
        </section>
        <aside className="arena-side-stack">
          <LeaderboardCard leaderboard={leaderboard} />
          <RewardsStrip quests={quests} />
        </aside>
      </div>
    </PanelState>
  );
}

function LeaderboardCard({ leaderboard }) {
  return (
    <section className="arena-card">
      <h2>Leaderboard · verified XP</h2>
      <PanelState empty={!leaderboard.length}>
        {leaderboard.map((member, index) => (
          <div className="arena-leader-row" key={member.user_id}>
            <b>{index + 1}</b>
            <span>{member.user_name || member.user_id}</span>
            <strong>{number(member.total_xp)} XP</strong>
          </div>
        ))}
        <p className="arena-muted">Only verified outcomes count.</p>
      </PanelState>
    </section>
  );
}

function RewardsStrip({ quests }) {
  const verified = quests.filter((quest) => quest.status === "verified");
  return (
    <section className="arena-card">
      <h2>My Rewards</h2>
      <div className="arena-chests">
        {verified.map((quest) => (
          <div className="arena-chest" key={quest.quest_id}>
            <span className="arena-chest-box rare" aria-hidden="true" />
            <strong>{quest.themed_title || quest.original_title}</strong>
            <span>+{number(quest.xp_reward)} verified XP</span>
          </div>
        ))}
        {!verified.length && <p className="arena-state">No verified quest rewards yet.</p>}
      </div>
    </section>
  );
}

function TeamTab({ members, leaderboard, quests, loading, error }) {
  return (
    <PanelState loading={loading} error={error} empty={!members.length}>
      <div className="arena-grid-two">
        <section className="arena-card">
          <h2>Team</h2>
          <MemberRows members={members} leaderboard={leaderboard} quests={quests} />
        </section>
        <LeaderboardCard leaderboard={leaderboard} />
      </div>
    </PanelState>
  );
}

function RewardsTab({ quests, leaderboard, loading, error }) {
  const verified = quests.filter((quest) => quest.status === "verified");
  return (
    <PanelState loading={loading} error={error} empty={!verified.length && !leaderboard.length}>
      <div className="arena-grid-two">
        <section className="arena-card">
          <h2>Rewards &amp; Chests</h2>
          <p className="arena-muted">Verified quest rewards are listed from the session data. No badge or level records are available in the current API response.</p>
          <RewardsStrip quests={quests} />
        </section>
        <LeaderboardCard leaderboard={leaderboard} />
      </div>
    </PanelState>
  );
}

export default function ArenaWorkspace({
  currentSession,
  sessionDetails,
  onClaimQuest,
  onSelectRegion,
  onLeave,
  children,
  toolbar,
  loading = false,
  error = null,
  activity = null,
  activityState = "loading",
  activityError = "",
  onRetryActivity,
  currentUser,
  connectionStatus = "connecting",
  initialTab = "roadmap",
  roadmapData: externalRoadmapData = null,
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const entities = sessionDetails?.entities || EMPTY_ENTITIES;
  const members = sessionDetails?.members || [];
  const leaderboard = sessionDetails?.leaderboard || [];
  const quests = entities.quests || [];
  const layout = sessionDetails?.layout;
  const regionPaths = sessionDetails?.region_paths || {};
  const currentMember = members.find((member) => member.user_name === currentUser)
    || members.find((member) => member.user_id === currentSession?.host_user_id);
  const currentUserName = currentMember?.user_name || currentUser || currentSession?.host_name || "Arena member";
  const currentUserId = currentMember?.user_id || currentSession?.host_user_id || currentUserName;
  const isHost = currentSession?.host_user_id === currentUserId || currentMember?.role === "host";

  const [roadmap, setRoadmap] = useState(externalRoadmapData);
  const [roadmapLoading, setRoadmapLoading] = useState(false);
  const [roadmapError, setRoadmapError] = useState(null);

  useEffect(() => {
    if (externalRoadmapData) {
      setRoadmap(externalRoadmapData);
    }
  }, [externalRoadmapData]);

  const fetchRoadmap = useCallback(async () => {
    if (!currentSession?.id) return;
    try {
      setRoadmapLoading(true);
      setRoadmapError(null);
      const data = await getArenaRoadmap(currentSession.id);
      setRoadmap(data);
    } catch (err) {
      // Fallback to preserve the roadmap UI even if endpoint is syncing
      setRoadmap((prev) => prev || {
        session_id: currentSession.id,
        overall_progress: 0,
        verified_quests: 0,
        total_quests: 0,
        verified_xp: 0,
        terrain_style: "grass",
        members: members || [],
        phases: [],
        achievements: [],
      });
    } finally {
      setRoadmapLoading(false);
    }
  }, [currentSession?.id, members]);

  useEffect(() => {
    if (!externalRoadmapData && currentSession?.id) {
      fetchRoadmap();
    }
  }, [fetchRoadmap, externalRoadmapData, currentSession?.id]);

  const handleRoadmapClaimQuest = async (questId) => {
    if (onClaimQuest) {
      await onClaimQuest(questId);
    }
    await fetchRoadmap();
  };

  const handleRoadmapSubmitQuest = async (questId, evidenceNote) => {
    if (!currentSession?.id) return;
    await submitArenaQuest(currentSession.id, questId, evidenceNote);
    await fetchRoadmap();
  };

  const handleRoadmapApproveQuest = async (questId, evidenceNote) => {
    if (!currentSession?.id) return;
    await approveArenaQuest(currentSession.id, questId, evidenceNote);
    await fetchRoadmap();
  };

  const handleRoadmapOverridePhaseLock = async (phaseId, unlocked) => {
    if (!currentSession?.id) return;
    await overridePhaseLock(currentSession.id, phaseId, unlocked);
    await fetchRoadmap();
  };

  const handleRoadmapImportTasks = async (markdown) => {
    if (!currentSession?.id) return;
    await importArenaTasks(currentSession.id, markdown);
    await fetchRoadmap();
  };

  const panelProps = {
    loading: loading || !sessionDetails,
    error,
  };
  const panels = {
    roadmap: (
      <RoadmapProjectMap
        roadmap={roadmap}
        currentSession={currentSession}
        currentUser={currentUserName}
        currentUserId={currentUserId}
        isHost={isHost}
        onClaimQuest={handleRoadmapClaimQuest}
        onSubmitQuest={handleRoadmapSubmitQuest}
        onApproveQuest={handleRoadmapApproveQuest}
        onOverridePhaseLock={handleRoadmapOverridePhaseLock}
        onImportTasks={handleRoadmapImportTasks}
        onRefresh={fetchRoadmap}
        loading={roadmapLoading || panelProps.loading}
        error={roadmapError || error}
      />
    ),
    world: (
      <WorldTab
        {...panelProps}
        layout={layout}
        regionPaths={regionPaths}
        entities={entities}
        members={members}
        leaderboard={leaderboard}
        activity={activity}
        activityState={activityState}
        activityError={activityError}
        onRetryActivity={onRetryActivity}
        onSelectRegion={onSelectRegion}
      />
    ),
    quests: <QuestsTab {...panelProps} quests={quests} leaderboard={leaderboard} onClaimQuest={onClaimQuest} />,
    team: <TeamTab {...panelProps} members={members} leaderboard={leaderboard} quests={quests} />,
    rewards: <RewardsTab {...panelProps} quests={quests} leaderboard={leaderboard} />,
  };

  return (
    <div className="arena-app">
      <nav className="arena-side-nav" role="tablist" aria-label="Arena sections">
        <div className="arena-brand"><span className="arena-brand-cube" /> <span>OneContext<br />Arena</span></div>
        {TABS.map((tab) => (
          <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} className={`arena-nav-button${activeTab === tab.id ? " is-active" : ""}`} onClick={() => setActiveTab(tab.id)}>
            <span>{tab.icon}</span>{tab.label}
          </button>
        ))}
        <div className="arena-current-user">
          <span className="arena-pixel-avatar">
            <PixelAvatar userId={currentUserId} name={currentUserName} />
          </span>
          <div><strong>{currentUserName}</strong><small>{currentMember?.role || "Team member"}</small></div>
        </div>
      </nav>
      <main className="arena-main">
        <header className="arena-top">
          <div>
            <strong>OneContext — Project World</strong>
            <span className="arena-data-tag">REAL PROJECT DATA</span>
          </div>
          <div className={`arena-live is-${connectionStatus}`} aria-live="polite">
            <i /> {connectionStatus === "live" ? "Live" : connectionStatus === "reconnecting" ? "Reconnecting" : "Connecting"}
          </div>
          <div className="arena-toolbar">{toolbar}</div>
          <button className="arena-leave" type="button" onClick={onLeave} aria-label="Leave Arena">Leave</button>
        </header>
        <nav className="arena-mobile-tabs" role="tablist" aria-label="Arena sections">
          {TABS.map((tab) => (
            <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} className={activeTab === tab.id ? "is-active" : ""} onClick={() => setActiveTab(tab.id)}>
              {tab.icon} {tab.shortLabel}
            </button>
          ))}
        </nav>
        <div className="arena-wrap">
          <section className="arena-tab-panel" role="tabpanel" aria-label={TABS.find((tab) => tab.id === activeTab)?.label} key={activeTab}>
            <PanelErrorBoundary key={activeTab}>
              {panels[activeTab]}
            </PanelErrorBoundary>
          </section>
        </div>
      </main>
      {children}
    </div>
  );
}

export { PanelState, getQuestStatus, questEvidence };
