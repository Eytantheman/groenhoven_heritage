import { useState, useEffect, useRef, type ReactNode } from 'react';
import type { HousingProject } from '../types';
import { PANEL_CONTENT } from '../data/panel-content';
import type { CamPos } from '../data/panel-content';
import { IMAGE_PLANES } from '../config/image-planes';
import { SPLAT_HOTSPOTS, openSplat, splatAnchor } from '../config/splat-hotspots';
import { START_THUMB } from '../config/start';
import { useFloatingWindow, announceFloatOpen, FLOAT_OPEN_EVENT, SHEET_BREAKPOINT } from './useFloatingWindow';
import type { FloatKind } from './useFloatingWindow';

// Styling lives in src/App.css (.panel, .axo, .thumb, .lb …) — see DESIGN.md.

interface Props {
  project: HousingProject | null;
  tools: ReactNode; // the map controls (3D/2D, drawings, north), shown in the panel's top row
  visiblePlanes: Record<string, boolean>;
  onSetPlane: (id: string, on: boolean) => void;
}

/** ImagePlane id for an image that is situated in the 3D model, if any */
const planeIdFor = (src: string) => IMAGE_PLANES.find(p => p.imageUrl === src)?.id;

export function ProjectPanel({ project, tools, visiblePlanes, onSetPlane }: Props) {
  const [visible, setVisible] = useState(false);
  const [shown, setShown]     = useState<HousingProject | null>(null);
  const [axoIdx, setAxoIdx]   = useState(0);
  // Desktop opens with the start image (config/start.ts) in a small window in the map's
  // bottom-right corner; on phones a window would be a sheet over the view, so none.
  const [lbImg, setLbImg]     = useState<{ src: string; cap: string; camPos?: CamPos; planeId?: string; start?: boolean } | null>(() =>
    START_THUMB && window.innerWidth >= SHEET_BREAKPOINT
      ? { src: START_THUMB.src, cap: START_THUMB.caption, camPos: START_THUMB.camPos, planeId: planeIdFor(START_THUMB.src), start: true }
      : null);
  // The drawing last put on the model from "show in place"; it comes off again
  // as soon as another image is opened.
  const [placedId, setPlacedId] = useState<string | null>(null);

  function openImage(src: string, cap: string, camPos?: CamPos) {
    // If this image is also registered as a 3D image-plane drawing, the lightbox
    // gets a "show in place" toggle that projects it onto the model.
    const planeId = planeIdFor(src);
    if (placedId && placedId !== planeId) {
      onSetPlane(placedId, false);
      setPlacedId(null);
    }
    announceFloatOpen('image');
    setLbImg({ src, cap, camPos, planeId });
    if (camPos) window.dispatchEvent(new CustomEvent('cesium:image-cam', { detail: { ...camPos, id: Date.now() } }));
  }
  const timerRef              = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Presentation only: scroll container (reset per project) and the phone
  // bottom-sheet "peek" state (collapsed to its header so the building shows).
  const scrollRef             = useRef<HTMLDivElement>(null);
  const [peek, setPeek]       = useState(false);

  useEffect(() => {
    clearTimeout(timerRef.current);
    // A window belongs to the project it was opened from
    setLbImg(img => img && project && [...(PANEL_CONTENT[project.id]?.axos ?? []), ...(PANEL_CONTENT[project.id]?.thumbs ?? [])]
      .some(i => i.src === img.src) ? img : null);
    if (project) {
      setShown(project);
      setAxoIdx(0);
      setPeek(false);
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      timerRef.current = setTimeout(() => setShown(null), 400);
    }
    return () => clearTimeout(timerRef.current);
  }, [project]);

  useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent<FloatKind>).detail !== 'image') setLbImg(null); };
    window.addEventListener(FLOAT_OPEN_EVENT, h);
    return () => window.removeEventListener(FLOAT_OPEN_EVENT, h);
  }, []);

  useEffect(() => {
    if (!lbImg) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setLbImg(null); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [lbImg]);

  if (!shown) return null;

  const content  = PANEL_CONTENT[shown.id];
  const axos     = content?.axos ?? [];
  const thumbs   = content?.thumbs ?? [];
  const sources  = content?.sources ?? [];
  const scans    = SPLAT_HOTSPOTS.filter(h => h.projectId === shown.id);
  const axo      = axos[axoIdx];
  const bodyText = content?.description ?? shown.description;
  const paras    = bodyText ? bodyText.split('\n\n').filter(Boolean) : [];
  const coords   = formatCoords(shown.lat, shown.lng);

  function switchAxo(delta: number) {
    setAxoIdx(i => (i + delta + axos.length) % axos.length);
  }

  // 'on' when the thumb's drawing is currently shown on the model, 'off' when it could be
  function situation(src: string): 'on' | 'off' | undefined {
    const id = planeIdFor(src);
    return id ? (visiblePlanes[id] ? 'on' : 'off') : undefined;
  }

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const isEmpty = !axo && paras.length === 0 && !shown.note && thumbs.length === 0 && scans.length === 0 && sources.length === 0;

  return (
    <>
      {/* Outer shell: handles the slide animation. Does NOT scroll. */}
      <aside className={`panel${visible ? ' is-visible' : ''}${peek ? ' is-peek' : ''}`} aria-label={`Project: ${shown.name}`}>

        {/* Inner panel — this part scrolls */}
        <div className="panel__scroll" ref={scrollRef}>

          {/* Header */}
          <header className="panel__head">
            <div className="panel__kicker">
              {tools}
              <button className="link panel__peek"
                      onClick={() => { setPeek(v => !v); if (scrollRef.current) scrollRef.current.scrollTop = 0; }}
                      aria-expanded={!peek}>
                {peek ? 'Expand' : 'Collapse'}
              </button>
            </div>
            <dl className="meta">
              <MetaItem label="Architect" value={shown.architect} />
              <MetaItem label={content?.period ? 'Period' : 'Era'} value={content?.period ?? shown.era} />
              {(content?.programme || shown.social_org) &&
                <MetaItem label="Programme" value={content?.programme ?? shown.social_org!} />}
              {(content?.units || shown.scale) &&
                <MetaItem label="Units" value={content?.units ?? shown.scale!} />}
              {coords && <MetaItem label="Coordinates" value={coords} full />}
            </dl>
          </header>

          {/* Axo carousel */}
          {axo && (
            <figure className="axo">
              <button className="axo__frame" onClick={() => openImage(axo.src, axo.caption)} aria-label="Enlarge axonometric drawing">
                <SafeImg key={axo.src} src={axo.src} alt={`Axonometric drawing: ${axo.caption}`} />
              </button>

              <figcaption className="axo__cap">
                <div className="axo__row">
                  <span className="cap">Axonometric {pad2(axoIdx + 1)} / {pad2(axos.length)}</span>
                  {axos.length > 1 && (
                    <span className="axo__nav">
                      <AxoBtn onClick={e => { e.stopPropagation(); switchAxo(-1); }} dir="prev" />
                      <AxoBtn onClick={e => { e.stopPropagation(); switchAxo(1);  }} dir="next" />
                    </span>
                  )}
                </div>
                <p className="axo__text">{axo.caption}</p>
                <div className="axo__row">
                  {axos.length > 1 ? (
                    <span className="axo__dots">
                      {axos.map((_, i) => (
                        <button key={i} onClick={() => setAxoIdx(i)}
                                className={`axo__dot${i === axoIdx ? ' is-active' : ''}`}
                                aria-label={`Drawing ${i + 1}`} aria-current={i === axoIdx ? 'true' : undefined}>
                          {pad2(i + 1)}
                        </button>
                      ))}
                    </span>
                  ) : <span />}
                  <a href={axo.pdfUrl} target="_blank" rel="noopener" className="link cap">
                    Download PDF
                  </a>
                </div>
              </figcaption>
            </figure>
          )}

          {/* Description */}
          {paras.length > 0 && (
            <div className="panel__text">
              {paras.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          )}
          {shown.note && (
            <div className="panel__note">
              <span className="cap">Note</span>
              <p>{shown.note}</p>
            </div>
          )}

          {/* 3D scans — the in-map pin's keyboard / screen-reader twin, and the focus target on close */}
          {scans.length > 0 && (
            <section className="scans" aria-label="3D scans">
              <h3 className="section-head">
                <span>3D scan</span>
                <span>{pad2(scans.length)}</span>
              </h3>
              {scans.map(sc => (
                <button key={sc.id} className="scan-row" onClick={() => openSplat({ id: sc.id, at: splatAnchor(sc.id) ?? undefined })}>
                  <span className="dot" aria-hidden="true" />
                  <span className="scan-row__title">{sc.title}</span>
                  <span className="scan-row__go">Enter&nbsp;→</span>
                </button>
              ))}
            </section>
          )}

          {/* Archive thumbnails */}
          {thumbs.length > 0 && (
            <section className="archive" aria-label={content?.archiveTitle ?? 'Archive'}>
              <h3 className="section-head">
                <span>{content?.archiveTitle ?? 'Archive'}</span>
                <span>{pad2(thumbs.length)}</span>
              </h3>
              <div className="archive__grid">
                {thumbs.map((t, i) => (
                  <Thumb key={i} src={t.src} caption={t.caption} camPos={t.camPos}
                         situated={situation(t.src)}
                         onOpen={(src, cap, camPos) => openImage(src, cap, camPos)} />
                ))}
              </div>
            </section>
          )}

          {/* Other sources — press, archive records, blogs, social accounts; links only */}
          {sources.length > 0 && (
            <section className="sources" aria-label="Other sources">
              <h3 className="section-head">
                <span>Other sources</span>
                <span>{pad2(sources.length)}</span>
              </h3>
              <ul className="sources__list">
                {sources.map(s => (
                  <li key={s.url}>
                    <a className="source" href={s.url} target="_blank" rel="noopener noreferrer">
                      <span className="source__kind">{s.kind}</span>
                      <span className="source__body">
                        <span className="source__title">{s.title}</span>
                        <span className="source__meta">{s.publisher}{s.date ? ` · ${s.date}` : ''}</span>
                      </span>
                      <span className="source__go" aria-hidden="true">↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {isEmpty && (
            <p className="empty panel__empty">
              Documentation for this project is still being assembled.
            </p>
          )}

          <div className="panel__end" />
        </div>{/* end inner scrollable */}
      </aside>{/* end outer shell */}

      {lbImg && (
        <ImageLightbox
          key={lbImg.src}
          src={lbImg.src} caption={lbImg.cap} start={lbImg.start} onClose={() => setLbImg(null)}
          planeId={lbImg.planeId}
          shown={lbImg.planeId ? !!visiblePlanes[lbImg.planeId] : false}
          onToggleInPlace={lbImg.planeId ? () => {
            const id = lbImg.planeId!;
            if (visiblePlanes[id]) {
              onSetPlane(id, false);
              if (placedId === id) setPlacedId(null);
            } else {
              // Put it in the model and get the window out of the way
              onSetPlane(id, true);
              setPlacedId(id);
              setLbImg(null);
            }
          } : undefined}
        />
      )}
    </>
  );
}

/* ── Image lightbox (red-framed, randomly positioned) ── */

function ImageLightbox({ src, caption, start, onClose, planeId, shown, onToggleInPlace }: {
  src: string; caption: string; start?: boolean; onClose: () => void;
  planeId?: string; shown?: boolean; onToggleInPlace?: () => void;
}) {
  // Placement, clamping, pointer drag, phone sheet and focus handling
  const { ref: winRef, sheet: winSheet, dragging: winDragging, style: winStyle, handlers: winHandlers } = useFloatingWindow(start ? 340 : 600, start ? { corner: 'bottom-right' } : {});
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    // Capture phase + stopPropagation: Escape leaves full screen only, instead of
    // also reaching the panel's listener that closes the whole lightbox.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setFullscreen(false);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [fullscreen]);

  return (
    <div className="lb-layer">
      <div
        ref={winRef}
        className={`float lb${winSheet ? ' is-sheet' : ''}${winDragging ? ' is-dragging' : ''}`}
        {...winHandlers}
        role="dialog"
        aria-label={caption || 'Enlarged image'}
        tabIndex={-1}
        style={winStyle}
      >
        <div className="float__bar lb__bar">
          {winSheet ? (
            <span className="float__meta">Image</span>
          ) : (
            <span className="float__meta lb__grip" aria-hidden="true">
              <svg width="10" height="6" viewBox="0 0 10 6" fill="currentColor"><rect x="0" y="0" width="10" height="1"/><rect x="0" y="5" width="10" height="1"/></svg>
              Drag
            </span>
          )}
          <span className="float__actions">
            <button onClick={() => setFullscreen(true)} title="Full screen" className="link">Full screen</button>
            <button onClick={onClose} title="Close" className="link">Close</button>
          </span>
        </div>
        <SafeImg key={src} src={src} alt={caption} draggable={false} className="lb__img" />
        {planeId && (
          <button onClick={onToggleInPlace} aria-pressed={!!shown}
                  className={`lb__inplace${shown ? ' is-on' : ''}`}>
            <span className="tool__mark" aria-hidden="true" />
            {shown ? 'Showing in place on model' : 'Show in place on model'}
          </button>
        )}
        {caption && (
          <p className="lb__cap">{displayCaption(caption)}</p>
        )}
      </div>

      {fullscreen && (
        <div className="lb-full" onClick={() => setFullscreen(false)} role="dialog" aria-label="Full screen image">
          <img src={src} alt={caption} draggable={false} onClick={e => e.stopPropagation()}
               className="lb-full__img"
               style={{ maxHeight: caption ? 'calc(100% - 40px)' : '100%' }} />
          {caption && (
            <p className="lb-full__cap" onClick={e => e.stopPropagation()}>
              {displayCaption(caption)}
            </p>
          )}
          <button onClick={() => setFullscreen(false)} title="Close full screen" className="link lb-full__close">
            Close
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function MetaItem({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={`meta__item${full ? ' meta__item--full' : ''}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function AxoBtn({ onClick, dir }: { onClick: React.MouseEventHandler; dir: 'prev' | 'next' }) {
  return (
    <button onClick={onClick} className="axo__arrow" aria-label={dir === 'prev' ? 'Previous drawing' : 'Next drawing'}>
      <svg width="14" height="8" viewBox="0 0 14 8" stroke="currentColor" strokeWidth="1" fill="none" aria-hidden="true">
        {dir === 'prev'
          ? <><line x1="1" y1="4" x2="14" y2="4"/><polyline points="4.5,0.5 1,4 4.5,7.5"/></>
          : <><line x1="0" y1="4" x2="13" y2="4"/><polyline points="9.5,0.5 13,4 9.5,7.5"/></>}
      </svg>
    </button>
  );
}

function Thumb({ src, caption, camPos, situated, onOpen }: {
  src: string; caption: string; camPos?: CamPos; situated?: 'on' | 'off';
  onOpen: (src: string, cap: string, camPos?: CamPos) => void;
}) {
  const label = (camPos ? `Enlarge and fly to view: ${caption}` : `Enlarge: ${caption}`)
    + (situated ? ` (situated in the 3D model${situated === 'on' ? ', shown' : ''})` : '');
  return (
    <figure className="thumb">
      <button className="thumb__frame" onClick={() => onOpen(src, caption, camPos)} aria-label={label}>
        <SafeImg src={src} alt="" loading="lazy" />
        {camPos && <span className="thumb__tag">View</span>}
        {situated && (
          <span className={`thumb__tag thumb__tag--situated${situated === 'on' ? ' is-on' : ''}`}>
            {situated === 'on' ? 'On model' : 'Situated'}
          </span>
        )}
      </button>
      <figcaption className="thumb__cap">{displayCaption(caption)}</figcaption>
    </figure>
  );
}

/* Image with a quiet loading tone and a typeset error state */
function SafeImg(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  if (state === 'error') {
    return <span className="img-missing" role="img" aria-label={props.alt || 'Image unavailable'}>Image unavailable</span>;
  }
  return (
    <img
      {...props}
      className={`${props.className ?? ''} img-${state}`.trim()}
      onLoad={() => setState('ready')}
      onError={() => setState('error')}
    />
  );
}

/* ── Helpers ── */

/** Display-only: a caption that is just "<index> unknown" / "<index> author unknown" reads "<index>  Source unknown". */
function displayCaption(cap: string): string {
  const m = cap.match(/^(\S+)\s+(?:author\s+)?unknown\.?$/i);
  return m ? `${m[1]}  Source unknown` : cap;
}

function formatCoords(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null;
  const fmt = (deg: number, dir: [string, string]) => {
    const d = Math.floor(Math.abs(deg));
    const m = Math.floor((Math.abs(deg) - d) * 60);
    const s = ((Math.abs(deg) - d - m / 60) * 3600).toFixed(1);
    return `${d}°${m}′${s}″${deg >= 0 ? dir[0] : dir[1]}`;
  };
  return `${fmt(lat, ['N', 'S'])}  ${fmt(lng, ['E', 'W'])}`;
}
