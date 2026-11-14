/**
 * <fs-display-options>: the "Display" submenu in Settings.
 *
 *   High visibility        turns on the skin's existing data-a11y mode.
 *   Colour-blind friendly  sets data-cvd: chapter numbers under the seek bar, patterned alternate chapters.
 *   Bigger controls        sets data-large: larger targets, icons and text, a thicker seek bar.
 *   Colour filters         red-weak, green-weak or blue-weak: one at a time, sets data-cvd-filter. They re-map the colours of
 *                          the picture, strip frames and chapter bar with an SVG filter. Approximations, not a medical correction.
 *   Dim screen             sets data-dim: a dimmer picture and softer controls.
 *   Skip buttons (10 s)    sets data-skip: back and forward 10 second buttons in the control row.
 *   Calm motion            sets data-calm, which removes non-essential transitions and animation.
 *   Hide frame previews    sets data-nopreview: no frame strip and no picture in the single preview, only the time.
 *   Reset                  forgets every choice and goes back to following the operating system.
 *
 * Until the viewer changes something, High visibility follows prefers-contrast: more and Calm motion follows
 * prefers-reduced-motion: reduce; the others start off. Nothing is stored. A choice is saved to localStorage only after
 * the viewer makes it. The menu items are plain Video.js menu items marked data-fs-option in skin.html.
 */

type Option = { attribute: string; storageKey: string; query: string | null };

const OPTIONS: Record<string, Option> = {
  'high-visibility': { attribute: 'data-a11y', storageKey: 'frame-strip:high-visibility', query: '(prefers-contrast: more)' },
  'colour-blind': { attribute: 'data-cvd', storageKey: 'frame-strip:colour-blind', query: null },
  'bigger-controls': { attribute: 'data-large', storageKey: 'frame-strip:bigger-controls', query: null },
  'dim-screen': { attribute: 'data-dim', storageKey: 'frame-strip:dim-screen', query: null },
  'skip-buttons': { attribute: 'data-skip', storageKey: 'frame-strip:skip-buttons', query: null },
  'calm-motion': { attribute: 'data-calm', storageKey: 'frame-strip:calm-motion', query: '(prefers-reduced-motion: reduce)' },
  'hide-previews': { attribute: 'data-nopreview', storageKey: 'frame-strip:hide-previews', query: null },
};

type Filter = 'protan' | 'deutan' | 'tritan';

const FILTER_KEY = 'frame-strip:colour-filter';
const FILTERS: Filter[] = ['protan', 'deutan', 'tritan'];

type Matrix = number[][];

/** How a viewer with that kind of colour vision sees each colour (common simulation matrices, in sRGB). */
const SIMULATE: Record<Filter, Matrix> = {
  protan: [[0.567, 0.433, 0], [0.558, 0.442, 0], [0, 0.242, 0.758]],
  deutan: [[0.625, 0.375, 0], [0.7, 0.3, 0], [0, 0.3, 0.7]],
  tritan: [[0.95, 0.05, 0], [0, 0.433, 0.567], [0, 0.475, 0.525]],
};

/** Where the colour that is lost goes: into the channels that person can still tell apart. */
const SHIFT: Record<Filter, Matrix> = {
  protan: [[0, 0, 0], [0.7, 1, 0], [0.7, 0, 1]],
  deutan: [[0, 0, 0], [0.7, 1, 0], [0.7, 0, 1]],
  tritan: [[1, 0, 0.7], [0, 1, 0.7], [0, 0, 0]],
};

/** corrected = colour + SHIFT x (colour - simulated), folded into one 3x3 matrix. */
function correction(filter: Filter): Matrix {
  const sim = SIMULATE[filter];
  const shift = SHIFT[filter];
  const lost = sim.map((row, r) => row.map((value, c) => (r === c ? 1 : 0) - value));

  return [0, 1, 2].map((r) => [0, 1, 2].map((c) => (r === c ? 1 : 0) + shift[r]!.reduce((sum, k, i) => sum + k * lost[i]![c]!, 0)));
}

/** The three SVG filters, added once to the page. The CSS refers to them as url(#fs-filter-protan) and so on. */
function ensureFilters(): void {
  if (document.getElementById('fs-filter-defs')) return;

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');

  svg.id = 'fs-filter-defs';
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';

  for (const name of FILTERS) {
    const filter = document.createElementNS(ns, 'filter');
    const matrix = document.createElementNS(ns, 'feColorMatrix');
    const rows = correction(name).map((row) => `${row.map((v) => v.toFixed(4)).join(' ')} 0 0`);

    filter.id = `fs-filter-${name}`;
    // The matrices are written for sRGB values, not the linear light SVG filters use by default.
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    matrix.setAttribute('type', 'matrix');
    matrix.setAttribute('values', `${rows.join(' ')} 0 0 0 1 0`);
    filter.append(matrix);
    svg.append(filter);
  }

  document.body.append(svg);
}

function readFilter(): Filter | null {
  try {
    const value = localStorage.getItem(FILTER_KEY);

    return FILTERS.find((name) => name === value) ?? null;
  } catch {
    return null;
  }
}

function writeFilter(value: Filter | null): void {
  try {
    if (value) localStorage.setItem(FILTER_KEY, value);
    else localStorage.removeItem(FILTER_KEY);
  } catch {
    // The filter still applies for this page.
  }
}

function readChoice(key: string): boolean | null {
  try {
    const value = localStorage.getItem(key);

    return value === 'on' ? true : value === 'off' ? false : null;
  } catch {
    // Storage can be blocked (private windows, site settings); the choice then lasts until the page closes.
    return null;
  }
}

function writeChoice(key: string, value: boolean | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value ? 'on' : 'off');
  } catch {
    // Nothing to do: the setting still applies for this page.
  }
}

/** One tap sets a group of options (and switches the others off). The colour filter is left as it is. */
const PRESETS: Record<string, { label: string; on: string[] }> = {
  'low-vision': { label: 'Low vision', on: ['high-visibility', 'bigger-controls'] },
  'colour-blind': { label: 'Colour-blind', on: ['colour-blind'] },
  'light-sensitive': { label: 'Light-sensitive', on: ['calm-motion', 'dim-screen', 'hide-previews'] },
  'easier-to-press': { label: 'Easier to press', on: ['bigger-controls', 'skip-buttons'] },
};

export class DisplayOptionsElement extends HTMLElement {
  #root: HTMLElement | null = null;
  #abort: AbortController | null = null;
  /** The viewer's choice this page load, or null while following the system. Mirrors localStorage when it works. */
  #choices = new Map<string, boolean | null>();
  /** The colour filter the viewer picked, or null for none. Nothing is saved until they pick one. */
  #filter: Filter | null = null;

  connectedCallback(): void {
    this.hidden = true;
    this.#root = this.closest<HTMLElement>('.media-skin');

    if (!this.#root) return;

    const abort = new AbortController();
    const { signal } = abort;
    const root = this.#root;

    this.#abort = abort;

    for (const [name, option] of Object.entries(OPTIONS)) {
      this.#choices.set(name, readChoice(option.storageKey));

      // While nothing is chosen the option follows the system, including when the system setting changes.
      if (option.query) matchMedia(option.query).addEventListener('change', () => this.#apply(), { signal });
    }

    ensureFilters();
    this.#filter = readFilter();

    root.addEventListener('click', (event) => this.#click(event), { signal });
    // Escape closes the menu through Video.js; this only makes sure focus lands back on the Settings button.
    root.addEventListener('toggle', (event) => this.#toggled(event), { capture: true, signal });

    this.#apply();
  }

  disconnectedCallback(): void {
    this.#abort?.abort();
    this.#abort = null;
  }

  #effective(name: string): boolean {
    const option = OPTIONS[name]!;
    const choice = this.#choices.get(name) ?? null;

    return choice ?? (option.query ? matchMedia(option.query).matches : false);
  }

  #click(event: Event): void {
    const filterItem = (event.target as Element | null)?.closest<HTMLElement>('[data-fs-filter]');

    if (filterItem) {
      const name = filterItem.dataset.fsFilter as Filter;

      // One filter at a time: choosing the one that is on turns it off.
      this.#filter = this.#filter === name ? null : name;
      writeFilter(this.#filter);
      this.#apply();

      return;
    }

    const preset = (event.target as Element | null)?.closest<HTMLElement>('[data-fs-preset]');

    if (preset) {
      const chosen = PRESETS[preset.dataset.fsPreset ?? ''];

      if (!chosen) return;

      for (const [key, option] of Object.entries(OPTIONS)) {
        const on = chosen.on.includes(key);

        this.#choices.set(key, on);
        writeChoice(option.storageKey, on);
      }

      this.#apply();
      this.#say(`${chosen.label} applied.`);

      return;
    }

    const item = (event.target as Element | null)?.closest<HTMLElement>('[data-fs-option]');

    if (!item) return;

    const name = item.dataset.fsOption!;

    if (name === 'reset') {
      for (const [key, option] of Object.entries(OPTIONS)) {
        this.#choices.set(key, null);
        writeChoice(option.storageKey, null);
      }

      this.#filter = null;
      writeFilter(null);
      this.#say(this.#resetMessage());
    } else if (OPTIONS[name]) {
      const next = !this.#effective(name);

      this.#choices.set(name, next);
      writeChoice(OPTIONS[name].storageKey, next);
    }

    this.#apply();
  }

  /** Put the attributes on the skin and the state on the menu items. */
  #apply(): void {
    const root = this.#root;

    if (!root) return;

    for (const [name, option] of Object.entries(OPTIONS)) {
      const on = this.#effective(name);
      root.toggleAttribute(option.attribute, on);

      for (const item of root.querySelectorAll<HTMLElement>(`[data-fs-option="${name}"]`)) this.#showState(item, on);
    }

    this.#applyFilter(root);
  }

  #applyFilter(root: HTMLElement): void {
    if (this.#filter) root.setAttribute('data-cvd-filter', this.#filter);
    else root.removeAttribute('data-cvd-filter');

    for (const name of FILTERS) {
      for (const item of root.querySelectorAll<HTMLElement>(`[data-fs-filter="${name}"]`)) this.#showState(item, this.#filter === name);
    }
  }

  /** On/Off as text and as aria-checked. Items in a menu are menu checkboxes; the panel's frames are checkboxes already. */
  #showState(item: HTMLElement, on: boolean): void {
    if (item.localName === 'media-menu-item') item.setAttribute('role', 'menuitemcheckbox');

    item.setAttribute('aria-checked', String(on));

    const state = item.querySelector('[data-fs-state]');

    if (state) state.textContent = on ? 'On' : 'Off';
  }

  /** What Reset did, in words, including any option the device itself asks for (so it stays on and why). */
  #resetMessage(): string {
    const labels: Record<string, string> = { 'high-visibility': 'High visibility', 'calm-motion': 'Calm motion' };
    const following = Object.entries(OPTIONS)
      .filter(([, option]) => option.query && matchMedia(option.query).matches)
      .map(([name]) => labels[name] ?? name);

    return following.length > 0
      ? `Back to your device settings. ${following.join(' and ')} stays on because your device asks for it.`
      : 'Back to your device settings. Everything is off.';
  }

  /** A short spoken confirmation for presets and Reset, which change several things at once. */
  #say(message: string): void {
    const status = this.#root?.querySelector<HTMLElement>('[data-fs-status]');

    if (status) status.textContent = message;
  }

  #toggled(event: Event): void {
    const popup = event.target as HTMLElement | null;

    if (!popup?.matches?.('.media-menu-popup') || (event as ToggleEvent).newState !== 'closed') return;

    const root = this.#root;

    setTimeout(() => {
      const active = document.activeElement;

      if (active && active !== document.body && root?.contains(active)) return;

      root?.querySelector<HTMLElement>(`[commandfor="${popup.id}"]`)?.focus();
    }, 0);
  }
}

if (!customElements.get('fs-display-options')) customElements.define('fs-display-options', DisplayOptionsElement);
