import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Team from "./Team";
import { createTeam, joinTeam, listProjects, seedTeamDemo } from "../api/client";

vi.mock("../api/client", () => ({
  listProjects: vi.fn(),
  createTeam: vi.fn(),
  joinTeam: vi.fn(),
  listTeamMembers: vi.fn(),
  getRoomMembers: vi.fn().mockResolvedValue([]),
  sendHeartbeat: vi.fn().mockResolvedValue({}),
  sendTeamMessage: vi.fn(),
  listTeamMessages: vi.fn().mockResolvedValue([]),
  seedTeamDemo: vi.fn().mockResolvedValue({}),
  generateTeamCode: vi.fn(),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

function renderTeam(props = {}) {
  return render(
    <MemoryRouter>
      <Team {...props} />
    </MemoryRouter>,
  );
}

describe("Team workspace", () => {
  it("explains the sample editor is not connected to repository files", async () => {
    listProjects.mockResolvedValue([{ id: "project-1", name: "Project One" }]);
    renderTeam();

    expect(await screen.findByText(/does not open, change, or save your repository files/i)).toBeInTheDocument();
    expect(screen.getByText(/Demo collaborators are optional and are not added automatically/i)).toBeInTheDocument();
  });

  it("does not seed simulated teammates when creating or joining a real room", async () => {
    listProjects.mockResolvedValue([{ id: "project-1", name: "Project One" }]);
    createTeam.mockResolvedValue({ id: "team-1", name: "Team One", project_id: "project-1", join_code: "ABC123" });
    joinTeam.mockResolvedValue({
      team: { id: "team-1", name: "Team One", project_id: "project-1", join_code: "ABC123" },
      project_id: "project-1",
      member: { display_name: "Varun" },
    });
    renderTeam({ setCurrentTeam: vi.fn(), setActiveProject: vi.fn() });

    fireEvent.change(await screen.findByLabelText("Team Room Name *"), { target: { value: "Team One" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Team Room" }));

    await waitFor(() => expect(joinTeam).toHaveBeenCalledOnce());
    expect(seedTeamDemo).not.toHaveBeenCalled();
    expect(localStorage.getItem("onecontext_room")).toContain("team-1");
    expect(localStorage.getItem("onecontext_user")).toBe("Varun");
  });

  it("loads fictional collaborators only after an explicit simulated-demo action", async () => {
    renderTeam({ currentTeam: { id: "team-1", name: "Team One", project_id: "project-1" } });
    fireEvent.click(await screen.findByRole("button", { name: "Load SIMULATED demo teammates" }));

    await waitFor(() => expect(seedTeamDemo).toHaveBeenCalledWith("team-1"));
  });
});
