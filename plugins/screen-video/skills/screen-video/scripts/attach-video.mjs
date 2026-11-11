// node attach-video.mjs <GitHub PR or issue URL> <video>  → ATTACHMENT_URL https://github.com/user-attachments/assets/<uuid>
import { rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from './playwright.mjs';

const [pr, video] = process.argv.slice(2);
if (!pr || !video) throw new Error('usage: attach-video.mjs <GitHub PR or issue URL> <video>');
const prPath = new URL(pr).pathname;
const profile = join(homedir(), '.cache', 'screen-video', 'gh-profile');

// Chromium locks a profile to one browser, so a second session's upload waits its turn.
async function launch() {
  for (let waited = 0; ; waited += 5_000) {
    try {
      return await chromium.launchPersistentContext(profile, {
        headless: false,
        viewport: { width: 1280, height: 900 },
      });
    } catch (error) {
      if (!/existing browser session|ProcessSingleton|SingletonLock/i.test(String(error))) throw error;
      if (waited >= 15 * 60_000) throw error;
      if (waited === 0) console.log('WAITING_FOR_PROFILE (another upload is using it)');
      await new Promise((done) => setTimeout(done, 5_000));
    }
  }
}

const context = await launch();
try {
  const page = context.pages()[0] ?? (await context.newPage());
  const composer = page.locator('#new_comment_field, textarea[name="comment[body]"]');
  await page.goto(pr);
  if (!(await composer.count())) {
    // The user signs in themselves; this script never touches credentials or cookies.
    await page.goto(`https://github.com/login?return_to=${encodeURIComponent(prPath)}`);
    console.log('WAITING_FOR_SIGN_IN');
    await page.waitForURL((url) => url.pathname === prPath, { timeout: 10 * 60_000 });
  }
  // GitHub's own attachment upload; the comment is cleared, never posted.
  const box = composer.last();
  await box.scrollIntoViewIfNeeded();
  await box.click();
  await page.locator('input[type="file"]').last().setInputFiles(resolve(video));
  await page.waitForFunction(
    (el) => /user-attachments\/assets\/[0-9a-f-]+/.test(el.value),
    await box.elementHandle(),
    { timeout: 5 * 60_000 },
  );
  const url = (await box.inputValue()).match(
    /https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f-]+/,
  )[0];
  await box.fill('');
  console.log(`ATTACHMENT_URL ${url}`);
} finally {
  await context.close();
  if (process.env.FORGET_SESSION === '1') rmSync(profile, { recursive: true, force: true });
}
