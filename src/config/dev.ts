// Developer tooling (drawing-alignment editor, C-key camera capture) is only
// available in `npm run dev`, or on any build when the URL has `?dev`.
export const DEV_TOOLS: boolean =
  import.meta.env.DEV ||
  (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('dev'));
