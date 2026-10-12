export interface CameraPos {
  height: number;
  pitch: number;
  heading: number;
  lat?: number; // override project lat if needed
  lng?: number; // override project lng if needed
  focusRadius?: number; // metres of colour around the project in the greyscale model (default FOCUS_RADIUS)
}

/** Default radius (m) of the coloured area around a selected project */
export const FOCUS_RADIUS = 180;

export const PROJECT_CAMERAS: Record<number, CameraPos> = {
  37: { lat: 52.326545, lng: 4.979383, height: 207.4, pitch: -30.7, heading: 241.8, focusRadius: 240 }, // Groenhoven (8 towers, ~470 m across)
};
