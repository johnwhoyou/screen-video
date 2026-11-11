import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from './playwright.mjs';

/**
 * Runs `flow` in a recorded browser and resolves to the .mp4 path.
 *
 * Quality: the page lays out at `size` (CSS pixels) and renders at `scale`× (2 → 2560×1600,
 * 3 → 3840×2400), so text is sharp, not bigger. Frames come straight from Chrome's screencast
 * and ffmpeg ($FFMPEG, else `ffmpeg`) rebuilds them at 60 fps H.264. Playwright's own recorder is
 * not used: it encodes VP8 at about 1 Mbit/s, which blurs any resolution above 720p.
 *
 * Zoom, pan and captions are not done in the page: they are logged as keyframes and rendered by
 * ffmpeg afterwards, eased per output frame. Scaling the live page made Chrome repaint the whole
 * app at 2× each frame and the capture fell to ~5 fps, which played back as judder.
 *
 * Narration: pass `narration` (the durations.json from tts.mjs) and drive the flow with
 * `step(id, caption, action)`. Each step is held until its clip has finished, and the time it
 * started is written to `<video>.marks.json` for narrate.mjs.
 */
export async function record(
  flow,
  {
    size = { width: 1280, height: 800 },
    scale = 2,
    outDir,
    narration,
    storageState,
    captionStyle = 'subtitle',
  } = {},
) {
  const dir = outDir ?? mkdtempSync(join(tmpdir(), 'screen-video-'));
  mkdirSync(dir, { recursive: true });
  const durations = narration ? JSON.parse(readFileSync(narration, 'utf8')) : {};
  // Without the flag the screencast sends CSS-pixel frames, whatever deviceScaleFactor says.
  const browser = await chromium.launch({ args: [`--force-device-scale-factor=${scale}`, '--font-render-hinting=none'] });
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: scale, storageState });
  // The cursor itself is drawn by ffmpeg afterwards; the page only shows the click ripple.
  await context.addInitScript(clickRipple);
  const page = await context.newPage();
  const framesDir = mkdtempSync(join(dir, '.frames-'));
  const frames = [];
  const writes = [];
  const cdp = await context.newCDPSession(page);
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    // Ack before the disk write, or Chrome waits on it and the frame rate drops.
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    const file = join(framesDir, `${String(frames.length).padStart(6, '0')}.jpg`);
    frames.push({ file, t: metadata.timestamp });
    writes.push(writeFile(file, Buffer.from(data, 'base64')));
  });
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 90,
    maxWidth: size.width * scale,
    maxHeight: size.height * scale,
  });
  const t0 = Date.now();
  const now = () => (Date.now() - t0) / 1000;
  const marks = {};
  // Every click and keystroke the helpers make, for narrate.mjs to lay sound under.
  const sfx = [];
  const sound = (kind) => sfx.push({ t: now(), kind });
  const captions = [];
  // The camera: zoom `s`, centred on (fx, fy) as fractions of the page. Each keyframe eases
  // from the previous view to this one over `ms`.
  let view = { s: 1, fx: 0.5, fy: 0.5 };
  const keyframes = [];
  page.setDefaultTimeout(30_000);
  const pause = (ms) => page.waitForTimeout(ms);
  const caption = async (text) => {
    captions.push({ t: now(), text });
  };

  /** Moves the camera, keeping the whole crop on the page. */
  const camera = async (next, ms) => {
    const half = 0.5 / next.s;
    const target = {
      s: next.s,
      fx: Math.min(1 - half, Math.max(half, next.fx)),
      fy: Math.min(1 - half, Math.max(half, next.fy)),
    };
    if (target.s === view.s && target.fx === view.fx && target.fy === view.fy) return;
    keyframes.push({ t: now(), ms, from: view, to: target });
    view = target;
    await pause(ms + 60);
  };
  const centre = (box) => ({
    fx: (box.x + box.width / 2) / size.width,
    fy: (box.y + box.height / 2) / size.height,
  });
  const zoom = async (locator, { scale: s = 1.4, ms = 900 } = {}) => {
    // Mid-screen first: a target at the edge leaves the camera clamped with it in a corner.
    await locator.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
    const box = await locator.boundingBox();
    if (box) await camera({ s, ...centre(box) }, ms);
  };
  const unzoom = async ({ ms = 800 } = {}) => camera({ s: 1, fx: 0.5, fy: 0.5 }, ms);
  const inView = (box) => {
    const w = size.width / view.s;
    const h = size.height / view.s;
    const left = view.fx * size.width - w / 2;
    const top = view.fy * size.height - h / 2;
    return (
      box.x >= left &&
      box.y >= top &&
      box.x + box.width <= left + w &&
      box.y + box.height <= top + h
    );
  };

  // The cursor is drawn afterwards along these eased glides, at 60 fps: moving the real pointer
  // in small steps ran at the capture's uneven frame timing and looked choppy.
  const at = { x: size.width / 2, y: size.height / 2 };
  const moves = [];
  const glide = async (locator) => {
    await locator.evaluate((el) => el.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    const box = await locator.boundingBox();
    if (!box) return;
    // Zoomed in, never act off camera: pan to the target at the same zoom.
    if (view.s !== 1 && !inView(box)) await camera({ s: view.s, ...centre(box) }, 700);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const distance = Math.hypot(x - at.x, y - at.y);
    if (distance > 2) {
      const ms = Math.round(Math.min(900, Math.max(320, 260 + distance * 0.75)));
      moves.push({ t: now(), ms, from: { ...at }, to: { x, y } });
      await pause(ms);
    }
    // The real pointer lands as the drawn one arrives, so hover states show up on cue.
    await page.mouse.move(x, y);
    Object.assign(at, { x, y });
    await pause(140);
  };
  /** `zoom: true` or a scale pushes in on the target first: for the one or two clicks that matter. */
  const click = async (locator, { zoom: s, ...options } = {}) => {
    if (s) await zoom(locator, s === true ? {} : { scale: s });
    await glide(locator);
    sound('click');
    await locator.click(options);
  };
  /** Clicks into the field and types at a person's pace, a keystroke sound per character. */
  const type = async (locator, text, { clear = false } = {}) => {
    await click(locator);
    if (clear) await locator.fill('');
    for (const char of text) {
      sound(char === ' ' ? 'space' : char === '\n' ? 'enter' : 'key');
      if (char === '\n') await page.keyboard.press('Enter');
      else await page.keyboard.type(char);
      await pause(45 + Math.random() * 85 + (char === ' ' ? 40 : 0));
    }
  };
  /** Options pass through to Playwright, e.g. `{ force: true }` for text under a row's overlay button. */
  const hover = async (locator, options) => {
    await glide(locator);
    await locator.hover(options);
  };
  const step = async (id, text, action = async () => {}) => {
    const start = Date.now();
    marks[id] = (start - t0) / 1000;
    await caption(text);
    await action();
    const left = (durations[id] ?? 3) * 1000 + 600 - (Date.now() - start);
    if (left > 0) await pause(left);
  };

  let end;
  let captionImages = [];
  let cursorImage;
  try {
    await flow({ page, caption, pause, step, click, hover, type, zoom, unzoom });
    await pause(500);
    end = now();
    await cdp.send('Page.stopScreencast').catch(() => {});
    captionImages = await renderCaptions(context, captions, end, framesDir, captionStyle);
    cursorImage = await renderCursor(context, framesDir);
  } finally {
    await cdp.send('Page.stopScreencast').catch(() => {});
    await context.close();
    await browser.close();
  }
  await Promise.all(writes);
  const video = join(dir, `walkthrough-${Date.now()}.mp4`);
  encode({
    frames,
    start: t0 / 1000,
    end,
    dir: framesDir,
    out: video,
    size,
    scale,
    keyframes,
    captionImages,
    cursor: { image: cursorImage, moves, start: { x: size.width / 2, y: size.height / 2 } },
  });
  rmSync(framesDir, { recursive: true, force: true });
  if (Object.keys(marks).length) writeFileSync(`${video}.marks.json`, JSON.stringify(marks));
  if (sfx.length) writeFileSync(`${video}.sfx.json`, JSON.stringify(sfx));
  return video;
}

/** One transparent PNG per caption, at the recording's pixel density, for ffmpeg to overlay. */
const CAPTION_CSS = {
  top: 'padding:10px 18px;border-radius:10px;background:rgba(17,24,39,.88);color:#fff;font:600 16px system-ui,sans-serif',
  subtitle:
    "padding:7px 16px;border-radius:6px;background:rgba(0,0,0,.5);color:#fff;font:400 17px/1.35 'Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:.2px;text-shadow:0 1px 2px rgba(0,0,0,.35)",
};

/**
 * `subtitle` sits at the bottom, raised 88 CSS px so a media player's playbar never covers it:
 * the default. `top` is the old dark banner at the top of the frame.
 */
async function renderCaptions(context, captions, end, dir, style = 'subtitle') {
  const page = await context.newPage();
  const images = [];
  for (const [i, { t, text }] of captions.entries()) {
    const until = captions[i + 1]?.t ?? end;
    if (!text || until - t < 0.2) continue;
    await page.setContent(
      `<div id="c" style="display:inline-block;max-width:1000px;text-align:center;${CAPTION_CSS[style]}"></div>`,
    );
    await page.locator('#c').evaluate((el, value) => {
      el.textContent = value;
    }, text);
    const file = join(dir, `caption-${i}.png`);
    await page.locator('#c').screenshot({ path: file, omitBackground: true });
    images.push({ file, from: t, to: until, bottom: style === 'subtitle' });
  }
  await page.close();
  return images;
}

const CURSOR_SVG =
  '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l15 11-7 1.2L8.5 21z" fill="#111827" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
/** Where the arrow's tip sits in the rendered PNG, in CSS px: the 4px padding plus the tip. */
const CURSOR_TIP = { x: 4 + (4 * 22) / 24, y: 4 + (2 * 22) / 24 };

async function renderCursor(context, dir) {
  const page = await context.newPage();
  await page.setContent(
    `<div id="c" style="display:inline-block;padding:4px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))">${CURSOR_SVG}</div>`,
  );
  const file = join(dir, 'cursor.png');
  await page.locator('#c').screenshot({ path: file, omitBackground: true });
  await page.close();
  return file;
}

function clickRipple() {
  const mount = () => {
    if (document.getElementById('__pr_video_ripple')) return;
    // Next.js dev overlay badge.
    const style = document.createElement('style');
    style.id = '__pr_video_ripple';
    style.textContent = 'nextjs-portal{display:none!important}';
    document.documentElement.appendChild(style);
    let last = { x: -100, y: -100 };
    window.addEventListener(
      'mousemove',
      (event) => {
        last = { x: event.clientX, y: event.clientY };
      },
      true,
    );
    window.addEventListener(
      'mousedown',
      () => {
        const ring = document.createElement('div');
        Object.assign(ring.style, {
          position: 'fixed',
          left: `${last.x - 14}px`,
          top: `${last.y - 14}px`,
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          border: '2px solid rgba(61,127,242,.9)',
          zIndex: 2147483646,
          pointerEvents: 'none',
          transition: 'transform .4s ease-out, opacity .4s ease-out',
        });
        document.documentElement.appendChild(ring);
        requestAnimationFrame(() => {
          ring.style.transform = 'scale(1.8)';
          ring.style.opacity = '0';
        });
        setTimeout(() => ring.remove(), 450);
      },
      true,
    );
  };
  if (document.documentElement) mount();
  else document.addEventListener('DOMContentLoaded', mount);
}

/**
 * An ffmpeg expression of `t` for one camera value: held between keyframes, eased across each
 * (smootherstep, so the camera starts and stops without a jolt). Built as a balanced tree of
 * `if`s: one nested `if` per keyframe overflows ffmpeg's expression parser on a long take (a few
 * hundred cursor moves), a tree keeps the depth to log2 of the count.
 */
function track(keyframes, value, initial) {
  if (!keyframes.length) return String(initial);
  const segment = (i) => {
    if (i < 0) return value(keyframes[0].from).toFixed(5);
    const { t, ms, from, to } = keyframes[i];
    const d = ms / 1000;
    const a = value(from);
    const b = value(to);
    const p = `((t-${t.toFixed(3)})/${d.toFixed(3)})`;
    const ease = `(${p}*${p}*${p}*(${p}*(${p}*6-15)+10))`;
    // Held at where the next move starts, as the nested form did; the same as `to` for a glide.
    const hold = keyframes[i + 1] ? value(keyframes[i + 1].from) : b;
    return `if(lt(t,${(t + d).toFixed(3)}),${a.toFixed(5)}+(${(b - a).toFixed(5)})*${ease},${hold.toFixed(5)})`;
  };
  // Segment i runs from keyframe i's start to keyframe i+1's; segment -1 is before the first.
  const node = (lo, hi) => {
    if (lo === hi) return segment(lo);
    const mid = (lo + hi + 1) >> 1;
    return `if(lt(t,${keyframes[mid].t.toFixed(3)}),${node(lo, mid - 1)},${node(mid, hi)})`;
  };
  return node(-1, keyframes.length - 1);
}

/**
 * Chrome sends a frame only when the page changes, so each one is held until the next (the
 * concat list carries the gaps) and fps=60 makes the stream steady. Then the camera: scale by
 * the zoom per frame and crop back to the output size around the centre, then the captions,
 * each fading in and out. Time 0 is `start`, the origin of the step marks, so narration lines up.
 */
function encode({ frames, start, end, dir, out, size, scale, keyframes, captionImages, cursor }) {
  if (!frames.length) throw new Error('No frames captured');
  const lines = [];
  frames.forEach((frame, i) => {
    const from = i === 0 ? start : frame.t;
    const to = frames[i + 1]?.t ?? start + end;
    lines.push(`file '${frame.file}'`, `duration ${Math.max(0.001, to - from).toFixed(4)}`);
  });
  lines.push(`file '${frames[frames.length - 1].file}'`);
  writeFileSync(join(dir, 'frames.txt'), lines.join('\n'));

  const W = size.width * scale;
  const H = size.height * scale;
  const zoom = track(keyframes, (v) => v.s, 1);
  const fx = track(keyframes, (v) => v.fx, 0.5);
  const fy = track(keyframes, (v) => v.fy, 0.5);
  // Not in_w/in_h: crop keeps the size it was configured with, not each scaled frame's.
  const cropX = `clip((${fx})*${W}*(${zoom})-${W / 2},0,${W}*(${zoom})-${W})`;
  const cropY = `clip((${fy})*${H}*(${zoom})-${H / 2},0,${H}*(${zoom})-${H})`;
  // The cursor's page position, through the same camera, less where its tip sits in the image.
  const cx = track(cursor.moves, (v) => v.x, cursor.start.x);
  const cy = track(cursor.moves, (v) => v.y, cursor.start.y);
  const cursorX = `(${cx})*${scale}*(${zoom})-(${cropX})-${CURSOR_TIP.x * scale}`;
  const cursorY = `(${cy})*${scale}*(${zoom})-(${cropY})-${CURSOR_TIP.y * scale}`;
  const graph = [
    `[0:v]fps=60,scale=w='trunc(${W}*(${zoom})/2)*2':h=-2:eval=frame:flags=bicubic,` +
      `crop=w=${W}:h=${H}:x='${cropX}':y='${cropY}'[cam]`,
    `[1:v]format=rgba[cur]`,
    `[cam][cur]overlay=x='${cursorX}':y='${cursorY}':eval=frame:eof_action=pass[v0]`,
  ];
  captionImages.forEach(({ from, to, bottom }, i) => {
    const fade = Math.min(0.2, (to - from) / 3);
    graph.push(
      `[${i + 2}:v]format=rgba,fade=t=in:st=${from.toFixed(3)}:d=${fade.toFixed(3)}:alpha=1,` +
        `fade=t=out:st=${(to - fade).toFixed(3)}:d=${fade.toFixed(3)}:alpha=1[c${i}]`,
      `[v${i}][c${i}]overlay=x=(W-w)/2:y=${bottom ? `H-h-${88 * scale}` : 24 * scale}:eof_action=pass[v${i + 1}]`,
    );
  });
  graph.push(`[v${captionImages.length}]format=yuv420p[out]`);
  // Inline, not -filter_complex_script: ffmpeg 8 removed that flag, and its -/filter_complex
  // replacement does not exist before 7.1 (ffmpeg-static ships 6.x).
  const filterGraph = graph.join(';\n');

  execFileSync(
    process.env.FFMPEG ?? 'ffmpeg',
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      join(dir, 'frames.txt'),
      '-loop',
      '1',
      '-t',
      String(end),
      '-i',
      cursor.image,
      ...captionImages.flatMap(({ file }) => ['-loop', '1', '-t', String(end), '-i', file]),
      '-filter_complex',
      filterGraph,
      '-map',
      '[out]',
      '-r',
      '60',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '14',
      out,
    ],
    { stdio: 'inherit' },
  );
}
