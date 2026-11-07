export const VIEWPORTS = [
  { id: "desktop", label: "Desktop", width: 1920, height: 1080 },
  { id: "laptop", label: "Laptop", width: 1366, height: 768 },
  { id: "tablet", label: "Tablet", width: 768, height: 1024 },
  { id: "mobile-390", label: "Mobile (390)", width: 390, height: 844 },
  { id: "mobile-360", label: "Mobile (360)", width: 360, height: 800 },
] as const;

export type Viewport = (typeof VIEWPORTS)[number];
export type ViewportId = Viewport["id"];
export const VIEWPORT_IDS = VIEWPORTS.map((v) => v.id) as [ViewportId, ...ViewportId[]];
