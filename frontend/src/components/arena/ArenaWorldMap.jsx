import React, { useState, useRef } from "react";

export default function ArenaWorldMap({
  layout,
  gameBible,
  members,
  onSelectRegion,
  onSelectQuest,
  onSelectBoss,
  selectedRegion,
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const regions = layout?.regions || [];
  const paths = layout?.paths || [];
  const bosses = layout?.boss_markers || [];
  const quests = layout?.quest_markers || [];
  const checkpoints = layout?.checkpoint_markers || [];
  const archetype = layout?.archetype || "voxel_isometric";

  // Palette extract
  const palette = gameBible?.palette || [];
  const p1 = palette[0]?.hex || "#3b82f6";
  const p2 = palette[1]?.hex || "#10b981";
  const p3 = palette[2]?.hex || "#f59e0b";
  const p4 = palette[3]?.hex || "#ef4444";

  const handleMouseDown = (e) => {
    if (e.target.tagName === "svg" || e.target.id === "map-bg") {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "640px",
        backgroundColor: "#090d16",
        borderRadius: "12px",
        overflow: "hidden",
        border: "1px solid #1e293b",
        userSelect: "none",
        cursor: isDragging ? "grabbing" : "grab",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Zoom and Pan Controls */}
      <div
        style={{
          position: "absolute",
          top: "16px",
          right: "16px",
          zIndex: 30,
          display: "flex",
          gap: "8px",
          background: "rgba(15, 23, 42, 0.85)",
          padding: "6px 10px",
          borderRadius: "8px",
          border: "1px solid #334155",
          backdropFilter: "blur(4px)",
        }}
      >
        <button
          onClick={() => setZoom((z) => Math.min(1.8, z + 0.15))}
          style={btnStyle}
          title="Zoom In"
        >
          ➕
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.6, z - 0.15))}
          style={btnStyle}
          title="Zoom Out"
        >
          ➖
        </button>
        <button
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          style={btnStyle}
          title="Reset View"
        >
          🎯
        </button>
      </div>

      {/* Map Archetype & Biome Badge */}
      <div
        style={{
          position: "absolute",
          top: "16px",
          left: "16px",
          zIndex: 30,
          background: "rgba(15, 23, 42, 0.85)",
          padding: "8px 14px",
          borderRadius: "8px",
          border: "1px solid #334155",
          backdropFilter: "blur(4px)",
          color: "#f8fafc",
          fontSize: "13px",
        }}
      >
        <div style={{ fontWeight: "bold", display: "flex", alignItems: "center", gap: "6px" }}>
          <span>🌍 Universe:</span>
          <span style={{ color: p1 }}>{gameBible?.game_name || "Arena Realm"}</span>
          <span
            style={{
              fontSize: "11px",
              padding: "2px 6px",
              borderRadius: "4px",
              background: "#334155",
              color: "#94a3b8",
            }}
          >
            {archetype}
          </span>
        </div>
        <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "3px" }}>
          Hold & drag to explore • Click regions, quests, or bosses
        </div>
      </div>

      {/* Interactive SVG World Canvas */}
      <svg
        id="map-bg"
        width="100%"
        height="100%"
        viewBox="0 0 1200 800"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "center center",
          transition: isDragging ? "none" : "transform 0.15s ease-out",
        }}
      >
        <defs>
          <radialGradient id="worldAtmosphere" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stop-color="#1e1b4b" stop-opacity="0.3" />
            <stop offset="100%" stop-color="#090d16" stop-opacity="0.9" />
          </radialGradient>
          <filter id="nodeGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color={p1} flood-opacity="0.5" />
          </filter>
          <filter id="bossFlame" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="#ef4444" flood-opacity="0.8" />
          </filter>
        </defs>

        <rect width="1200" height="800" fill="url(#worldAtmosphere)" />

        {/* Ambient Grid Lines for Voxel/City Archetypes */}
        {archetype === "voxel_isometric" && (
          <g opacity="0.12" stroke="#64748b" strokeWidth="1">
            {Array.from({ length: 15 }).map((_, i) => (
              <line key={`g1-${i}`} x1={i * 90} y1="0" x2={i * 90 + 400} y2="800" />
            ))}
            {Array.from({ length: 15 }).map((_, i) => (
              <line key={`g2-${i}`} x1={1200 - i * 90} y1="0" x2={800 - i * 90} y2="800" />
            ))}
          </g>
        )}

        {/* Dependency Paths */}
        {paths.map((p, idx) => (
          <g key={`path-${idx}`}>
            <line
              x1={p.x1}
              y1={p.y1}
              x2={p.x2}
              y2={p.y2}
              stroke="#334155"
              strokeWidth="3"
              strokeDasharray={p.type === "service" ? "6,6" : "none"}
              opacity="0.8"
            />
            {/* Pulsing energy packet on path */}
            <circle
              cx={(p.x1 + p.x2) / 2}
              cy={(p.y1 + p.y2) / 2}
              r="3.5"
              fill={p1}
              opacity="0.75"
            />
          </g>
        ))}

        {/* Checkpoints / Portals */}
        {checkpoints.map((cp, idx) => (
          <g
            key={`cp-${idx}`}
            transform={`translate(${cp.x}, ${cp.y})`}
            style={{ cursor: "pointer" }}
          >
            <rect
              x="-60"
              y="-18"
              width="120"
              height="36"
              rx="18"
              fill="#1e1b4b"
              stroke={cp.status === "unlocked" ? "#10b981" : "#8b5cf6"}
              strokeWidth="2"
            />
            <text
              x="0"
              y="5"
              textAnchor="middle"
              fill="#f8fafc"
              fontSize="11"
              fontWeight="bold"
            >
              {cp.status === "unlocked" ? "🔓" : "🌌"} {cp.themed_title.slice(0, 14)}
            </text>
          </g>
        ))}

        {/* Regions */}
        {regions.map((r) => {
          const isSelected = selectedRegion?.region_id === r.region_id;
          const isDamaged = r.health < 80;

          return (
            <g
              key={r.region_id}
              transform={`translate(${r.x}, ${r.y})`}
              onClick={() => onSelectRegion(r)}
              style={{ cursor: "pointer" }}
            >
              {/* Region Elevation Base / Shadow */}
              <ellipse
                cx="0"
                cy="32"
                rx="68"
                ry="30"
                fill="#020617"
                opacity="0.6"
              />

              {/* Main Region Biome Block */}
              {archetype === "voxel_isometric" ? (
                // Isometric Voxel Hex Block
                <g filter={isSelected ? "url(#nodeGlow)" : "none"}>
                  <polygon
                    points="0,-28 58,-2 0,24 -58,-2"
                    fill={isSelected ? p1 : (isDamaged ? "#7f1d1d" : "#1e293b")}
                    stroke={isSelected ? "#ffffff" : (isDamaged ? "#ef4444" : "#475569")}
                    strokeWidth={isSelected ? "2.5" : "1.5"}
                  />
                  <polygon
                    points="-58,-2 0,24 0,44 -58,18"
                    fill={isDamaged ? "#450a0a" : "#0f172a"}
                  />
                  <polygon
                    points="0,24 58,-2 58,18 0,44"
                    fill={isDamaged ? "#290505" : "#090d16"}
                  />
                </g>
              ) : (
                // Rounded Realm Node
                <circle
                  cx="0"
                  cy="0"
                  r="42"
                  fill={isSelected ? p1 : (isDamaged ? "#7f1d1d" : "#1e293b")}
                  stroke={isSelected ? "#ffffff" : (isDamaged ? "#ef4444" : "#475569")}
                  strokeWidth={isSelected ? "3" : "2"}
                  filter={isSelected ? "url(#nodeGlow)" : "none"}
                />
              )}

              {/* Health Arc Indicator */}
              <rect
                x="-30"
                y="30"
                width="60"
                height="6"
                rx="3"
                fill="#334155"
              />
              <rect
                x="-30"
                y="30"
                width={(60 * r.health) / 100}
                height="6"
                rx="3"
                fill={r.health > 80 ? "#10b981" : r.health > 50 ? "#f59e0b" : "#ef4444"}
              />

              {/* Region Label */}
              <text
                x="0"
                y="-36"
                textAnchor="middle"
                fill="#f8fafc"
                fontSize="12"
                fontWeight="bold"
                style={{ textShadow: "0 2px 4px rgba(0,0,0,0.8)" }}
              >
                {r.themed_name}
              </text>
              <text
                x="0"
                y="-49"
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="10"
              >
                📁 {r.original_name}
              </text>
            </g>
          );
        })}

        {/* Quest Markers */}
        {quests.map((q) => {
          const isVerified = q.status === "verified";
          const isClaimed = q.status === "claimed";

          return (
            <g
              key={q.quest_id}
              transform={`translate(${q.x}, ${q.y})`}
              onClick={() => onSelectQuest(q)}
              style={{ cursor: "pointer" }}
            >
              <circle
                cx="0"
                cy="0"
                r="14"
                fill={isVerified ? "#065f46" : isClaimed ? "#92400e" : "#1e3a8a"}
                stroke={isVerified ? "#10b981" : isClaimed ? "#f59e0b" : "#3b82f6"}
                strokeWidth="2"
              />
              <text
                x="0"
                y="4"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="11"
                fontWeight="bold"
              >
                {isVerified ? "✓" : "!"}
              </text>
            </g>
          );
        })}

        {/* Boss Markers */}
        {bosses.map((b) => {
          const isDefeated = b.status === "defeated";
          const isCritical = b.severity === "critical";

          return (
            <g
              key={b.boss_id}
              transform={`translate(${b.x}, ${b.y})`}
              onClick={() => onSelectBoss(b)}
              style={{ cursor: "pointer" }}
              filter={!isDefeated ? "url(#bossFlame)" : "none"}
            >
              <polygon
                points="0,-16 16,0 0,16 -16,0"
                fill={isDefeated ? "#334155" : (isCritical ? "#991b1b" : "#b91c1c")}
                stroke={isDefeated ? "#64748b" : "#f87171"}
                strokeWidth="2.5"
              />
              <text
                x="0"
                y="4"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="11"
                fontWeight="bold"
              >
                {isDefeated ? "💀" : "👾"}
              </text>
            </g>
          );
        })}

        {/* Teammate Player Presence Avatars */}
        {members.map((m, idx) => {
          const reg = regions.find((r) => r.region_id === m.current_region_id) || regions[idx % regions.length];
          if (!reg) return null;

          const offsetX = (idx % 2 === 0 ? 1 : -1) * (18 + idx * 8);
          const offsetY = -10 + (idx * 12);

          return (
            <g
              key={`player-${m.user_id}`}
              transform={`translate(${reg.x + offsetX}, ${reg.y + offsetY})`}
            >
              <circle
                cx="0"
                cy="0"
                r="11"
                fill="#0284c7"
                stroke="#38bdf8"
                strokeWidth="2"
              />
              <text
                x="0"
                y="4"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="9"
                fontWeight="bold"
              >
                {m.user_name ? m.user_name.slice(0, 2).toUpperCase() : "ME"}
              </text>
              {/* Online indicator ping */}
              <circle
                cx="8"
                cy="-8"
                r="3.5"
                fill={m.is_online ? "#10b981" : "#94a3b8"}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const btnStyle = {
  background: "#1e293b",
  border: "1px solid #475569",
  color: "#f8fafc",
  padding: "4px 8px",
  borderRadius: "4px",
  cursor: "pointer",
  fontSize: "12px",
};
