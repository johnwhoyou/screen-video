// From a project with playwright installed:
//   node <skill-dir>/examples/playwright-site/flow.mjs
// Narrated: GOOGLE_API_KEY=… node <skill-dir>/scripts/tts.mjs script.json audio
//   NARRATION=audio/durations.json node flow.mjs
//   node <skill-dir>/scripts/narrate.mjs <video.mp4> audio out.mp4
import { record } from '../../scripts/record-lib.mjs';

const video = await record(
  async ({ page, step, click, type, zoom, unzoom }) => {
    await page.goto('https://playwright.dev/');
    await step('intro', 'Playwright: browser automation for the web');

    await step('docs', 'Start from the docs', async () => {
      await click(page.getByRole('link', { name: 'Get started' }));
      await page.getByRole('heading', { name: 'Installation' }).waitFor();
    });

    await step('install', 'One command installs it', async () => {
      await zoom(page.locator('pre').first(), { scale: 1.4 });
    });

    await step('search', 'Search finds any API', async () => {
      await unzoom();
      await click(page.getByRole('button', { name: /search/i }).first());
      await type(page.getByRole('searchbox').first(), 'screenshot');
    });
  },
  { narration: process.env.NARRATION },
);
console.log(video);
