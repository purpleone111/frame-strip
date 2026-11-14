/**
 * <fs-auto-chapters>: gives a video that has no chapters track equal parts ("Part 1", "Part 2"…), so the seek bar,
 * the frame strip and Browse frames are grouped and coloured for any video, not only ones that ship chapters.
 *
 *   - A video with a chapters track of its own is left alone. If one arrives later, the equal parts are removed.
 *   - Put data-no-auto-chapters on <video-player> to switch this off.
 *   - The parts are made once the duration is known, as a WebVTT track held in memory. Nothing is uploaded.
 */

import { findMedia } from './film';

const COUNT = 6;
const LABEL = 'Equal parts';

function stamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${rest.toFixed(3).padStart(6, '0')}`;
}

export class AutoChaptersElement extends HTMLElement {
  #media: HTMLMediaElement | null = null;
  #track: HTMLTrackElement | null = null;
  #url: string | null = null;
  #retry = 0;
  #tries = 0;

  connectedCallback(): void {
    this.hidden = true;
    this.#tries = 0;
    this.#find();
  }

  disconnectedCallback(): void {
    window.clearTimeout(this.#retry);
    this.#unbind();
    this.#remove();
  }

  readonly #check = (): void => {
    const media = this.#media;

    if (!media || this.closest('video-player')?.hasAttribute('data-no-auto-chapters')) return;

    if (this.#hasOwnChapters(media)) {
      this.#remove();

      return;
    }

    const duration = media.duration;

    if (this.#track || !Number.isFinite(duration) || duration <= 0) return;

    const step = duration / COUNT;
    const cues = Array.from({ length: COUNT }, (_, index) => {
      const end = index === COUNT - 1 ? duration : (index + 1) * step;

      return `${stamp(index * step)} --> ${stamp(end)}\nPart ${index + 1}`;
    });
    const track = document.createElement('track');

    this.#url = URL.createObjectURL(new Blob([`WEBVTT\n\n${cues.join('\n\n')}\n`], { type: 'text/vtt' }));
    track.kind = 'chapters';
    track.label = LABEL;
    track.srclang = 'en';
    track.default = true;
    track.src = this.#url;
    this.#track = track;
    media.append(track);
  };

  #find(): void {
    const media = findMedia(this);

    if (media) {
      this.#media = media;
      media.addEventListener('loadedmetadata', this.#check);
      media.addEventListener('durationchange', this.#check);
      media.textTracks?.addEventListener('addtrack', this.#check);
      this.#check();

      return;
    }

    // The media element can be added a moment after the skin.
    if (this.#tries < 30) {
      this.#tries += 1;
      this.#retry = window.setTimeout(() => this.#find(), 100);
    }
  }

  #unbind(): void {
    const media = this.#media;

    media?.removeEventListener('loadedmetadata', this.#check);
    media?.removeEventListener('durationchange', this.#check);
    media?.textTracks?.removeEventListener('addtrack', this.#check);
    this.#media = null;
  }

  /** True when the video brings chapters of its own: a <track> in the page or a chapters text track from the stream. */
  #hasOwnChapters(media: HTMLMediaElement): boolean {
    for (const track of media.querySelectorAll('track[kind="chapters"]')) {
      if (track !== this.#track) return true;
    }

    const tracks = media.textTracks;

    for (let index = 0; tracks && index < tracks.length; index += 1) {
      const track = tracks[index];

      if (track?.kind === 'chapters' && track.label !== LABEL) return true;
    }

    return false;
  }

  #remove(): void {
    this.#track?.remove();
    this.#track = null;

    if (this.#url) URL.revokeObjectURL(this.#url);

    this.#url = null;
  }
}

if (!customElements.get('fs-auto-chapters')) customElements.define('fs-auto-chapters', AutoChaptersElement);
