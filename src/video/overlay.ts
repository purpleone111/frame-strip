/**
 * Base for the two centered panels (the Display panel and the frame browser). Each is a child of the skin, so it
 * centers in the player (also in fullscreen) rather than in the browser window. It behaves like a modal dialog:
 *
 *   - focus moves into it and stays in it (Tab wraps), and everything else in the player is made inert
 *   - Escape, the Close button and a click on the dimmed background close it
 *   - focus goes back to the control that opened it (for the Settings menu, back to the Settings button)
 *   - key presses inside it do not reach the player's hotkeys, so Space on a button does not also pause the video
 */

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export abstract class FsOverlay extends HTMLElement {
  #root: HTMLElement | null = null;
  #abort: AbortController | null = null;
  #returnTo: HTMLElement | null = null;
  #inerted: HTMLElement[] = [];
  #isOpen = false;

  get isOpen(): boolean {
    return this.#isOpen;
  }

  /** The control that opens this panel: any element in the skin with data-fs-open="<name>". */
  protected abstract readonly openName: string;

  /** Called each time the panel opens, before focus moves in. */
  protected abstract onOpen(): void;

  protected get skin(): HTMLElement | null {
    return this.#root;
  }

  connectedCallback(): void {
    this.hidden = true;
    this.#root = this.closest<HTMLElement>('.media-skin');

    if (!this.#root) return;

    const abort = new AbortController();
    const { signal } = abort;

    this.#abort = abort;

    this.#root.addEventListener('click', (event) => this.#openerClick(event), { signal });
    // Enter and Space on a Settings menu item. Opening twice is harmless: the second call does nothing.
    this.#root.addEventListener('keydown', (event) => this.#openerKey(event), { signal });
    this.addEventListener('keydown', (event) => this.#key(event), { signal });
    this.addEventListener('click', (event) => this.#click(event), { signal });
  }

  disconnectedCallback(): void {
    this.#abort?.abort();
    this.#abort = null;
    this.#release();
  }

  #opener(event: Event): HTMLElement | null {
    const target = event.target as Element | null;

    return target?.closest<HTMLElement>(`[data-fs-open="${this.openName}"]`) ?? null;
  }

  #openerClick(event: MouseEvent): void {
    const opener = this.#opener(event);

    if (opener) this.open(opener);
  }

  #openerKey(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;

    const opener = this.#opener(event);

    if (!opener || opener.localName === 'button') return;

    event.preventDefault();
    this.open(opener);
  }

  open(opener: HTMLElement): void {
    const root = this.#root;

    if (!root || this.#isOpen) return;

    // Where focus goes back to. An item inside the Settings menu disappears when the menu closes, so use the button
    // that opened that menu.
    const popup = opener.closest<HTMLElement>('.media-menu-popup');
    const trigger = popup?.id ? root.querySelector<HTMLElement>(`[commandfor="${popup.id}"]`) : null;

    this.#returnTo = trigger ?? opener;

    // Close any open menu.
    try {
      for (const element of root.querySelectorAll<HTMLElement>('[popover]:popover-open')) element.hidePopover();
    } catch {
      // Without the :popover-open selector the menu may stay open behind the panel; the panel still works.
    }

    this.#isOpen = true;
    this.onOpen();
    this.hidden = false;

    // Everything else in the player stops being reachable while the panel is open.
    for (const child of Array.from(root.children)) {
      if (child === this || child.contains(this) || !(child instanceof HTMLElement) || child.inert) continue;

      child.inert = true;
      this.#inerted.push(child);
    }

    const title = this.querySelector<HTMLElement>('[data-fs-title]');

    title?.focus();
  }

  close(): void {
    if (!this.#isOpen) return;

    this.#isOpen = false;
    this.hidden = true;
    this.#release();

    const target = this.#returnTo;

    this.#returnTo = null;
    // After the inert state is gone, so the control can take focus.
    target?.focus();
  }

  #release(): void {
    for (const element of this.#inerted) element.inert = false;

    this.#inerted = [];
  }

  #click(event: MouseEvent): void {
    const target = event.target as Element | null;

    if (target?.closest('[data-fs-close]') || target?.matches('[data-fs-scrim]')) this.close();
  }

  #key(event: KeyboardEvent): void {
    // The player's hotkeys must not see keys pressed inside the panel.
    event.stopPropagation();

    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();

      return;
    }

    if (event.key !== 'Tab') return;

    const items = Array.from(this.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => !element.closest('[hidden]'));

    if (items.length === 0) return;

    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    const insideTitle = active === this.querySelector('[data-fs-title]');

    if (event.shiftKey && (active === first || insideTitle)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
