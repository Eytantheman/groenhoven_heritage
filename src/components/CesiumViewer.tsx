import { useEffect, useRef, useState } from 'react';
import type { HousingProject } from '../types';
import { IMAGE_PLANES, type ImagePlane } from '../config/image-planes';
import { VIDEO_HOTSPOTS } from '../config/video-hotspots';
import { SPLAT_HOTSPOTS, setSplatAnchor } from '../config/splat-hotspots';
import { DEV_TOOLS } from '../config/dev';
import { PROJECT_CAMERAS } from '../config/cameras';
import { START_THUMB } from '../config/start';
import { MapHint } from './MapHint';
import { SplatPins } from './SplatPins';

// Cesium is loaded via CDN script tag — access the global
declare const Cesium: typeof import('cesium');

// Signal orange — the single accent from DESIGN.md (also used for in-scene hotspots)
const ACCENT = '#FF4F00';
const accentColor = () => Cesium.Color.fromCssColorString(ACCENT);
// Tiles in greyscale, except a soft-edged circle of colour around the selected project.
// u_radius is animated (0 = all grey), so a selection reveals its surroundings outward.
// positionWC is single precision (~0.5 m at Earth radius): plenty for a 100 m+ circle.
const FOCUS_SHADER_GLSL = `
void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
  vec3 c = material.diffuse;
  float g = dot(c, vec3(0.299, 0.587, 0.114));
  // Horizontal distance only: a vertical cylinder, so tall buildings colour top to bottom
  vec3 up = normalize(u_center);
  vec3 v = fsInput.attributes.positionWC - u_center;
  float d = length(v - dot(v, up) * up);
  float k = 1.0 - smoothstep(u_radius - u_fade, u_radius, d);
  material.diffuse = mix(vec3(g), c, k * step(0.5, u_radius));
}`;
const REVEAL_MS = 1400;

/** Area kept in colour: the selected project, `radius` metres around it. */
export interface MapFocus { lat: number; lng: number; radius: number }

// Backdrop behind the tiles (visible above the horizon on tilted views):
// a neutral studio grey instead of black, so it reads as "model", not "failure".
const BACKDROP = '#D9D8D3';

export interface FlyTarget {
  lat: number;
  lng: number;
  height?: number;
  pitch?: number;
  heading?: number;
  id: number;
}

interface Props {
  tourProjects: HousingProject[];
  flyToTarget: FlyTarget | null;
  onProjectSelect: (p: HousingProject) => void;
  visiblePlanes: Record<string, boolean>;
  activePlaneId: string | null;
  show3dTiles: boolean;
  /** Presentation only: hide the drawing controls (e.g. the active drawing belongs to another project). */
  controlsHidden?: boolean;
  /** The one area of the 3D tiles shown in colour; null = all greyscale. */
  focus: MapFocus | null;
}

export function CesiumViewer({ tourProjects, flyToTarget, onProjectSelect, visiblePlanes, activePlaneId, show3dTiles, controlsHidden = false, focus }: Props) {
  const containerRef       = useRef<HTMLDivElement>(null);
  const creditsRef         = useRef<HTMLDivElement>(null);
  const prevShow3dRef      = useRef(show3dTiles);
  const viewerRef          = useRef<any>(null);
  const tilesetRef         = useRef<any>(null);
  const tourPolyRef        = useRef<any>(null);
  const imagePlaneEntities = useRef<any[]>([]);
  const satelliteLayerRef  = useRef<any>(null);
  const savedSatCamRef     = useRef<{ lng: number; lat: number; height: number; heading: number } | null>(null);
  const show3dTilesRef     = useRef(show3dTiles);
  show3dTilesRef.current   = show3dTiles;
  const focusShaderRef     = useRef<any>(null);
  const focusRadiusRef     = useRef(0); // current animated radius (m)

  // ── Image-plane live editor ──────────────────────────────────────────────
  const planeParamsRef    = useRef<ImagePlane[]>(IMAGE_PLANES.map(p => ({ ...p })));
  const planeEditStateRef = useRef({ on: false, idx: IMAGE_PLANES.length - 1 });
  const [planeEditOn, setPlaneEditOn]   = useState(false);
  const [planeEditIdx, setPlaneEditIdx] = useState(IMAGE_PLANES.length - 1);
  const [planeEditVals, setPlaneEditVals] = useState<ImagePlane | null>(null);
  const [planeLogMsg, setPlaneLogMsg]   = useState<string | null>(null);
  const STEP_LEVELS = [0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
  const stepMultRef = useRef(5); // index into STEP_LEVELS — default 10× (5m/click), so movement is visible immediately
  const [stepMultIdx, setStepMultIdx] = useState(5);
  const setStepMult = (idx: number) => {
    const clamped = Math.max(0, Math.min(STEP_LEVELS.length - 1, idx));
    stepMultRef.current = clamped;
    setStepMultIdx(clamped);
  };
  // Always step relative to the ref (not the possibly-stale React state) so
  // rapid consecutive clicks each register instead of collapsing into one.
  const bumpStepMult = (delta: number) => setStepMult(stepMultRef.current + delta);

  // Applies planeParamsRef.current[idx] to the live Cesium entity — callable
  // from both the keyboard handler (inside the init effect) and click buttons.
  // In-place mutation of position/orientation/dimensions left the plane's
  // rendering primitive stuck mid-rebuild (blank/white, sometimes never
  // recovering). Destroying and re-adding the entity fresh — the same
  // construction that reliably works at initial load — sidesteps that
  // internal rebuild path entirely. nudgePlane() below debounces calls into
  // this so rapid clicks trigger one recreate instead of many.
  function applyPlaneParams(idx: number) {
    const p = planeParamsRef.current[idx];
    const viewer = viewerRef.current;
    const oldEnt = imagePlaneEntities.current[idx];
    if (!p || !viewer) return;
    const wasShown = oldEnt ? oldEnt.show : true;
    if (oldEnt) viewer.entities.remove(oldEnt);

    const pos = Cesium.Cartesian3.fromDegrees(p.lng, p.lat, p.height);
    const hpr = new Cesium.HeadingPitchRoll(
      Cesium.Math.toRadians(p.heading),
      Cesium.Math.toRadians(p.pitch ?? 0),
      Cesium.Math.toRadians(p.roll ?? 0),
    );
    const orientation = Cesium.Transforms.headingPitchRollQuaternion(pos, hpr);
    const normal = p.type === 'plan' ? Cesium.Cartesian3.UNIT_Z : Cesium.Cartesian3.UNIT_Y;
    const ent = viewer.entities.add({
      id: `image-plane-${p.id}`,
      position: pos,
      orientation,
      show: wasShown,
      plane: {
        plane: new Cesium.Plane(normal, 0),
        dimensions: new Cesium.Cartesian2(p.widthM, p.heightM),
        material: new Cesium.ImageMaterialProperty({
          image: p.imageUrl,
          transparent: true,
          color: new Cesium.Color(1, 1, 1, p.opacity ?? 1),
        }),
        outline: false,
      },
    });
    imagePlaneEntities.current[idx] = ent;
  }

  // Flies the camera to a near-nadir view centered on the plane so it's always
  // actually on screen when it becomes the active drawing (rather than wherever
  // the camera happened to be pointed already). Called from the keyboard/Tab
  // handler, the recenter button, and whenever activePlaneId changes from outside.
  function flyToPlane(idx: number) {
    const p = planeParamsRef.current[idx];
    const viewer = viewerRef.current;
    if (!p || !viewer) return;
    const span = Math.max(p.widthM, p.heightM);
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(p.lng, p.lat, p.height + span * 1.3),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-89), roll: 0 },
      duration: 1.5,
    });
  }

  const applyDebounceRef = useRef<{ timer: ReturnType<typeof setTimeout> | null }>({ timer: null });
  function scheduleApplyPlaneParams(idx: number) {
    const d = applyDebounceRef.current;
    if (d.timer) clearTimeout(d.timer);
    d.timer = setTimeout(() => {
      applyPlaneParams(idx);
      d.timer = null;
    }, 180);
  }

  type NudgeAction = 'up' | 'down' | 'left' | 'right' | 'rotateCCW' | 'rotateCW'
    | 'tiltUp' | 'tiltDown' | 'rollCCW' | 'rollCW'
    | 'scaleUp' | 'scaleDown' | 'heightUp' | 'heightDown';

  function nudgePlane(action: NudgeAction, big = false) {
    const st = planeEditStateRef.current;
    const p = planeParamsRef.current[st.idx];
    if (!p) return;
    const mult   = STEP_LEVELS[stepMultRef.current];
    const factor = big ? 10 : 1;
    const moveM  = 0.5  * mult * factor;
    const rotDeg = 0.5  * mult * factor;
    const scaleF = 0.01 * mult * factor;
    const hM     = 0.2  * mult * factor;
    switch (action) {
      case 'up':         p.lat += moveM / 111320; break;
      case 'down':       p.lat -= moveM / 111320; break;
      case 'right':      p.lng += moveM / (111320 * Math.cos(p.lat * Math.PI / 180)); break;
      case 'left':       p.lng -= moveM / (111320 * Math.cos(p.lat * Math.PI / 180)); break;
      case 'rotateCCW':  p.heading = (p.heading - rotDeg + 360) % 360; break;
      case 'rotateCW':   p.heading = (p.heading + rotDeg) % 360; break;
      case 'tiltUp':     p.pitch = (p.pitch ?? 0) + rotDeg; break;
      case 'tiltDown':   p.pitch = (p.pitch ?? 0) - rotDeg; break;
      case 'rollCCW':    p.roll  = (p.roll  ?? 0) - rotDeg; break;
      case 'rollCW':     p.roll  = (p.roll  ?? 0) + rotDeg; break;
      case 'scaleUp':    p.widthM *= 1 + scaleF; p.heightM *= 1 + scaleF; break;
      case 'scaleDown':  p.widthM *= 1 - scaleF; p.heightM *= 1 - scaleF; break;
      case 'heightDown': p.height -= hM; break;
      case 'heightUp':   p.height += hM; break;
    }
    scheduleApplyPlaneParams(st.idx);
    setPlaneEditVals({ ...p });
  }

  // Direct-set from the height/opacity sliders (as opposed to nudgePlane's relative steps).
  function setPlaneHeight(value: number) {
    const st = planeEditStateRef.current;
    const p = planeParamsRef.current[st.idx];
    if (!p) return;
    p.height = value;
    scheduleApplyPlaneParams(st.idx);
    setPlaneEditVals({ ...p });
  }

  // Opacity only touches the material color, not position/dimensions, so it's applied
  // directly to the live entity — no need to recreate it (and no white-flash reload).
  function setPlaneOpacity(pct: number) {
    const st = planeEditStateRef.current;
    const p = planeParamsRef.current[st.idx];
    const ent = imagePlaneEntities.current[st.idx];
    if (!p) return;
    p.opacity = pct / 100;
    if (ent?.plane?.material) {
      ent.plane.material.color = new Cesium.Color(1, 1, 1, p.opacity);
    }
    setPlaneEditVals({ ...p });
  }

  function logActivePlanePosition() {
    const p = planeParamsRef.current[planeEditStateRef.current.idx];
    if (!p) return;
    const snippet = `{
    id: '${p.id}',
    imageUrl: '${p.imageUrl}',
    lat: ${p.lat.toFixed(6)},
    lng: ${p.lng.toFixed(6)},
    height: ${p.height.toFixed(1)},
    heading: ${p.heading.toFixed(1)},
    pitch: ${(p.pitch ?? 0).toFixed(1)},
    roll: ${(p.roll ?? 0).toFixed(1)},
    widthM: ${p.widthM.toFixed(1)},
    heightM: ${p.heightM.toFixed(1)},
    type: '${p.type}',
    opacity: ${p.opacity ?? 1},
    placement: 'surveyed', // tuned live against the tileset — update if you started from a rougher guess
  }`;
    console.log('🖼️ Image plane:', snippet);
    navigator.clipboard?.writeText(snippet).catch(() => {});
    setPlaneLogMsg('Logged to console + copied to clipboard');
    setTimeout(() => setPlaneLogMsg(null), 3000);
  }

  // ── Initialise viewer once ───────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN as string;

    const viewer = new Cesium.Viewer(containerRef.current, {
      animation:            false,
      baseLayerPicker:      false,
      fullscreenButton:     false,
      geocoder:             false,
      homeButton:           false,
      infoBox:              false,
      navigationHelpButton: false,
      sceneModePicker:      false,
      selectionIndicator:   false,
      timeline:             false,
      // Visible attribution (required for Google Photorealistic 3D Tiles)
      creditContainer:      creditsRef.current ?? document.createElement('div'),
      // @ts-expect-error: imageryProvider:false disables the default imagery layer
      imageryProvider:      false,
    });

    viewer.scene.skyBox.show          = false;
    viewer.scene.backgroundColor      = Cesium.Color.fromCssColorString(BACKDROP);
    viewer.scene.globe.show           = false;
    viewer.scene.fog.enabled          = false;
    viewer.scene.skyAtmosphere.show   = false;

    viewerRef.current = viewer;
    // React StrictMode double-invokes this effect in dev (mount → cleanup →
    // mount). viewerRef/tilesetRef get reset to null in cleanup, but this
    // array was never cleared, so entities from the destroyed first-mount
    // viewer stayed in it, shifting all indices for the second mount.
    imagePlaneEntities.current = [];

    // ── Image planes (architectural drawings) ────────────────────────────────
    for (const p of IMAGE_PLANES) {
      const pos = Cesium.Cartesian3.fromDegrees(p.lng, p.lat, p.height);
      const hpr = new Cesium.HeadingPitchRoll(
        Cesium.Math.toRadians(p.heading),
        Cesium.Math.toRadians(p.pitch ?? 0),
        Cesium.Math.toRadians(p.roll ?? 0),
      );
      const orientation = Cesium.Transforms.headingPitchRollQuaternion(pos, hpr);
      // facade: UNIT_Y = faces heading direction (vertical plane)
      // plan:   UNIT_Z = faces up (horizontal plane)
      // pitch/roll above additionally tilt/roll that base orientation.
      const normal = p.type === 'plan' ? Cesium.Cartesian3.UNIT_Z : Cesium.Cartesian3.UNIT_Y;
      const ent = viewer.entities.add({
        id: `image-plane-${p.id}`,
        position: pos,
        orientation,
        plane: {
          plane: new Cesium.Plane(normal, 0),
          dimensions: new Cesium.Cartesian2(p.widthM, p.heightM),
          material: new Cesium.ImageMaterialProperty({
            image: p.imageUrl,
            transparent: true,
            color: new Cesium.Color(1, 1, 1, p.opacity ?? 1),
          }),
          outline: false,
        },
      });
      imagePlaneEntities.current.push(ent);
    }

    // ── Image-plane live editor (arrow keys move/rotate/scale) ──────────────
    const onPlaneEditKeyDown = (e: KeyboardEvent) => {
      const st = planeEditStateRef.current;
      if (!st.on) return;
      if (e.key === 'Tab') {
        e.preventDefault();
        st.idx = (st.idx + 1) % planeParamsRef.current.length;
        setPlaneEditIdx(st.idx);
        setPlaneEditVals({ ...planeParamsRef.current[st.idx] });
        flyToPlane(st.idx);
        return;
      }
      if (e.key === 'Escape') {
        st.on = false;
        setPlaneEditOn(false);
        return;
      }
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        bumpStepMult(1);
        return;
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        bumpStepMult(-1);
        return;
      }
      const actionByKey: Record<string, NudgeAction> = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowRight: 'right', ArrowLeft: 'left',
        q: 'rotateCCW', Q: 'rotateCCW', e: 'rotateCW', E: 'rotateCW',
        w: 'tiltUp', W: 'tiltUp', s: 'tiltDown', S: 'tiltDown',
        a: 'rollCCW', A: 'rollCCW', d: 'rollCW', D: 'rollCW',
        '.': 'scaleUp', '>': 'scaleUp', ',': 'scaleDown', '<': 'scaleDown',
        '[': 'heightDown', ']': 'heightUp',
      };
      const action = actionByKey[e.key];
      if (!action) return;
      e.preventDefault();
      nudgePlane(action, e.shiftKey);
    };
    window.addEventListener('keydown', onPlaneEditKeyDown);

    const onPlaneEditToggle = () => {
      const st = planeEditStateRef.current;
      st.on = !st.on;
      setPlaneEditOn(st.on);
      if (st.on) {
        setPlaneEditVals({ ...planeParamsRef.current[st.idx] });
        flyToPlane(st.idx);
      }
      setPlaneLogMsg(null);
    };
    window.addEventListener('cesium:edit-planes-toggle', onPlaneEditToggle);

    const onPlaneEditRecenter = () => flyToPlane(planeEditStateRef.current.idx);
    window.addEventListener('cesium:edit-planes-recenter', onPlaneEditRecenter);

    // ── Video hotspots (red frame in 3D, hover → video overlay) ─────────────
    const videoEntities: Record<string, any> = {};
    for (const h of VIDEO_HOTSPOTS) {
      const pos = Cesium.Cartesian3.fromDegrees(h.lng, h.lat, h.height);
      const hpr = new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(h.heading), 0, 0);
      const orientation = Cesium.Transforms.headingPitchRollQuaternion(pos, hpr);
      videoEntities[h.id] = viewer.entities.add({
        id: `video-hotspot-${h.id}`,
        position: pos,
        orientation,
        plane: {
          plane: new Cesium.Plane(Cesium.Cartesian3.UNIT_Y, 0),
          dimensions: new Cesium.Cartesian2(h.widthM, h.heightM),
          material: accentColor().withAlpha(0.12),
          outline: true,
          outlineColor: accentColor(),
        },
      });
    }

    // ── Splat hotspots: HTML pins over the map (<SplatPins>), placed from setSplatAnchor ──
    // Throttle the map while a scan is open — two 3D engines share the GPU
    const onSplatOpen = () => { viewer.targetFrameRate = 15; };
    const onSplatClose = () => { viewer.targetFrameRate = undefined as unknown as number; };
    window.addEventListener('cesium:splat-open', onSplatOpen);
    window.addEventListener('cesium:splat-close', onSplatClose);
    // Screen point of a scanned spot, for the scan window's view cone (same range as the pin)
    const splatWorld = Object.fromEntries(SPLAT_HOTSPOTS.map(h => [h.id, Cesium.Cartesian3.fromDegrees(h.lng, h.lat, h.height)]));
    setSplatAnchor(id => {
      const p = splatWorld[id];
      if (!p || viewer.isDestroyed()) return null;
      if (Cesium.Cartesian3.distance(viewer.camera.positionWC, p) > 2500) return null;
      const w = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, p);
      if (!w) return null;
      const r = viewer.scene.canvas.getBoundingClientRect();
      if (w.x < 0 || w.y < 0 || w.x > r.width || w.y > r.height) return null;
      return { x: r.left + w.x, y: r.top + w.y };
    });

    // ── Cesium Ion (asset 2275207 = Google Photorealistic 3D Tiles, works in EEA) ──
    const emitTilesLoading = (loading: boolean, pending = 0, processing = 0) =>
      window.dispatchEvent(new CustomEvent('cesium:tiles-loading', { detail: { loading, pending, processing } }));

    // One shader for the tileset's whole life (also across reloads); uniforms driven by `focus`
    if (!focusShaderRef.current) {
      focusShaderRef.current = new Cesium.CustomShader({
        uniforms: {
          u_center: { type: Cesium.UniformType.VEC3, value: new Cesium.Cartesian3() },
          u_radius: { type: Cesium.UniformType.FLOAT, value: 0 },
          u_fade:   { type: Cesium.UniformType.FLOAT, value: 60 },
        },
        fragmentShaderText: FOCUS_SHADER_GLSL,
      });
    }

    const loadTileset = (isReload = false) => {
      emitTilesLoading(true);
      Cesium.Cesium3DTileset.fromIonAssetId(2275207, { showCreditsOnScreen: true })
        .then((tileset: any) => {
          // StrictMode mounts twice in dev; the first viewer may be gone already
          if (viewer.isDestroyed()) return;
          if (tilesetRef.current) viewer.scene.primitives.remove(tilesetRef.current);
          tilesetRef.current = tileset;
          tileset.show = show3dTilesRef.current;
          tileset.customShader = focusShaderRef.current;
          viewer.scene.primitives.add(tileset);

          tileset.loadProgress.addEventListener((pending: number, processing: number) => {
            emitTilesLoading(pending > 0 || processing > 0, pending, processing);
          });
          tileset.allTilesLoaded.addEventListener(() => emitTilesLoading(false));

          if (!isReload) {
            // Open on the start image's view (see config/start.ts), else Groenhoven's camera
            const start = START_THUMB?.camPos ?? PROJECT_CAMERAS[37];
            viewer.camera.flyTo({
              destination: Cesium.Cartesian3.fromDegrees(start.lng!, start.lat!, start.height),
              orientation: {
                heading: Cesium.Math.toRadians(start.heading),
                pitch:   Cesium.Math.toRadians(start.pitch),
                roll:    0,
              },
              duration: 0,
            });
          }
        })
        .catch((e: any) => { console.error('Cesium Ion 3D Tiles failed:', e); emitTilesLoading(false, 0, 0); });
    };

    loadTileset();

    const onReload = () => loadTileset(true);
    window.addEventListener('cesium:reload-tiles', onReload);

    // ── Direct Google Maps Tiles API option (blocked in EEA) ────────────────
    // Cesium.Cesium3DTileset.fromUrl(
    //   `https://tile.googleapis.com/v1/3dtiles/root.json?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`,
    //   { showCreditsOnScreen: true }
    // ).then((tileset: any) => { ... });

    // ── Bearing events ────────────────────────────────────────────────────
    viewer.scene.postRender.addEventListener(() => {
      const h = Cesium.Math.toDegrees(viewer.camera.heading);
      window.dispatchEvent(new CustomEvent('cesium:bearing', { detail: h }));
    });

    // ── Camera capture (press C) ──────────────────────────────────────────
    const onKeyDown = (e: KeyboardEvent) => {
      if (!DEV_TOOLS) return;
      if (e.key !== 'c' && e.key !== 'C') return;
      // Don't capture while typing in a field
      if ((e.target as HTMLElement | null)?.closest?.('input, select, textarea')) return;
      const cam = viewer.camera;
      const carto = Cesium.Ellipsoid.WGS84.cartesianToCartographic(cam.positionWC);
      const result = {
        lat:     parseFloat(Cesium.Math.toDegrees(carto.latitude).toFixed(6)),
        lng:     parseFloat(Cesium.Math.toDegrees(carto.longitude).toFixed(6)),
        height:  parseFloat(carto.height.toFixed(1)),
        heading: parseFloat(Cesium.Math.toDegrees(cam.heading).toFixed(1)),
        pitch:   parseFloat(Cesium.Math.toDegrees(cam.pitch).toFixed(1)),
      };
      console.log('📷 Camera:', JSON.stringify(result));
      window.dispatchEvent(new CustomEvent('cesium:capture', { detail: result }));
    };
    window.addEventListener('keydown', onKeyDown);

    // ── North reset ───────────────────────────────────────────────────────
    const onReset = () => {
      viewer.camera.flyTo({
        destination: viewer.camera.positionWC,
        orientation: { heading: 0, pitch: viewer.camera.pitch, roll: 0 },
        duration: 0.6,
      });
    };
    window.addEventListener('cesium:reset-north', onReset);

    // ── Click handler ─────────────────────────────────────────────────────
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: any) => {
      const picked = viewer.scene.pick(click.position);
      if (!picked?.id) return;
      const entId: string | undefined = picked.id?.id;
      // Video hotspot click
      if (entId?.startsWith('video-hotspot-')) {
        const id = entId.slice('video-hotspot-'.length);
        const hotspot = VIDEO_HOTSPOTS.find(h => h.id === id);
        if (hotspot) window.dispatchEvent(new CustomEvent('cesium:video-open', { detail: hotspot.videoSrc }));
        return;
      }
      // Project marker click
      if (picked.id instanceof Cesium.Entity) {
        const proj = picked.id.properties?.getValue(Cesium.JulianDate.now())?.project as HousingProject | undefined;
        if (proj) onProjectSelect(proj);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // ── Shift+Click → log world position (helps align image planes) ──────────
    handler.setInputAction((click: any) => {
      const pos = viewer.scene.pickPosition(click.position);
      if (!pos) return;
      const carto = Cesium.Ellipsoid.WGS84.cartesianToCartographic(pos);
      const result = {
        lat:    parseFloat(Cesium.Math.toDegrees(carto.latitude).toFixed(6)),
        lng:    parseFloat(Cesium.Math.toDegrees(carto.longitude).toFixed(6)),
        height: parseFloat(carto.height.toFixed(1)),
      };
      console.log('📍 Picked:', JSON.stringify(result));
      window.dispatchEvent(new CustomEvent('cesium:pick', { detail: result }));
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK, Cesium.KeyboardEventModifier.SHIFT);

    // ── Hover over video hotspot → highlight ──────────────────────────────
    let hoveredVideoId: string | null = null;
    handler.setInputAction((move: any) => {
      const picked = viewer.scene.pick(move.endPosition);
      const entId: string | undefined = picked?.id?.id;
      const newId = entId?.startsWith('video-hotspot-')
        ? entId.slice('video-hotspot-'.length)
        : null;
      if (newId === hoveredVideoId) return;

      if (hoveredVideoId && videoEntities[hoveredVideoId]) {
        videoEntities[hoveredVideoId].plane.material = accentColor().withAlpha(0.12);
      }
      hoveredVideoId = newId;
      viewer.scene.canvas.style.cursor = newId ? 'pointer' : '';
      if (newId && videoEntities[newId]) {
        videoEntities[newId].plane.material = accentColor().withAlpha(0.4);
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    return () => {
      handler.destroy();
      if (applyDebounceRef.current.timer) clearTimeout(applyDebounceRef.current.timer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keydown', onPlaneEditKeyDown);
      window.removeEventListener('cesium:edit-planes-toggle', onPlaneEditToggle);
      window.removeEventListener('cesium:edit-planes-recenter', onPlaneEditRecenter);
      window.removeEventListener('cesium:reset-north', onReset);
      window.removeEventListener('cesium:splat-open', onSplatOpen);
      window.removeEventListener('cesium:splat-close', onSplatClose);
      setSplatAnchor(null);
      window.removeEventListener('cesium:reload-tiles', onReload);
      if (!viewer.isDestroyed()) viewer.destroy();
      viewerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Colour focus: reveal the selected project's surroundings, grey elsewhere ──
  const focusCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    const shader = focusShaderRef.current;
    if (!shader) return;
    const prev = focusCenterRef.current;
    const moved = !!focus && (!prev || prev.lat !== focus.lat || prev.lng !== focus.lng);
    if (focus && moved) {
      // A new place: centre there and grow from nothing
      focusCenterRef.current = { lat: focus.lat, lng: focus.lng };
      shader.setUniform('u_center', Cesium.Cartesian3.fromDegrees(focus.lng, focus.lat, 0));
      focusRadiusRef.current = 0;
    }
    if (focus) shader.setUniform('u_fade', Math.max(40, focus.radius * 0.35));

    const from = focusRadiusRef.current;
    const to = focus ? focus.radius : 0;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / REVEAL_MS);
      const e = 1 - Math.pow(1 - t, 3); // ease-out
      focusRadiusRef.current = from + (to - from) * e;
      shader.setUniform('u_radius', focusRadiusRef.current);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [focus?.lat, focus?.lng, focus?.radius]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync tour route polyline ─────────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (tourPolyRef.current) { viewer.entities.remove(tourPolyRef.current); tourPolyRef.current = null; }
    if (tourProjects.length < 2) return;

    const positions = tourProjects
      .filter((p: HousingProject) => p.lat != null && p.lng != null)
      .flatMap((p: HousingProject) => [p.lng!, p.lat!, 5]);

    tourPolyRef.current = viewer.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights(positions),
        width: 3,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString(ACCENT),
          dashLength: 24,
        }),
        clampToGround: false,
        arcType: Cesium.ArcType.NONE,
      },
    });
  }, [tourProjects]);

  // ── Toggle image plane visibility (per-drawing, driven by the lightbox) ──
  useEffect(() => {
    imagePlaneEntities.current.forEach((ent, i) => {
      const id = IMAGE_PLANES[i]?.id;
      if (ent && id) ent.show = !!visiblePlanes[id];
    });
  }, [visiblePlanes]);

  // ── Activate a plane from outside (the "show in place" lightbox toggle) ──
  // Makes it the target for the sliders/edit-HUD and flies the camera to it.
  useEffect(() => {
    if (!activePlaneId) return;
    const idx = planeParamsRef.current.findIndex(p => p.id === activePlaneId);
    if (idx < 0) return;
    planeEditStateRef.current.idx = idx;
    setPlaneEditIdx(idx);
    setPlaneEditVals({ ...planeParamsRef.current[idx] });
    flyToPlane(idx);
  }, [activePlaneId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Closing the drawing (from the lightbox) also collapses the deep-edit HUD.
  useEffect(() => {
    if (!activePlaneId || !visiblePlanes[activePlaneId]) {
      planeEditStateRef.current.on = false;
      setPlaneEditOn(false);
    }
  }, [activePlaneId, visiblePlanes]);

  // ── Toggle 3D tiles / 2D satellite ─────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    // Only act on an actual 3D <-> 2D switch. On mount the camera is still
    // Cesium's default (North America), and saving it here made the first
    // switch to 2D jump to that globe view.
    if (prevShow3dRef.current === show3dTiles) return;
    prevShow3dRef.current = show3dTiles;
    if (show3dTiles) {
      // Save 2D camera state before leaving satellite mode
      const cam2d = viewer.camera;
      const c2d = Cesium.Ellipsoid.WGS84.cartesianToCartographic(cam2d.positionWC);
      savedSatCamRef.current = {
        lng: Cesium.Math.toDegrees(c2d.longitude),
        lat: Cesium.Math.toDegrees(c2d.latitude),
        height: c2d.height,
        heading: cam2d.heading,
      };
      if (tilesetRef.current) tilesetRef.current.show = true;
      viewer.scene.globe.show = false;
      if (satelliteLayerRef.current) {
        viewer.imageryLayers.remove(satelliteLayerRef.current);
        satelliteLayerRef.current = null;
      }
    } else {
      if (tilesetRef.current) tilesetRef.current.show = false;
      viewer.scene.globe.show = true;

      if (savedSatCamRef.current) {
        // Restore last 2D camera position
        const s = savedSatCamRef.current;
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(s.lng, s.lat, s.height),
          orientation: { heading: s.heading, pitch: -Math.PI / 2, roll: 0 },
          duration: 0.4,
        });
      } else {
        // First time: flatten to top-down over screen-center ground point
        const cam = viewer.camera;
        const camCarto = Cesium.Ellipsoid.WGS84.cartesianToCartographic(cam.positionWC);
        const canvasCenter = new Cesium.Cartesian2(
          viewer.canvas.clientWidth / 2,
          viewer.canvas.clientHeight / 2,
        );
        const groundPos = viewer.camera.pickEllipsoid(canvasCenter);
        const target = groundPos
          ? Cesium.Ellipsoid.WGS84.cartesianToCartographic(groundPos)
          : camCarto;
        // Cap altitude so a high 3D overview doesn't show the whole globe in 2D
        const height2d = Math.min(camCarto.height, 8000);
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromRadians(target.longitude, target.latitude, height2d),
          orientation: { heading: cam.heading, pitch: -Math.PI / 2, roll: 0 },
          duration: 0.6,
        });
      }

      if (!satelliteLayerRef.current) {
        Cesium.IonImageryProvider.fromAssetId(3)
          .then((provider: any) => {
            if (!viewer.isDestroyed() && !satelliteLayerRef.current) {
              const layer = viewer.imageryLayers.addImageryProvider(provider);
              layer.saturation = 0; // grayscale
              satelliteLayerRef.current = layer;
            }
          })
          .catch((e: any) => console.error('Satellite imagery failed:', e));
      }
    }
  }, [show3dTiles]);

  // ── Fly to target ────────────────────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !flyToTarget) return;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(flyToTarget.lng, flyToTarget.lat, flyToTarget.height ?? 300),
      orientation: {
        heading: Cesium.Math.toRadians(flyToTarget.heading ?? 0),
        pitch:   Cesium.Math.toRadians(flyToTarget.pitch ?? -25),
        roll:    0,
      },
      duration: 3.5,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    });
  }, [flyToTarget]);

  // Corner controls (edit button + sliders) only appear once a drawing has
  // been switched on from the "show in place" toggle in the lightbox — they
  // live outside the deep-edit HUD, not gated by planeEditOn.
  const activePlaneShown = !!activePlaneId && !!visiblePlanes[activePlaneId] && !controlsHidden;

  return (
    <div className="map">
      <div ref={containerRef} className="map__canvas" />
      <div ref={creditsRef} className="map__credits" aria-label="Map data attribution" />
      <MapHint />
      <SplatPins />

      {activePlaneShown && (
        <div className="drawing-ctrl">
          {DEV_TOOLS && <button
            onClick={() => window.dispatchEvent(new CustomEvent('cesium:edit-planes-toggle'))}
            title="Toggle drawing-alignment editor"
            aria-pressed={planeEditOn}
            className={`drawing-ctrl__edit${planeEditOn ? ' is-on' : ''}`}
          >
            <span className="tool__mark" aria-hidden="true" />
            {planeEditOn ? 'Editing drawing' : 'Edit drawing'}
          </button>}

          {planeEditVals && (
            <div className="drawing-ctrl__sliders">
              <SliderControl
                label="Height" value={planeEditVals.height} unit="m"
                min={0} max={150} step={0.5} decimals={1}
                onChange={setPlaneHeight}
              />
              <SliderControl
                label="Opacity" value={Math.round((planeEditVals.opacity ?? 1) * 100)} unit="%"
                min={20} max={100} step={1} decimals={0}
                onChange={setPlaneOpacity}
              />
            </div>
          )}
        </div>
      )}

      {DEV_TOOLS && activePlaneShown && planeEditOn && planeEditVals && (
        <div className="devcard plane-hud" role="region" aria-label="Drawing alignment editor">
          <div className="devcard__head">
            <span className="devcard__title"><span className="dot" aria-hidden="true" />{planeEditVals.id}</span>
            <span className="devcard__meta">{planeEditIdx + 1}/{IMAGE_PLANES.length}</span>
          </div>
          <dl className="plane-hud__vals">
            <dt>lat</dt><dd>{planeEditVals.lat.toFixed(6)}</dd>
            <dt>lng</dt><dd>{planeEditVals.lng.toFixed(6)}</dd>
            <dt>height</dt><dd>{planeEditVals.height.toFixed(1)} m</dd>
            <dt>head</dt><dd>{planeEditVals.heading.toFixed(1)}°</dd>
            <dt>tilt</dt><dd>{(planeEditVals.pitch ?? 0).toFixed(1)}°</dd>
            <dt>roll</dt><dd>{(planeEditVals.roll ?? 0).toFixed(1)}°</dd>
            <dt>size</dt><dd>{planeEditVals.widthM.toFixed(1)} × {planeEditVals.heightM.toFixed(1)} m</dd>
            <dt>opacity</dt><dd>{Math.round((planeEditVals.opacity ?? 1) * 100)}%</dd>
          </dl>

          <div className="plane-hud__pads">
            {/* Move D-pad */}
            <div className="plane-hud__dpad">
              <div />
              <CtrlBtn label="↑" title="Move north" onClick={() => nudgePlane('up')} />
              <div />
              <CtrlBtn label="←" title="Move west" onClick={() => nudgePlane('left')} />
              <div className="plane-hud__dpad-label">move</div>
              <CtrlBtn label="→" title="Move east" onClick={() => nudgePlane('right')} />
              <div />
              <CtrlBtn label="↓" title="Move south" onClick={() => nudgePlane('down')} />
              <div />
            </div>

            <div className="plane-hud__pairs">
              <CtrlPair label="rotate">
                <CtrlBtn label="↺" title="Rotate CCW" onClick={() => nudgePlane('rotateCCW')} />
                <CtrlBtn label="↻" title="Rotate CW" onClick={() => nudgePlane('rotateCW')} />
              </CtrlPair>
              <CtrlPair label="tilt">
                <CtrlBtn label="⤴" title="Tilt up" onClick={() => nudgePlane('tiltUp')} />
                <CtrlBtn label="⤵" title="Tilt down" onClick={() => nudgePlane('tiltDown')} />
              </CtrlPair>
              <CtrlPair label="roll">
                <CtrlBtn label="⟲" title="Roll CCW" onClick={() => nudgePlane('rollCCW')} />
                <CtrlBtn label="⟳" title="Roll CW" onClick={() => nudgePlane('rollCW')} />
              </CtrlPair>
              <CtrlPair label="scale">
                <CtrlBtn label="−" title="Scale down" onClick={() => nudgePlane('scaleDown')} />
                <CtrlBtn label="+" title="Scale up" onClick={() => nudgePlane('scaleUp')} />
              </CtrlPair>
              <CtrlPair label="height">
                <CtrlBtn label="▼" title="Lower" onClick={() => nudgePlane('heightDown')} />
                <CtrlBtn label="▲" title="Raise" onClick={() => nudgePlane('heightUp')} />
              </CtrlPair>
            </div>
          </div>

          <div className="plane-hud__step">
            <span>
              step ×{STEP_LEVELS[stepMultIdx]} ({(0.5 * STEP_LEVELS[stepMultIdx]).toFixed(1)}m/click)
            </span>
            <CtrlBtn label="−" title="Smaller step" onClick={() => bumpStepMult(-1)} />
            <CtrlBtn label="+" title="Bigger step" onClick={() => bumpStepMult(1)} />
          </div>

          <p className="plane-hud__help">
            Click buttons above, or use keyboard:<br />
            ↑↓←→ move · Q/E rotate · W/S tilt · A/D roll<br />
            , / . scale · [ ] height<br />
            +/− step size · Shift = ×10 · Tab = switch · Esc = exit
          </p>
          <div className="plane-hud__actions">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('cesium:edit-planes-recenter'))}
              title="Fly the camera back to this drawing"
              className="devcard__btn devcard__btn--ghost"
            >
              Recenter camera
            </button>
            <button onClick={logActivePlanePosition} className="devcard__btn">
              Log position
            </button>
          </div>
          {planeLogMsg && (
            <div className="devcard__meta plane-hud__msg" role="status">{planeLogMsg}</div>
          )}
        </div>
      )}
    </div>
  );
}

function CtrlPair({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="plane-hud__pair">
      <div className="plane-hud__pair-label">{label}</div>
      <div className="plane-hud__pair-btns">{children}</div>
    </div>
  );
}

function CtrlBtn({ label, title, onClick }: { label: string; title: string; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button title={title} aria-label={title} onClick={onClick} className="ctrl-btn">
      {label}
    </button>
  );
}

function SliderControl({ label, value, unit, min, max, step, decimals, onChange }: {
  label: string; value: number; unit: string;
  min: number; max: number; step: number; decimals: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="slider">
      <span className="slider__head">
        <span>{label}</span>
        <span className="slider__val">{value.toFixed(decimals)}{unit}</span>
      </span>
      <input
        type="range" className="edit-slider"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
      />
    </label>
  );
}
