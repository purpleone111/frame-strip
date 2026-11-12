/**
 * Frame Strip icons: solid, rounded and a little heavier than the Scaffold set. The settings button is a set of
 * sliders instead of a gear, and fullscreen is a pair of viewfinder corners. Each is a full SVG string.
 */

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="display:block;width:100%;height:100%">${body}</svg>`;

/** A line drawn with a round cap, for the parts that are strokes rather than solid shapes. */
const line = (d: string, width = 2.2) =>
  `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;

const speaker =
  '<path d="M4 9.5h3.2l4.3-3.7c.6-.5 1.5-.1 1.5.7v11c0 .8-.9 1.2-1.5.7l-4.3-3.7H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z"/>';

export const frameStripIcons = {
  play: svg(
    '<path d="M8 6l11 6-11 6z" fill="currentColor" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>'
  ),
  pause: svg('<rect x="6" y="5" width="4.5" height="14" rx="1.6"/><rect x="13.5" y="5" width="4.5" height="14" rx="1.6"/>'),
  restart: svg(
    `${line('M12 5a7 7 0 1 1-6.6 4.7', 2.4)}<path d="M2.7 8.8l5.4 1.9-1.3-5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>`
  ),
  'volume-high': svg(`${speaker}${line('M16 9.2a4 4 0 0 1 0 5.6', 2)}${line('M18.6 6.6a7.6 7.6 0 0 1 0 10.8', 2)}`),
  'volume-low': svg(`${speaker}${line('M16 9.2a4 4 0 0 1 0 5.6', 2)}`),
  'volume-off': svg(`${speaker}${line('M16 9.5l5 5M21 9.5l-5 5')}`),
  'fullscreen-enter': svg(
    line('M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3', 2.6)
  ),
  'fullscreen-exit': svg(
    line('M9 4v3a2 2 0 0 1-2 2H4M20 9h-3a2 2 0 0 1-2-2V4M15 20v-3a2 2 0 0 1 2-2h3M4 15h3a2 2 0 0 1 2 2v3', 2.6)
  ),
  gear: svg(
    `${line('M4 7h7.6M11.4 12H20M4 17h6.6M17.4 17H20', 2.2)}<circle cx="15" cy="7" r="2.4"/><circle cx="8" cy="12" r="2.4"/><circle cx="14" cy="17" r="2.4"/>`
  ),
};
