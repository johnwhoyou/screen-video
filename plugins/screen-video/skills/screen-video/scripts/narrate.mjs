// node narrate.mjs <video.webm> <audio-dir> <out.mp4>
// Lays each <audio-dir>/<id>.wav at its step's time from <video>.marks.json, plus click and
// keystroke sounds from <video>.sfx.json when record-lib wrote one (SFX=0 leaves them out,
// SFX_VOLUME scales them; default 1). Writes H.264 + AAC.
// ffmpeg: $FFMPEG, else `ffmpeg` on PATH. No ffmpeg? `npm i --prefix <scratch> ffmpeg-static`
// and set FFMPEG=<scratch>/node_modules/ffmpeg-static/ffmpeg.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { renderSfx } from './sfx.mjs';

const [video, audioDir, out] = process.argv.slice(2);
if (!video || !audioDir || !out)
  throw new Error('usage: narrate.mjs <video.webm> <audio-dir> <out.mp4>');
const marks = JSON.parse(readFileSync(`${video}.marks.json`, 'utf8'));
const ids = Object.keys(marks);
const sfxEvents =
  process.env.SFX !== '0' && existsSync(`${video}.sfx.json`)
    ? JSON.parse(readFileSync(`${video}.sfx.json`, 'utf8'))
    : [];
const sfxTrack = sfxEvents.length
  ? renderSfx(sfxEvents, `${out}.sfx.wav`, { volume: Number(process.env.SFX_VOLUME ?? 1) })
  : null;
const tracks = ids.length + (sfxTrack ? 1 : 0);

const filter = [
  ...ids.map((id, i) => `[${i + 1}:a]adelay=${Math.round(marks[id] * 1000 + 250)}[a${i}]`),
  ...(sfxTrack ? [`[${ids.length + 1}:a]anull[a${ids.length}]`] : []),
  `${Array.from({ length: tracks }, (_, i) => `[a${i}]`).join('')}amix=inputs=${tracks}:normalize=0,alimiter=limit=0.95[aout]`,
].join(';');

execFileSync(
  process.env.FFMPEG ?? 'ffmpeg',
  [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    video,
    ...ids.flatMap((id) => ['-i', `${audioDir}/${id}.wav`]),
    ...(sfxTrack ? ['-i', sfxTrack] : []),
    '-filter_complex',
    filter,
    '-map',
    '0:v',
    '-map',
    '[aout]',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    process.env.CRF ?? '18',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-ar',
    '48000',
    '-b:a',
    '160k',
    '-movflags',
    '+faststart',
    out,
  ],
  { stdio: 'inherit' },
);
console.log(out);
