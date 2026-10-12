export interface ImagePlane {
  id: string;
  imageUrl: string;   // path in /public (e.g. '/drawings/plan.png') or absolute URL — should
                      // exactly match a thumb/axo `src` in panel-content.ts so the "Show in
                      // place on model" toggle in the lightbox can find this entry.
  lat: number;        // center latitude
  lng: number;        // center longitude
  height: number;     // center height above ellipsoid (meters)
  heading: number;    // degrees clockwise from north
                      //   facade: which direction the plane faces (0=N, 90=E, 180=S, 270=W)
                      //   plan:   which edge of the image points north (0 = top of image = north)
  pitch?: number;     // degrees, default 0 — additional tilt on top of the base orientation
  roll?: number;      // degrees, default 0 — additional roll on top of the base orientation
  widthM: number;     // plane width in meters
  heightM: number;    // plane height in meters (vertical extent for facades; depth for plans)
  type: 'facade' | 'plan'; // base orientation: facade = vertical plane, plan = horizontal plane
                            // (pitch/roll above fine-tune from there — e.g. a tilted section)
  opacity?: number;   // 0–1, default 1
  // How the placement was derived — purely informational, doesn't affect rendering.
  // 'surveyed'      — landmark-matched against the 3D tileset and hand-tuned with the live editor.
  // 'estimated'     — best-guess geo-registration (footprint/orientation inferred from the drawing).
  // 'camera-frame'  — no reliable geo-registration was possible; placed facing the project's
  //                   default camera so it's at least visible in-frame. Needs manual review.
  placement?: 'surveyed' | 'estimated' | 'camera-frame';
}

export const IMAGE_PLANES: ImagePlane[] = [
  {
    id: 'groenhoven-siteplan',
    imageUrl: '/images/37/thumb-3.jpg',
    lat: 52.325165,
    lng: 4.976427,
    height: 84.5,
    heading: 330.0,
    widthM: 473.2,
    heightM: 310.3,
    type: 'plan',
    opacity: 0.85,
    placement: 'surveyed', // tuned live against the tileset — update if you started from a rougher guess
  },
  {
    id: 'groenhoven-balkenframe',
    imageUrl: '/images/37/thumb-5.jpg',
    lat: 52.326188,
    lng: 4.975795,
    height: 89.0,
    heading: 61.8,
    widthM: 30.0,
    heightM: 41.8,
    type: 'plan', // laid flat — 'plan' base orientation (UNIT_Z normal)
    opacity: 0.9,
    placement: 'surveyed', // tuned live against the tileset — update if you started from a rougher guess
  },
];
