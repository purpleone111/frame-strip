/**
 * <fs-contact-sheet>: the frame browser. A panel in the middle of the player with the video's frames laid out like a
 * contact sheet, grouped by chapter. Every frame is a real button with a name such as "Go to 0:26, chapter 5, Scene 5",
 * so keyboard and screen reader users can browse the film by picture and jump to a moment. It is an extra route
 * beside the seek slider, not a replacement for it.
 *
 * Without a storyboard it lists the chapters as buttons instead; without chapters either, it says so.
 */

import { findMedia, formatTime, loadSheet, readChapters, readTiles, type Chapter, type Tile } from './film';
import { FsOverlay } from './overlay';

/** More frames than this are thinned out, so the sheet stays quick to open and to move through. */
const MAX_FRAMES = 60;

export class ContactSheetElement extends FsOverlay {
  protected readonly openName = 'sheet';

  protected onOpen(): void {
    const body = this.querySelector<HTMLElement>('[data-fs-sheet-body]');
    const media = findMedia(this);

    if (!body) return;

    if (!media) {
      body.replaceChildren(this.#message('The video is not ready yet.'));

      return;
    }

    const duration = Number.isFinite(media.duration) ? media.duration : 0;
    const chapters = readChapters(media);
    const tiles = readTiles(media);

    if (tiles.length === 0) {
      body.replaceChildren(...(chapters.length > 0 ? this.#chapterList(media, chapters) : [this.#message('No frames or chapters are available for this video.')]));

      return;
    }

    // Thin the list, keeping the first frame.
    const step = Math.max(1, Math.ceil(tiles.length / MAX_FRAMES));
    const picked = tiles.filter((_, index) => index % step === 0);
    const chapterAt = (time: number) => {
      for (let index = chapters.length - 1; index >= 0; index--) {
        if (time >= chapters[index]!.start) return index;
      }

      return chapters.length > 0 ? 0 : -1;
    };

    // One section per chapter (or one section for the whole video).
    const groups = new Map<number, Tile[]>();

    for (const tile of picked) {
      const key = chapterAt(tile.start);

      groups.set(key, [...(groups.get(key) ?? []), tile]);
    }

    const current = tiles.find((tile) => media.currentTime >= tile.start && media.currentTime < tile.end);
    const sections: HTMLElement[] = [];

    for (const [chapterIndex, group] of groups) {
      const section = document.createElement('section');
      const heading = document.createElement('h3');
      const grid = document.createElement('div');
      const chapter = chapterIndex >= 0 ? chapters[chapterIndex] : undefined;

      heading.className = 'fs-sheet-heading';
      if (chapterIndex >= 0) {
        heading.dataset.slot = String((chapterIndex % 8) + 1);
        grid.dataset.slot = heading.dataset.slot;
      }
      heading.textContent = chapter ? `Chapter ${chapterIndex + 1}${chapter.title ? ` \u00b7 ${chapter.title}` : ''}` : 'All frames';
      grid.className = 'fs-sheet-grid';

      for (const tile of group) {
        const button = document.createElement('button');
        const time = document.createElement('span');
        const label = `Go to ${formatTime(tile.start)}${chapter ? `, chapter ${chapterIndex + 1}${chapter.title ? `, ${chapter.title}` : ''}` : ''}`;

        button.type = 'button';
        button.className = 'fs-sheet-frame';
        button.setAttribute('aria-label', label);
        button.dataset.start = String(tile.start);
        time.className = 'fs-sheet-time';
        time.textContent = formatTime(tile.start);
        button.append(time);

        if (current && tile.start <= current.start && current.start < (picked[picked.indexOf(tile) + 1]?.start ?? Infinity)) {
          button.setAttribute('aria-current', 'true');
        }

        button.addEventListener('click', () => {
          media.currentTime = Math.min(tile.start + 0.05, duration > 0 ? duration : tile.start + 0.05);
          this.close();
        });

        void loadSheet(tile.url).then((sheet) => {
          if (!sheet) return;

          const maxX = sheet.w - tile.w;
          const maxY = sheet.h - tile.h;

          button.style.backgroundImage = `url("${tile.url}")`;
          button.style.backgroundSize = `${(sheet.w / tile.w) * 100}% ${(sheet.h / tile.h) * 100}%`;
          button.style.backgroundPosition = `${maxX > 0 ? (tile.x / maxX) * 100 : 0}% ${maxY > 0 ? (tile.y / maxY) * 100 : 0}%`;
        });

        button.style.aspectRatio = `${tile.w} / ${tile.h}`;
        grid.append(button);
      }

      section.append(heading, grid);
      sections.push(section);
    }

    body.replaceChildren(...sections);
  }

  #chapterList(media: HTMLMediaElement, chapters: Chapter[]): HTMLElement[] {
    const list = document.createElement('div');

    list.className = 'fs-sheet-chapters';

    chapters.forEach((chapter, index) => {
      const button = document.createElement('button');

      button.type = 'button';
      button.className = 'fs-sheet-chapter';
      button.textContent = `Chapter ${index + 1}${chapter.title ? ` \u00b7 ${chapter.title}` : ''} \u00b7 ${formatTime(chapter.start)}`;
      button.addEventListener('click', () => {
        media.currentTime = chapter.start;
        this.close();
      });
      list.append(button);
    });

    return [this.#message('Frame previews are not available for this video. These chapters are.'), list];
  }

  #message(text: string): HTMLElement {
    const paragraph = document.createElement('p');

    paragraph.className = 'fs-panel-note';
    paragraph.textContent = text;

    return paragraph;
  }
}

if (!customElements.get('fs-contact-sheet')) customElements.define('fs-contact-sheet', ContactSheetElement);
