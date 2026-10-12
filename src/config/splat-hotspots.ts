export interface SplatHotspot {
  id: string;
  projectId: number; // project whose panel lists the scan (keyboard / screen-reader way in)
  title: string;
  content: string;   // .sog scene in /public, e.g. '/splats/groenhoven/bijlmer04.sog'
  settings: string;  // SuperSplat viewer settings.json (start camera, background, …)
  lat: number;
  lng: number;
  height: number;    // pin foot height (meters above ellipsoid) — Shift+click the facade in dev to get it
  tagSide?: 'left' | 'right'; // which side of the pin its tag hangs (default right) — to separate close pins
}

const query = (h: SplatHotspot) =>
  `content=${encodeURIComponent(h.content)}&settings=${encodeURIComponent(h.settings)}`;

/** The atlas embed of the self-hosted SuperSplat viewer (public/splat-viewer, v1.37.0): no viewer UI. */
export const splatEmbedUrl = (h: SplatHotspot) => `/splat-viewer/embed.html?${query(h)}`;
/** The full SuperSplat viewer with its own controls, for "New tab". */
export const splatViewerUrl = (h: SplatHotspot) => `/splat-viewer/index.html?noanim&${query(h)}`;

export interface SplatOpenDetail {
  id: string;
  at?: { x: number; y: number }; // screen point of the clicked pin, kept clear by the window
}
export const openSplat = (detail: SplatOpenDetail) =>
  window.dispatchEvent(new CustomEvent<SplatOpenDetail>('cesium:splat-open', { detail }));

/**
 * Where a hotspot's scanned spot is on screen right now (client px), or null when it is
 * off screen / too far to show its pin. Registered by the map, read every frame by the
 * scan window to draw its view cone back to the building.
 */
type AnchorFn = (id: string) => { x: number; y: number } | null;
let anchorFn: AnchorFn = () => null;
export const setSplatAnchor = (fn: AnchorFn | null) => { anchorFn = fn ?? (() => null); };
export const splatAnchor = (id: string) => anchorFn(id);

// The Community Bar scan is switched off for now; its files stay in public/splats/groenhoven.
// To bring it back, put this entry back in SPLAT_HOTSPOTS:
//   {
//     id: 'groenhoven-interior',
//     projectId: 37,
//     title: 'Community Bar',
//     content: '/splats/groenhoven/bijlmer04.sog',
//     settings: '/splats/groenhoven/settings.json',
//     lat: 52.326302,
//     lng: 4.976538,
//     height: 44.4,
//   },
export const SPLAT_HOTSPOTS: SplatHotspot[] = [];
