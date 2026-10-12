# The Architectural Heritage of Groenhoven

An interactive 3D web map of Groenhoven, Joop van Stigt's eight residential
towers in Amsterdam's Bijlmer (1971–1980). Derived from the Augmented Atlas of
Social Housing in the NL, narrowed to this one complex.

## Run

```sh
npm install
npm run dev      # dev server (drawing editor + C-key camera capture enabled)
npm run build    # production build into dist/
```

Needs `.env.local` with `VITE_CESIUM_ION_TOKEN` (see `.env.example`).

## Where the content lives

| File | What |
|---|---|
| `src/data/housing-atlas.json` | Project record (name, location, architect, era) |
| `src/data/panel-content.ts` | Description, axonometric, archive images, sources |
| `src/config/cameras.ts` | Opening/selected camera view and colour-focus radius |
| `src/config/image-planes.ts` | Drawings placed in the 3D model (site plan, floor plan) |
| `src/config/splat-hotspots.ts` | 3D interior scans (Community Bar scan switched off for now; files kept) |
| `src/config/video-hotspots.ts` | Video overlays anchored on the map (none yet) |
| `public/images/37/` | Archive images and axonometric |
| `public/splats/groenhoven/` | Gaussian-splat scans (.sog) and their viewer settings |

See `PROJECT_OVERVIEW.md` for the concept and `DESIGN.md` for the design rules.
