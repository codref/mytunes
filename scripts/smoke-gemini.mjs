#!/usr/bin/env node
/**
 * Smoke-test Google AI backends from .env.local.
 *
 * Usage:
 *   npm run smoke:gemini -- --help
 *   npm run smoke:gemini -- --flash
 *   npm run smoke:gemini -- --clip
 *   npm run smoke:gemini -- --full
 *   npm run smoke:gemini -- --flash --clip
 *   npm run smoke:gemini -- --all
 *   npm run smoke:gemini -- --flash --model gemini-2.0-flash-001
 *   npm run smoke:gemini -- --clip --location global
 *   npm run smoke:gemini -- --backend vertex|gemini-api
 *
 * Default (no flags): --flash --clip
 * Flash failures on Vertex warn by default; pass --strict to fail the run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { GoogleGenAI } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
config({ path: path.join(root, '.env.local'), override: true });

function truthy(v) {
  return ['1', 'true', 'yes', 'on'].includes(String(v || '').trim().toLowerCase());
}

function printHelp() {
  console.log(`mytunes smoke tests

Flags:
  --flash, -f          Test Gemini Flash text model
  --clip, -c           Test Lyria Clip (~$0.04)
  --full               Test Lyria full song (~$0.08; Vertex: lyria-3-pro-preview, Gemini API: lyria-3.5)
  --all, -a            Run flash + clip + full
  --model <id>         Override model id for the selected test(s) that use one model
  --flash-model <id>   Override Flash model only
  --clip-model <id>    Override Clip model only
  --full-model <id>    Override Full model only
  --location <loc>     Override GOOGLE_CLOUD_LOCATION (e.g. global, us-central1)
  --backend <name>     Force vertex | gemini-api
  --strict             Fail the whole run if Flash fails (default: warn on Vertex Flash 404)
  --help, -h           Show help

Examples:
  npm run smoke:flash
  npm run smoke:clip
  npm run smoke:gemini -- --flash --clip --location global
  npm run smoke:gemini -- --flash --flash-model gemini-2.0-flash-001 --location us-central1
`);
}

function parseArgs(argv) {
  const flags = {
    flash: false,
    clip: false,
    full: false,
    all: false,
    strict: false,
    help: false,
    model: null,
    flashModel: null,
    clipModel: null,
    fullModel: null,
    location: null,
    backend: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--help':
      case '-h':
        flags.help = true;
        break;
      case '--flash':
      case '-f':
        flags.flash = true;
        break;
      case '--clip':
      case '-c':
        flags.clip = true;
        break;
      case '--full':
        flags.full = true;
        break;
      case '--all':
      case '-a':
        flags.all = true;
        break;
      case '--strict':
        flags.strict = true;
        break;
      case '--model':
        flags.model = next();
        break;
      case '--flash-model':
        flags.flashModel = next();
        break;
      case '--clip-model':
        flags.clipModel = next();
        break;
      case '--full-model':
        flags.fullModel = next();
        break;
      case '--location':
        flags.location = next();
        break;
      case '--backend':
        flags.backend = next();
        break;
      default:
        if (a.startsWith('-')) {
          console.error(`Unknown flag: ${a}`);
          printHelp();
          process.exit(1);
        }
    }
  }

  if (flags.all) {
    flags.flash = true;
    flags.clip = true;
    flags.full = true;
  }

  // Default suite when nothing selected
  if (!flags.flash && !flags.clip && !flags.full && !flags.help) {
    flags.flash = true;
    flags.clip = true;
  }

  return flags;
}

const flags = parseArgs(process.argv.slice(2));
if (flags.help) {
  printHelp();
  process.exit(0);
}

const project = (process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '').trim();
const envLocation = (process.env.GOOGLE_CLOUD_LOCATION || process.env.GCLOUD_LOCATION || 'global').trim();
const location = (flags.location || envLocation).trim();
const apiKey = (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '').trim();
const forcedGemini =
  flags.backend === 'gemini-api' ||
  truthy(process.env.GOOGLE_GENAI_USE_GEMINI_API);
const forcedVertex =
  flags.backend === 'vertex' ||
  truthy(process.env.GOOGLE_GENAI_USE_VERTEXAI) ||
  truthy(process.env.GOOGLE_GENAI_USE_ENTERPRISE);

let mode;
if (flags.backend === 'gemini-api') {
  if (!apiKey) {
    console.error('FAIL: --backend gemini-api requires GOOGLE_API_KEY');
    process.exit(1);
  }
  mode = 'gemini-api';
} else if (flags.backend === 'vertex') {
  if (!project) {
    console.error('FAIL: --backend vertex requires GOOGLE_CLOUD_PROJECT');
    process.exit(1);
  }
  mode = 'vertex';
} else if (forcedGemini && apiKey) mode = 'gemini-api';
else if ((forcedVertex || project) && project) mode = 'vertex';
else if (apiKey) mode = 'gemini-api';
else if (project) mode = 'vertex';
else {
  console.error(
    'FAIL: configure GOOGLE_CLOUD_PROJECT (Vertex) and/or GOOGLE_API_KEY (Gemini Developer API) in .env.local',
  );
  process.exit(1);
}

const defaults = {
  flash: 'gemini-3.5-flash-lite',
  clip: 'lyria-3-clip-preview',
  full: mode === 'vertex' ? 'lyria-3-pro-preview' : 'lyria-3.5',
};

// --model applies only when a single test kind is selected; else use per-test overrides
const selectedCount = [flags.flash, flags.clip, flags.full].filter(Boolean).length;
const sharedModel = selectedCount === 1 ? flags.model : null;

const flashModel = flags.flashModel || sharedModel || defaults.flash;
const clipModel = flags.clipModel || sharedModel || defaults.clip;
const fullModel = flags.fullModel || sharedModel || defaults.full;

let ai;
if (mode === 'vertex') {
  console.log(`Backend: Vertex AI project=${project} location=${location}`);
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log(`Credentials: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
  } else {
    console.log('Credentials: Application Default Credentials (gcloud auth application-default login)');
  }
  ai = new GoogleGenAI({
    vertexai: true,
    project,
    location,
    httpOptions: { timeout: 600_000 },
    ...(process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? { googleAuthOptions: { keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS } }
      : {}),
  });
} else {
  const masked = `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`;
  console.log(`Backend: Gemini Developer API key=${masked}`);
  if (flags.location) {
    console.warn('NOTE: --location is ignored for Gemini Developer API backend');
  }
  // @google/genai 3.x defaults to v1; Lyria models are v1beta-only.
  ai = new GoogleGenAI({
    apiKey,
    httpOptions: { apiVersion: 'v1beta', timeout: 600_000 },
  });
}

console.log(
  `Tests: ${[
    flags.flash ? `flash(${flashModel})` : null,
    flags.clip ? `clip(${clipModel})` : null,
    flags.full ? `full(${fullModel})` : null,
  ]
    .filter(Boolean)
    .join(', ')}`,
);

const results = [];

async function runFlash() {
  console.log(`\n=== Flash ping (${flashModel}) ===`);
  try {
    const flash = await ai.models.generateContent({
      model: flashModel,
      contents: 'Reply with exactly: OK',
    });
    const text = (flash.text || '').trim();
    console.log(`Flash response: ${text.slice(0, 80)}`);
    if (!text) throw new Error('empty Flash response');
    console.log('Flash ping: OK');
    results.push({ test: 'flash', ok: true, model: flashModel });
  } catch (err) {
    const payload = err?.error || err;
    console.error('Flash ping failed:', err?.message || err);
    if (err?.error) console.error(JSON.stringify(err.error, null, 2));
    results.push({ test: 'flash', ok: false, model: flashModel, error: payload });

    if (payload?.code === 402 || payload?.status === 'RESOURCE_EXHAUSTED') {
      console.error('Gemini API prepaid credits depleted.');
      process.exit(2);
    }
    if (mode === 'vertex' && !flags.strict) {
      console.warn(
        'WARN: Vertex Flash unavailable (model/region/access). Continuing because --strict was not set.',
      );
      return;
    }
    process.exit(1);
  }
}

async function runLyria(kind, model, outName, costHint) {
  console.log(`\n=== Lyria ${kind} (${model}) via generateContent… ${costHint} ===`);
  try {
    const response = await ai.models.generateContent({
      model,
      contents:
        kind === 'clip'
          ? 'A short instrumental acoustic guitar piece.'
          : 'Create a 90-second instrumental acoustic folk piece with clear intro and ending.',
      config: { responseModalities: ['AUDIO', 'TEXT'] },
    });

    let audioData = '';
    const textBits = [];
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData?.data) audioData = part.inlineData.data;
      if (part.text) textBits.push(part.text);
    }

    if (!audioData) {
      console.error(`FAIL: Lyria ${kind} returned no audio`);
      console.error('text:', textBits.join('\n').slice(0, 500));
      results.push({ test: kind, ok: false, model });
      process.exit(1);
    }

    const outDir = path.join(root, 'tmp');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, outName);
    fs.writeFileSync(outFile, Buffer.from(audioData, 'base64'));
    const size = fs.statSync(outFile).size;
    console.log(`Wrote ${outFile} (${size} bytes)`);
    if (textBits.length) console.log('Text:', textBits.join(' | ').slice(0, 160));
    if (size < 1000) {
      console.error('FAIL: audio file suspiciously small');
      results.push({ test: kind, ok: false, model });
      process.exit(1);
    }
    console.log(`Lyria ${kind}: OK`);
    results.push({ test: kind, ok: true, model, file: outFile, bytes: size });
  } catch (err) {
    console.error(`FAIL: Lyria ${kind}`, err?.message || err);
    if (err?.error) console.error(JSON.stringify(err.error, null, 2));
    results.push({ test: kind, ok: false, model, error: err?.error || err?.message });
    process.exit(1);
  }
}

if (flags.flash) await runFlash();
if (flags.clip) await runLyria('clip', clipModel, 'smoke-clip.mp3', '~$0.04');
if (flags.full) await runLyria('full', fullModel, 'smoke-full.mp3', '~$0.08');

console.log('\n--- Summary ---');
for (const r of results) {
  console.log(`${r.ok ? 'OK' : 'FAIL'}  ${r.test}  ${r.model}${r.file ? `  → ${r.file}` : ''}`);
}
console.log(`Smoke finished (${mode}, location=${mode === 'vertex' ? location : 'n/a'}).`);
