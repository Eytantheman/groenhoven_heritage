import { PANEL_CONTENT } from '../data/panel-content';

// The site opens on archive image 02.1 (aerial photo): its window is open beside the
// view and the camera starts at the image's saved vantage point.
export const START_IMAGE_SRC = '/images/37/thumb-11.jpg';
export const START_THUMB = PANEL_CONTENT[37]?.thumbs?.find(t => t.src === START_IMAGE_SRC);
