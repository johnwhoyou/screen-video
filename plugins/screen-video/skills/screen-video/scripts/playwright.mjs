import { createRequire } from 'node:module';
import { join } from 'node:path';

// Resolved from the project being demoed, so the skill ships no browser of its own.
const roots = [process.cwd(), process.env.PLAYWRIGHT_ROOT].filter(Boolean);
const load = () => {
  for (const root of roots) {
    try {
      return createRequire(join(root, 'noop.js'))('playwright');
    } catch {}
  }
  throw new Error(
    `playwright not found from ${roots.join(', ')}: run from a project that has it ` +
      '(npm i -D playwright && npx playwright install chromium) or set PLAYWRIGHT_ROOT',
  );
};
export const { chromium } = load();
