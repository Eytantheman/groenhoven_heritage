import { useEffect, useRef } from 'react';
import { SPLAT_HOTSPOTS, openSplat, splatAnchor } from '../config/splat-hotspots';

// Styling lives in src/App.css (.scan-pin).

// Where the leader's foot sits inside a pin, from its top-left (right-hanging tag) or
// top-right (left-hanging tag) corner: plate 34 px, leader 20 px, 7 px foot square.
const FOOT_X = 16.5;
const FOOT_Y = 34 + 20 + 3.5;

/**
 * 3D-scan pins: a paper tag (immersive-view icon + the scan's title) on a leader down to an
 * accent square on the scanned spot. Real HTML over the map, so the text is rendered by the
 * browser at the screen's own resolution (a WebGL billboard is drawn at the map's lower
 * resolution and scaled up, which blurs small type). Repositioned every frame.
 */
export function SplatPins() {
  const layerRef = useRef<HTMLDivElement>(null);
  const pinRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    let raf = 0;
    const place = () => {
      raf = requestAnimationFrame(place);
      const box = layerRef.current?.getBoundingClientRect();
      if (!box) return;
      for (const h of SPLAT_HOTSPOTS) {
        const el = pinRefs.current[h.id];
        if (!el) continue;
        const p = splatAnchor(h.id);
        if (!p) { el.style.visibility = 'hidden'; continue; }
        const x = Math.round(p.x - box.left), y = Math.round(p.y - box.top);
        el.style.visibility = 'visible';
        el.style.transform = h.tagSide === 'left'
          ? `translate(${x + FOOT_X}px, ${y - FOOT_Y}px) translateX(-100%)`
          : `translate(${x - FOOT_X}px, ${y - FOOT_Y}px)`;
      }
    };
    place();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={layerRef} className="scan-pins">
      {SPLAT_HOTSPOTS.map(h => (
        <div key={h.id} ref={el => { pinRefs.current[h.id] = el; }}
             className={`scan-pin${h.tagSide === 'left' ? ' is-left' : ''}`} style={{ visibility: 'hidden' }}>
          {/* Not a tab stop: the project panel's "3D scan" rows are the keyboard way in */}
          <button className="scan-pin__tag" tabIndex={-1} aria-label={`Enter 3D scan: ${h.title}`}
                  onClick={() => openSplat({ id: h.id, at: splatAnchor(h.id) ?? undefined })}>
            <span className="scan-pin__plate"><ScanIcon /></span>
            <span className="scan-pin__label">{h.title}</span>
          </button>
          <span className="scan-pin__leader" aria-hidden="true" />
          <span className="scan-pin__foot" aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}

/** Isometric volume inside an orbit — "step inside, look around" */
function ScanIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <path d="M17 10.5 L23.5 14.27 L23.5 20.77 L17 23.5 L10.5 20.77 L10.5 14.27 Z M10.5 14.27 L17 18.04 L23.5 14.27 M17 18.04 L17 23.5"
            fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M29.11 19.54 A12.5 4.2 0 0 1 4.89 19.54" fill="none" stroke="var(--accent)" strokeWidth="1.4" />
      <path d="M3.39 16.34 L7.29 18.94 L2.69 20.74 Z" fill="var(--accent)" />
    </svg>
  );
}
