import '@videojs/html/video/player';
import '@videojs/html/media/mux-video';
import '@/video/skin';
import skinTemplate from '@/video/skin.html?raw';

export type Clip = {
  /** Short name on the picker button. */
  label: string;
  /** Title shown on the player. */
  title: string;
  /** Public Mux playback ID. It is safe to share. */
  playbackId: string;
  /** Chapters track, served from `apps/preview/public`. Leave out for a plain seek bar. */
  chapters?: string;
  /** Credit line shown under the player. */
  credit: string;
  creditUrl?: string;
};

/**
 * The clips the picker offers. The first one loads by default. A clip with an empty `playbackId` is left out, so a
 * slot can sit here until its ID is filled in.
 */
export const CLIPS: readonly Clip[] = (
  [
    {
      label: 'Sweater Whether',
      title: 'Sweater Whether Teaser',
      playbackId: '5YgdV2ic9TKHQ6MdG8yCf9lceJjSWkayQXk01L013drbQ',
      chapters: './chapters.vtt',
      credit: 'Sweater Whether, teaser. Film by Abhi Tundel.',
    },
    {
      label: 'Video.js sample',
      title: 'Video.js sample video',
      playbackId: 'BV3YZtogl89mg9VcNBhhnHm02Y34zI1nlMuMQfAbl3dM',
      credit: 'Sample video from the Video.js documentation.',
    },
    {
      label: 'Mux demo',
      title: 'Mux demo video',
      playbackId: '61zK4LlhV9P00tpGpsH7Fc00T58eR7m63b',
      credit: 'Mux demo video, from the Video.js documentation.',
    },
    {
      // Fill in the playback ID to add this clip, and check NASA's media guidelines first.
      label: 'NASA Cosmic Dawn',
      title: 'NASA Cosmic Dawn Trailer',
      playbackId: '',
      credit: 'Cosmic Dawn trailer, NASA.',
    },
  ] satisfies Clip[]
).filter((clip) => clip.playbackId !== '');

/** Clips without a chapters file get equal parts, so every clip shows the same coloured seek bar. */
const AUTO_CHAPTER_COUNT = 6;

function formatTime(seconds: number): string {
  const total = Math.max(0, seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${rest.toFixed(3).padStart(6, '0')}`;
}

/** Once the duration is known, add a chapters track of equal parts to the media. */
function addAutoChapters(media: HTMLMediaElement): void {
  const add = () => {
    const duration = media.duration;

    if (!Number.isFinite(duration) || duration <= 0) return;

    media.removeEventListener('loadedmetadata', add);
    media.removeEventListener('durationchange', add);

    const step = duration / AUTO_CHAPTER_COUNT;
    const cues = Array.from({ length: AUTO_CHAPTER_COUNT }, (_, index) => {
      const end = index === AUTO_CHAPTER_COUNT - 1 ? duration : (index + 1) * step;

      return `${formatTime(index * step)} --> ${formatTime(end)}\nPart ${index + 1}`;
    });
    const track = document.createElement('track');

    track.kind = 'chapters';
    track.label = 'English';
    track.srclang = 'en';
    track.default = true;
    track.src = URL.createObjectURL(new Blob([`WEBVTT\n\n${cues.join('\n\n')}\n`], { type: 'text/vtt' }));
    media.append(track);
  };

  media.addEventListener('loadedmetadata', add);
  media.addEventListener('durationchange', add);
}

const MEDIA_PLACEHOLDER = '<!-- Add a compatible media component here. -->';

export function createPlayer(clip: Clip = CLIPS[0]!): HTMLElement {
  const src = `https://stream.mux.com/${clip.playbackId}.m3u8`;
  const poster = `https://image.mux.com/${clip.playbackId}/thumbnail.webp?time=2&width=1280`;
  const track = clip.chapters
    ? `<track kind="chapters" label="English" srclang="en" src="${clip.chapters}" default>`
    : '';
  const player = document.createElement('video-player');

  player.setAttribute('poster', poster);
  player.setAttribute('content-title', clip.title);

  player.innerHTML = skinTemplate.replace(
    MEDIA_PLACEHOLDER,
    `<mux-video src="${src}" playsinline crossorigin>${track}</mux-video>`
  );

  if (!clip.chapters) {
    const media = player.querySelector<HTMLMediaElement>('mux-video');

    if (media) addAutoChapters(media);
  }

  return player;
}
