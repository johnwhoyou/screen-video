# screen-video

An [Agent Skill](https://agentskills.io) that has your coding agent record a polished demo or
walkthrough video of any web app: a smooth drawn cursor, captions, zoom and pan, click and
keystroke sounds, optional AI voice-over, sharp at 2× or 4K. It drives a real browser with
Playwright and hands back an `.mp4`, or plays it inline in a GitHub PR or issue, on Linear, or in Slack.

Ask your agent for things like *"record a demo of the signup flow"*, *"make a narrated walkthrough
of this PR"* or *"a one-minute how-to video for customers"*.

## Install

Claude Code:

```bash
claude plugin marketplace add johnwhoyou/screen-video
claude plugin install screen-video@screen-video
```

Cursor, Codex, Gemini CLI, Copilot, OpenCode and others, with the [`skills`](https://skills.sh) CLI:

```bash
npx skills add johnwhoyou/screen-video
```

Or copy `plugins/screen-video/skills/screen-video/` into your agent's skills folder
(for Claude Code, `~/.claude/skills/screen-video/`).

## Needs

- Node 18+ and **ffmpeg** on `PATH` (or `$FFMPEG`)
- **Playwright** in the project you record from: `npm i -D playwright && npx playwright install chromium`
- For voice-over: a `GOOGLE_API_KEY` (Gemini TTS, from [AI Studio](https://aistudio.google.com))

## Try it

From any folder with Playwright installed:

```bash
node <skill-dir>/examples/playwright-site/flow.mjs
```

It records a short tour of playwright.dev and prints the `.mp4` path. `SKILL.md` covers the
rest: narration, the zoom budget, demo data, the Gmail scene for email-driven tutorials, and delivery.

## License

MIT
