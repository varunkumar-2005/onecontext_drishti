import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ArenaWorkspace, {
  computeIslandLayout,
  avatarSkinFor,
  getMemberRegion,
  getDistrictFogOpacity,
  getProgressMarkerX,
  regionActivityCounts,
  regionScale,
} from "./ArenaWorkspace";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const session = { id: "session-1", game_name: "Minecraft", join_code: "AB2345", host_name: "Ada" };
const details = {
  session,
  members: [{ user_id: "ada", user_name: "Ada", role: "host" }],
  leaderboard: [{ user_id: "ada", user_name: "Ada", total_xp: 120, events_count: 1 }],
  entities: {
    regions: [{ region_id: "backend", original_name: "backend" }],
    quests: [
      { quest_id: "q-1", source_id: "#7", source_type: "github_issue", region_id: "backend", original_title: "Fix session sync", status: "verified", assigned_to: "ada", xp_reward: 120, evidence: { ci_status: "green", pr_number: 7 } },
      { quest_id: "q-2", source_id: "#8", source_type: "github_issue", region_id: "backend", original_title: "Add missing tests", status: "available", issue_url: "https://github.com/acme/repo/issues/8" },
    ],
    bosses: [],
    checkpoints: [],
  },
  layout: {
    canvas_width: 1200,
    canvas_height: 800,
    regions: [{ region_id: "backend", x: 600, y: 300 }],
    paths: [],
  },
};
const realRegions = [
  ["reg-api", "backend/api"],
  ["reg-core", "backend/core"],
  ["reg-agents", "backend/agents"],
  ["reg-storage", "backend/storage"],
  ["reg-services", "backend/services"],
  ["reg-features", "backend/features"],
  ["reg-pages", "frontend/src/pages"],
  ["reg-components", "frontend/src/components"],
  ["reg-tests", "tests"],
].map(([region_id, path]) => ({ region_id, original_name: path }));
const realRegionPaths = Object.fromEntries(realRegions.map((region) => [region.region_id, region.original_name]));

function renderWorkspace(props = {}) {
  return render(
    <ArenaWorkspace
      currentSession={session}
      sessionDetails={details}
      onClaimQuest={vi.fn()}
      onSelectRegion={vi.fn()}
      onLeave={vi.fn()}
      activity={{ events: [] }}
      activityState="ready"
      initialTab="world"
      {...props}
    />,
  );
}

function selectTab(name) {
  fireEvent.click(screen.getAllByRole("tab", { name: new RegExp(name, "i") })[0]);
}

describe("ArenaWorkspace", () => {
  it("lays out all nine actual project districts with readable separation", () => {
    const result = computeIslandLayout(realRegions, realRegionPaths);
    const points = realRegions.map((region) => result.positions.get(region.region_id));
    expect(result.positions.size).toBe(9);
    expect(points.every((point) => point.x > 0 && point.x < result.width && point.y > 0 && point.y < result.height)).toBe(true);
    expect(new Set(points.map((point) => point.y)).size).toBeGreaterThan(2);

    points.forEach((point, index) => {
      points.slice(index + 1).forEach((other) => {
        expect(Math.hypot(point.x - other.x, point.y - other.y)).toBeGreaterThanOrEqual(350);
      });
    });

    const labels = realRegions.map((region) => {
      const point = result.positions.get(region.region_id);
      return { x: point.x, y: point.y + 72, width: 140, height: 42 };
    });
    labels.forEach((label, index) => {
      labels.slice(index + 1).forEach((other) => {
        const overlaps = Math.abs(label.x - other.x) < (label.width + other.width) / 2
          && Math.abs(label.y - other.y) < (label.height + other.height) / 2;
        expect(overlaps).toBe(false);
      });
    });
  });

  it("centers a real root district and spaces the remaining districts around it", () => {
    const regions = [
      { region_id: "root" },
      { region_id: "backend" },
      { region_id: "frontend" },
    ];
    const result = computeIslandLayout(regions, { root: ".", backend: "backend", frontend: "frontend" });
    const root = result.positions.get("root");
    expect(root.x).toBe(result.width / 2);
    expect(root.y).toBe(result.height / 2);
    expect(Math.hypot(result.positions.get("backend").x - root.x, result.positions.get("backend").y - root.y)).toBeGreaterThanOrEqual(330);
  });

  it("shows a real empty activity state when the activity endpoint has no events", () => {
    renderWorkspace({ activity: { events: [] }, activityState: "ready" });
    expect(screen.getAllByText("No activity yet.").length).toBeGreaterThan(0);
    expect(screen.queryByText("Activity could not be loaded.")).not.toBeInTheDocument();
  });

  it("maps real activity paths to their deepest district and scales busy districts", () => {
    const counts = regionActivityCounts([
      { path: "backend/api/arena.py" },
      { path: "backend/api/rooms.py" },
      { path: "backend/core/auth.py" },
    ], {
      "backend-root": "backend",
      "backend-api": "backend/api",
      "backend-core": "backend/core",
    });

    expect(counts.get("backend-api")).toBe(2);
    expect(counts.get("backend-core")).toBe(1);
    expect(regionScale({ region_id: "backend-api" }, [], 2))
      .toBeGreaterThan(regionScale({ region_id: "quiet" }, [], 0));
    expect(regionScale({ region_id: "backend-api" }, [{ region_id: "backend-api" }], 0))
      .toBeGreaterThan(regionScale({ region_id: "quiet" }, [], 0));
  });

  it("lifts district fog from verified quest progress and moves the XP marker", () => {
    expect(getDistrictFogOpacity(0, 3)).toBe(0.54);
    expect(getDistrictFogOpacity(1, 2)).toBe(0.27);
    expect(getDistrictFogOpacity(2, 2)).toBe(0);
    expect(getDistrictFogOpacity(0, 0)).toBe(0.54);
    expect(getProgressMarkerX(240)).toBeGreaterThan(getProgressMarkerX(80));
    expect(getProgressMarkerX(1200)).toBe(370);
  });

  it("uses a stable pixel palette for each teammate id", () => {
    expect(avatarSkinFor("user-ada")).toEqual(avatarSkinFor("user-ada"));
    expect(avatarSkinFor("user-ada")).not.toEqual(avatarSkinFor("user-grace"));
    expect(getMemberRegion(
      { user_id: "ada", current_region_id: null },
      [
        { actor_id: "ada", path: "backend/core/auth.py", created_at: "2026-01-01T10:00:00Z" },
        { actor_id: "ada", path: "backend/api/arena.py", created_at: "2026-01-01T10:01:00Z" },
      ],
      { "backend-root": "backend", "backend-api": "backend/api", "backend-core": "backend/core" },
    )).toBe("backend-api");
  });

  it("renders a teammate avatar in the sidebar, team list, and their active district", () => {
    const activeDetails = {
      ...details,
      members: [{ ...details.members[0], current_region_id: "backend" }],
      region_paths: { backend: "backend" },
    };
    renderWorkspace({ sessionDetails: activeDetails, currentUser: "Ada" });
    expect(screen.getAllByRole("img", { name: "Ada pixel avatar" }).length).toBeGreaterThanOrEqual(3);
  });

  it("shows an actionable error when activity cannot be reached", () => {
    const onRetryActivity = vi.fn();
    renderWorkspace({
      activityState: "error",
      activityError: "The backend is unreachable.",
      onRetryActivity,
    });
    expect(screen.getByRole("alert")).toHaveTextContent("The backend is unreachable.");
    fireEvent.click(screen.getByRole("button", { name: "Retry activity" }));
    expect(onRetryActivity).toHaveBeenCalledOnce();
    expect(screen.queryByText("No activity yet.")).not.toBeInTheDocument();
  });

  it("does not claim the Arena connection is live while its event stream is reconnecting", () => {
    renderWorkspace({ connectionStatus: "reconnecting" });
    expect(screen.getByText("Reconnecting")).toBeInTheDocument();
  });

  it("switches tabs using local state without depending on fetched panel data", () => {
    renderWorkspace({ sessionDetails: null, loading: true, initialTab: "world" });
    expect(screen.getByRole("tabpanel", { name: "Code Map" })).toBeInTheDocument();

    selectTab("Quests");
    expect(screen.getByRole("tabpanel", { name: "Quests" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading this panel");

    selectTab("Team");
    expect(screen.getByRole("tabpanel", { name: "Team" })).toBeInTheDocument();
    selectTab("Rewards");
    expect(screen.getByRole("tabpanel", { name: "Rewards" })).toBeInTheDocument();
    selectTab("Roadmap");
    expect(screen.getByRole("tabpanel", { name: "Project Roadmap" })).toBeInTheDocument();
  });

  it.each([
    ["Code Map", "world"],
    ["Quests", "quests"],
    ["Team", "team"],
    ["Rewards", "rewards"],
  ])("shows loading, error, and empty states on %s", (tab, id) => {
    const view = renderWorkspace({ sessionDetails: null, loading: true, initialTab: "world" });
    selectTab(tab);
    expect(screen.getByRole("status")).toHaveTextContent("Loading this panel");

    view.rerender(
      <ArenaWorkspace currentSession={session} sessionDetails={details} onClaimQuest={vi.fn()} loading={false} error="Panel data unavailable." initialTab="world" />,
    );
    selectTab(tab);
    expect(screen.getByRole("alert")).toHaveTextContent("Panel data unavailable.");

    const emptyDetails = {
      ...details,
      entities: { regions: [], quests: [], bosses: [], checkpoints: [] },
      members: [],
      leaderboard: [],
      layout: { canvas_width: 1200, canvas_height: 800, regions: [], paths: [] },
    };
    view.rerender(
      <ArenaWorkspace currentSession={session} sessionDetails={emptyDetails} onClaimQuest={vi.fn()} loading={false} error={null} />,
    );
    selectTab(tab);
    if (id === "world" || id === "quests" || id === "team" || id === "rewards") {
      expect(screen.getByText("Nothing to show yet.")).toBeInTheDocument();
    }
  });

  it("shows real quest evidence and calls the existing claim callback", () => {
    const onClaimQuest = vi.fn().mockResolvedValue(undefined);
    renderWorkspace({ onClaimQuest });
    selectTab("Quests");
    expect(screen.getByText(/Server evidence: CI green · PR #7/)).toBeInTheDocument();
    const questRow = screen.getByText(/Add missing tests/).closest("article");
    fireEvent.click(within(questRow).getByRole("button", { name: "Take Quest" }));
    expect(onClaimQuest).toHaveBeenCalledWith("q-2");
  });

  it("shows verified XP from the server leaderboard and verified quest rewards only", () => {
    renderWorkspace();
    selectTab("Team");
    expect(screen.getAllByText("120 XP").length).toBeGreaterThan(0);
    selectTab("Rewards");
    expect(screen.getByText("Fix session sync")).toBeInTheDocument();
    expect(screen.queryByText("Add missing tests")).not.toBeInTheDocument();
  });

  it("keeps tab navigation available when a panel render fails", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const invalidDetails = {
      ...details,
      entities: { ...details.entities, regions: [{ region_id: "bad", original_name: { invalid: true } }] },
      layout: { ...details.layout, regions: [{ region_id: "bad", x: 600, y: 300 }] },
    };
    renderWorkspace({ sessionDetails: invalidDetails });
    expect(screen.getByRole("alert")).toHaveTextContent("This panel could not be displayed");
    selectTab("Team");
    expect(screen.getByRole("tabpanel", { name: "Team" })).toBeInTheDocument();
    expect(screen.getAllByText("Ada").length).toBeGreaterThan(0);
  });
});

describe("Roadmap Project Quest (Stage R2)", () => {
  const mockRoadmap = {
    session_id: "session-1",
    overall_progress: 50.0,
    verified_quests: 1,
    total_quests: 3,
    verified_xp: 120,
    terrain_style: "grass",
    members: [
      { user_id: "ada", user_name: "Ada", avatar_style: "adventurer", current_phase_id: "ph-1", verified_xp: 120 },
      { user_id: "bob", user_name: "Bob", avatar_style: "adventurer", current_phase_id: "ph-2", verified_xp: 0 },
    ],
    phases: [
      {
        id: "ph-1",
        order: 0,
        title: "Phase 1: Discovery",
        themed_title: "Campsite of Discovery",
        description: "Initial discovery & planning",
        locked: false,
        progress: 100.0,
        verified_quests: 1,
        total_quests: 1,
        stars: 3,
        landmark_archetype: "camp",
        quests: [
          {
            id: "q-1",
            title: "Fix session sync",
            themed_title: "Calibrate Nether Compass",
            xp: 120,
            due_date: "2026-12-01",
            assignee: { id: "ada", name: "Ada" },
            status: "verified",
            verification_type: "host_approval",
            evidence: { ci_status: "green" },
            evidence_links: ["https://github.com/acme/repo/pull/7"],
          },
        ],
      },
      {
        id: "ph-2",
        order: 1,
        title: "Phase 2: MVP",
        themed_title: "Workshop Clearing",
        description: "Build core features",
        locked: false,
        progress: 0.0,
        verified_quests: 0,
        total_quests: 2,
        stars: 0,
        landmark_archetype: "workshop",
        quests: [
          {
            id: "q-2",
            title: "Implement world generator",
            themed_title: "Craft Stone Pickaxe",
            xp: 100,
            due_date: "2026-12-05",
            assignee: { id: "bob", name: "Bob" },
            status: "submitted",
            verification_type: "host_approval",
            evidence: {},
            evidence_links: [],
          },
          {
            id: "q-3",
            title: "Add real-time sync",
            themed_title: "Forge Redstone Link",
            xp: 80,
            due_date: "2026-12-10",
            assignee: null,
            status: "open",
            verification_type: "host_approval",
            evidence: {},
            evidence_links: [],
          },
        ],
      },
      {
        id: "ph-3",
        order: 2,
        title: "Phase 3: Beta",
        themed_title: "Canyon Radar Tower",
        description: "Telemetry & security",
        locked: true,
        progress: 0,
        verified_quests: 0,
        total_quests: 0,
        stars: 0,
        landmark_archetype: "bridge",
        quests: [],
      },
    ],
    achievements: [
      { id: "first_quest_verified", title: "First Steps", unlocked: true },
      { id: "phase_complete", title: "Phase Champion", unlocked: true },
    ],
  };

  it("renders the Roadmap quest header, progress bar with teammate pins, and star counters", () => {
    render(
      <ArenaWorkspace
        currentSession={session}
        sessionDetails={details}
        initialTab="roadmap"
        roadmapData={mockRoadmap}
      />
    );

    expect(screen.getByText("Project Roadmap Quest")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByText("Roadmap")).toBeInTheDocument();
    expect(screen.getByLabelText(/Ada progress pin/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Bob progress pin/i)).toBeInTheDocument();
  });

  it("renders Quest Log card showing completed quests and active quests", () => {
    render(
      <ArenaWorkspace
        currentSession={session}
        sessionDetails={details}
        initialTab="roadmap"
        roadmapData={mockRoadmap}
      />
    );

    expect(screen.getByRole("heading", { name: "Quest Log" })).toBeInTheDocument();
    expect(screen.getByText("Fix session sync")).toBeInTheDocument();
    expect(screen.getByText("Implement world generator")).toBeInTheDocument();
    expect(screen.getByText("Add real-time sync")).toBeInTheDocument();
  });

  it("opens Phase Quest Drawer on milestone sign click and shows quests", () => {
    render(
      <ArenaWorkspace
        currentSession={session}
        sessionDetails={details}
        initialTab="roadmap"
        roadmapData={mockRoadmap}
      />
    );

    const sign = screen.getAllByRole("button", { name: /Phase 2: MVP/i })[0];
    fireEvent.click(sign);

    expect(screen.getByRole("dialog", { name: /Phase Quests: Phase 2: MVP/i })).toBeInTheDocument();
    expect(screen.getByText("Craft Stone Pickaxe")).toBeInTheDocument();
  });

  it("prohibits host from approving their own claimed quest", () => {
    const roadmapWithAdaSubmitted = {
      ...mockRoadmap,
      phases: mockRoadmap.phases.map((p) =>
        p.id === "ph-2"
          ? {
              ...p,
              quests: [
                {
                  id: "q-2",
                  title: "Implement world generator",
                  themed_title: "Craft Stone Pickaxe",
                  xp: 100,
                  due_date: "2026-12-05",
                  assignee: { id: "ada", name: "Ada" },
                  status: "submitted",
                  verification_type: "host_approval",
                  evidence: {},
                  evidence_links: [],
                },
              ],
            }
          : p
      ),
    };

    render(
      <ArenaWorkspace
        currentSession={{ ...session, host_user_id: "ada" }}
        currentUser="Ada"
        sessionDetails={details}
        initialTab="roadmap"
        roadmapData={roadmapWithAdaSubmitted}
      />
    );

    const sign = screen.getAllByRole("button", { name: /Phase 2: MVP/i })[0];
    fireEvent.click(sign);

    const selfApproveBtn = screen.getByRole("button", { name: /Self-Approval Prohibited/i });
    expect(selfApproveBtn).toBeDisabled();
  });

  it("allows host to approve quests claimed by teammates with HOST APPROVED label", () => {
    render(
      <ArenaWorkspace
        currentSession={{ ...session, host_user_id: "ada" }}
        currentUser="Ada"
        sessionDetails={details}
        initialTab="roadmap"
        roadmapData={mockRoadmap}
      />
    );

    const sign = screen.getAllByRole("button", { name: /Phase 2: MVP/i })[0];
    fireEvent.click(sign);

    const approveBtn = screen.getByRole("button", { name: "HOST APPROVED" });
    expect(approveBtn).toBeEnabled();
  });

  it("supports keyboard navigation on landmarks, milestone signs, and quest items", () => {
    render(
      <ArenaWorkspace
        currentSession={session}
        sessionDetails={details}
        initialTab="roadmap"
        roadmapData={mockRoadmap}
      />
    );

    const sign = screen.getAllByRole("button", { name: /Phase 1: Discovery/i })[0];
    expect(sign).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(sign, { key: "Enter" });

    expect(screen.getByRole("dialog", { name: /Phase Quests: Phase 1: Discovery/i })).toBeInTheDocument();
  });
});
