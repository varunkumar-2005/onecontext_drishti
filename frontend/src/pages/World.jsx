import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BASE_URL,
  checkInArenaWorld,
  getArenaFilePanel,
  getArenaSession,
  getArenaWorld,
  refreshArenaWorld,
} from "../api/client";
import WorldStage from "../components/world/WorldStage";
import { applyWorldDelta, KIND_COLORS } from "../components/world/worldState";
import "./World.css";

export function FileDrawer({ panel, onClose }) {
  if (!panel) return null;
  return (
    <section className="file-drawer" role="dialog" aria-label={`File details for ${panel.path}`}>
      <button className="drawer-close" onClick={onClose} aria-label="Close file details">×</button>
      <p className="eyebrow">File landmark</p>
      <h2>{panel.path}</h2>
      <p>Current party: {panel.current_actors?.join(", ") || "No one here"}</p>
      <h3>Linked quests</h3>
      <ul>{(panel.linked_quests || []).map((quest, index) => <li key={quest.id || index}>{quest.themed_title || quest.title || "Quest"}</li>)}</ul>
      <h3>Recent commits</h3>
      <ul>{(panel.recent_commits || []).map((commit, index) => <li key={index}>{commit.ref || "commit"} · {commit.created_at}</li>)}</ul>
      <h3>Alerts &amp; evidence</h3>
      <pre>{JSON.stringify(panel.open_alerts || [], null, 2)}</pre>
      <h3>Related memories</h3>
      <ul>{(panel.related_memories || []).map((memory, index) => <li key={memory.id || index}>{memory.text || memory.title || "Memory"}</li>)}</ul>
      <p className="privacy-note">Metadata only — source contents are never displayed here.</p>
    </section>
  );
}

function actorName(avatar) {
  return avatar.user_name || avatar.actor;
}

export default function World() {
  const sessionId = localStorage.getItem("onecontext_arena_session_id");
  const [world, setWorld] = useState(null);
  const [theme, setTheme] = useState(null);
  const [sessionDetails, setSessionDetails] = useState(null);
  const [gameName, setGameName] = useState("");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [focusPath, setFocusPath] = useState(null);
  const [panel, setPanel] = useState(null);
  const [query, setQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const retry = useRef(0);

  const load = async () => {
    if (!sessionId) {
      setError("Join an Arena session before opening World.");
      setStatus("error");
      return;
    }
    try {
      setError("");
      setStatus("loading");
      const [next, session] = await Promise.all([getArenaWorld(sessionId), getArenaSession(sessionId)]);
      setTheme(session.game_bible);
      setSessionDetails(session);
      setGameName(session.session?.game_name || "");
      setWorld({
        ...next,
        quests: session.entities?.quests || [],
        theme_source: session.game_bible?.theme_source,
      });
      setStatus("live");
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Could not load the live world.");
      setStatus("error");
    }
  };

  useEffect(() => { load(); }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return undefined;
    let eventSource;
    let disposed = false;
    let reconnectTimer;
    const connect = () => {
      const token = localStorage.getItem("onecontext_arena_token");
      if (!token || disposed) return;
      eventSource = new EventSource(`${BASE_URL}/arena/sessions/${sessionId}/stream?access_token=${encodeURIComponent(token)}`);
      eventSource.onopen = () => {
        retry.current = 0;
        setStatus("live");
      };
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "world_delta") setWorld((current) => applyWorldDelta(current, data));
          if (data.type === "alert_opened" || data.type === "alert_resolved") load();
        } catch {
          // Ignore keep-alive frames and malformed events; the next refresh reconciles state.
        }
      };
      eventSource.onerror = () => {
        eventSource.close();
        if (!disposed) {
          setStatus("reconnecting");
          const wait = Math.min(10000, 500 * 2 ** retry.current++);
          reconnectTimer = setTimeout(connect, wait);
        }
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      eventSource?.close();
    };
  }, [sessionId]);

  const select = async (building) => {
    setSelected(building.path);
    setFocusPath(building.path);
    try {
      setPanel(await getArenaFilePanel(sessionId, building.path));
    } catch {
      setPanel({ path: building.path, error: "File details unavailable." });
    }
  };

  const filtered = useMemo(
    () => (world?.buildings || []).filter((building) => building.path.toLowerCase().includes(query.toLowerCase())),
    [world?.buildings, query],
  );

  const party = useMemo(() => {
    const names = new Set();
    return (world?.avatars || []).filter((avatar) => {
      const name = actorName(avatar);
      if (names.has(name)) return false;
      names.add(name);
      return true;
    });
  }, [world?.avatars]);

  const onReskin = async () => {
    const token = localStorage.getItem("onecontext_arena_token");
    try {
      const response = await fetch(`${BASE_URL}/arena/sessions/${sessionId}/switch-theme`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ new_game_name: gameName }),
      });
      if (!response.ok) throw new Error("Theme update was rejected.");
      await load();
    } catch (requestError) {
      setError(requestError.message || "Could not re-skin the world.");
      setStatus("error");
    }
  };

  const onRefresh = async () => {
    setIsRefreshing(true);
    try {
      const next = await refreshArenaWorld(sessionId);
      setWorld((current) => ({ ...current, ...next, quests: current?.quests || [] }));
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Could not refresh the world.");
      setStatus("error");
    } finally {
      setIsRefreshing(false);
    }
  };

  const onCheckIn = async (path) => {
    if (!path) return;
    try {
      await checkInArenaWorld(sessionId, path);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Could not check in to this file.");
      setStatus("error");
    }
  };

  if (status === "error" && !world) {
    return (
      <main className="world-error">
        <h1>World unavailable</h1>
        <p>{error}</p>
        <button onClick={load}>Retry</button>
        <a href="/arena">Open Arena to join a session</a>
      </main>
    );
  }

  const regions = sessionDetails?.entities?.regions || [];
  const regionPaths = sessionDetails?.region_paths || {};
  const leaderboard = sessionDetails?.leaderboard || [];
  const liveWorld = { ...world, buildings: query ? filtered : world?.buildings };
  const activeThemeColor = theme?.palette?.[0]?.hex || "#5fbf3f";

  return (
    <main className="world-page" style={{ "--accent": activeThemeColor, "--accent2": theme?.palette?.[1]?.hex || "#60a5fa" }}>
      <section className="stage-wrap" aria-label="World map stage">
        {status === "loading" && !world
          ? <div className="world-skeleton" role="status">Building your world from tracked project files…</div>
          : <WorldStage
            theme={theme}
            world={liveWorld}
            regions={regions}
            regionPaths={regionPaths}
            leaderboard={leaderboard}
            selectedPath={selected}
            focusPath={focusPath}
            onSelect={select}
          />}
        {!world?.buildings?.length && status === "live" && (
          <div className="world-empty">
            <strong>No activity yet</strong>
            <span>Run <code>scripts/onecontext_watch.py</code> to populate live activity.</span>
          </div>
        )}
      </section>

      <header className="world-hud world-topbar">
        <div className="world-brand">
          <strong>◈ OneContext World</strong>
          <span className={`connection-state ${status}`}>● {status === "reconnecting" ? "Reconnecting" : status === "live" ? "Live" : "Loading"}</span>
        </div>
        <div className="world-theme-controls">
          {world?.simulated && <b className="simulated-badge">SIMULATED</b>}
          {world?.theme_source === "fallback" && <b className="fallback-badge">Fallback theme</b>}
          {status === "error" && <button className="retry-button" onClick={load}>Retry</button>}
          <label className="visually-hidden" htmlFor="world-theme">Game theme</label>
          <input id="world-theme" value={gameName} onChange={(event) => setGameName(event.target.value)} placeholder="Game theme" />
          <button onClick={onReskin}>Re-skin</button>
          <label className="visually-hidden" htmlFor="world-search">Search files</label>
          <input
            id="world-search"
            value={query}
            onChange={(event) => {
              const nextQuery = event.target.value;
              setQuery(nextQuery);
              const match = world?.buildings?.find((building) => building.path.toLowerCase().includes(nextQuery.toLowerCase()));
              if (match) setFocusPath(match.path);
            }}
            placeholder="Find a real file…"
          />
        </div>
      </header>

      <aside className="world-panel alert-feed" aria-label="Alerts and quests">
        <div className="panel-heading"><span className="eyebrow">Signals</span><h2>Live alerts</h2></div>
        {!world?.alerts?.length
          ? <p className="panel-empty">All clear. Alerts are evidence-backed.</p>
          : world.alerts.map((alert) => (
            <button
              className={`alert-card ${alert.kind}`}
              key={alert.dedupe_key}
              onClick={() => {
                const building = world.buildings?.find((item) => alert.paths?.includes(item.path));
                if (building) select(building);
              }}
            >
              <strong>{alert.kind.replaceAll("_", " ")}</strong>
              <small>{alert.paths?.join(", ")}</small>
              <span>{alert.actors?.length || 0} members · evidence attached</span>
            </button>
          ))}
        <div className="panel-divider" />
        <div className="panel-heading"><span className="eyebrow">Objectives</span><h2>Quest markers</h2></div>
        <p className="panel-empty">{world?.quests?.length ? `${world.quests.length} Arena quests mapped to project districts.` : "No quests are linked to this world yet."}</p>
        {(world?.quests || []).filter((quest) => quest.status !== "verified").slice(0, 4).map((quest) => (
          <div className="quest-peek" key={quest.quest_id || quest.id}>
            <span className="quest-flag">⚑</span>
            <span>{quest.themed_title || quest.original_title}</span>
          </div>
        ))}
      </aside>

      <aside className="world-panel party" aria-label="Party and map legend">
        <div className="panel-heading"><span className="eyebrow">Expedition</span><h2>Party</h2></div>
        {!party.length && <p className="panel-empty">No active explorers yet.</p>}
        {party.map((avatar) => (
          <div className="party-member" key={avatar.actor}>
            <span className={`party-avatar ${avatar.type === "agent" ? "agent" : "human"}`}>{actorName(avatar).slice(0, 1).toUpperCase()}</span>
            <span className="party-name">{actorName(avatar)}<small>{avatar.type === "agent" ? "Agent" : "Explorer"}</small></span>
          </div>
        ))}
        <div className="panel-divider" />
        <div className="panel-heading"><span className="eyebrow">Map key</span><h2>Legend</h2></div>
        <ul className="world-legend">
          {Object.entries(KIND_COLORS).map(([kind, color]) => <li key={kind}><i style={{ background: color }} />{kind}</li>)}
          <li><i className="legend-road" />Import route</li>
          <li><i className="legend-fog" />Unverified district</li>
          <li><i className="legend-flag">⚑</i>Verified XP territory</li>
        </ul>
        <p className="map-hint">Drag to travel · wheel to zoom · Enter opens a landmark</p>
      </aside>

      <footer className="world-controls">
        <button onClick={onRefresh} disabled={isRefreshing}>{isRefreshing ? "Refreshing…" : "Refresh world"}</button>
        <select aria-label="Check in to file" value="" onChange={(event) => onCheckIn(event.target.value)}>
          <option value="">Check in to a file…</option>
          {(world?.buildings || []).map((building) => <option key={building.path} value={building.path}>{building.path}</option>)}
        </select>
        <span>{status === "reconnecting" ? "Reconnecting to live updates…" : `${world?.districts?.length || 0} districts · ${world?.buildings?.length || 0} real files`}</span>
      </footer>

      {error && world && <div className="world-toast" role="status">{error}</div>}
      <FileDrawer panel={panel} onClose={() => setPanel(null)} />
    </main>
  );
}
