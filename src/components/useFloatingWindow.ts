import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Below this width floating windows become fixed bottom sheets (no drag). Matches App.css. */
export const SHEET_BREAKPOINT = 1024;
const MARGIN = 24;
const EDGE = 16;
const BAR_H = 36;
const MIN_BESIDE = 340; // narrowest window worth placing beside an avoided point
const PIN_TAG_W = 150;  // the 3D scan pin's tag (icon + scan title), to the right of its point
const CREDITS_H = 28;   // the map attribution along the bottom-right edge

const isSheetWidth = () => window.innerWidth < SHEET_BREAKPOINT;

/**
 * One floating window at a time: whoever opens one announces it, and the owners of the
 * other kinds close theirs (image lightbox in ProjectPanel; video and 3D scan in App).
 */
export type FloatKind = 'image' | 'video' | 'splat';
export const FLOAT_OPEN_EVENT = 'atlas:float-open';
export const announceFloatOpen = (kind: FloatKind) =>
  window.dispatchEvent(new CustomEvent<FloatKind>(FLOAT_OPEN_EVENT, { detail: kind }));

type Area = { left: number; top: number; right: number; bottom: number };

/**
 * The visible map area (the `.map` element, falling back to the viewport), minus the
 * masthead: whichever of "right of it" or "below it" fits `prefW` better.
 */
function freeArea(prefW = 0): Area {
  const r = document.querySelector('.map')?.getBoundingClientRect();
  const map: Area = r && r.width > 0 && r.height > 0
    ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  // Only the masthead: the intro under it gives way on the first touch of the map anyway
  const lc = document.querySelector('.masthead')?.getBoundingClientRect();
  if (!lc || lc.height === 0 || lc.right <= map.left || lc.bottom <= map.top) return map;
  const right: Area = { ...map, left: Math.max(map.left, lc.right) };
  const below: Area = { ...map, top: Math.max(map.top, lc.bottom) };
  const score = (a: Area) => Math.min(prefW, a.right - a.left - MARGIN * 2) * (a.bottom - a.top);
  return score(right) >= score(below) ? right : below;
}

export interface FloatingWindowOptions {
  /** Width / height of the content, so the window is also sized to fit the free height. */
  aspect?: number;
  /** Height of everything that is not content (bar, caption), used with `aspect`. */
  chromeH?: number;
  /** Screen point to keep clear (e.g. the clicked hotspot): the window opens on the other side. */
  avoid?: { x: number; y: number };
  /** Grow the opening size by this factor (after fitting beside `avoid`), up to the free area. */
  scale?: number;
  /** Open in the bottom-right corner of the free area (clear of the attribution) instead of at random. */
  corner?: 'bottom-right';
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

/**
 * Placement + drag for the floating windows (image lightbox, video).
 * - Width fits the free map area; height is measured after mount, so the window
 *   is placed at a random spot that actually fits, then kept on screen as its
 *   content (e.g. a late-loading image) changes size.
 * - Dragging uses pointer events with pointer capture (mouse, pen and touch)
 *   and is clamped to the viewport.
 * - On narrow screens the window is a fixed full-width sheet instead.
 * - Focus moves into the window on open and returns to the opener on close.
 */
export function useFloatingWindow(preferredW: number, opts: FloatingWindowOptions = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState(isSheetWidth);
  const [pos, setPos] = useState(() => {
    const a = freeArea(preferredW);
    let maxW = a.right - a.left - MARGIN * 2;
    if (opts.aspect) maxW = Math.min(maxW, (a.bottom - a.top - MARGIN * 2 - (opts.chromeH ?? 0)) * opts.aspect);
    let w = Math.min(preferredW, maxW);
    // Keep the avoided point uncovered: narrow the window to the wider side of it (if that
    // still leaves a usable window), so whatever points at it stays visible
    const avoidRight = !!opts.avoid && opts.avoid.x < (a.left + a.right) / 2;
    if (opts.avoid) {
      const side = avoidRight ? a.right - opts.avoid.x - MARGIN * 2 : opts.avoid.x - a.left - MARGIN * 2;
      // To the right also clear the pin's tag, which hangs right of the point, when there is room
      const roomy = avoidRight ? side - PIN_TAG_W : side;
      if (roomy >= MIN_BESIDE) w = Math.min(w, roomy);
      else if (side >= MIN_BESIDE) w = Math.min(w, side);
    }
    if (opts.scale) w = Math.min(w * opts.scale, maxW);
    w = Math.round(Math.max(280, w));
    const slack = Math.max(0, a.right - a.left - w - MARGIN * 2);
    const x = opts.corner ? a.right - MARGIN - w
      : opts.avoid ? a.left + MARGIN + (avoidRight ? slack : 0)
      : a.left + MARGIN + Math.random() * slack;
    return { x: Math.round(x), y: a.top + MARGIN, w, corner: opts.corner, placed: false };
  });
  const drag = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Track the sheet breakpoint
  useEffect(() => {
    const onResize = () => setSheet(isSheetWidth());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // First placement, once the real height is known
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || pos.placed) return;
    const a = freeArea(pos.w);
    const h = el.offsetHeight;
    const y = pos.corner ? a.bottom - h - MARGIN - CREDITS_H
      : a.top + MARGIN + Math.random() * Math.max(0, a.bottom - a.top - h - MARGIN * 2);
    setPos(p => ({ ...p, y: Math.round(clamp(y, EDGE, window.innerHeight - h - EDGE)), placed: true }));
  }, [pos.placed, pos.w, pos.corner]);

  // Keep it on screen when its own size or the viewport changes
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const keepInView = () => {
      if (drag.current) return;
      const h = el.offsetHeight;
      setPos(p => {
        // A corner window stays anchored to its corner (e.g. as its image loads) until dragged
        const a = p.corner && p.placed ? freeArea(p.w) : null;
        const x = clamp(a ? a.right - MARGIN - p.w : p.x, 0, window.innerWidth - p.w);
        const y = clamp(a ? a.bottom - h - MARGIN - CREDITS_H : p.y, EDGE, window.innerHeight - h - EDGE);
        return x === p.x && y === p.y ? p : { ...p, x, y };
      });
    };
    const ro = new ResizeObserver(keepInView);
    ro.observe(el);
    window.addEventListener('resize', keepInView);
    return () => { ro.disconnect(); window.removeEventListener('resize', keepInView); };
  }, []);

  // Focus in on open, back to the opener on close
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = ref.current;
    // Next frame: the window is visibility:hidden until it has been placed
    const raf = requestAnimationFrame(() => el?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(raf);
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (sheet || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, a, video, input')) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
    setDragging(true);
    setPos(p => ({ ...p, corner: undefined })); // moved by hand: no longer held in its corner
  }, [sheet, pos.x, pos.y]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const x = clamp(d.ox + e.clientX - d.sx, 0, window.innerWidth - pos.w);
    const y = clamp(d.oy + e.clientY - d.sy, 0, window.innerHeight - BAR_H);
    setPos(p => ({ ...p, x, y }));
  }, [pos.w]);

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  const style: React.CSSProperties = sheet
    ? {}
    : { left: pos.x, top: pos.y, width: pos.w, visibility: pos.placed ? 'visible' : 'hidden' };

  return {
    ref,
    sheet,
    dragging,
    style,
    handlers: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag },
  };
}
