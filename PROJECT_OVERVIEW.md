# The Architectural Heritage of Groenhoven — Project Overview

## What it is

**The Architectural Heritage of Groenhoven** is an interactive 3D web map
devoted to Groenhoven, the collective housing complex of eight towers designed
by Joop van Stigt in Amsterdam's Bijlmer (1971–1980), listed as a municipal
monument in 2021. It grows out of the *Augmented Atlas of Social Housing in the
NL* (TU Delft Housing Studies course, with Het Nieuwe Instituut) and keeps its
approach, narrowed to a single complex so it can be documented in depth.

## Core experience

- The site opens on a real-world 3D view of Groenhoven (Google Photorealistic
  3D Tiles), with the complex shown in colour in an otherwise greyscale model.
- The project panel holds the period, programme and unit count, a written
  history, the student axonometric (linking to the full PDF), archival drawings
  and photographs from the Van Stigt archive (Nieuwe Instituut) and the
  Amsterdam Beeldbank, and a list of outside sources: press, blogs, the
  residents' collective and reference pages.
- Some archive images carry a saved camera position: opening them flies the
  view to the matching vantage point.
- Drawings (the site plan and an apartment floor plan) can be placed in the 3D
  scene as geo-registered image planes, from the lightbox ("show in place on
  model") or all at once from the Drawings toggle.
- 3D Gaussian-splat scans can be pinned to the facade and open in a floating
  viewer (the Community Bar scan is switched off for now; its files are kept).
- A toggle switches between photorealistic 3D tiles and a flat 2D satellite map.

## Technical stack

- **React 19 + TypeScript**, built with **Vite**
- **CesiumJS** (CDN) for the 3D view, camera flights and Google Photorealistic
  3D Tiles via Cesium Ion
- Self-hosted SuperSplat viewer (`public/splat-viewer`) for the scans
- All content is static: a JSON record plus TypeScript config files, and assets
  under `public/`. No backend or CMS.
