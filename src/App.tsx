import { useState, useMemo, useEffect, useRef } from 'react';
import { CesiumViewer, type FlyTarget, type MapFocus } from './components/CesiumViewer';
import { ProjectPanel } from './components/ProjectPanel';
import { PROJECT_CAMERAS, FOCUS_RADIUS } from './config/cameras';
import { IMAGE_PLANES } from './config/image-planes';
import { VIDEO_HOTSPOTS } from './config/video-hotspots';
import { SPLAT_HOTSPOTS, splatEmbedUrl, splatViewerUrl, splatAnchor } from './config/splat-hotspots';
import type { SplatOpenDetail } from './config/splat-hotspots';
import { DEV_TOOLS } from './config/dev';
import { PANEL_CONTENT } from './data/panel-content';
import { useFloatingWindow, announceFloatOpen, FLOAT_OPEN_EVENT } from './components/useFloatingWindow';
import type { FloatKind } from './components/useFloatingWindow';
import type { HousingProject } from './types';
import allProjectsData from './data/housing-atlas.json';
import './App.css';

const ALL_PROJECTS = allProjectsData as HousingProject[];
// The site is about one complex: it opens with Groenhoven selected
const GROENHOVEN = ALL_PROJECTS.find(p => p.id === 37) ?? null;

export default function App() {
  const [selected, setSelected] = useState<HousingProject | null>(GROENHOVEN);
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  const [bearing, setBearing] = useState(0);
  const [capture, setCapture] = useState<Record<string, number> | null>(null);
  const [pick, setPick] = useState<{ lat: number; lng: number; height: number } | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [splatOpen, setSplatOpen] = useState<SplatOpenDetail | null>(null);
  // Which image-plane drawings are shown in the 3D scene — starts empty (nothing
  // shown) and is driven per-drawing from the "show in place" toggle in the
  // enlarged image lightbox, keyed by ImagePlane id.
  const [visiblePlanes, setVisiblePlanes] = useState<Record<string, boolean>>({});
  const [activePlaneId, setActivePlaneId] = useState<string | null>(null);
  const [introVisible, setIntroVisible] = useState(true);
  const [show3dTiles, setShow3dTiles] = useState(true);
  const [tileLoading, setTileLoading] = useState(false);
  const [tileFrozen, setTileFrozen] = useState(false);
  const [tilePct, setTilePct] = useState(0);
  const loaderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const freezeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tileMaxRef = useRef(0);
  const tileLastRef = useRef(0);
  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const h = (e: Event) => setBearing((e as CustomEvent<number>).detail);
    window.addEventListener('cesium:bearing', h);
    return () => window.removeEventListener('cesium:bearing', h);
  }, []);

  useEffect(() => {
    const h = (e: Event) => {
      setCapture((e as CustomEvent).detail);
      // A new capture restarts the 8s auto-dismiss instead of inheriting the old timer
      if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
      captureTimerRef.current = setTimeout(() => setCapture(null), 8000);
    };
    window.addEventListener('cesium:capture', h);
    return () => {
      window.removeEventListener('cesium:capture', h);
      if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const h = (e: Event) => setPick((e as CustomEvent).detail);
    window.addEventListener('cesium:pick', h);
    return () => window.removeEventListener('cesium:pick', h);
  }, []);

  // One floating window at a time (see announceFloatOpen)
  useEffect(() => {
    const h = (e: Event) => {
      const kind = (e as CustomEvent<FloatKind>).detail;
      if (kind !== 'video') setVideoSrc(null);
      if (kind !== 'splat') setSplatOpen(null);
    };
    window.addEventListener(FLOAT_OPEN_EVENT, h);
    return () => window.removeEventListener(FLOAT_OPEN_EVENT, h);
  }, []);

  useEffect(() => {
    const h = (e: Event) => { announceFloatOpen('splat'); setSplatOpen((e as CustomEvent<SplatOpenDetail>).detail); };
    window.addEventListener('cesium:splat-open', h);
    return () => window.removeEventListener('cesium:splat-open', h);
  }, []);

  useEffect(() => {
    const h = (e: Event) => { announceFloatOpen('video'); setVideoSrc((e as CustomEvent<string>).detail); };
    window.addEventListener('cesium:video-open', h);
    return () => window.removeEventListener('cesium:video-open', h);
  }, []);

  useEffect(() => {
    const h = (e: Event) => setFlyTarget((e as CustomEvent).detail);
    window.addEventListener('cesium:image-cam', h);
    return () => window.removeEventListener('cesium:image-cam', h);
  }, []);

  useEffect(() => {
    const h = (e: Event) => {
      const { loading, pending, processing } = (e as CustomEvent<{ loading: boolean; pending: number; processing: number }>).detail;
      if (loading) {
        const current = pending + processing;
        if (current > tileMaxRef.current) tileMaxRef.current = current;
        const pct = tileMaxRef.current > 0
          ? Math.min(99, Math.round(100 * (1 - current / tileMaxRef.current)))
          : 0;
        setTilePct(pct);
        if (!loaderTimerRef.current)
          loaderTimerRef.current = setTimeout(() => setTileLoading(true), 500);
        // "Stalled" means 8s without progress, not 8s since loading began:
        // restart the timer whenever the queue shrinks.
        const progressed = current < tileLastRef.current;
        tileLastRef.current = current;
        if (progressed) {
          if (freezeTimerRef.current) { clearTimeout(freezeTimerRef.current); freezeTimerRef.current = null; }
          setTileFrozen(false);
        }
        if (!freezeTimerRef.current)
          freezeTimerRef.current = setTimeout(() => setTileFrozen(true), 8000);
      } else {
        tileMaxRef.current = 0;
        tileLastRef.current = 0;
        setTilePct(100);
        if (loaderTimerRef.current) { clearTimeout(loaderTimerRef.current); loaderTimerRef.current = null; }
        if (freezeTimerRef.current) { clearTimeout(freezeTimerRef.current); freezeTimerRef.current = null; }
        setTileLoading(false);
        setTileFrozen(false);
      }
    };
    window.addEventListener('cesium:tiles-loading', h);
    return () => {
      window.removeEventListener('cesium:tiles-loading', h);
      if (loaderTimerRef.current) clearTimeout(loaderTimerRef.current);
      if (freezeTimerRef.current) clearTimeout(freezeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setIntroVisible(false), 28000);
    return () => clearTimeout(t);
  }, []);

  // The intro also gives way as soon as the visitor touches the map
  useEffect(() => {
    if (!introVisible) return;
    const h = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.('.map__canvas')) setIntroVisible(false);
    };
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
  }, [introVisible]);

  function flyTo(p: HousingProject) {
    if (p.lat == null || p.lng == null) return;
    const cam = PROJECT_CAMERAS[p.id] ?? { height: 250, pitch: -25, heading: 0 };
    setFlyTarget({ lat: cam.lat ?? p.lat, lng: cam.lng ?? p.lng, ...cam, id: Date.now() });
    if (p.id !== selected?.id) { setVideoSrc(null); setSplatOpen(null); } // windows belong to the project they came from
    setSelected(p);
    setIntroVisible(false);
  }

  function reloadTiles() {
    setTileFrozen(false);
    setTileLoading(false);
    window.dispatchEvent(new Event('cesium:reload-tiles'));
  }

  function resetNorth() {
    window.dispatchEvent(new Event('cesium:reset-north'));
    setBearing(0);
  }

  // Called from the "show in place" toggle under an enlarged image in the
  // project panel — shows/hides that one drawing and makes it the active
  // plane so the height/opacity sliders and edit button appear for it.
  function setPlaneVisible(id: string, on: boolean) {
    setVisiblePlanes(v => ({ ...v, [id]: on }));
    setActivePlaneId(a => on ? id : a === id ? null : a);
  }

  const visibleCount = IMAGE_PLANES.filter(p => visiblePlanes[p.id]).length;
  const anyPlaneVisible = visibleCount > 0;
  const allPlanesVisible = visibleCount === IMAGE_PLANES.length && visibleCount > 0;
  const planesState = allPlanesVisible ? 'on' : anyPlaneVisible ? 'mixed' : 'off';
  const showTileStatus = show3dTiles && (tileLoading || tileFrozen);

  // Hide the drawing controls when the active drawing belongs to a different project than the open one
  const activePlaneUrl = IMAGE_PLANES.find(p => p.id === activePlaneId)?.imageUrl;
  const selectedContent = selected ? PANEL_CONTENT[selected.id] : undefined;
  const activePlaneInOtherProject = !!selected && !!activePlaneUrl &&
    ![...(selectedContent?.axos ?? []), ...(selectedContent?.thumbs ?? [])].some(i => i.src === activePlaneUrl);

  // The model is greyscale; the selected project's surroundings are revealed in colour
  const mapFocus = useMemo<MapFocus | null>(() =>
    selected && selected.lat != null && selected.lng != null
      ? { lat: selected.lat, lng: selected.lng, radius: PROJECT_CAMERAS[selected.id]?.focusRadius ?? FOCUS_RADIUS }
      : null,
  [selected]);

  const toolsEl = (
    <div className="tools" role="toolbar" aria-label="Map controls">
      <button
        className="tool tool--mode"
        onClick={() => setShow3dTiles(v => !v)}
        title={show3dTiles ? 'Switch to 2D satellite' : 'Switch to 3D tiles'}
        aria-label={show3dTiles ? 'Switch to 2D satellite' : 'Switch to 3D tiles'}
      >
        <span className={show3dTiles ? 'is-on' : ''}>3D</span>
        <span className="tool__slash">/</span>
        <span className={!show3dTiles ? 'is-on' : ''}>2D</span>
      </button>
      <button
        className={`tool tool--planes is-${planesState}`}
        onClick={() => {
          // All shown -> hide all; none or some shown -> show all
          const next = !allPlanesVisible;
          setVisiblePlanes(Object.fromEntries(IMAGE_PLANES.map(p => [p.id, next])));
          if (!next) setActivePlaneId(null);
        }}
        title={allPlanesVisible ? 'Hide all drawings' : 'Show all drawings'}
        aria-pressed={planesState === 'mixed' ? 'mixed' : allPlanesVisible}
      >
        <span className="tool__mark" aria-hidden="true" />
        Drawings
      </button>
      <button
        className={`tool tool--north${Math.round(bearing) % 360 === 0 ? ' is-north' : ''}`}
        onClick={resetNorth}
        title="Reset to north"
        aria-label="Reset view to north"
      >
        <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true"
             style={{ transform: `rotate(${-bearing}deg)` }}>
          <path d="M5 1 L5 13 M1.5 4.5 L5 1 L8.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        N
      </button>
    </div>
  );

  return (
    <div className={`atlas${selected ? ' has-selection' : ''}`}>
      <CesiumViewer
        tourProjects={[]}
        flyToTarget={flyTarget}
        onProjectSelect={p => flyTo(p)}
        visiblePlanes={visiblePlanes}
        activePlaneId={activePlaneId}
        show3dTiles={show3dTiles}
        controlsHidden={activePlaneInOtherProject}
        focus={mapFocus}
      />

      <div className={`leftcol${introVisible ? '' : ' is-compact'}`}>
      {/* Masthead — a wall label pinned to the top-left of the model */}
      <header className="masthead">
        <h1 className="masthead__title">
          <span className="masthead__kicker">The Architectural Heritage of</span>
          {/* The title brings the introduction back down (or folds it away) */}
          <button className="masthead__btn" onClick={() => setIntroVisible(v => !v)}
                  aria-expanded={introVisible} aria-controls="intro">
            Groenhoven
          </button>
        </h1>

        {showTileStatus && (
          <div className="status" role="status" aria-live="polite">
            {tileFrozen ? (
              <>
                <span className="status__label status__label--alert"><span className="dot" aria-hidden="true" />Tiles stalled</span>
                <button className="status__action link link--under" onClick={reloadTiles}>Reload tiles</button>
              </>
            ) : (
              <>
                <span className="status__label">Loading tiles</span>
                <span className="status__pct">{tilePct > 0 ? `${tilePct}%` : ''}</span>
                <span className="status__bar" aria-hidden="true">
                  <span style={{ transform: `scaleX(${tilePct / 100})` }} />
                </span>
              </>
            )}
          </div>
        )}
      </header>

      {/* Intro — wall text that fades away after a while or on first selection */}
      <section id="intro" className={`intro${introVisible ? ' is-visible' : ''}`} aria-hidden={!introVisible} aria-label="Introduction">
        <button className="link intro__close" onClick={() => setIntroVisible(false)} tabIndex={introVisible ? 0 : -1}>Close</button>
        <p>
          Groenhoven, Joop van Stigt’s eight residential towers in Amsterdam’s Bijlmer (1971–1980), explored in situ: archival drawings and photographs, and drawings placed on the model. The project explores a 3D digital heritage of the architecture of Groenhoven. Built from research produced within the Housing Studies course (TU Delft 2024-2026).
        </p>
      </section>
      </div>

      <ProjectPanel project={selected} tools={toolsEl} visiblePlanes={visiblePlanes} onSetPlane={setPlaneVisible} />

      {splatOpen && <SplatOverlay key={splatOpen.id} open={splatOpen} onClose={() => setSplatOpen(null)} />}
      {videoSrc && <VideoOverlay key={videoSrc} videoSrc={videoSrc} onClose={() => setVideoSrc(null)} />}

      {DEV_TOOLS && capture && <CameraToast capture={capture} defaultId={selected?.id ?? null} projects={ALL_PROJECTS} onDismiss={() => setCapture(null)} />}
      {DEV_TOOLS && pick && !capture && <PickToast pick={pick} onDismiss={() => setPick(null)} />}
    </div>
  );
}

function VideoOverlay({ videoSrc, onClose }: { videoSrc: string; onClose: () => void }) {
  // Same frame, placement, drag and phone-sheet behaviour as the image lightbox
  const { ref: winRef, sheet: winSheet, dragging: winDragging, style: winStyle, handlers: winHandlers } = useFloatingWindow(Math.min(window.innerWidth * 0.41, 550));
  const hotspot = VIDEO_HOTSPOTS.find(h => h.videoSrc === videoSrc);
  const title = hotspot
    ? hotspot.id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : 'Video';

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="lb-layer">
      <figure
        ref={winRef}
        className={`float lb video${winSheet ? ' is-sheet' : ''}${winDragging ? ' is-dragging' : ''}`}
        {...winHandlers}
        style={winStyle}
        role="dialog"
        aria-label={`Video: ${title}`}
        tabIndex={-1}
      >
        <div className="float__bar lb__bar">
          {winSheet ? (
            <span className="float__meta">Video</span>
          ) : (
            <span className="float__meta lb__grip" aria-hidden="true">
              <svg width="10" height="6" viewBox="0 0 10 6" fill="currentColor"><rect x="0" y="0" width="10" height="1"/><rect x="0" y="5" width="10" height="1"/></svg>
              Drag
            </span>
          )}
          <span className="float__actions">
            <button className="link" onClick={onClose}>Close</button>
          </span>
        </div>
        <video src={videoSrc} autoPlay controls playsInline className="video__el" />
        <figcaption className="lb__cap">
          <span className="dot" aria-hidden="true" />Video&ensp;{title}
        </figcaption>
      </figure>
    </div>
  );
}

const SPLAT_ASPECT = 16 / 10;

function SplatOverlay({ open, onClose }: { open: SplatOpenDetail; onClose: () => void }) {
  // Larger than the video window (interiors need room), sized to the free height too, and
  // opened on the side of the map away from the pin it came from
  const { ref: winRef, sheet: winSheet, dragging: winDragging, style: winStyle, handlers: winHandlers } =
    useFloatingWindow(Math.min(window.innerWidth * 0.6, 900), { aspect: SPLAT_ASPECT, chromeH: 36 + 37, avoid: open.at, scale: 2 });
  const hotspot = SPLAT_HOTSPOTS.find(h => h.id === open.id);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  // Tell the map to ease off while the scan is open
  useEffect(() => () => { window.dispatchEvent(new Event('cesium:splat-close')); }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  // Messages from the embed (public/splat-viewer/embed.html): progress, first frame, Esc
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return;
      const msg = e.data as { source?: string; type?: string; value?: number };
      if (msg?.source !== 'splat') return;
      if (msg.type === 'progress' && typeof msg.value === 'number') setProgress(msg.value);
      else if (msg.type === 'loaded') setStatus('ready');
      else if (msg.type === 'error') setStatus('error');
      else if (msg.type === 'escape') onClose();
    };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, [onClose]);

  if (!hotspot) return null;
  const tell = (type: string) =>
    frameRef.current?.contentWindow?.postMessage({ source: 'atlas', type }, window.location.origin);
  const fullScreen = () => { frameRef.current?.requestFullscreen?.().catch(() => {}); };

  return (
    <div className="lb-layer">
      <SplatCone id={hotspot.id} winRef={winRef} />
      <figure
        ref={winRef}
        className={`float lb splat${winSheet ? ' is-sheet' : ''}${winDragging ? ' is-dragging' : ''}`}
        {...winHandlers}
        style={winStyle}
        role="dialog"
        aria-label={`3D scan: ${hotspot.title}`}
        tabIndex={-1}
      >
        <div className="float__bar lb__bar">
          {winSheet ? (
            <span className="float__meta splat__title">{hotspot.title}</span>
          ) : (
            <span className="float__meta lb__grip" aria-hidden="true">
              <svg width="10" height="6" viewBox="0 0 10 6" fill="currentColor"><rect x="0" y="0" width="10" height="1"/><rect x="0" y="5" width="10" height="1"/></svg>
              Drag
            </span>
          )}
          <span className="float__actions">
            <button className="link" onClick={() => tell('reset')} disabled={status !== 'ready'} aria-label="Reset scan view">Reset</button>
            {!winSheet && <button className="link" onClick={fullScreen} aria-label="Show scan full screen">Full screen</button>}
            <a className="link link--plain" href={splatViewerUrl(hotspot)} target="_blank" rel="noreferrer"
               aria-label="Open the scan in a new tab">New tab&nbsp;↗</a>
            <button className="link" onClick={onClose}>Close</button>
          </span>
        </div>
        <div className="splat__frame">
          {/* Unmounted on close; the embed destroys its viewer and frees the GPU memory */}
          <iframe
            ref={frameRef}
            src={splatEmbedUrl(hotspot)}
            title={`3D scan: ${hotspot.title}`}
            className="splat__el"
            allow="fullscreen; xr-spatial-tracking"
          />
          {status !== 'ready' && (
            <div className="splat__loading" role="status">
              {status === 'error' ? (
                <span className="splat__loading-label">Scan could not be loaded</span>
              ) : (
                <>
                  <span className="splat__loading-label">Loading scan</span>
                  <span className="splat__loading-pct">{progress > 0 ? `${Math.round(progress)}%` : ''}</span>
                  <span className="splat__loading-bar"><span style={{ transform: `scaleX(${progress / 100})` }} /></span>
                </>
              )}
            </div>
          )}
        </div>
        {!winSheet && (
          <figcaption className="lb__cap splat__cap">
            <span><span className="dot" aria-hidden="true" />3D scan&ensp;{hotspot.title}</span>
            <span className="splat__hint">Drag to look · Scroll to move</span>
          </figcaption>
        )}
      </figure>
    </div>
  );
}

/**
 * The scan window's view cone: from the scanned spot on the facade to the window's two
 * outermost corners, so the window reads as a view from inside the building at that point.
 * Redrawn every frame (camera and window both move) by writing the SVG attributes directly.
 */
function SplatCone({ id, winRef }: { id: string; winRef: React.RefObject<HTMLElement | null> }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const coneRef = useRef<SVGPolygonElement>(null);
  const edgeRef = useRef<SVGPathElement>(null);
  const footRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const svg = svgRef.current, win = winRef.current;
      const p = splatAnchor(id);
      const r = win?.getBoundingClientRect();
      const visible = !!(p && r && r.width > 0 && win!.style.visibility !== 'hidden' &&
        !(p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom));
      if (svg) svg.style.opacity = visible ? '1' : '0';
      if (!visible) return;

      // Corners seen from the spot: the two with the widest angle between them frame the cone
      const corners = [[r!.left, r!.top], [r!.right, r!.top], [r!.right, r!.bottom], [r!.left, r!.bottom]];
      const mid = Math.atan2((r!.top + r!.bottom) / 2 - p!.y, (r!.left + r!.right) / 2 - p!.x);
      const rel = corners.map(([x, y]) => {
        let a = Math.atan2(y - p!.y, x - p!.x) - mid;
        while (a > Math.PI) a -= 2 * Math.PI;
        while (a <= -Math.PI) a += 2 * Math.PI;
        return a;
      });
      const a = corners[rel.indexOf(Math.min(...rel))];
      const b = corners[rel.indexOf(Math.max(...rel))];
      coneRef.current?.setAttribute('points', `${p!.x},${p!.y} ${a[0]},${a[1]} ${b[0]},${b[1]}`);
      edgeRef.current?.setAttribute('d', `M${a[0]},${a[1]} L${p!.x},${p!.y} L${b[0]},${b[1]}`);
      footRef.current?.setAttribute('cx', String(p!.x));
      footRef.current?.setAttribute('cy', String(p!.y));
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [id, winRef]);

  return (
    <svg ref={svgRef} className="splat-cone" aria-hidden="true">
      <polygon ref={coneRef} className="splat-cone__fill" />
      <path ref={edgeRef} className="splat-cone__edge" />
      <circle ref={footRef} r="5" className="splat-cone__foot" />
    </svg>
  );
}

function PickToast({ pick, onDismiss }: {
  pick: { lat: number; lng: number; height: number };
  onDismiss: () => void;
}) {
  const snippet = `lat: ${pick.lat}, lng: ${pick.lng}, height: ${pick.height},`;
  return (
    <div className="devcard toast" role="status">
      <div className="devcard__head">
        <span className="devcard__title"><span className="dot" aria-hidden="true" />Position picked</span>
        <button className="link" onClick={onDismiss}>Dismiss</button>
      </div>
      <pre className="devcard__code">{snippet}</pre>
      <button className="devcard__btn" onClick={() => navigator.clipboard.writeText(snippet)}>
        Copy to clipboard
      </button>
    </div>
  );
}

function CameraToast({ capture, defaultId, projects, onDismiss }: {
  capture: Record<string, number>;
  defaultId: number | null;
  projects: HousingProject[];
  onDismiss: () => void;
}) {
  const [assignedId, setAssignedId] = useState<string>(defaultId != null ? String(defaultId) : '');
  const snippet = `  ${assignedId || '??'}: { lat: ${capture.lat}, lng: ${capture.lng}, height: ${capture.height}, pitch: ${capture.pitch}, heading: ${capture.heading} },`;
  const assignedProject = projects.find(p => p.id === Number(assignedId));

  return (
    <div className="devcard toast" role="status">
      <div className="devcard__head">
        <span className="devcard__title"><span className="dot" aria-hidden="true" />Camera captured</span>
        <button className="link" onClick={onDismiss}>Dismiss</button>
      </div>
      <div className="devcard__meta">
        h={capture.height}m · pitch={capture.pitch}° · heading={capture.heading}°
      </div>
      <label className="devcard__field">
        <span className="devcard__label">Assign to project</span>
        <select value={assignedId} onChange={e => setAssignedId(e.target.value)} className="devcard__select">
          <option value="">— pick a project —</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.id}. {p.name}</option>)}
        </select>
        {assignedProject && <span className="devcard__meta">{assignedProject.city}</span>}
      </label>
      <pre className="devcard__code">{snippet}</pre>
      <button className="devcard__btn" onClick={() => navigator.clipboard.writeText(snippet)}>
        Copy to clipboard
      </button>
    </div>
  );
}
