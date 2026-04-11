/**
 * Core audio conversion module.
 *
 * Converts M4A podcast files to MP3, guaranteeing output < 25 MB via
 * deterministic bitrate planning and bounded retry re-encoding.
 *
 * Uses ffmpeg-static / ffprobe-static so no separate system ffmpeg is needed.
 * Binaries are bundled for Linux x64 (Heroku) and macOS (local dev).
 */

import { statSync } from 'fs';
import { unlink } from 'fs/promises';
import { randomUUID } from 'crypto';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import ffmpeg from 'fluent-ffmpeg';

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobeStatic.path);

const MAX_OUTPUT_BYTES = 25 * 1024 * 1024; // 25 MB hard cap
const MAX_RETRIES = 2;

/**
 * Compute target bitrate in kbps that fits audio within targetMB.
 *
 * Formula:
 *   targetBits = targetMB * 1024² * 8 * 0.96   (0.96 = safety margin)
 *   targetKbps = clamp(round(targetBits / duration / 1000), 32, 192)
 *
 * @param {number} durationSeconds
 * @param {number} targetMB - defaults to 25
 * @returns {number} kbps (integer, 32–192)
 */
export function computeTargetKbps(durationSeconds, targetMB = 25) {
  if (!durationSeconds || durationSeconds <= 0) {
    throw new Error('Invalid duration: must be a positive number');
  }
  const targetBytes = targetMB * 1024 * 1024;
  const safetyFactor = 0.96;
  const targetBits = targetBytes * 8 * safetyFactor;
  const targetBitrateBps = Math.floor(targetBits / durationSeconds);
  const targetKbps = Math.round(targetBitrateBps / 1000);
  return Math.max(32, Math.min(192, targetKbps));
}

/**
 * Get audio duration in seconds via ffprobe.
 *
 * @param {string} inputPath
 * @returns {Promise<number>}
 */
export function getDuration(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return reject(new Error(`ffprobe failed: ${err.message}`));
      const duration = metadata?.format?.duration;
      if (!duration || duration <= 0) {
        return reject(new Error('Could not determine audio duration from file'));
      }
      resolve(duration);
    });
  });
}

/**
 * Convert audio to MP3 at the given settings.
 * Calls onProgress(percent) with integers 0–99 as conversion proceeds.
 *
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {{ kbps: number, mono: boolean, sampleRate: number|null }} opts
 * @param {(pct: number) => void} [onProgress]
 * @returns {Promise<void>}
 */
export function convertToMp3(inputPath, outputPath, { kbps, mono, sampleRate }, onProgress) {
  return new Promise((resolve, reject) => {
    let cmd = ffmpeg(inputPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate(kbps)
      .outputOptions('-id3v2_version', '3')
      .format('mp3');

    if (mono) cmd = cmd.audioChannels(1);
    if (sampleRate) cmd = cmd.audioFrequency(sampleRate);

    cmd
      .output(outputPath)
      .on('progress', (p) => {
        if (typeof p.percent === 'number' && !isNaN(p.percent)) {
          onProgress?.(Math.min(99, Math.round(p.percent)));
        }
      })
      .on('end', resolve)
      .on('error', (err) => reject(new Error(`ffmpeg conversion failed: ${err.message}`)))
      .run();
  });
}

/**
 * Run the full conversion pipeline with deterministic bitrate planning
 * and bounded retry re-encoding to guarantee output < 25 MB.
 *
 * Preset adjustments are applied on top of the computed cap:
 *   - auto   → computed kbps (up to 192)
 *   - high   → min(computed, 192)   — same as auto; cap enforces limit
 *   - medium → min(computed, 96)
 *   - low    → min(computed, 64)
 *
 * If kbps < 64, mono and reduced sample rate are enabled automatically.
 *
 * @param {string} inputPath           Path to uploaded M4A
 * @param {'auto'|'low'|'medium'|'high'} preset
 * @param {boolean} forceMono         User-requested mono
 * @param {(event: object) => void} onEvent  SSE event callback
 * @returns {Promise<{ outputPath, kbps, mono, sampleRate, sizeBytes, durationSeconds }>}
 */
export async function runConversion(inputPath, preset, forceMono, onEvent) {
  // ── Step 1: probe ───────────────────────────────────────────────────────────
  const durationSeconds = await getDuration(inputPath);
  onEvent({ type: 'probed', durationSeconds });

  // ── Step 2: plan bitrate ────────────────────────────────────────────────────
  let kbps = computeTargetKbps(durationSeconds);

  if (preset === 'low')    kbps = Math.min(kbps, 64);
  else if (preset === 'medium') kbps = Math.min(kbps, 96);
  // 'high' and 'auto' use the computed cap as-is

  let mono = forceMono || kbps < 64;
  let sampleRate = kbps < 64 ? 22050 : null;

  // ── Step 3: encode with bounded retry ──────────────────────────────────────
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const outputPath = `/tmp/podcast_converter_out_${randomUUID()}.mp3`;

    onEvent({ type: 'converting', kbps, mono, sampleRate, attempt });

    await convertToMp3(inputPath, outputPath, { kbps, mono, sampleRate }, (percent) => {
      onEvent({ type: 'progress', percent });
    });

    onEvent({ type: 'verifying' });

    const { size } = statSync(outputPath);

    if (size < MAX_OUTPUT_BYTES) {
      return { outputPath, kbps, mono, sampleRate: sampleRate ?? 44100, sizeBytes: size, durationSeconds };
    }

    // Output exceeded cap — clean up and retry with lower settings
    await unlink(outputPath).catch(() => {});

    if (attempt < MAX_RETRIES) {
      kbps = Math.max(32, Math.floor(kbps * 0.75));
      mono = true;
      sampleRate = 22050;
      onEvent({ type: 'retrying', attempt: attempt + 1, kbps });
    }
  }

  throw new Error(
    `Output exceeded 25 MB after ${MAX_RETRIES + 1} encoding attempts. ` +
    `Try enabling Force Mono or using a shorter file.`
  );
}
