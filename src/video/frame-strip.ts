/**
 * <fs-frame-strip>: a row of frames from the video's storyboard, shown above the seek bar while the seek slider is
 * hovered, touched, dragged or keyboard-focused.
 *
 * It is a visual layer only. It is aria-hidden, nothing in it is focusable, and the existing time slider stays the
 * one keyboard and screen reader control. The frames come from the storyboard text track that <mux-video> adds (cues
 * shaped like `image-url#xywh=x,y,w,h`), so the strip is one sprite sheet cropped with CSS, not an image per frame.
 * With no storyboard, no duration, or a seek bar that is too narrow, it stays closed and the single preview that is
 * already in the skin does the job.
 *
 * The same element also writes "Chapter N" into the existing single preview's label.
 */

import { findMedia, formatTime, loadSheet, readChapters, readTiles, type Chapter, type Tile } from './film';

const MIN_FRAMES = 6;
const MAX_FRAMES = 10;
/** Narrowest a frame may be. The strip needs room for MIN_FRAMES of them, otherwise the single preview is used. */
const MIN_FRAME_WIDTH = 56;
const GAP = 4;
/** How long the strip waits after the pointer leaves, so moving up from the bar to the strip does not close it. */
const LEAVE_DELAY = 300;
/** A chapter segment narrower than this cannot hold its number, so the number is left off that segment. */
const MIN_NUMBER_WIDTH = 14;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The colour slot of a chapter (1 to 8). The CSS gives each slot its hue, the same eight as the seek bar. */
const slotOf = (chapterIndex: number) => String((chapterIndex % 8) + 1);

export class FrameStripElement extends HTMLElement {
  #slider: HTMLElement | null = null;
  #media: HTMLMediaElement | null = null;
  #frames: HTMLElement[] = [];
  #framesRow = document.createElement('div');
  /** The double ring. It is one element that slides to the current frame, so the marker glides instead of jumping. */
  #ring = document.createElement('div');
  #label = document.createElement('div');
  #labelTime = document.createElement('span');
  #labelChapter = document.createElement('span');
  #labelTitle = document.createElement('span');
  #tiles: Tile[] = [];
  #chapters: Chapter[] = [];
  #abort: AbortController | null = null;
  #resize: ResizeObserver | null = null;
  #chapterWatch: MutationObserver | null = null;
  #markFrame = 0;
  #leaveTimer = 0;
  #frame = 0;

  #hovering = false;
  #pressing = false;
  #scrubbing = false;
  #keyboard = false;
  #dismissed = false;
  #open = false;
  /** The time under the pointer, or null when the strip follows the playhead. */
  #pointerTime: number | null = null;
  #builtFor = '';

  connectedCallback(): void {
    this.setAttribute('aria-hidden', 'true');

    this.#slider = this.closest<HTMLElement>('media-time-slider');
    this.#media = findMedia(this);

    if (!this.#slider || !this.#media) return;

    this.#framesRow.className = 'media-frame-strip-frames';
    this.#ring.className = 'media-frame-strip-ring';
    this.#label.className = 'media-frame-strip-label';
    this.#labelTime.className = 'media-frame-strip-label-time';
    this.#labelChapter.className = 'media-frame-strip-label-chapter';
    this.#labelTitle.className = 'media-frame-strip-label-title';
    this.#label.append(this.#labelTime, this.#labelChapter, this.#labelTitle);
    this.replaceChildren(this.#label, this.#framesRow);

    const abort = new AbortController();
    const { signal } = abort;
    const slider = this.#slider;
    const media = this.#media;

    this.#abort = abort;

    // The seek bar: pointer, touch and keyboard.
    slider.addEventListener('pointerenter', (event) => this.#enter(event), { signal });
    slider.addEventListener('pointermove', (event) => this.#move(event), { signal });
    slider.addEventListener('pointerleave', () => this.#leave(), { signal });
    slider.addEventListener('pointerdown', (event) => this.#press(event), { signal });
    slider.addEventListener('focusin', () => this.#focusChanged(), { signal });
    slider.addEventListener('focusout', () => queueMicrotask(() => this.#focusChanged()), { signal });
    slider.addEventListener('keydown', (event) => this.#key(event), { signal });
    // A click that lands on the strip seeks even if the press itself was handled elsewhere (a safety net).
    slider.addEventListener('click', (event) => this.#clickFallback(event), { signal });
    window.addEventListener('pointerup', (event) => this.#release(event), { signal });
    window.addEventListener('pointercancel', (event) => this.#release(event), { signal });

    // The strip itself: pressing or dragging on it seeks.
    this.addEventListener('pointerdown', (event) => this.#scrubStart(event), { signal });
    this.addEventListener('pointermove', (event) => this.#scrubMove(event), { signal });
    this.addEventListener('pointerup', (event) => this.#scrubEnd(event), { signal });
    this.addEventListener('pointercancel', (event) => this.#scrubEnd(event), { signal });
    this.addEventListener('pointerenter', () => this.#enterStrip(), { signal });

    // Following the playhead: keyboard seeking changes the time without any pointer.
    for (const name of ['timeupdate', 'seeked', 'durationchange', 'loadedmetadata']) {
      media.addEventListener(name, () => this.#refresh(), { signal });
    }

    for (const name of ['durationchange', 'loadedmetadata']) {
      media.addEventListener(name, () => this.#scheduleMarks(), { signal });
    }

    this.#resize = new ResizeObserver(() => {
      this.#refresh();
      this.#scheduleMarks();
    });
    this.#resize.observe(slider);

    // Video.js builds the chapter segments when the chapters load; number them as they appear.
    this.#chapterWatch = new MutationObserver(() => this.#scheduleMarks());
    this.#chapterWatch.observe(slider.querySelector('media-time-slider-chapters') ?? slider, { childList: true });
    this.#scheduleMarks();
  }

  disconnectedCallback(): void {
    this.#abort?.abort();
    this.#abort = null;
    this.#resize?.disconnect();
    this.#resize = null;
    this.#chapterWatch?.disconnect();
    this.#chapterWatch = null;
    window.clearTimeout(this.#leaveTimer);
    cancelAnimationFrame(this.#frame);
    cancelAnimationFrame(this.#markFrame);
  }

  // ---- input -------------------------------------------------------------------------------------------------

  #enter(event: PointerEvent): void {
    window.clearTimeout(this.#leaveTimer);
    this.#hovering = true;
    this.#dismissed = false;
    this.#pointerTime = this.#timeAt(event.clientX);
    this.#refresh();
  }

  #enterStrip(): void {
    window.clearTimeout(this.#leaveTimer);
    this.#hovering = true;
    this.#refresh();
  }

  #move(event: PointerEvent): void {
    this.#hovering = true;
    this.#pointerTime = this.#timeAt(event.clientX);
    this.#schedule();
  }

  #leave(): void {
    window.clearTimeout(this.#leaveTimer);
    this.#leaveTimer = window.setTimeout(() => {
      if (this.#pressing || this.#scrubbing) return;

      this.#hovering = false;
      this.#pointerTime = null;
      this.#refresh();
    }, LEAVE_DELAY);
  }

  #press(event: PointerEvent): void {
    this.#pressing = true;
    this.#hovering = true;
    this.#dismissed = false;
    this.#pointerTime = this.#timeAt(event.clientX);
    this.#refresh();
  }

  #release(event: PointerEvent): void {
    if (!this.#pressing && !this.#scrubbing) return;

    this.#pressing = false;

    // A finger has no hover: when it lifts, the preview goes with it.
    if (event.pointerType !== 'mouse') {
      this.#hovering = false;
      this.#pointerTime = null;
    }

    this.#refresh();
  }

  #focusChanged(): void {
    const slider = this.#slider;
    const keyboard = !!slider?.querySelector(':focus-visible');

    if (keyboard !== this.#keyboard) {
      this.#keyboard = keyboard;

      if (!keyboard) this.#dismissed = false;

      this.#refresh();
    }
  }

  /** Escape closes the strip and leaves the slider focused. */
  #key(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.#open) {
      this.#dismissed = true;
      this.#refresh();
    }
  }

  // ---- seeking from the strip -----------------------------------------------------------------------------------

  #scrubStart(event: PointerEvent): void {
    if (event.button !== 0 || !this.#open) return;

    // The seek bar must not also handle this press.
    event.stopPropagation();
    event.preventDefault();
    this.#scrubbing = true;
    // Seek first: nothing after this may stop the press from doing its job.
    this.#seekTo(this.#timeAt(event.clientX));

    try {
      this.setPointerCapture(event.pointerId);
    } catch {
      // Without capture a drag can leave the strip; the press itself has already seeked.
    }
  }

  #scrubMove(event: PointerEvent): void {
    if (!this.#scrubbing) return;

    event.stopPropagation();
    this.#pointerTime = this.#timeAt(event.clientX);
    this.#seekTo(this.#pointerTime);
    this.#schedule();
  }

  #scrubEnd(event: PointerEvent): void {
    if (!this.#scrubbing) return;

    event.stopPropagation();
    this.#scrubbing = false;

    if (this.hasPointerCapture(event.pointerId)) this.releasePointerCapture(event.pointerId);

    if (event.pointerType !== 'mouse') {
      this.#hovering = false;
      this.#pointerTime = null;
    }

    this.#refresh();
  }

  /** A click inside the strip's box seeks, whichever element received it. Repeating the seek is harmless. */
  #clickFallback(event: MouseEvent): void {
    if (!this.#open || this.#scrubbing) return;

    const box = this.getBoundingClientRect();
    const inside =
      event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;

    if (inside) this.#seekTo(this.#timeAt(event.clientX));
  }

  #seekTo(time: number): void {
    const media = this.#media;

    if (media && Number.isFinite(time)) media.currentTime = time;
  }

  // ---- state -------------------------------------------------------------------------------------------------

  #duration(): number {
    const duration = this.#media?.duration ?? 0;

    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  }

  /** Pointer position along the seek bar to time. It follows the writing direction. */
  #timeAt(clientX: number): number {
    const slider = this.#slider;

    if (!slider) return 0;

    const rect = slider.getBoundingClientRect();
    const fraction = rect.width > 0 ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0;
    const rtl = getComputedStyle(slider).direction === 'rtl';

    return (rtl ? 1 - fraction : fraction) * this.#duration();
  }

  #schedule(): void {
    if (this.#frame) return;

    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#refresh();
    });
  }

  /** Open or close, and bring the frames, the ring and the label up to date. */
  #refresh(): void {
    const slider = this.#slider;
    const media = this.#media;

    if (!slider || !media) return;

    const time = this.#pointerTime ?? media.currentTime;
    const duration = this.#duration();
    const width = slider.getBoundingClientRect().width;
    const wanted = this.#hovering || this.#pressing || this.#scrubbing || this.#keyboard;
    // "Hide frame previews" in the Display menu: the strip stays closed.
    const previewsOff = !!slider.closest('.media-skin')?.hasAttribute('data-nopreview');

    // The chapter number also goes into the single preview, which is what narrow players use.
    this.#updatePreviewChapter(time);

    let open = wanted && !previewsOff && !this.#dismissed && duration > 0 && width >= MIN_FRAMES * MIN_FRAME_WIDTH + (MIN_FRAMES - 1) * GAP;

    if (open) {
      this.#tiles = this.#tiles.length > 0 ? this.#tiles : readTiles(media);
      this.#chapters = readChapters(media);

      if (this.#tiles.length === 0) {
        // Cues still loading, or this media has no storyboard: leave the single preview in charge and try again.
        open = false;
        this.#tiles = [];
      } else {
        this.#build(width);
        this.#update(time, duration, width);
      }
    }

    if (open !== this.#open) {
      // Opening again must not make the ring fly in from wherever it was last.
      if (open) this.#ring.setAttribute('data-still', '');

      this.#open = open;
      this.toggleAttribute('data-open', open);
      slider.toggleAttribute('data-strip-open', open);
    }
  }

  /** Make N frames for this width. Each one is a crop of the sprite sheet, so no image per frame. */
  #build(width: number): void {
    const count = clamp(Math.floor((width + GAP) / (MIN_FRAME_WIDTH + GAP)), MIN_FRAMES, MAX_FRAMES);
    const key = `${count}|${this.#tiles.length}|${this.#tiles[0]?.url ?? ''}|${this.#duration()}`;

    if (key === this.#builtFor) return;

    this.#builtFor = key;

    const tile = this.#tiles[0]!;
    const frames: HTMLElement[] = [];

    this.#ring.setAttribute('data-still', '');

    this.style.setProperty('--fs-tile-aspect', `${tile.w} / ${tile.h}`);

    for (let index = 0; index < count; index++) {
      const frame = document.createElement('div');

      frame.className = 'media-frame-strip-frame';
      frames.push(frame);
    }

    this.#frames = frames;
    this.#framesRow.replaceChildren(this.#ring, ...frames);

    const duration = this.#duration();

    frames.forEach((frame, index) => {
      // The middle of the stretch of the film this frame sits above.
      const sample = ((index + 0.5) / count) * duration;
      const tileAt = this.#tileAt(sample);

      void loadSheet(tileAt.url).then((sheet) => {
        // Rebuilt in the meantime: this frame is gone.
        if (!sheet || frame.parentElement !== this.#framesRow) return;

        const maxX = sheet.w - tileAt.w;
        const maxY = sheet.h - tileAt.h;

        frame.style.backgroundImage = `url("${tileAt.url}")`;
        frame.style.backgroundSize = `${(sheet.w / tileAt.w) * 100}% ${(sheet.h / tileAt.h) * 100}%`;
        frame.style.backgroundPosition = `${maxX > 0 ? (tileAt.x / maxX) * 100 : 0}% ${maxY > 0 ? (tileAt.y / maxY) * 100 : 0}%`;
        frame.dataset.ready = '';
      });
    });
  }

  #tileAt(time: number): Tile {
    const tiles = this.#tiles;

    return tiles.find((tile) => time >= tile.start && time < tile.end) ?? tiles[tiles.length - 1]!;
  }

  #chapterIndexAt(time: number): number {
    const chapters = this.#chapters;

    for (let index = chapters.length - 1; index >= 0; index--) {
      if (time >= chapters[index]!.start) return index;
    }

    return chapters.length > 0 ? 0 : -1;
  }

  /** Ring on the frame at this time, and the label above it. */
  #update(time: number, duration: number, width: number): void {
    const count = this.#frames.length;
    const current = clamp(Math.floor((time / duration) * count), 0, count - 1);
    const rtl = this.#slider ? getComputedStyle(this.#slider).direction === 'rtl' : false;

    this.#frames.forEach((frame, index) => {
      frame.toggleAttribute('data-current', index === current);

      // The chapter each frame sits in: a number on every frame in high visibility mode.
      const chapter = this.#chapterIndexAt(((index + 0.5) / count) * duration);

      if (chapter >= 0) {
        frame.dataset.chapter = String(chapter + 1);
        frame.dataset.slot = slotOf(chapter);
      } else {
        delete frame.dataset.chapter;
        delete frame.dataset.slot;
      }

      // A frame that starts a chapter gets a notch and the chapter number, so the structure shows without colour.
      const before = index > 0 ? this.#chapterIndexAt(((index - 0.5) / count) * duration) : -1;

      frame.toggleAttribute('data-chapter-start', chapter >= 0 && chapter !== before);
      frame.toggleAttribute('data-notch', chapter >= 0 && index > 0 && chapter !== before);
    });

    // Slide the ring to the current frame.
    const currentFrame = this.#frames[current];

    if (currentFrame) {
      this.#ring.style.width = `${currentFrame.offsetWidth}px`;
      this.#ring.style.height = `${currentFrame.offsetHeight}px`;
      this.#ring.style.transform = `translateX(${currentFrame.offsetLeft}px)`;

      // The first position after opening or rebuilding is set without gliding.
      if (this.#ring.hasAttribute('data-still')) {
        void this.#ring.offsetWidth;
        this.#ring.removeAttribute('data-still');
      }
    }

    const chapterIndex = this.#chapterIndexAt(time);

    this.#labelTime.textContent = formatTime(time);
    this.#labelChapter.textContent = chapterIndex >= 0 ? `Chapter ${chapterIndex + 1}` : '';
    this.#labelTitle.textContent = chapterIndex >= 0 ? (this.#chapters[chapterIndex]?.title ?? '') : '';
    this.#labelChapter.hidden = chapterIndex < 0;

    if (chapterIndex >= 0) this.#label.dataset.slot = slotOf(chapterIndex);
    else delete this.#label.dataset.slot;
    this.#labelTitle.hidden = chapterIndex < 0 || !this.#chapters[chapterIndex]?.title;

    // Keep the label over the pointer (or the playhead) and inside the strip.
    const fraction = time / duration;
    const along = (rtl ? 1 - fraction : fraction) * width;
    const half = this.#label.offsetWidth / 2;

    this.#label.style.left = `${clamp(along, half, Math.max(half, width - half))}px`;
  }

  #scheduleMarks(): void {
    if (this.#markFrame) return;

    this.#markFrame = requestAnimationFrame(() => {
      this.#markFrame = 0;
      this.#markChapters();
    });
  }

  /**
   * Number the chapter segments of the seek bar (data-n), and flag segments too short to hold a number (data-tiny).
   * The CSS shows the numbers under the bar in High visibility and Colour-blind friendly modes.
   */
  #markChapters(): void {
    const slider = this.#slider;
    const media = this.#media;

    if (!slider || !media) return;

    const chapters = readChapters(media);
    const duration = this.#duration();
    const width = slider.getBoundingClientRect().width;

    slider.querySelectorAll<HTMLElement>('.media-time-slider-chapter').forEach((element, index) => {
      const chapter = chapters[index];

      if (!chapter || duration <= 0) {
        delete element.dataset.n;
        element.removeAttribute('data-tiny');

        return;
      }

      const length = Math.min(chapter.end, duration) - chapter.start;

      element.dataset.n = String(index + 1);
      element.toggleAttribute('data-tiny', (length / duration) * width < MIN_NUMBER_WIDTH);
    });
  }

  /** "Chapter N" in the existing single preview's label. Does nothing without chapters. */
  #updatePreviewChapter(time: number): void {
    const label = this.#slider?.querySelector<HTMLElement>('.media-time-slider-preview-label');

    if (!label || !this.#media) return;

    let number = label.querySelector<HTMLElement>('.media-time-slider-chapter-number');

    if (!number) {
      number = document.createElement('span');
      number.className = 'media-time-slider-chapter-number';
      label.querySelector('media-time-slider-chapter-title')?.before(number);
    }

    const chapters = this.#chapters.length > 0 ? this.#chapters : readChapters(this.#media);

    this.#chapters = chapters;

    const index = this.#chapterIndexAt(this.#pointerTime ?? time);

    number.textContent = index >= 0 ? `Chapter ${index + 1}` : '';
    number.hidden = index < 0;

    if (index >= 0) number.dataset.slot = slotOf(index);
    else delete number.dataset.slot;
  }
}

if (!customElements.get('fs-frame-strip')) customElements.define('fs-frame-strip', FrameStripElement);
