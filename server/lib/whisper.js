import { statSync } from 'fs';
import { basename, extname } from 'path';

const WHISPER_MAX_BYTES = 25 * 1024 * 1024; // 25 MB — OpenAI API hard limit

/**
 * Transcribe an audio file using the OpenAI transcription API.
 *
 * Model is controlled by the TRANSCRIPTION_MODEL env var:
 *   whisper-1                  — legacy, $0.006/min
 *   gpt-4o-mini-transcribe     — cheaper GPT-4o tier, $0.003/min
 *   gpt-4o-transcribe          — best accuracy, same cost as whisper-1, $0.006/min
 *   gpt-4o-transcribe-diarize  — speaker-labelled output, $0.008/min  [default]
 *
 * Returns the transcript as a plain string. For the diarize model the string
 * includes speaker labels: "[Speaker 1]: ...\n\n[Speaker 2]: ..."
 */
export async function transcribe(audioPath, model) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  model = model || process.env.TRANSCRIPTION_MODEL || 'gpt-4o-transcribe-diarize';
  const isDiarize = model.endsWith('-diarize');

  const { size } = statSync(audioPath);
  if (size > WHISPER_MAX_BYTES) {
    const mb = (size / 1024 / 1024).toFixed(1);
    throw new Error(
      `File is ${mb} MB — the transcription API limit is 25 MB. ` +
      `Please compress or trim your audio before uploading.`
    );
  }

  const formData = new FormData();
  formData.append('model', model);
  formData.append('language', 'en');
  formData.append('response_format', 'json');
  if (isDiarize) {
    formData.append('chunking_strategy', 'auto');
  }

  const { Blob } = await import('buffer');
  const { readFileSync } = await import('fs');
  const fileBuffer = readFileSync(audioPath);
  const fileName = basename(audioPath);
  const mimeMap = {
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
  };
  const mime = mimeMap[extname(audioPath).toLowerCase()] ?? 'audio/mpeg';
  formData.append('file', new Blob([fileBuffer], { type: mime }), fileName);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

  let res;
  try {
    res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(
        `Transcription timed out after 5 minutes (model: ${model}). ` +
        `Try again, or set TRANSCRIPTION_MODEL=whisper-1 in your .env for faster processing.`
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Transcription API error ${res.status}: ${err}`);
  }

  const data = await res.json();

  if (isDiarize) {
    console.log('[transcribe] diarize response keys:', Object.keys(data));
    if (data.segments?.length) {
      console.log('[transcribe] first segment:', JSON.stringify(data.segments[0]));
    }
  }

  return isDiarize ? formatDiarizedTranscript(data) : (data.text || '').trim();
}

/**
 * Format a diarize response into a speaker-labelled string with real timestamps.
 * Consecutive segments from the same speaker are merged into one block.
 * Each block is prefixed with [MM:SS] using the first segment's start time.
 * Falls back to data.text if no segments are present.
 */
function formatDiarizedTranscript(data) {
  const segments = data.segments || [];
  if (segments.length === 0) return (data.text || '').trim();

  const lines = [];
  let currentSpeaker = null;
  let currentChunks = [];
  let blockStartSecs = 0;

  for (const seg of segments) {
    const speaker = seg.speaker || 'Speaker';
    const text = (seg.text || '').trim();
    if (!text) continue;

    if (speaker !== currentSpeaker) {
      if (currentSpeaker !== null) {
        lines.push(`[${formatTimestamp(blockStartSecs)}] [${currentSpeaker}]: ${currentChunks.join(' ')}`);
      }
      currentSpeaker = speaker;
      currentChunks = [text];
      blockStartSecs = seg.start ?? 0;
    } else {
      currentChunks.push(text);
    }
  }

  if (currentSpeaker !== null && currentChunks.length > 0) {
    lines.push(`[${formatTimestamp(blockStartSecs)}] [${currentSpeaker}]: ${currentChunks.join(' ')}`);
  }

  return lines.join('\n\n');
}

/** Convert seconds to MM:SS string */
function formatTimestamp(secs) {
  const s = Math.floor(secs ?? 0);
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const r = (s % 60).toString().padStart(2, '0');
  return `${m}:${r}`;
}
