export interface VideoHotspot {
  id: string;
  videoSrc: string;  // path in /public, e.g. '/videos/example.mp4'
  lat: number;
  lng: number;
  height: number;   // center height of the frame (meters above ellipsoid)
  heading: number;  // degrees clockwise from north — which direction the frame faces
  widthM: number;   // frame width in meters
  heightM: number;  // frame height in meters
}

export const VIDEO_HOTSPOTS: VideoHotspot[] = [];
