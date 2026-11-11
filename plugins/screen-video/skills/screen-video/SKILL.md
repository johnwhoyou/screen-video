---
name: screen-video
description: Record a captioned, optionally voice-narrated screen recording of a running web app with Playwright — smooth cursor, keyboard and click sounds, zoom and pan, 2×–4K sharp — and deliver it where it is needed — a plain .mp4, inline in a GitHub PR or issue, on a Linear issue, in Slack, or a customer-facing tutorial. Use when asked for a demo video, screen recording, walkthrough of a UI or change, narrated tour, "UI/UX walkthrough", PR or ticket video, release or bug-repro clip, or a customer onboarding / how-to video (subtitle captions, Gmail email scene).
compatibility: Needs Node, Playwright resolvable from the current repo, and ffmpeg. Narration needs a GOOGLE_API_KEY (Gemini TTS). GitHub inline upload needs a one-time browser sign-in; Linear and Slack delivery use their MCP servers.
---

# Screen video

Chrome's screencast records the browser itself, rebuilt as a 60 fps H.264 `.mp4`. Captions, cursor,
zoom and sounds are added afterwards, so the take stays smooth whatever the page is doing.

Scripts resolve `playwright` from the current repo's `node_modules`, so run them from the repo root.
`<skill-dir>` is this skill's folder.

## 0. Ask first

Unless the request already says, ask in one message:

1. **What story?** Which app and URL, which pages, the 3–6 beats the viewer should see. Who watches it
   (teammates, a reviewer, a customer)?
2. **Voice?** Captions only, or narrated (AI voice-over)? Customer videos are always narrated.
3. **Where does it go?** Just the `.mp4` file (default), a GitHub PR or issue, a Linear issue, Slack, or
   somewhere else. Ask for the PR/issue/channel; never create a ticket on someone else's behalf.
4. **What data?** Which local DB or account to record against. Never prod, never real customer data.

## 1. Record

1. Run the app locally and **open each page once first**: a dev server's first compile otherwise
   lands in the video.
2. Write a flow script on top of `scripts/record-lib.mjs` (copy
   `examples/playwright-site/flow.mjs`, a runnable take of a public site).
   Use `step(id, caption, action)` (or bare `caption()`) to put one subtitle line on screen for
   each step: bottom-centre, raised above a player's playbar, translucent (`captionStyle: 'top'`
   for a banner). Keep it to about 1 minute.
   Click with the flow's `click(locator)` / `hover(locator)`, not `locator.click()`: they glide the
   drawn cursor to the target first. A bare `locator.click()` still works but the cursor jumps.
   `zoom(locator, { scale })` eases onto a target, `unzoom()` back out, and
   `click(locator, { zoom: true })` pushes in before a click. Zoom stays put until you move it;
   a click outside the zoomed view pans there first.

   **Zoom budget: it should feel like a person leaning in, not a reflex.**
   - Zoom only when small text *is* the point: a diff, a value that changed, a dialog's message.
     Never for navigation, opening a menu, or a button press anyone can see.
   - About one zoom per 15–20 seconds. Two in a row: pan between them (call `zoom` on the next
     target) instead of out-and-back-in.
   - Stay zoomed while the next actions happen in the same area; `unzoom()` when the story moves
     somewhere else.
   - Scale 1.3–1.5. Go to 2 only for something tiny, like a single icon. Hold at least 2 seconds.
   - Prefer a narrated pause over a zoom: if the line reads fine at full size, don't zoom.

   Type with `type(locator, text, { clear })`: it types at a person's pace. `click` and `type` log
   each click and keystroke to `<video>.sfx.json`, and `narrate.mjs` lays recorded sounds under the
   voice: recorded mouse-click and mechanical-keyboard samples from `sounds/`. `SFX_VOLUME` scales them (default 1), `SFX=0` for none. `page.keyboard.type` and
   bare `locator.click()` make no sound.
3. `node flow.mjs` prints the `.mp4` path. It needs ffmpeg (`$FFMPEG` or PATH; no ffmpeg?
   `npm i --prefix <scratch> ffmpeg-static`).

### Quality

`record(flow, { scale })` lays the page out at `size` (default 1280×800 CSS px, so the UI looks
normal) and renders it at `scale`× pixel density: `2` (default) is 2560×1600, `3` is 3840×2400.
Text gets sharper, not smaller. Expect roughly 15–40 MB a minute at `2` and 2–3× that at `3`. For a
size-capped destination (GitHub free plan 10 MB, Slack previews) use `scale: 1` or `CRF=24`.

### Narration (when asked for voice)

1. Write `script.json`: `[{ "id": "intro", "say": "…" }, …]`, one spoken line per `step` id.
   Write it for the ear: short sentences, numbers as words ("fifteen hundred").
2. `GOOGLE_API_KEY=… node <skill-dir>/scripts/tts.mjs script.json <audio-dir>` writes one WAV
   per line and `durations.json`. Gemini 3.8 Flash TTS (`TTS_MODEL`, `TTS_VOICE` override) sounded
   more natural than OpenAI `gpt-4o-mini-tts`. Get a key at aistudio.google.com.
3. Record with `{ narration: '<audio-dir>/durations.json' }`. Each `step` holds until its line has
   finished, and the start times land in `<video>.mp4.marks.json`.
4. `node <skill-dir>/scripts/narrate.mjs <video.mp4> <audio-dir> <out.mp4>` muxes the clips and
   sounds in (re-encodes at `CRF`, default 18). Deliver `<out.mp4>`.

TTS gotchas:
- Send the line only. A "Say warmly: …" prefix gets read aloud, and `systemInstruction` returns 400.
- Gemini returns a whole WAV plus a provenance chunk; wrapping that in a second header plays static
  at both ends of every line. `tts.mjs` extracts the data chunk for this reason; keep it.
- To check sync, transcribe the mp4 audio with timestamps (OpenAI `whisper-1`,
  `response_format=verbose_json`) and compare against the marks.

### Gotchas that cost a retake

- Clear a prefilled input with `.fill('')` before `pressSequentially`, which only appends.
- Each take changes data (publishes, accepts, saves). Reset the data between takes.
- Wait out autosaves and background AI fill-ins before the next step, or the UI jumps.
- Wheel-scrolling can fold a collapsing header and hide the next button. Prefer
  `el.scrollIntoView()` through `locator.evaluate`.
- Never let the page enter **browser** fullscreen: the frames resize and the video crops to the
  top-left. Run `document.documentElement.requestFullscreen = undefined` before a fullscreen button.

### Demo data

- Seed exactly the state the story needs into a **local** DB, with believable people at
  `example.com` and `555` numbers. Never a real customer, never a preview or prod DB.
- History, audit and event tables are append-only: every retake adds rows that make the next take
  look staged. Use a **fresh record** per take, or keep the story to actions that leave no trail.
- Dry run first: a `DRY=1` branch in the flow clicks **Cancel** on every destructive confirm. Pull
  frames at a few step marks, fix locators and framing, then do the one real take.
- After the take, check the DB end state matches what the captions or narration claim.
- Changing the data means re-running `tts.mjs` for the lines that describe it.
- zsh does not word-split `$VAR`. Pass frame times to `frames.mjs` literally, or loop under `bash`.

### Customer tutorial videos (onboarding, how-to)

- Always narrated. Keep captions to short phrases; the voice carries the detail.
- An email step goes in Gmail: `mountGmail(page, { emailHtml, subject, sender, me })` from
  `scripts/gmail-scene.mjs`. Feed it the app's **real** rendered email. It rewrites
  `target="_blank"` to `_top`, because a popup leaves the take waiting on the wrong page. Replying
  is built in: `#reply-btn`, `#reply-text`, `#send-btn`. Pass `mailbox: 'sam'` for several inboxes
  (served at `/sam` and `/sam/message`). A reply never reaches the app, so write its effect
  straight to the local DB.
- Wait on elements, not `waitForURL`: auth redirect chains abort navigations (`ERR_ABORTED`) and
  some pages never fire `load`. Give navigating clicks `{ noWaitAfter: true }`.
- After (re)starting a dev server, warm every page **and API route** the take hits.
- Reseed before every take. Magic-link tokens are single-use, so a failed attempt burns them.

## 2. Check

`node <skill-dir>/scripts/frames.mjs <video.mp4> 10 30 50` writes `frame-<t>.jpg` beside the
video. Look at them before delivering. For narration, ask the user to listen once: frames can't
catch audio defects. Check for **real customer data** (names, emails, phones): uploading publishes
it to everyone who can see the destination.

## 3. Deliver

### Just the file (default)

Print the absolute path of the final `.mp4`. Done.

### GitHub PR, issue or comment (plays inline)

GitHub only plays a video inline from a `https://github.com/user-attachments/assets/<uuid>` URL on
its own line, and that URL comes **only** from GitHub's web upload: `gh`, the REST API and committed
files all give a download link instead. Uploads are private to repo members and never committed.

```bash
node <skill-dir>/scripts/attach-video.mjs <GitHub PR or issue URL> <video.mp4>
```

- Opens a visible Chromium window. If the saved sign-in has expired it shows GitHub's sign-in page:
  **the user signs in**. Never ask for the password and never read the browser's cookies.
- Uploads through the page's comment box; the comment is never posted. Prints
  `ATTACHMENT_URL https://github.com/user-attachments/assets/<uuid>`.
- Remembers the sign-in in `~/.cache/screen-video/gh-profile`. `FORGET_SESSION=1` deletes it
  after the upload. A concurrent upload waits for the profile (`WAITING_FOR_PROFILE`).

Put the URL **alone on its own line** in the body or comment (`gh pr edit <n> --body-file <file>`,
`gh issue comment <n> --body-file <file>`). To confirm, check the PR's `body_html` for a
`<video src=…private-user-images…>` tag; a `curl -sI` on the asset URL can 404 even when it plays.
Size limit: 10 MB on free plans, 100 MB on paid.

### Linear issue

The Linear MCP uploads directly; no browser needed.

1. `prepare_attachment_upload` with `issue`, `filename`, `contentType` (`video/mp4`) and `size`
   (exact bytes: `stat -f%z <file>` on macOS, `stat -c%s` on Linux).
2. Within 60 s, `curl -X PUT --data-binary @<file> "<uploadRequest.url>"` with **every**
   `uploadRequest.headers` entry sent verbatim. Changing a header's casing or dropping one gives a
   403. Upload one file at a time.
3. `create_attachment_from_upload` with `issue` and `assetUrl`.
4. To make it play in the thread, `save_comment` with `![walkthrough.mp4](<assetUrl>)` plus a
   one-line caption. Open the issue once to confirm it renders as a player.
5. Replacing a video: upload the new one, edit the same comment (`save_comment` with `id`), then
   `delete_attachment` the old one.

### Slack

With the Slack MCP, after the user confirms the channel (sharing can't be undone):

1. `slack_get_file_upload_url` with `filename` and `content_length` (exact bytes).
2. `URL='<upload_url>' && curl -X POST "$URL" -H 'Content-Type: video/mp4' --data-binary @<file>`.
   Keep the URL byte-for-byte; a 401 means it was mangled or expired, so get a fresh one.
3. `slack_complete_file_upload` with `file_id`, `channel_id` (a `C…`/`D…` id, not a name; look it
   up with `slack_search_channels`), optional `thread_ts` and `initial_comment`.

Without the MCP, give the user the file path to drag in.

### Anywhere else

Hand over the file path and the size; mention `scale: 1` / `CRF=24` if the destination caps size.
