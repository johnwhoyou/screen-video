// node frames.mjs <video> <seconds...>  → frame-<t>.jpg beside the video
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from './playwright.mjs';

const [video, ...times] = process.argv.slice(2);
if (!video || !times.length) throw new Error('usage: frames.mjs <video> <seconds...>');
const file = resolve(video);
const dir = dirname(file);
// Playwright's Chromium cannot decode H.264, so an .mp4 goes through ffmpeg (downscaled for review).
if (!file.endsWith('.webm')) {
  for (const t of times) {
    execFileSync(process.env.FFMPEG ?? 'ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', file,
      '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '3', `${dir}/frame-${t}.jpg`,
    ]);
    console.log(`${dir}/frame-${t}.jpg`);
  }
  process.exit(0);
}
// A file:// video only loads from a file:// page, not about:blank.
writeFileSync(
  `${dir}/.frames.html`,
  `<body style="margin:0"><video id="v" src="file://${file}" muted preload="auto" style="width:1280px;height:800px"></video></body>`,
);

const browser = await chromium.launch({ args: ['--font-render-hinting=none'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`file://${dir}/.frames.html`);
for (const t of times.map(Number)) {
  await page.evaluate(
    (t) =>
      new Promise((done) => {
        const v = document.getElementById('v');
        v.addEventListener('seeked', () => done(), { once: true });
        v.currentTime = t;
        setTimeout(done, 5000);
      }),
    t,
  );
  await page.screenshot({ path: `${dir}/frame-${t}.jpg`, type: 'jpeg', quality: 60 });
  console.log(`${dir}/frame-${t}.jpg`);
}
await browser.close();
