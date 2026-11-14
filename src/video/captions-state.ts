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
 */

const BUTTON = '.media-captions-button';
const OFF = '[data-no-captions]';

export class CaptionsStateElement extends HTMLElement {
  #abort: AbortController | null = null;
  #observer: MutationObserver | null = null;
  #root: HTMLElement | null = null;

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

    this.#observer = new MutationObserver(() => this.#sync());
    this.#observer.observe(root, { subtree: true, attributes: true, childList: true, attributeFilter: ['hidden', 'data-availability'] });

    this.#sync();
  }

  disconnectedCallback(): void {
    this.#abort?.abort();
    this.#abort = null;
    this.#observer?.disconnect();
    this.#observer = null;
  }

  #sync(): void {
    const root = this.#root;

    if (!root) return;

    const flagged = root.closest('video-player')?.hasAttribute('data-no-captions') ?? false;
    let none = true;

    for (const button of root.querySelectorAll<HTMLElement>(BUTTON)) {
      const availability = button.getAttribute('data-availability');
      const off = flagged || button.hasAttribute('hidden') || availability === 'unavailable' || availability === 'unsupported';

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

if (!customElements.get('fs-captions-state')) customElements.define('fs-captions-state', CaptionsStateElement);
