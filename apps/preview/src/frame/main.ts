import '@videojs/html/i18n';
import '@/skin.css';
import './preview.css';
import { playerStyles, type WorkbenchParams } from '../shell/params';
import { applyMediaParams, initialParams, onParamsChange } from './frame';
import { CLIPS, createPlayer, type Clip } from './player';

// The i18n provider follows the page's `lang` and loads Video.js's built-in translations for it.
const i18n = document.createElement('media-i18n');
const wrapper = document.createElement('div');
const buttons = new Map<Clip, HTMLButtonElement>();
const credit = document.createElement('p');

let params = initialParams();
let current: Clip = CLIPS[0]!;

wrapper.className = 'preview-player';
credit.className = 'clip-credit';
credit.setAttribute('aria-live', 'polite');

function showCredit(clip: Clip): void {
  credit.replaceChildren(document.createTextNode(clip.credit));

  if (clip.creditUrl) {
    const link = document.createElement('a');

    link.href = clip.creditUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Source';
    credit.append(' ', link);
  }
}

/** Swap the whole player, so each clip starts clean with its own source, poster and chapters. */
function showClip(clip: Clip): void {
  current = clip;
  i18n.replaceChildren(createPlayer(clip));
  applyMediaParams(params);
  showCredit(clip);

  for (const [item, button] of buttons) button.setAttribute('aria-pressed', String(item === clip));
}

function createPicker(): HTMLElement {
  const picker = document.createElement('div');

  picker.className = 'clip-picker';
  picker.setAttribute('role', 'group');
  picker.setAttribute('aria-label', 'Choose a video');

  for (const clip of CLIPS) {
    const button = document.createElement('button');

    button.type = 'button';
    button.className = 'clip-button';
    button.textContent = clip.label;
    button.addEventListener('click', () => {
      if (clip !== current) showClip(clip);
    });
    buttons.set(clip, button);
    picker.append(button);
  }

  return picker;
}

wrapper.append(i18n);
// With one clip there is nothing to choose, so the picker stays out.
if (CLIPS.length > 1) wrapper.append(createPicker());
wrapper.append(credit);
document.getElementById('root')!.append(wrapper);

showClip(current);

function render(next: WorkbenchParams): void {
  params = next;
  wrapper.removeAttribute('style');

  for (const [name, value] of Object.entries(playerStyles(params))) wrapper.style.setProperty(name, value);

  applyMediaParams(params);
}

render(params);
onParamsChange(render);
