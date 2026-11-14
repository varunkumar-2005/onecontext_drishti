import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import WorldStage, { districtFogOpacity, fitWorldCamera, resolveLabelVisibility, selectBuildingLod } from "./WorldStage";

const buildings = [
  { path: "backend/main.py", region_id: "backend", kind: "route", loc: "m", heat: 2, grid: [1, 1] },
  { path: "frontend/App.jsx", region_id: "frontend", kind: "ui", loc: "s", heat: 0, grid: [2, 2] },
];
const world = { districts: [{ region_id: "backend", x: 10, y: 10, w: 240, h: 180 }, { region_id: "frontend", x: 280, y: 10, w: 240, h: 180 }], buildings, avatars: [{ actor: "Ada", type: "user", path: "backend/main.py" }, { actor: "Scout", type: "agent", path: "frontend/App.jsx" }], quest_markers: [{ id: "q1" }], alerts: [
  { dedupe_key: "collision", kind: "collision", paths: ["backend/main.py"] },
  { dedupe_key: "dependency", kind: "dependency_risk", paths: ["backend/main.py", "frontend/App.jsx"] },
  { dedupe_key: "storm", kind: "ci_storm", paths: ["backend/main.py"] },
  { dedupe_key: "boss", kind: "security_boss", paths: ["backend/main.py"] },
] };
const theme = { world_archetype: "fantasy_adventure", building_archetypes: { route: "Gateway", ui: "Portal" } };

describe("WorldStage", () => {
  it("renders real world fixture with every active alert effect", () => {
    const { container, getByTestId } = render(<WorldStage world={world} theme={theme} onSelect={() => {}} />);
    expect(container.querySelector('[data-building="backend/main.py"]')).toBeInTheDocument();
    expect(getByTestId("collision-effect")).toBeInTheDocument();
    expect(getByTestId("dependency-effect")).toBeInTheDocument();
    expect(getByTestId("ci_storm-effect")).toBeInTheDocument();
    expect(getByTestId("security_boss-effect")).toBeInTheDocument();
  });

  it("re-skins labels without moving the building and moves a persistent avatar with its path", () => {
    const { container, rerender } = render(<WorldStage world={world} theme={theme} onSelect={() => {}} />);
    const before = container.querySelector('[data-building="backend/main.py"] polygon')?.getAttribute("points");
    const avatar = container.querySelector(".world-avatar");
    const oldTransform = avatar.getAttribute("transform");
    rerender(<WorldStage world={{ ...world, avatars: [{ actor: "Ada", type: "user", path: "frontend/App.jsx" }] }} theme={{ ...theme, building_archetypes: { route: "Citadel", ui: "Shrine" } }} onSelect={() => {}} />);
    expect(container.querySelector('[data-building="backend/main.py"] polygon')?.getAttribute("points")).toBe(before);
    expect(container.querySelector(".world-avatar")).toBe(avatar);
    expect(avatar.getAttribute("transform")).not.toBe(oldTransform);
  });
});

describe("World map level of detail", () => {
  it("fits and centers the loaded districts after world data arrives", () => {
    expect(fitWorldCamera([], { width: 1000, height: 620 })).toBeNull();
    expect(fitWorldCamera(world.districts, { width: 650, height: 420 })).toEqual({
      x: -48,
      y: -106,
      width: 650,
      height: 420,
    });
  });

  it("keeps the top twelve ranked files as landmarks in each district", () => {
    const files = Array.from({ length: 15 }, (_, index) => ({
      path: `backend/file-${index}.py`,
      region_id: "backend",
      loc: index === 0 ? "xl" : "xs",
      heat: index === 1 ? 8 : 0,
      grid: [index % 8, Math.floor(index / 8)],
    }));
    const { landmarks, props } = selectBuildingLod(
      files,
      [{ paths: ["backend/file-14.py"] }],
      [{ file_paths: ["backend/file-13.py"] }],
    );
    expect(landmarks).toHaveLength(12);
    expect(props).toHaveLength(3);
    expect(landmarks.some((building) => building.path === "backend/file-0.py")).toBe(true);
    expect(landmarks.some((building) => building.path === "backend/file-1.py")).toBe(true);
    expect(landmarks.some((building) => building.path === "backend/file-13.py")).toBe(true);
    expect(landmarks.some((building) => building.path === "backend/file-14.py")).toBe(true);
  });

  it("hides lower-priority labels when their bounding boxes collide", () => {
    const visible = resolveLabelVisibility([
      { id: "landmark", text: "main.py", x: 100, y: 80, priority: 100 },
      { id: "neighbor", text: "config.py", x: 106, y: 81, priority: 10 },
      { id: "clear", text: "README.md", x: 240, y: 80, priority: 1 },
    ]);
    expect(visible.has("landmark")).toBe(true);
    expect(visible.has("neighbor")).toBe(false);
    expect(visible.has("clear")).toBe(true);
  });

  it("lifts district fog as verified quest progress increases", () => {
    expect(districtFogOpacity(0, 0)).toBe(0.3);
    expect(districtFogOpacity(0, 4)).toBe(0.3);
    expect(districtFogOpacity(2, 4)).toBe(0.15);
    expect(districtFogOpacity(4, 4)).toBe(0.035);
  });
});
