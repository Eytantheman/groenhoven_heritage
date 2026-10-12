# Design brief

## Character
Simple, confident, editorial. The feel of a contemporary museum or architecture school
website: content first, typography-led, quietly fashionable.

## Reference mood
Contemporary museum and Kunsthalle websites, architecture school and biennale sites,
independent design studios, and art book publishers. Swiss/International style, updated.

Reference sites:
- OMA — https://www.oma.com/

## Tokens
- Colors: black #0A0A0A, off-white #F5F4F0, mid grey #8A8A85, rule line #D9D8D3
- One accent, used rarely: #FF4F00 (signal orange)
- Fonts: "Inter Tight" for headings and body, "IBM Plex Mono" for captions and metadata
- Type scale: 12 / 14 / 16 / 20 / 32 / 56 / 96px
- Spacing scale: 4, 8, 16, 24, 40, 64, 120px
- Border radius: 0
- Grid: 12 columns, 24px gutter, generous outer margins

## Rules
- Max 2 font weights per page (regular + medium)
- Headlines tight (letter-spacing -0.02em), body line length max 70 characters
- Captions and metadata in mono, small, often uppercase
- Separate sections with 1px rules or whitespace, never boxes
- Images with sharp corners and a caption

## Never use
Gradients, drop shadows, glassmorphism, rounded cards, pill buttons, emoji,
generic icon packs, stock photos, centered long text, startup-style hero sections.

## Implementation in this app (The Architectural Heritage of Groenhoven)
The 3D model is the image; the interface is a set of paper sheets laid over it.

- **Sheets, not cards.** Masthead, intro, index and project panel are flat `--paper` (#F5F4F0)
  planes with ink type, 1px rules and square corners. No blur, no shadow, no transparency.
- **The map is never hidden behind a sheet.** The Cesium canvas (`.map`) is inset to the
  area the sheets leave free, so the camera's centre of view is the centre of the visible map.
- **Layouts.** >=1280px: map | index (288) | panel (440); opening a project pushes the index left
  into a two-page spread. 1024-1279px: the panel slides over the index. <1024px (phones and
  tablet portrait): the index is a bottom bar that opens into a drawer; the project is a
  bottom sheet above that bar (55% height) with a Collapse/Expand "peek" state; the masthead
  hides while a project is open.
- **Wall label.** Title + mono subtitle top-left; the intro sits under it as wall text with a
  mono Close, and also gives way on the first touch of the map, opening the index, or after 28s.
  Tile loading (1px accent progress rule, % only once >0) and "Tiles stalled" (accent square +
  underlined "Reload tiles", shown only after 8s without progress) are a status line on the label.
- **Index.** Grouped by city (mono heading + count) in the curated geographic order; rows are
  names only. The selected row inverts to ink with an accent square.
- **Project panel.** Mono kicker (No. / city / Close), 32px title, ruled definition list,
  axonometric on a white sheet with a catalogue caption, a 20px lede when there are several
  paragraphs, archive as a catalogue grid with captions always visible ("01.2  Source unknown"
  where the source is missing). A "View" tag marks images that also move the camera.
- **Floating windows** (image lightbox, video) share one frame: paper, 1px ink border, mono bar
  as the drag handle (pointer events: mouse, pen, touch). They open in the free map area at a
  measured, clamped position, take focus and return it on close. Below 1024px they are fixed
  full-width sheets. Full screen is solid ink.
- **Map attribution** is always visible (required by the Google / Cesium ion terms) but minimal:
  no strip, small white mono type straight on the map at the bottom-right, with a faint dark
  halo for legibility (provider logos are white artwork).
- **Backdrop.** Behind the tiles the scene is `#D9D8D3` (rule grey), so the sky on tilted
  views reads as a studio backdrop rather than a rendering failure.
- **Accent use.** Signal orange only for state markers (small squares), slider thumbs, the
  progress rule, the focus ring (with a 2px ink inner ring) and the in-scene video hotspot frame.
- **Type scale.** 12 (mono captions/metadata), 14 (UI, metadata values), 16 (body), 20 (lede,
  intro, phone title), 32 (titles). Developer tools may go smaller.
- **Developer tools** (drawing-alignment editor, C-key camera capture) only exist in `npm run dev`
  or with `?dev` in the URL; they are inverted ink cards in mono.
- **Contrast.** `#8A8A85` fails AA for small text on paper, so small metadata uses
  `--grey-ink` #5C5C57; `--grey` is for decorative separators only.
- **Motion.** Sheets slide 0.38s ease, image fades 0.6s, underline draws on hover, a slow
  1-3% image scale on hover. `prefers-reduced-motion` disables all of it.

Tokens live in `src/index.css`; component styles in `src/App.css`.
