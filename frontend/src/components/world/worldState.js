export function applyWorldDelta(world, delta) {
  if (!world) return world;
  const merge = (current = [], next = [], key) => {
    const map = new Map(current.map((item) => [item[key], item]));
    next.forEach((item) => map.set(item[key], { ...map.get(item[key]), ...item }));
    return [...map.values()];
  };
  return { ...world, buildings: merge(world.buildings, delta.buildings, "path"), avatars: delta.avatars || world.avatars, alerts: merge(world.alerts, delta.alerts, "dedupe_key") };
}

export const KIND_COLORS = { route: "#38bdf8", model: "#a78bfa", ui: "#34d399", test: "#fbbf24", config: "#94a3b8", docs: "#60a5fa", migration: "#fb7185", other: "#64748b" };
