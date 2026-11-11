// node tts.mjs <script.json> <out-dir>  → <out-dir>/<id>.wav per line + <out-dir>/durations.json
// script.json: [{ "id": "intro", "say": "What the narrator says." }, …]. Needs GOOGLE_API_KEY.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const MODEL = process.env.TTS_MODEL ?? 'gemini-3.8-flash-tts';
const VOICE = process.env.TTS_VOICE ?? 'Sulafat';
const [scriptPath, outDir] = process.argv.slice(2);
if (!scriptPath || !outDir) throw new Error('usage: tts.mjs <script.json> <out-dir>');
if (!process.env.GOOGLE_API_KEY) throw new Error('GOOGLE_API_KEY is not set');
mkdirSync(outDir, { recursive: true });

async function speak(text) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Text only: a "Say warmly: …" prefix is read aloud, and systemInstruction is rejected.
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
        },
      }),
    },
  );
  const json = await res.json();
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error(JSON.stringify(json).slice(0, 500));
  const body = Buffer.from(part.inlineData.data, 'base64');
  let pcm = body;
  let rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType)?.[1] ?? 24000);
  // The payload is a whole WAV with a provenance chunk after the audio. Wrapping it in another
  // header plays that header and chunk as a burst of static at both ends of every line.
  if (body.toString('ascii', 0, 4) === 'RIFF') {
    for (let i = 12; i + 8 <= body.length; ) {
      const id = body.toString('ascii', i, i + 4);
      const size = body.readUInt32LE(i + 4);
      if (id === 'fmt ') rate = body.readUInt32LE(i + 12);
      if (id === 'data') {
        pcm = body.subarray(i + 8, i + 8 + size);
        break;
      }
      i += 8 + size + (size & 1);
    }
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return { wav: Buffer.concat([header, pcm]), seconds: pcm.length / 2 / rate };
}

const durations = {};
for (const { id, say } of JSON.parse(readFileSync(scriptPath, 'utf8'))) {
  const { wav, seconds } = await speak(say);
  writeFileSync(`${outDir}/${id}.wav`, wav);
  durations[id] = Number(seconds.toFixed(2));
  console.log(id, durations[id]);
}
writeFileSync(`${outDir}/durations.json`, JSON.stringify(durations));
