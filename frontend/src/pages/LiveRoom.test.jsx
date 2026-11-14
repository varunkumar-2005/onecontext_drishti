import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import LiveRoom from "./LiveRoom";
import {
  createArenaSession,
  createProject,
  createTeam,
  importArenaRepository,
  importArenaTasks,
  joinTeam,
} from "../api/client";

vi.mock("../api/client", () => ({
  BASE_URL: "http://127.0.0.1:8000",
  catchUpRoom: vi.fn(),
  captureDecision: vi.fn(),
  configureGitHub: vi.fn(),
  correctMemory: vi.fn(),
  createArenaSession: vi.fn(),
  createProject: vi.fn(),
  createTeam: vi.fn(),
  getContextPack: vi.fn(),
  getGitHubConfig: vi.fn(),
  getRoomEvents: vi.fn(),
  getRoomMembers: vi.fn(),
  ingestFile: vi.fn(),
  ingestText: vi.fn(),
  importArenaRepository: vi.fn(),
  importArenaTasks: vi.fn(),
  joinTeam: vi.fn(),
  sendHeartbeat: vi.fn(),
  syncGitHub: vi.fn(),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

function renderLanding() {
  return render(
    <MemoryRouter>
      <LiveRoom
        currentTeam={null}
        setCurrentTeam={vi.fn()}
        setActiveProject={vi.fn()}
        currentUser="Host"
        setCurrentUser={vi.fn()}
        connectionStatus="disconnected"
        setConnectionStatus={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe("Team Room project onboarding", () => {
  it("replaces the old project selector with project, task upload, and GitHub fields", () => {
    renderLanding();

    expect(screen.getByLabelText("Project Name:")).toBeInTheDocument();
    expect(screen.getByLabelText(/Upload task list/)).toBeInTheDocument();
    expect(screen.getByLabelText(/GitHub Repository URL/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("creates an Arena session and sends task text and GitHub URL to the imports", async () => {
    const markdown = "# Milestone\n- [ ] Ship safely";
    const file = new File([markdown], "tasks.md", { type: "text/markdown" });
    Object.defineProperty(file, "text", { value: () => Promise.resolve(markdown) });

    createProject.mockResolvedValue({ id: "project-1", name: "OneContext", bank_id: "onecontext-project-1" });
    createArenaSession.mockResolvedValue({ session: { id: "arena-1" }, arena_token: "host-token" });
    importArenaRepository.mockResolvedValue({ file_count: 2, district_count: 1 });
    importArenaTasks.mockResolvedValue({ imported_count: 1 });
    createTeam.mockResolvedValue({ id: "team-1", join_code: "ABC123" });
    joinTeam.mockResolvedValue({ member: { display_name: "Host" } });

    renderLanding();
    fireEvent.change(screen.getByLabelText("Project Name:"), { target: { value: "OneContext" } });
    fireEvent.change(screen.getByLabelText(/GitHub Repository URL/), {
      target: { value: "https://github.com/acme/onecontext" },
    });
    fireEvent.change(screen.getByLabelText(/Default XP per task/), {
      target: { value: "225" },
    });
    fireEvent.change(screen.getByLabelText(/Upload task list/), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Create Project, Quests & World" }));

    await waitFor(() => expect(importArenaTasks).toHaveBeenCalledWith("arena-1", markdown, 225));
    expect(importArenaRepository).toHaveBeenCalledWith("arena-1", "https://github.com/acme/onecontext");
    expect(createArenaSession).toHaveBeenCalledWith(expect.objectContaining({
      project_id: "project-1",
      game_name: "Minecraft",
    }));
    expect(createTeam).toHaveBeenCalledWith({ name: "OneContext Team", project_id: "project-1" });
    expect(localStorage.getItem("onecontext_arena_session_id")).toBe("arena-1");
  });
});
