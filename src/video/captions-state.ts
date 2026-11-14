/**
 * <fs-captions-state>: shows the captions button greyed out, and not usable, when the video has no captions.
 *
 * Video.js already knows when there are no captions and marks the button (hidden or data-availability). A player can
 * also say it outright with data-no-captions on <video-player>, for a video where the player still sees a track but
 * there is nothing to read. In both cases this element:
 *
 *   - sets data-no-captions on the captions buttons, which the CSS draws dimmed, flat and crossed through (not by
 *     colour alone),
 *   - sets aria-disabled and takes the button out of the tab order, so it reads as unavailable and not as a control,
 *   - swallows clicks, Enter and Space on it, so nothing toggles,
 *   - marks the Captions row in the Settings menu, which the CSS hides.
 *
 * A video that does have captions is left exactly as Video.js has it.
 *
 * It also offers "Add captions file…" in the Settings menu, for every video. The person picks a .vtt (or .srt) file
 * from their own device; it is read in the browser, added to the media as a captions track and switched on. Nothing
 * is uploaded. Picking another file replaces the one added before.
 */

import { findMedia } from './film';

const BUTTON = '.media-captions-button';
const OFF = '[data-no-captions]';

export class CaptionsStateElement extends HTMLElement {
  #abort: AbortController | null = null;
  #observer: MutationObserver | null = null;
  #root: HTMLElement | null = null;
  #media: HTMLMediaElement | null = null;
  #input: HTMLInputElement | null = null;
  #userTrack: HTMLTrackElement | null = null;
  #userUrl: string | null = null;
  #userLabel = '';
  #resetTimer = 0;

  connectedCallback(): void {
    this.hidden = true;
    this.#root = this.closest<HTMLElement>('.media-skin');

    const root = this.#root;

    if (!root) return;

    const abort = new AbortController();
    const { signal } = abort;

    this.#abort = abort;

    const block = (event: Event) => {
      const target = event.target as Element | null;

      if (!target?.closest(`${BUTTON}${OFF}, .media-menu-item${OFF}`)) return;

      if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return;

      event.preventDefault();
      event.stopImmediatePropagation();
    };

    // Capture, so it runs before the button's own handlers.
    root.addEventListener('click', block, { capture: true, signal });
    root.addEventListener('keydown', block, { capture: true, signal });

    // The "Add captions file…" row opens a hidden file picker.
    const input = document.createElement('input');

    input.type = 'file';
    input.accept = '.vtt,.srt,text/vtt';
    input.hidden = true;
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');
    input.addEventListener('change', () => void this.#load(input), { signal });
    root.append(input);
    this.#input = input;

    root.addEventListener(
      'click',
      (event) => {
        if ((event.target as Element | null)?.closest('[data-fs-add-captions]')) input.click();
      },
      { signal }
    );

    root.addEventListener(
      'keydown',
      (event) => {
        const key = (event as KeyboardEvent).key;

        if ((key === 'Enter' || key === ' ') && (event.target as Element | null)?.closest('[data-fs-add-captions]')) {
          event.preventDefault();
          input.click();
        }
      },
      { signal }
    );

    this.#observer = new MutationObserver(() => this.#sync());
    this.#observer.observe(root, { subtree: true, attributes: true, childList: true, attributeFilter: ['hidden', 'data-availability'] });

    this.#sync();
  }

  disconnectedCallback(): void {
    this.#abort?.abort();
    this.#abort = null;
    this.#observer?.disconnect();
    this.#observer = null;
    this.#unbind();
    this.#input?.remove();
    this.#input = null;
    this.#forgetUserTrack();
    window.clearTimeout(this.#resetTimer);
  }

  readonly #onTracks = (): void => {
    this.#enableUserTrack();
    this.#sync();
  };

  /** Listens to the media's text tracks, so the button follows captions that arrive late (streams add them after load). */
  #bind(media: HTMLMediaElement | null): void {
    if (media === this.#media) return;

    this.#unbind();
    this.#media = media;

    if (!media) return;

    media.textTracks?.addEventListener('addtrack', this.#onTracks);
    media.textTracks?.addEventListener('removetrack', this.#onTracks);
    media.addEventListener('loadedmetadata', this.#onTracks);
  }

  #unbind(): void {
    const media = this.#media;

    media?.textTracks?.removeEventListener('addtrack', this.#onTracks);
    media?.textTracks?.removeEventListener('removetrack', this.#onTracks);
    media?.removeEventListener('loadedmetadata', this.#onTracks);
    this.#media = null;
  }

  #hasCaptionTracks(): boolean {
    const tracks = this.#media?.textTracks;

    if (!tracks) return false;

    for (let i = 0; i < tracks.length; i += 1) {
      const kind = tracks[i]?.kind;

      if (kind === 'captions' || kind === 'subtitles') return true;
    }

    return false;
  }

  #forgetUserTrack(): void {
    this.#userTrack?.remove();
    this.#userTrack = null;

    if (this.#userUrl) URL.revokeObjectURL(this.#userUrl);

    this.#userUrl = null;
    this.#userLabel = '';
  }

  #enableUserTrack(): void {
    const tracks = this.#media?.textTracks;

    if (!tracks || !this.#userLabel) return;

    for (let i = 0; i < tracks.length; i += 1) {
      const track = tracks[i];

      if (track && track.label === this.#userLabel && track.mode !== 'showing') track.mode = 'showing';
    }
  }

  #say(text: string, revert: boolean): void {
    const label = this.#root?.querySelector<HTMLElement>('[data-fs-add-captions] [data-fs-add-label]');

    if (!label) return;

    label.textContent = text;
    window.clearTimeout(this.#resetTimer);

    if (revert) {
      this.#resetTimer = window.setTimeout(() => {
        label.textContent = this.#userTrack ? 'Replace captions file…' : 'Add captions file…';
      }, 4000);
    }
  }

  async #load(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];

    input.value = '';

    const media = findMedia(this);

    if (!file || !media) return;

    if (file.size > 2_000_000) {
      this.#say('That file is too large', true);

      return;
    }

    let text = '';

    try {
      text = await file.text();
    } catch {
      this.#say('Could not read that file', true);

      return;
    }

    const vtt = toVtt(text);

    if (!vtt) {
      this.#say('Not a captions file', true);

      return;
    }

    this.#forgetUserTrack();

    const label = file.name.replace(/\.(vtt|srt)$/i, '') || 'Captions';
    const url = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
    const track = document.createElement('track');

    track.kind = 'captions';
    track.label = label;
    track.srclang = 'und';
    track.src = url;
    track.default = true;
    this.#userTrack = track;
    this.#userUrl = url;
    this.#userLabel = label;
    media.append(track);
    this.#bind(media);
    this.#say('Replace captions file…', false);
    this.#enableUserTrack();
    this.#sync();
  }

  #sync(): void {
    const root = this.#root;

    if (!root) return;

    this.#bind(findMedia(this));

    // Captions the person added themselves count as captions, whatever the player was told about the clip.
    const added = this.#userTrack !== null;
    const flagged = !added && (root.closest('video-player')?.hasAttribute('data-no-captions') ?? false);
    const tracks = this.#hasCaptionTracks();
    let none = true;

    for (const button of root.querySelectorAll<HTMLElement>(BUTTON)) {
      const availability = button.getAttribute('data-availability');
      const off =
        !added &&
        (flagged ||
          button.hasAttribute('hidden') ||
          availability === 'unavailable' ||
          availability === 'unsupported' ||
          (!tracks && availability !== 'available'));

      this.#mark(button, off, true);

      if (!off) none = false;
    }

    // The Captions row in Settings goes with the button.
    const content = root.querySelector('media-captions-radio-group')?.closest('media-menu-content');
    const row = content?.id ? root.querySelector<HTMLElement>(`[commandfor="${content.id}"]`) : null;

    if (row) this.#mark(row, none, false);
  }

  #mark(element: HTMLElement, off: boolean, focusable: boolean): void {
    if (element.hasAttribute('data-no-captions') !== off) element.toggleAttribute('data-no-captions', off);

    if (off) {
      if (element.getAttribute('aria-disabled') !== 'true') element.setAttribute('aria-disabled', 'true');

      if (focusable && !element.hasAttribute('data-fs-was-focusable')) {
        element.setAttribute('data-fs-was-focusable', element.getAttribute('tabindex') ?? '');
        element.setAttribute('tabindex', '-1');
      }
    } else {
      if (element.getAttribute('aria-disabled') === 'true') element.removeAttribute('aria-disabled');

      if (element.hasAttribute('data-fs-was-focusable')) {
        const before = element.getAttribute('data-fs-was-focusable');

        if (before) element.setAttribute('tabindex', before);
        else element.removeAttribute('tabindex');

        element.removeAttribute('data-fs-was-focusable');
      }
    }
  }
}

/** Turns a .vtt or .srt file's text into WebVTT, or null when it is neither. */
function toVtt(text: string): string | null {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

  if (clean.startsWith('WEBVTT')) return clean;

  // SRT: "00:00:01,000 --> 00:00:02,500". WebVTT wants a dot, and a WEBVTT line first.
  if (/\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{3}/.test(clean)) {
    return `WEBVTT\n\n${clean.replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')}`;
  }

  return null;
}

if (!customElements.get('fs-captions-state')) customElements.define('fs-captions-state', CaptionsStateElement);
