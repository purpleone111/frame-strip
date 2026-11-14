/**
 * Helpers shared by the frame strip, the Display panel and the frame browser: the media element, the storyboard
 * tiles, the chapters and the time format. Nothing here plays or changes the media.
 */

export type Tile = { url: string; x: number; y: number; w: number; h: number; start: number; end: number };
export type Chapter = { start: number; end: number; title: string };
export type Sheet = { w: number; h: number };

const XYWH = /^(.*)#xywh=(\d+),(\d+),(\d+),(\d+)\s*$/;
const sheetSizes = new Map<string, Promise<Sheet | null>>();

export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, '0');

  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/** The media element, or a custom element such as <mux-video> that speaks its API. Skin parts never play anything. */
export function findMedia(from: Element): HTMLMediaElement | null {
  const container = from.closest('media-container') ?? from.closest('video-player');

  if (!container) return null;

  for (const element of container.querySelectorAll('*')) {
    if (element.localName.startsWith('media-')) continue;

    if ('paused' in element && 'play' in element && typeof element.play === 'function') {
      return element as HTMLMediaElement;
    }
  }

  return null;
}

/** The storyboard tiles from the media's thumbnails track, or an empty list while the cues are not loaded. */
export function readTiles(media: HTMLMediaElement): Tile[] {
  const tracks = media.textTracks;

  if (!tracks) return [];

  for (let index = 0; index < tracks.length; index++) {
    const track = tracks[index];

    if (!track || track.kind !== 'metadata') continue;

    // A disabled track never loads its cues.
    if (track.mode === 'disabled') track.mode = 'hidden';

    const cues = track.cues;

    if (!cues || cues.length === 0) continue;

    const tiles: Tile[] = [];

    for (let cueIndex = 0; cueIndex < cues.length; cueIndex++) {
      const cue = cues[cueIndex] as VTTCue | undefined;
      const match = cue ? XYWH.exec(cue.text.trim()) : null;

      if (!cue || !match) {
        tiles.length = 0;
        break;
      }

      tiles.push({
        url: new URL(match[1]!, document.baseURI).href,
        x: Number(match[2]),
        y: Number(match[3]),
        w: Number(match[4]),
        h: Number(match[5]),
        start: cue.startTime,
        end: cue.endTime,
      });
    }

    if (tiles.length > 0) return tiles;
  }

  return [];
}

export function readChapters(media: HTMLMediaElement): Chapter[] {
  const tracks = media.textTracks;

  if (!tracks) return [];

  for (let index = 0; index < tracks.length; index++) {
    const track = tracks[index];

    if (!track || track.kind !== 'chapters') continue;

    if (track.mode === 'disabled') track.mode = 'hidden';

    const cues = track.cues;

    if (!cues || cues.length === 0) continue;

    const chapters: Chapter[] = [];

    for (let cueIndex = 0; cueIndex < cues.length; cueIndex++) {
      const cue = cues[cueIndex] as VTTCue | undefined;

      if (cue) chapters.push({ start: cue.startTime, end: cue.endTime, title: cue.text.trim() });
    }

    return chapters;
  }

  return [];
}

/** The size of a sprite sheet, loaded once. Percentage background sizing needs it. */
export function loadSheet(url: string): Promise<Sheet | null> {
  let sheet = sheetSizes.get(url);

  if (!sheet) {
    sheet = new Promise<Sheet | null>((resolve) => {
      const image = new Image();

      image.decoding = 'async';
      image.onload = () => resolve({ w: image.naturalWidth, h: image.naturalHeight });
      image.onerror = () => resolve(null);
      image.src = url;
    });
    sheetSizes.set(url, sheet);
  }

  return sheet;
}
