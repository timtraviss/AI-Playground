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
export async function transcribe(audioPath) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const model = process.env.TRANSCRIPTION_MODEL || 'gpt-4o-transcribe-diarize';
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

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

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
 * Format a verbose_json diarize response into a speaker-labelled string.
 * Consecutive segments from the same speaker are merged into one block.
 * Falls back to data.text if no segments are present.
 */
function formatDiarizedTranscript(data) {
  const segments = data.segments || [];
  if (segments.length === 0) return (data.text || '').trim();

  const lines = [];
  let currentSpeaker = null;
  let currentChunks = [];

  for (const seg of segments) {
    const speaker = seg.speaker || 'Speaker';
    const text = (seg.text || '').trim();
    if (!text) continue;

    if (speaker !== currentSpeaker) {
      if (currentSpeaker !== null) {
        lines.push(`[${currentSpeaker}]: ${currentChunks.join(' ')}`);
      }
      currentSpeaker = speaker;
      currentChunks = [text];
    } else {
      currentChunks.push(text);
    }
  }

  if (currentSpeaker !== null && currentChunks.length > 0) {
    lines.push(`[${currentSpeaker}]: ${currentChunks.join(' ')}`);
  }

  return lines.join('\n\n');
}
