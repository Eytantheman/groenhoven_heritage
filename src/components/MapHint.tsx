import { useState } from 'react';

// Styling lives in src/App.css (.map-hint).

const KEY = 'atlas:map-hint-dismissed';

/** How to move through the 3D model — mouse on desktop, gestures on touch screens. Dismissible. */
export function MapHint() {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(KEY) !== '1'; } catch { return true; }
  });
  if (!open) return null;

  const touch = window.matchMedia('(pointer: coarse)').matches;
  const items: [string, string][] = touch
    ? [['Drag', 'Move'], ['Pinch', 'Zoom'], ['Two-finger twist', 'Rotate'], ['Two-finger drag', 'Tilt']]
    : [['Drag', 'Move'], ['Scroll', 'Zoom'], ['Ctrl + drag', 'Rotate & tilt']];

  function dismiss() {
    setOpen(false);
    try { localStorage.setItem(KEY, '1'); } catch { /* no storage: hide for this visit only */ }
  }

  return (
    <div className="map-hint" role="note" aria-label="Map controls">
      <ul className="map-hint__list">
        {items.map(([how, what]) => (
          <li key={how}><span className="map-hint__how">{how}</span>{what}</li>
        ))}
      </ul>
      <button className="link map-hint__close" onClick={dismiss} aria-label="Hide map controls hint">Hide</button>
    </div>
  );
}
