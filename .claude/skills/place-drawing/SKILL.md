---
name: place-drawing
description: Take a measured architectural drawing (plan or section) already associated with a project (a thumb/axo in panel-content.ts) and place it as a geo-registered image-plane in the 3D model — flat for plans, perpendicular for sections — estimating position/rotation/scale, or falling back to a camera-frame placement when that can't be reasonably guessed. Not for photographs.
---

# Place a project drawing in the 3D model

Turns one **measured architectural drawing** already attached to a project (a
`thumb` or `axo` entry in `src/data/panel-content.ts`) into an `ImagePlane`
entry in `src/config/image-planes.ts`, so it renders in the 3D scene and gets
a "Show in place on model" toggle under its enlarged view in the lightbox
(`src/components/ProjectPanel.tsx` matches lightbox images to `IMAGE_PLANES`
by exact `imageUrl` — nothing else needs to change for that toggle to appear).

**Scope: plans and sections only — not photographs.** Photos (archival or
contemporary) aren't measured/orthographic, so they don't geo-register
reliably against the tileset the way a drawing does; don't use this skill for
them.

- **Plan** — a top-down drawing (site plan, floor plan, axonometric) →
  placed **flat**, `type: 'plan'` in `image-planes.ts`.
- **Section** — a cross-section / cutaway drawing → placed **perpendicular**
  (vertical), `type: 'facade'` in `image-planes.ts` (that's the code's name
  for "vertical plane" — it's used here for sections too, not just
  elevations).

Two placement paths within either type, chosen per-drawing:

- **Geo-registered** (`placement: 'estimated'`) — the drawing shows enough of
  the building footprint to align against the 3D tileset.
- **Camera-frame fallback** (`placement: 'camera-frame'`) — no reliable
  geo-registration is possible, so it's placed facing the project's default
  camera instead, just to make it visible in-scene. Flag it clearly — it is
  not accurate and needs manual review later. This is the **normal path for
  sections**: the tileset only has exterior geometry, so there's usually
  nothing inside a cutaway drawing to landmark-match against. Only attempt
  geo-registration for a section if it clearly shows where the cut line falls
  on the building's footprint (e.g. a paired site plan indicates it).

Reference example (already hand-tuned, `placement: 'surveyed'`):
`src/config/image-planes.ts` → `groenhoven-siteplan`. `'surveyed'` is the
end state after any estimate has been refined live in the app (see Step 5);
don't write `'surveyed'` yourself for a fresh guess.

## Inputs

Ask for (or infer from context) two things:
1. The project — id and name (look it up in `src/data/housing-atlas.json`).
2. Which drawing — find it in `PANEL_CONTENT[id].thumbs` / `.axos` in
   `src/data/panel-content.ts` by its caption or index. Note its exact `src`
   path — the new `ImagePlane.imageUrl` must match it **exactly**, or the
   lightbox toggle won't find it.

Also read `src/config/cameras.ts` for `PROJECT_CAMERAS[id]` (may not exist —
if missing, the project uses a generic default camera; the camera-frame
fallback then isn't available either, so lean harder on trying to estimate).

## Step 1 — Ask: plan or section?

Don't guess this from the image alone — **ask the user** whether the drawing
is a plan or a section before proceeding. It determines the whole rest of the
process (flat vs. perpendicular, and which placement path is realistic).

It's still worth using Read to look at the image itself once you know which
it is — for a plan, to find footprint landmarks for Step 2; for a section, to
check whether it includes a site-plan inset that would make geo-registration
possible instead of defaulting to the camera-frame fallback.

If the image turns out to be a photograph rather than a drawing, stop — this
skill isn't for photos (see Scope above).

## Step 2 — Estimate geo-registration

**Plans**: this is the primary path — mirrors how `groenhoven-siteplan` was
originally placed.

1. Open the app (`npm run dev` if not already running) and fly the camera to
   a steep top-down view over the project's `lat`/`lng` from
   `housing-atlas.json` (near-nadir, pitch ≈ -85 to -89°, height ≈ site span
   × 1.3).
2. Compare the plan against the loaded tileset: does the building
   footprint/massing/orientation visibly match what's on screen? Use the
   browser tools (screenshot, zoom) to look closely.
3. If it matches: pick 2+ landmark points that appear in both the plan and
   the tileset. `Shift+Click` in the scene logs the picked world position to
   the console as `📍 Picked: {lat, lng, height}` (already wired in
   `CesiumViewer.tsx`, no extra setup needed). Use these to derive:
   - **Center** (`lat`/`lng`) — roughly the plan's centroid mapped to world
     coordinates.
   - **Heading** — compare the compass angle between two landmarks in the
     real world vs. their angle in the image, and adjust so the plan's "up"
     direction lines up.
   - **Scale** (`widthM`/`heightM`) — real-world distance between two
     landmarks ÷ their pixel distance in the image, applied to the image's
     full pixel dimensions.
   - **Height** — ground elevation at that point (roughly the picked
     height), plus a small offset (a couple meters) so the plane doesn't
     z-fight with the terrain/tileset.
4. If nothing lines up convincingly even after trying: use the fallback
   (Step 3) instead. Don't force a guess that isn't grounded in an actual
   visual match.

**Sections**: only attempt this if the section (or a paired plan) clearly
indicates where the cut line sits on the building's footprint — pick that
line's endpoints the same way as above to get center/heading, and use the
section drawing's own vertical extent for `heightM`. Otherwise, skip straight
to Step 3 — sections usually can't be landmark-matched against an
exteriors-only tileset.

Don't aim for precision here — Step 5 (the live editor) is what nails it
down. Getting the right footprint, roughly the right orientation, and a
plausible scale is enough for an initial guess. Write it with
`placement: 'estimated'`.

## Step 3 — Camera-frame fallback

Use this when Step 2 concluded there's no reliable geo-registration, **and**
`PROJECT_CAMERAS[id]` exists. Places the drawing as a vertical card facing
the project's default camera, so it's at least visible when that camera
loads — not geo-accurate, just in-frame. This is the expected path for most
sections.

Given `cam = PROJECT_CAMERAS[id]` (`lat`, `lng`, `height`, `pitch`, `heading`
in degrees) and a distance `D` in meters (default **50**):

```
headingRad = cam.heading * π/180
pitchRad   = cam.pitch   * π/180
east  = sin(headingRad) * cos(pitchRad)
north = cos(headingRad) * cos(pitchRad)
up    = sin(pitchRad)

lat    = cam.lat + (north * D) / 111320
lng    = cam.lng + (east  * D) / (111320 * cos(cam.lat * π/180))
height = cam.height + up * D
heading = (cam.heading + 180) % 360   // faces back toward the camera
type = 'facade'
widthM  = D * 0.6                      // adjust to taste — keeps it from filling the whole frame
heightM = widthM * (image height / image width)   // preserve the image's aspect ratio
opacity = 0.9
placement = 'camera-frame'
```

If `PROJECT_CAMERAS[id]` doesn't exist either, there's no anchor to place
the drawing against at all — stop and tell the user rather than guessing a
location with nothing to base it on.

## Step 4 — Add the entry

Add the new object to the `IMAGE_PLANES` array in
`src/config/image-planes.ts`, following the existing style (see the
`ImagePlane` interface at the top of that file for field meanings). Use a
short, unique `id` (e.g. `<project-slug>-<what-it-is>`, matching
`groenhoven-siteplan`'s pattern).

Run `npx tsc --noEmit -p .` to confirm it type-checks.

## Step 5 — Verify and refine live

New drawings are hidden by default (`visiblePlanes` starts empty in
`App.tsx`) — nothing else needs wiring for that.

1. Reload the app, open the project, open the target drawing in the lightbox
   (click its thumbnail/axo).
2. Confirm the "Show in place on model" button appears under the enlarged
   image (proves the `imageUrl` match worked) and click it. The camera
   flies to the plane and the "Edit drawing" button + height/opacity
   sliders appear bottom-left.
3. If the placement came from Step 2 (estimated) and looks off, click
   "Edit drawing" to open the full D-pad/rotate/scale HUD and nudge it into
   visual alignment against the tileset. Give the texture a few seconds to
   reload after each change — a brief blank/white flash is expected Cesium
   behavior, not a bug. Note the auto-fly-to-plane view is always near-nadir
   (top-down), which is fine for plans but not useful for judging a
   perpendicular section/facade placement — re-fly to the project's default
   `PROJECT_CAMERAS` angle (or orbit manually) to actually see it.
4. Once it looks right, click "Log position" (logs to console and copies to
   clipboard) and use those tuned values to update the entry in
   `image-planes.ts`, setting `placement: 'surveyed'`.
5. For a camera-frame placement that's clearly rough by design, it's fine to
   leave `placement: 'camera-frame'` as-is — just make sure the user knows
   it's a placeholder, not a real location.

## Report back

Summarize: which drawing, which project, plan or section, which placement
path was used (estimated vs. camera-frame) and why, and whether it was
refined live or still needs a manual pass.
