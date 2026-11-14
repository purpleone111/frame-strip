/**
 * <fs-display-panel>: the Display options as a panel in the middle of the player. Each option is a film frame: it shows
 * a real frame from the video with that option's effect on it, so people choose by looking. The choices themselves are
 * handled by <fs-display-options> (display-options.ts); this element opens the panel, paints the sample frames, and
 * moves focus between frames with the arrow keys.
 */

import { findMedia, loadSheet, readChapters, readTiles } from './film';
import { FsOverlay } from './overlay';

export class DisplayPanelElement extends FsOverlay {
  protected readonly openName = 'display';

  connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('keydown', (event) => this.#arrows(event));
  }

  protected onOpen(): void {
    void this.#paintSamples();
    this.#buildRainbow();
  }

  /**
   * A small copy of the seek bar's chapters, with their real proportions. It changes with the options: numbers and
   * patterns appear in Colour-blind friendly mode and the colours shift with a colour filter, so people see the effect
   * on the skin's signature before they leave the panel. Decorative: the chapter names and numbers are in the strip
   * labels and the frame browser.
   */
  #buildRainbow(): void {
    const bar = this.querySelector<HTMLElement>('[data-fs-rainbow]');
    const media = findMedia(this);

    if (!bar || !media) return;

    const chapters = readChapters(media);
    const duration = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : (chapters[chapters.length - 1]?.end ?? 0);

    bar.parentElement?.toggleAttribute('hidden', chapters.length === 0 || duration <= 0);

    bar.replaceChildren(
      ...chapters.map((chapter, index) => {
        const segment = document.createElement('span');
        const number = document.createElement('b');

        segment.className = 'fs-rainbow-seg';
        segment.dataset.slot = String((index % 8) + 1);
        segment.style.flexGrow = String(Math.max(0.001, Math.min(chapter.end, duration) - chapter.start));
        number.textContent = String(index + 1);
        segment.append(number);

        return segment;
      })
    );

    // Segments too narrow for their number leave it off, as on the seek bar. Measured once the panel is showing.
    requestAnimationFrame(() => {
      for (const segment of bar.querySelectorAll<HTMLElement>('.fs-rainbow-seg')) {
        segment.toggleAttribute('data-tiny', segment.offsetWidth < 16);
      }
    });
  }

  /** Every sample shows the frame the video is on, or the first frame when there is no storyboard. */
  async #paintSamples(): Promise<void> {
    const media = findMedia(this);

    if (!media) return;

    const tiles = readTiles(media);
    const tile = tiles.find((item) => media.currentTime >= item.start && media.currentTime < item.end) ?? tiles[0];

    if (!tile) return;

    const sheet = await loadSheet(tile.url);

    if (!sheet) return;

    const maxX = sheet.w - tile.w;
    const maxY = sheet.h - tile.h;

    for (const picture of this.querySelectorAll<HTMLElement>('.fs-tile-picture')) {
      picture.style.backgroundImage = `url("${tile.url}")`;
      picture.style.backgroundSize = `${(sheet.w / tile.w) * 100}% ${(sheet.h / tile.h) * 100}%`;
      picture.style.backgroundPosition = `${maxX > 0 ? (tile.x / maxX) * 100 : 0}% ${maxY > 0 ? (tile.y / maxY) * 100 : 0}%`;
      picture.style.aspectRatio = `${tile.w} / ${tile.h}`;
      picture.dataset.ready = '';
    }
  }

  /** Arrow keys move between the frames like frames on a strip; Tab still works as usual. */
  #arrows(event: KeyboardEvent): void {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];

    if (!keys.includes(event.key)) return;

    const tiles = Array.from(this.querySelectorAll<HTMLElement>('.fs-tile'));
    const index = tiles.indexOf(document.activeElement as HTMLElement);

    if (index < 0) return;

    event.preventDefault();

    const rtl = getComputedStyle(this).direction === 'rtl';
    const back = event.key === 'ArrowUp' || event.key === (rtl ? 'ArrowRight' : 'ArrowLeft');
    const forward = event.key === 'ArrowDown' || event.key === (rtl ? 'ArrowLeft' : 'ArrowRight');
    let next = index;

    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tiles.length - 1;
    else if (back) next = Math.max(0, index - 1);
    else if (forward) next = Math.min(tiles.length - 1, index + 1);

    tiles[next]?.focus();
  }
}

if (!customElements.get('fs-display-panel')) customElements.define('fs-display-panel', DisplayPanelElement);
