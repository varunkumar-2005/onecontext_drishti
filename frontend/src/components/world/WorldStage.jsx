import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { KIND_COLORS } from "./worldState";

const HEIGHT = { xs: 14, s: 24, m: 38, l: 56, xl: 78 };
const SIZE_SCORE = { xs: 1, s: 2, m: 3, l: 4, xl: 5 };
const LANDMARKS_PER_DISTRICT = 12;

export function buildingPriority(building, alertPaths = new Set(), questPaths = new Set()) {
  return (SIZE_SCORE[building.loc] || 2)
    + Math.max(0, Number(building.heat) || 0) * 2
    + (alertPaths.has(building.path) ? 18 : 0)
    + (questPaths.has(building.path) ? 12 : 0);
}

export function selectBuildingLod(buildings = [], alerts = [], quests = [], perDistrict = LANDMARKS_PER_DISTRICT) {
  const alertPaths = new Set(alerts.flatMap((alert) => alert.paths || []));
  const questPaths = new Set(quests.flatMap((quest) => quest.file_paths || []));
  const groups = new Map();
  buildings.forEach((building) => {
    const group = groups.get(building.region_id) || [];
    group.push({ ...building, priority: buildingPriority(building, alertPaths, questPaths) });
    groups.set(building.region_id, group);
  });
  const landmarks = [];
  const props = [];
  groups.forEach((group) => {
    group.sort((a, b) => b.priority - a.priority || a.path.localeCompare(b.path));
    const districtLandmarks = group.slice(0, perDistrict);
    districtLandmarks.forEach((building, index) => {
      building.landmark = index < 4 || alertPaths.has(building.path) || questPaths.has(building.path);
    });
    landmarks.push(...districtLandmarks);
    props.push(...group.slice(perDistrict));
  });
  return { landmarks, props };
}

export function resolveLabelVisibility(labels, gap = 3) {
  const accepted = [];
  const ordered = [...labels].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  ordered.forEach((label) => {
    const width = Math.max(28, label.text.length * 5.6);
    const box = { left: label.x - width / 2, right: label.x + width / 2, top: label.y - 9, bottom: label.y + 2 };
    const overlaps = accepted.some((other) => (
      box.left < other.right + gap && box.right + gap > other.left
      && box.top < other.bottom + gap && box.bottom + gap > other.top
    ));
    if (!overlaps) accepted.push({ ...box, id: label.id });
  });
  return new Set(accepted.map((label) => label.id));
}

export function districtFogOpacity(verified, total) {
  if (total <= 0) return 0.3;
  return Math.max(0.035, 0.3 * (1 - Math.min(1, Math.max(0, verified) / total)));
}

export function fitWorldCamera(districts, bounds) {
  if (!districts.length) return null;
  const minX = Math.min(...districts.map((district) => district.x - 10));
  const maxX = Math.max(...districts.map((district) => district.x + district.w + 34));
  const minY = Math.min(...districts.map((district) => district.y - 14));
  const maxY = Math.max(...districts.map((district) => district.y + district.h + 22));
  return {
    x: (minX + maxX - bounds.width) / 2,
    y: (minY + maxY - bounds.height) / 2,
    width: bounds.width,
    height: bounds.height,
  };
}

const paletteColor = (theme, index, fallback) => {
  const value = theme?.palette?.[index];
  return typeof value === "string" ? value : value?.hex || fallback;
};

function districtColor(districtId, quests, regionPaths, members) {
  const pathForRegion = (regionId) => regionPaths?.[regionId] || "";
  const rootForRegion = (regionId) => pathForRegion(regionId).split("/")[0];
  const xpByMember = new Map();
  quests.filter((quest) => quest.status === "verified").forEach((quest) => {
    if (!quest.assigned_to || rootForRegion(quest.region_id) !== districtId) return;
    xpByMember.set(quest.assigned_to, (xpByMember.get(quest.assigned_to) || 0) + (Number(quest.xp_reward) || 0));
  });
  const leader = [...xpByMember.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  if (!leader) return { color: "#94a3b8", title: "Neutral territory — no verified XP" };
  const member = members.find((item) => item.user_id === leader[0]);
  const index = Math.max(0, members.findIndex((item) => item.user_id === leader[0]));
  const color = member?.color || ["#5fbf3f", "#38bdf8", "#c084fc", "#f59e0b", "#fb7185"][index % 5];
  return { color, title: `${member?.user_name || leader[0]} leads with ${leader[1]} verified XP` };
}

const basename = (path) => path.split("/").pop() || path;

function IsometricBuilding({ building, x, y, selected, roof, accent, hovered, labelVisible, onSelect }) {
  const height = HEIGHT[building.loc] || 24;
  const color = KIND_COLORS[building.kind] || KIND_COLORS.other;
  const depth = 9;
  const width = 12;
  const bodyTop = y - height;
  const title = `${building.path}, ${building.kind}, heat ${building.heat || 0}`;
  return (
    <g
      data-building={building.path}
      className={`world-building${selected ? " is-selected" : ""}${hovered ? " is-hovered" : ""}`}
      tabIndex="0"
      role="button"
      aria-label={title}
      onClick={() => onSelect(building)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(building);
        }
      }}
      style={{ cursor: "pointer" }}
    >
      {building.heat > 0 && (
        <ellipse
          cx={x}
          cy={y + 3}
          rx={20 + Math.min(20, building.heat * 3)}
          ry={9 + Math.min(9, building.heat)}
          fill={accent}
          opacity={Math.min(0.26, 0.06 + building.heat * 0.035)}
          filter="url(#world-glow)"
        />
      )}
      <polygon points={`${x - width},${bodyTop} ${x},${bodyTop + depth} ${x},${y + depth} ${x - width},${y}`} fill={color} stroke="#111827" strokeWidth="1" />
      <polygon points={`${x},${bodyTop + depth} ${x + width},${bodyTop} ${x + width},${y} ${x},${y + depth}`} fill="#111827" opacity=".34" stroke="#111827" strokeWidth="1" />
      <polygon points={`${x - width},${bodyTop} ${x},${bodyTop - depth} ${x + width},${bodyTop} ${x},${bodyTop + depth}`} fill="#fff" opacity=".18" stroke="#dbeafe" strokeOpacity=".22" />
      {roof === "spire" ? (
        <path d={`M${x - width} ${bodyTop} L${x} ${bodyTop - 22} L${x + width} ${bodyTop}Z`} fill={accent} stroke="#fff" strokeOpacity=".28" />
      ) : roof === "dome" ? (
        <ellipse cx={x} cy={bodyTop - 1} rx={width + 1} ry={depth + 4} fill={accent} opacity=".82" stroke="#fff" strokeOpacity=".32" />
      ) : (
        <polygon points={`${x - width},${bodyTop} ${x},${bodyTop - depth} ${x + width},${bodyTop} ${x},${bodyTop + depth}`} fill={accent} opacity=".76" />
      )}
      {labelVisible && (
        <g className="building-label" aria-hidden="true">
          <rect x={x - 37} y={bodyTop - (roof === "spire" ? 39 : 27)} width="74" height="15" rx="5" fill="#0b1220" fillOpacity=".87" stroke={accent} strokeOpacity=".6" />
          <text x={x} y={bodyTop - (roof === "spire" ? 28 : 16)} textAnchor="middle">{basename(building.path)}</text>
        </g>
      )}
      <title>{title}</title>
      {(selected || hovered) && <circle cx={x} cy={y + 2} r="18" fill="none" stroke={selected ? "#fff" : accent} strokeWidth="1.5" strokeDasharray={selected ? undefined : "3 3"} />}
    </g>
  );
}

function Prop({ building, x, y, onSelect, hovered, labelVisible }) {
  return (
    <g
      data-building={building.path}
      className={`world-prop${hovered ? " is-hovered" : ""}`}
      tabIndex="0"
      role="button"
      aria-label={`${building.path}, small landmark prop`}
      onClick={() => onSelect(building)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(building);
        }
      }}
      style={{ cursor: "pointer" }}
    >
      <path d={`M${x} ${y - 10} l9 8 -9 8 -9 -8Z`} fill={KIND_COLORS[building.kind] || KIND_COLORS.other} stroke="#0f172a" />
      {building.kind === "docs" ? (
        <path d={`M${x} ${y - 27} l8 10 h-16Z`} fill="#86a96b" stroke="#c7d2a4" strokeWidth=".7" />
      ) : (
        <path d={`M${x} ${y - 31} l9 12 h-18Z`} fill="#537d50" stroke="#a3c18a" strokeWidth=".7" />
      )}
      <rect x={x - 1} y={y - 19} width="2" height="12" fill="#795548" />
      {labelVisible && <text x={x} y={y - 36} textAnchor="middle" className="prop-label">{basename(building.path)}</text>}
      <title>{building.path}</title>
    </g>
  );
}

function districtTitle(district, regions, regionPaths) {
  const match = regions.find((region) => {
    const path = regionPaths?.[region.region_id] || "";
    return path.split("/")[0] === district.region_id;
  });
  return { primary: district.region_id, secondary: match?.themed_name || match?.theme_biome_or_zone || "" };
}

export default memo(function WorldStage({
  world,
  selectedPath,
  onSelect,
  theme,
  focusPath,
  regions = [],
  regionPaths = {},
  leaderboard = [],
}) {
  const [camera, setCamera] = useState(null);
  const [hoveredPath, setHoveredPath] = useState(null);
  const drag = useRef(null);
  const districts = useMemo(() => Object.fromEntries((world?.districts || []).map((district) => [district.region_id, district])), [world]);
  const { landmarks, props } = useMemo(
    () => selectBuildingLod(world?.buildings || [], world?.alerts || [], world?.quests || []),
    [world?.buildings, world?.alerts, world?.quests],
  );
  const roofs = theme?.world_archetype?.includes("fantasy")
    ? "spire"
    : theme?.world_archetype?.includes("cyber") || theme?.world_archetype?.includes("social")
      ? "dome"
      : "flat";
  const accent = paletteColor(theme, 0, "#5fbf3f");
  const secondary = paletteColor(theme, 1, "#60a5fa");
  const terrain = theme?.world_archetype?.includes("fantasy")
    ? { pattern: "stone", base: paletteColor(theme, 2, "#343543") }
    : theme?.world_archetype?.includes("racing") || theme?.world_archetype?.includes("urban")
      ? { pattern: "sand", base: paletteColor(theme, 1, "#8c795b") }
      : { pattern: "grass", base: paletteColor(theme, 2, "#34543b") };

  const bounds = useMemo(() => {
    const all = world?.districts || [];
    return {
      width: Math.max(1000, ...all.map((district) => district.x + district.w + 100)),
      height: Math.max(620, ...all.map((district) => district.y + district.h + 150)),
    };
  }, [world?.districts]);

  useEffect(() => {
    if (!world?.districts?.length) return;
    setCamera((current) => current || fitWorldCamera(world.districts, bounds));
  }, [bounds, world?.districts]);

  const pointFor = (building) => {
    const district = districts[building.region_id];
    if (!district) return null;
    const [gx, gy] = building.grid || [0, 0];
    return { x: district.x + 22 + gx * 25, y: district.y + 112 - gy * 11 };
  };

  useEffect(() => {
    const building = (world?.buildings || []).find((item) => item.path === focusPath);
    const point = building && pointFor(building);
    if (!point) return;
    setCamera({ x: Math.max(0, point.x - 250), y: Math.max(0, point.y - 170), width: 520, height: 360 });
  }, [focusPath, world?.buildings, world?.districts]);

  const questsByDistrict = useMemo(() => {
    const map = new Map();
    (world?.quests || []).forEach((quest) => {
      const path = regionPaths[quest.region_id] || "";
      const districtId = path.split("/")[0];
      if (!districtId) return;
      const entry = map.get(districtId) || { total: 0, verified: 0 };
      entry.total += 1;
      if (quest.status === "verified") entry.verified += 1;
      map.set(districtId, entry);
    });
    return map;
  }, [world?.quests, regionPaths]);

  const crossDistrictEdges = useMemo(() => {
    const grouped = new Map();
    (world?.edges || []).forEach((edge) => {
      const from = (world?.buildings || []).find((building) => building.path === edge.from_path);
      const to = (world?.buildings || []).find((building) => building.path === edge.to_path);
      if (!from || !to || from.region_id === to.region_id) return;
      const key = [from.region_id, to.region_id].sort().join("|");
      grouped.set(key, (grouped.get(key) || 0) + 1);
    });
    return [...grouped.entries()].map(([key, count]) => ({ regions: key.split("|"), count }));
  }, [world?.edges, world?.buildings]);

  const labelKeys = useMemo(() => {
    if (!camera) return new Set();
    const showAll = camera.width <= bounds.width * 0.68;
    const candidates = [...landmarks, ...props].flatMap((building) => {
      const point = pointFor(building);
      if (!point) return [];
      const landmark = building.landmark;
      const interactive = building.path === selectedPath || building.path === hoveredPath;
      if (!landmark && !interactive && !showAll) return [];
      return [{
        id: building.path,
        text: basename(building.path),
        x: point.x,
        y: point.y - (landmark ? (HEIGHT[building.loc] || 24) + (roofs === "spire" ? 31 : 19) : 36),
        priority: (interactive ? 1000 : 0) + (landmark ? 100 : 0) + (building.priority || 0),
      }];
    });
    return resolveLabelVisibility(candidates);
  }, [landmarks, props, camera, selectedPath, hoveredPath, bounds.width, roofs, districts]);

  const handleWheel = (event) => {
    event.preventDefault();
    setCamera((current) => {
      if (!current) return current;
      const scale = event.deltaY > 0 ? 1.12 : 0.89;
      const width = Math.max(340, Math.min(bounds.width * 1.5, current.width * scale));
      const height = Math.max(240, Math.min(bounds.height * 1.5, current.height * scale));
      return { x: current.x + (current.width - width) / 2, y: current.y + (current.height - height) / 2, width, height };
    });
  };

  const handlePointerDown = (event) => {
    if (event.target.closest("[data-building]")) return;
    drag.current = { x: event.clientX, y: event.clientY, camera };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const handlePointerMove = (event) => {
    const target = event.target.closest("[data-building]");
    setHoveredPath(target?.getAttribute("data-building") || null);
    if (!drag.current || !camera) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const scaleX = camera.width / Math.max(1, rect.width);
    const scaleY = camera.height / Math.max(1, rect.height);
    setCamera({
      ...drag.current.camera,
      x: drag.current.camera.x - (event.clientX - drag.current.x) * scaleX,
      y: drag.current.camera.y - (event.clientY - drag.current.y) * scaleY,
    });
  };
  const handlePointerUp = () => { drag.current = null; };

  const paletteMembers = (leaderboard || []).map((member, index) => ({
    ...member,
    color: ["#5fbf3f", "#38bdf8", "#c084fc", "#f59e0b", "#fb7185"][index % 5],
  }));
  const labelLayout = camera ? `${camera.x} ${camera.y} ${camera.width} ${camera.height}` : `0 0 ${bounds.width} ${bounds.height}`;

  return (
    <svg
      className="world-svg"
      viewBox={labelLayout}
      preserveAspectRatio="xMidYMid meet"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={() => { setHoveredPath(null); handlePointerUp(); }}
      aria-label="Live project world map. Use the wheel to zoom and drag to pan."
    >
      <defs>
        <pattern id="terrain-grass" width="32" height="26" patternUnits="userSpaceOnUse">
          <rect width="32" height="26" fill={terrain.base} />
          <path d="M4 10l3-4m-1 8 4-5m13 8 4-5m-2-7 3-3" stroke={accent} strokeOpacity=".2" strokeWidth="1.3" />
          <circle cx="18" cy="5" r="1" fill="#d9e7bd" fillOpacity=".2" />
        </pattern>
        <pattern id="terrain-stone" width="38" height="28" patternUnits="userSpaceOnUse">
          <rect width="38" height="28" fill={terrain.base} />
          <path d="M0 9h15l4 5H5m14-5h19M7 14v8h14l4-8m3 0v8h10" fill="none" stroke={secondary} strokeOpacity=".22" strokeWidth="1" />
        </pattern>
        <pattern id="terrain-sand" width="34" height="24" patternUnits="userSpaceOnUse">
          <rect width="34" height="24" fill={terrain.base} />
          <path d="M2 7q8-5 15 0t15 0M-4 17q8-5 15 0t15 0" fill="none" stroke="#f5deb3" strokeOpacity=".2" />
        </pattern>
        <linearGradient id="world-vignette" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#050811" stopOpacity=".4" />
          <stop offset=".5" stopColor="#050811" stopOpacity="0" />
          <stop offset="1" stopColor="#050811" stopOpacity=".55" />
        </linearGradient>
        <linearGradient id="road-fill" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#9b805a" stopOpacity=".8" />
          <stop offset="1" stopColor="#584b3a" stopOpacity=".9" />
        </linearGradient>
        <filter id="world-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <rect x="-200" y="-200" width={bounds.width + 400} height={bounds.height + 400} fill="#0b1018" />
      {(world?.districts || []).map((district) => {
        const progress = questsByDistrict.get(district.region_id) || { total: 0, verified: 0 };
        const territory = districtColor(district.region_id, world?.quests || [], regionPaths, paletteMembers);
        const title = districtTitle(district, regions, regionPaths);
        const terrainFill = `url(#terrain-${terrain.pattern})`;
        return (
          <g key={district.region_id} className="district-land" aria-label={`${district.region_id} district`}>
            <path
              className="district-outline"
              d={`M${district.x - 5} ${district.y + 36} Q${district.x + district.w / 3} ${district.y - 14} ${district.x + district.w + 8} ${district.y + 8} L${district.x + district.w + 34} ${district.y + district.h - 18} Q${district.x + district.w / 2} ${district.y + district.h + 22} ${district.x + 10} ${district.y + district.h + 4}Z`}
              fill="#020617"
              opacity=".52"
              transform="translate(0 9)"
            />
            <path
              d={`M${district.x} ${district.y + 30} Q${district.x + district.w / 3} ${district.y - 12} ${district.x + district.w} ${district.y} L${district.x + district.w + 24} ${district.y + district.h - 25} Q${district.x + district.w / 2} ${district.y + district.h + 8} ${district.x + 24} ${district.y + district.h}Z`}
              fill={terrainFill}
              stroke={accent}
              strokeOpacity=".55"
              strokeWidth="2"
            />
            <path
              d={`M${district.x + 2} ${district.y + 32} Q${district.x + district.w / 3} ${district.y - 8} ${district.x + district.w - 2} ${district.y + 3} L${district.x + district.w + 18} ${district.y + district.h - 27} Q${district.x + district.w / 2} ${district.y + district.h} ${district.x + 28} ${district.y + district.h - 3}Z`}
              fill="#dbeafe"
              opacity={districtFogOpacity(progress.verified, progress.total)}
              pointerEvents="none"
            />
            <g className="district-banner">
              <path d={`M${district.x + 8} ${district.y + 9} h144 l-7 28 h-137Z`} fill="#101827" fillOpacity=".92" stroke={accent} strokeOpacity=".65" />
              <text className="district-name" x={district.x + 17} y={district.y + 23}>{title.primary}</text>
              {title.secondary && <text className="district-themed" x={district.x + 17} y={district.y + 33}>{title.secondary}</text>}
            </g>
            <g className="territory-flag" aria-label={territory.title}>
              <path d={`M${district.x + district.w - 16} ${district.y + 11}v34`} stroke="#cbd5e1" strokeWidth="2" />
              <path d={`M${district.x + district.w - 15} ${district.y + 12}h22l-5 7 5 7h-22Z`} fill={territory.color} stroke="#fff" strokeOpacity=".7" />
              <title>{territory.title}</title>
            </g>
            <g aria-label={`${progress.verified} of ${progress.total} quests verified`}>
              <rect x={district.x + district.w - 63} y={district.y + district.h - 6} width="52" height="4" rx="2" fill="#0f172a" />
              <rect x={district.x + district.w - 63} y={district.y + district.h - 6} width={progress.total ? 52 * progress.verified / progress.total : 0} height="4" rx="2" fill={accent} />
            </g>
          </g>
        );
      })}
      <g className="district-roads" aria-label="Repository import routes">
        {crossDistrictEdges.map(({ regions: [fromId, toId], count }) => {
          const from = districts[fromId];
          const to = districts[toId];
          if (!from || !to) return null;
          const startX = from.x + from.w / 2;
          const startY = from.y + from.h / 2;
          const endX = to.x + to.w / 2;
          const endY = to.y + to.h / 2;
          const bend = Math.max(28, Math.min(100, Math.abs(endX - startX) * 0.18 + Math.abs(endY - startY) * 0.1));
          const middleX = (startX + endX) / 2;
          const middleY = (startY + endY) / 2 - bend;
          const path = `M${startX} ${startY} Q${middleX} ${middleY} ${endX} ${endY}`;
          return (
            <g key={`${fromId}|${toId}`} aria-label={`${count} imports between ${fromId} and ${toId}`}>
              <path d={path} fill="none" stroke="#0b1220" strokeWidth={8 + Math.min(8, count)} strokeLinecap="round" opacity=".78" />
              <path d={path} fill="none" stroke="url(#road-fill)" strokeWidth={4 + Math.min(5, count * 0.4)} strokeLinecap="round" opacity=".9" />
              <path d={path} fill="none" stroke="#f2d9a6" strokeWidth="1" strokeDasharray="2 7" strokeLinecap="round" opacity=".65" />
              <title>{count} repository imports between {fromId} and {toId}</title>
            </g>
          );
        })}
      </g>
      <rect x="-200" y="-200" width={bounds.width + 400} height={bounds.height + 400} fill="url(#world-vignette)" pointerEvents="none" />
      {props.map((building) => {
        const point = pointFor(building);
        if (!point) return null;
        return (
          <Prop
            key={building.path}
            building={building}
            x={point.x}
            y={point.y}
            hovered={hoveredPath === building.path}
            labelVisible={labelKeys.has(building.path)}
            onSelect={onSelect}
          />
        );
      })}
      {landmarks.map((building) => {
        const point = pointFor(building);
        if (!point) return null;
        const isHovered = hoveredPath === building.path;
        return (
          <IsometricBuilding
            key={building.path}
            building={building}
            x={point.x}
            y={point.y}
            selected={selectedPath === building.path}
            hovered={isHovered}
            roof={roofs}
            accent={accent}
            labelVisible={labelKeys.has(building.path)}
            onSelect={onSelect}
          />
        );
      })}
      {(world?.alerts || []).map((alert) => {
        const buildings = (world.buildings || []).filter((item) => alert.paths?.includes(item.path));
        const first = buildings[0];
        const point = first && pointFor(first);
        if (!point) return null;
        if (alert.kind === "dependency_risk" && buildings[1]) {
          const other = pointFor(buildings[1]);
          if (other) {
            const curve = `M${point.x} ${point.y - 12} Q${(point.x + other.x) / 2} ${(point.y + other.y) / 2 - 30} ${other.x} ${other.y - 12}`;
            return <path key={alert.dedupe_key} data-testid="dependency-effect" d={curve} fill="none" stroke="#f5b84b" strokeWidth="3" strokeDasharray="7 5" className="dependency-link" />;
          }
        }
        return (
          <g key={alert.dedupe_key} aria-label={`${alert.kind} alert`} data-testid={`${alert.kind}-effect`}>
            {alert.kind === "ci_storm" && <><text x={point.x - 12} y={point.y - 30} fontSize="24">☁</text><path d={`M${point.x - 10} ${point.y - 20}l-4 14m11-14-4 14m11-14-4 14`} stroke="#93c5fd" strokeWidth="2" className="rain-streak" /></>}
            {alert.kind === "security_boss" && <><text x={point.x - 10} y={point.y + 6} fontSize="22">☠</text><rect x={point.x - 14} y={point.y + 10} width="28" height="5" rx="2" fill="#450a0a" /><rect x={point.x - 14} y={point.y + 10} width="20" height="5" rx="2" fill="#ef4444" /></>}
            {alert.kind === "collision" && <circle cx={point.x} cy={point.y} r="18" fill="none" stroke="#fb7185" strokeWidth="3" className="alert-pulse" />}
            {alert.kind === "stale_lore" && <text x={point.x - 7} y={point.y + 5} opacity=".55" fontSize="18">◌</text>}
            {alert.kind === "migration_conflict" && <path d={`M${point.x - 15} ${point.y - 15}l30 30m0-30-30 30`} stroke="#fb7185" strokeWidth="3" />}
          </g>
        );
      })}
      {(world?.quest_markers || []).map((quest, index) => (
        <text key={quest.id || index} x={25 + index * 24} y={bounds.height - 18} fontSize="18" aria-label="Quest flag">⚑</text>
      ))}
      {(world?.avatars || []).map((avatar) => {
        const building = (world.buildings || []).find((item) => item.path === avatar.path);
        const point = building && pointFor(building);
        const x = point?.x ?? 34;
        const y = point ? point.y - (HEIGHT[building.loc] || 24) - 26 : 40;
        const color = avatar.type === "agent" ? "#d28cff" : "#65d6e8";
        const name = avatar.user_name || avatar.actor;
        return (
          <g key={avatar.actor} className="world-avatar" transform={`translate(${x} ${y})`} aria-label={`${name}${avatar.type === "agent" ? ", agent" : ", user"} at ${avatar.path || "the world"}`}>
            {avatar.type === "agent" && <path d="M0 7v15" stroke={color} strokeWidth="2" opacity=".7" />}
            <circle cy="-3" r="10" fill={color} stroke="#e0f2fe" strokeWidth="2" />
            <text y="1" textAnchor="middle" className="avatar-initial">{name.slice(0, 1).toUpperCase()}</text>
            <rect x={-Math.max(28, name.length * 3.2)} y="-27" width={Math.max(56, name.length * 6.4)} height="13" rx="6" fill="#101827" stroke={color} strokeWidth=".8" />
            <text y="-18" textAnchor="middle" className="avatar-name">{name}</text>
            <title>{name} · {avatar.path || "world"}</title>
          </g>
        );
      })}
    </svg>
  );
});
