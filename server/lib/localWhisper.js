/**
 * Local Whisper transcription via @huggingface/transformers (WASM, no API key).
 * Audio is decoded to 16 kHz mono Float32 PCM via ffmpeg before being passed
 * to the pipeline.
 */
import { pipeline, env } from '@huggingface/transformers';
import { readFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

const __dirname = dirname(fileURLToPath(import.meta.url));
env.cacheDir = join(__dirname, '../../models');
ffmpeg.setFfmpegPath(ffmpegPath);

let _pipe = null;

async function getPipeline() {
  if (!_pipe) {
    _pipe = await pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-tiny.en',
      { dtype: 'fp32' },
    );
  }
  return _pipe;
}

function decodeAudioToPcm(audioPath) {
  const rawPath = audioPath + '.pcm';
  return new Promise((resolve, reject) => {
    ffmpeg(audioPath)
      .outputOptions(['-f', 'f32le', '-ac', '1', '-ar', '16000'])
      .output(rawPath)
      .on('end', () => resolve(rawPath))
      .on('error', reject)
      .run();
  });
}

export async function transcribeLocal(audioPath) {
  let rawPath;
  try {
    rawPath = await decodeAudioToPcm(audioPath);
    const buf = readFileSync(rawPath);
    const audio = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    const pipe = await getPipeline();
    const result = await pipe(audio);
    return (result.text || '').trim();
  } finally {
    if (rawPath) try { unlinkSync(rawPath); } catch {}
  }
}
