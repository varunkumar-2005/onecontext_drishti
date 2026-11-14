/**
 * frontend/src/api/client.js
 * Axios API client communicating with the OneContext FastAPI backend.
 */

import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== "undefined" && window.location.hostname
    ? `http://${window.location.hostname}:8000`
    : "http://127.0.0.1:8000");

export const BASE_URL = API_BASE_URL;

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const arenaToken = localStorage.getItem("onecontext_arena_token");
  if (arenaToken && config.url?.startsWith("/arena/")) {
    config.headers.Authorization = `Bearer ${arenaToken}`;
  }
  return config;
});

export const getHealth = async () => {
  const res = await api.get("/health");
  return res.data;
};

// --- Projects ---
export const listProjects = async () => {
  const res = await api.get("/projects");
  return res.data;
};

export const createProject = async ({ name, description }) => {
  const res = await api.post("/projects", { name, description });
  return res.data;
};

// --- Agents ---
export const listAgents = async (projectId) => {
  const res = await api.get(`/projects/${projectId}/agents`);
  return res.data;
};

export const registerAgent = async (projectId, { id, name, role }) => {
  const res = await api.post(`/projects/${projectId}/agents`, { id, name, role });
  return res.data;
};

export const runAgent = async (projectId, agentId, { task, context }) => {
  const res = await api.post(`/projects/${projectId}/agents/${agentId}/run`, {
    task,
    context,
  });
  return res.data;
};

// --- Memory & RAG ---
export const retainMemory = async (projectId, { text, source, agent_id }) => {
  const res = await api.post(`/projects/${projectId}/retain`, {
    text,
    source: source || "note",
    agent_id: agent_id || "user",
  });
  return res.data;
};

export const recallMemory = async (projectId, { query, max_results = 5 }) => {
  const res = await api.post(`/projects/${projectId}/recall`, {
    query,
    max_results,
  });
  return res.data;
};

export const askMemory = async (projectId, { question, agent_id = "user" }) => {
  const res = await api.post(`/projects/${projectId}/ask`, {
    question,
    agent_id,
  });
  return res.data;
};

export const askWithoutMemory = async (projectId, { question, agent_id = "user" }) => {
  const res = await api.post(`/projects/${projectId}/ask-without-memory`, {
    question,
    agent_id,
  });
  return res.data;
};

// --- Corrections & Conflict Detection (Phase 5) ---
export const correctMemory = async (projectId, { old_memory_id, new_text, agent_id = "user", reason = "", old_memory_text = "" }) => {
  const res = await api.post(`/projects/${projectId}/correct`, {
    old_memory_id,
    new_text,
    agent_id,
    reason,
    old_memory_text,
  });
  return res.data;
};

export const checkConflict = async (projectId, { text }) => {
  const res = await api.post(`/projects/${projectId}/check-conflict`, { text });
  return res.data;
};

export const getConflicts = async (projectId) => {
  const res = await api.get(`/projects/${projectId}/conflicts`);
  return res.data;
};

// --- Validator ---
export const validateDraft = async (projectId, { draft, check_topic }) => {
  const res = await api.post(`/projects/${projectId}/validate`, {
    draft,
    check_topic,
  });
  return res.data;
};

// --- Audit Trail ---
export const getAudit = async (projectId, limit = 50) => {
  const res = await api.get(`/projects/${projectId}/audit?limit=${limit}`);
  return res.data;
};

// --- Team Rooms ---
export const createTeam = async ({ name, project_id }) => {
  const res = await api.post("/teams", { name, project_id });
  return res.data;
};

export const joinTeam = async ({ join_code, display_name }) => {
  const res = await api.post("/teams/join", { join_code, display_name });
  return res.data;
};

export const listTeamMembers = async (teamId) => {
  const res = await api.get(`/teams/${teamId}/members`);
  return res.data;
};

export const sendTeamMessage = async (teamId, { sender, role, message, message_type = "chat", retain_as_memory = false }) => {
  const res = await api.post(`/teams/${teamId}/messages`, {
    sender,
    role,
    message,
    message_type,
    retain_as_memory,
  });
  return res.data;
};

export const listTeamMessages = async (teamId, limit = 100) => {
  const res = await api.get(`/teams/${teamId}/messages?limit=${limit}`);
  return res.data;
};

export const seedTeamDemo = async (teamId) => {
  const res = await api.post(`/teams/${teamId}/seed-demo`);
  return res.data;
};

export const generateTeamCode = async (teamId, { instruction, current_code, filename, author }) => {
  const res = await api.post(`/teams/${teamId}/generate-code`, {
    instruction,
    current_code,
    filename,
    author,
  });
  return res.data;
};

// --- Context Packs & Ingestion ---
export const getContextPack = async (projectId, { task, target = "generic", max_chars = 3000 }) => {
  const res = await api.post(`/projects/${projectId}/context-pack`, {
    task,
    target,
    max_chars,
  });
  return res.data;
};

export const ingestText = async (projectId, { text, source_type = "doc", source_name }) => {
  const res = await api.post(`/projects/${projectId}/ingest`, {
    text,
    source_type,
    source_name,
  });
  return res.data;
};

export const ingestFile = async (projectId, formData) => {
  const res = await api.post(`/projects/${projectId}/ingest-file`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
};

export const captureDecision = async (projectId, { text, source_name = "manual_capture" }) => {
  const res = await api.post(`/projects/${projectId}/capture`, {
    text,
    source_name,
  });
  return res.data;
};

// --- Live Team Room & Events Stream ---
export const getRoomEvents = async (teamId, since = null) => {
  const url = since ? `/rooms/${teamId}/events?since=${encodeURIComponent(since)}` : `/rooms/${teamId}/events`;
  const res = await api.get(url);
  return res.data;
};

export const getRoomMembers = async (teamId) => {
  const res = await api.get(`/rooms/${teamId}/members`);
  return res.data;
};

export const sendHeartbeat = async (teamId, displayName) => {
  const res = await api.post(`/rooms/${teamId}/heartbeat`, { display_name: displayName });
  return res.data;
};

export const catchUpRoom = async (teamId, displayName) => {
  const res = await api.post(`/rooms/${teamId}/catch-up`, { display_name: displayName });
  return res.data;
};

// --- GitHub Sync ---
export const configureGitHub = async (projectId, repo) => {
  const res = await api.post(`/projects/${projectId}/github`, { repo });
  return res.data;
};

export const getGitHubConfig = async (projectId) => {
  const res = await api.get(`/projects/${projectId}/github`);
  return res.data;
};

export const syncGitHub = async (projectId) => {
  const res = await api.post(`/projects/${projectId}/github/sync`);
  return res.data;
};

// --- OneContext Arena APIs ---
export const listArenaSessions = async (projectId = null) => {
  const url = projectId ? `/arena/sessions?project_id=${projectId}` : `/arena/sessions`;
  const res = await api.get(url);
  return res.data;
};

export const createArenaSession = async (payload) => {
  const res = await api.post("/arena/sessions", payload);
  if (res.data.arena_token) localStorage.setItem("onecontext_arena_token", res.data.arena_token);
  return res.data;
};

export const importArenaRepository = async (sessionId, repoUrl) => (
  await api.post(`/arena/sessions/${sessionId}/repository-import`, { repo_url: repoUrl })
).data;

export const importArenaTasks = async (sessionId, markdown, defaultXP = 100) => (
  await api.post(`/arena/sessions/${sessionId}/tasks-import`, { markdown, default_xp: defaultXP })
).data;

export const getArenaSession = async (sessionId) => {
  const res = await api.get(`/arena/sessions/${sessionId}`);
  return res.data;
};

export const joinArenaSession = async (payload) => {
  const res = await api.post("/arena/sessions/join", payload);
  if (res.data.arena_token) localStorage.setItem("onecontext_arena_token", res.data.arena_token);
  return res.data;
};

export const sendArenaHeartbeat = async (sessionId, _userId, regionId = null, questId = null) => {
  let url = `/arena/sessions/${sessionId}/heartbeat?`;
  if (regionId) url += `&current_region_id=${encodeURIComponent(regionId)}`;
  if (questId) url += `&current_quest_id=${encodeURIComponent(questId)}`;
  const res = await api.post(url);
  return res.data;
};

export const claimArenaQuest = async (sessionId, questId, { userId, userName }) => {
  const res = await api.post(`/arena/sessions/${sessionId}/quests/${questId}/claim`, {
    user_id: userId,
    user_name: userName,
  });
  return res.data;
};

export const proposeArenaBossFix = async (sessionId, bossId, payload) => {
  const res = await api.post(`/arena/sessions/${sessionId}/bosses/${bossId}/propose-fix`, payload);
  return res.data;
};

export const approveArenaBossFix = async (sessionId, bossId, payload) => {
  const res = await api.post(`/arena/sessions/${sessionId}/bosses/${bossId}/approve`, payload);
  return res.data;
};

export const switchArenaTheme = async (sessionId, payload) => {
  const res = await api.post(`/arena/sessions/${sessionId}/switch-theme`, payload);
  return res.data;
};

export const getArenaRecap = async (sessionId) => {
  const res = await api.get(`/arena/sessions/${sessionId}/recap`);
  return res.data;
};

export const searchArenaLore = async (sessionId, query) => {
  const res = await api.get(`/arena/sessions/${sessionId}/lore?query=${encodeURIComponent(query)}`);
  return res.data;
};

export const getArenaWorld = async (sessionId) => (await api.get(`/arena/sessions/${sessionId}/world`)).data;
export const refreshArenaWorld = async (sessionId) => (await api.post(`/arena/sessions/${sessionId}/world/refresh`)).data;
export const getArenaFilePanel = async (sessionId, path) => (await api.get(`/arena/sessions/${sessionId}/files?path=${encodeURIComponent(path)}`)).data;
export const getArenaActivity = async (sessionId, minutes = 30) => (await api.get(`/arena/sessions/${sessionId}/activity?minutes=${minutes}`)).data;
export const checkInArenaWorld = async (sessionId, path) => (await api.post(`/arena/sessions/${sessionId}/checkin`, { path })).data;

export const getArenaRoadmap = async (sessionId) => (await api.get(`/arena/sessions/${sessionId}/roadmap`)).data;
export const overridePhaseLock = async (sessionId, phaseId, unlocked) =>
  (await api.post(`/arena/sessions/${sessionId}/phases/${phaseId}/unlock`, { unlocked })).data;
export const getRoadmapLeaderboard = async (sessionId) =>
  (await api.get(`/arena/sessions/${sessionId}/leaderboard`)).data;
export const submitArenaQuest = async (sessionId, questId, evidenceNote) =>
  (await api.post(`/arena/sessions/${sessionId}/quests/${questId}/submit`, { evidence_note: evidenceNote })).data;
export const approveArenaQuest = async (sessionId, questId, evidenceNote) =>
  (await api.post(`/arena/sessions/${sessionId}/quests/${questId}/approve`, { evidence_note: evidenceNote })).data;

// --- IDE APIs ---
export const getIDEFiles = async (projectId, path = '') => (await api.get(`/ide/projects/${projectId}/files?path=${encodeURIComponent(path)}`)).data;
export const getIDEFileContent = async (projectId, path) => (await api.get(`/ide/projects/${projectId}/file-content?path=${encodeURIComponent(path)}`)).data;
export const saveIDEFile = async (projectId, { path, content, author }) => (await api.post(`/ide/projects/${projectId}/file-content`, { path, content, author })).data;
export const getIDEFileChanges = async (projectId, path = '', minutes = 60) => (await api.get(`/ide/projects/${projectId}/file-changes?path=${encodeURIComponent(path)}&minutes=${minutes}`)).data;
export const runSecurityScan = async (projectId, { path, content }) => (await api.post(`/ide/projects/${projectId}/security-scan`, { path, content })).data;
export const getAIAssist = async (projectId, { prompt, file_path, file_content, context }) => (await api.post(`/ide/projects/${projectId}/ai-assist`, { prompt, file_path, file_content, context })).data;
export const detectConflicts = async (projectId, { path, author, content }) => (await api.post(`/ide/projects/${projectId}/detect-conflicts`, { path, author, content })).data;
export const simulateConflict = async (projectId, { path, current_content, author }) => (await api.post(`/ide/projects/${projectId}/simulate-conflict`, { path, current_content, author })).data;
export const postInsight = async (projectId, payload) => (await api.post(`/ide/projects/${projectId}/insights`, payload)).data;
export const searchInsights = async (projectId, query = '', timeRange = '24h') => (await api.get(`/ide/projects/${projectId}/insights?query=${encodeURIComponent(query)}&time_range=${timeRange}`)).data;
export const resolveConflict = async (projectId, payload) => (await api.post(`/ide/projects/${projectId}/resolve-conflict`, payload)).data;
export const createSecurityQuest = async (projectId, payload) => (await api.post(`/ide/projects/${projectId}/security-quest`, payload)).data;
export const verifySecurityQuest = async (projectId, payload) => (await api.post(`/ide/projects/${projectId}/verify-security-quest`, payload)).data;
export const listSecurityQuests = async (projectId) => (await api.get(`/ide/projects/${projectId}/security-quests`)).data;

export default api;
