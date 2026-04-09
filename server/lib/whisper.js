import { statSync } from 'fs';
import { basename, extname } from 'path';

const WHISPER_MAX_BYTES = 25 * 1024 * 1024; // 25 MB — OpenAI API hard limit

/**
 * Transcribe an audio file using the OpenAI Whisper API.
 * Returns the plain-text transcript string.
 * Requires OPENAI_API_KEY in environment.
 */
export async function transcribe(audioPath) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const { size } = statSync(audioPath);
  if (size > WHISPER_MAX_BYTES) {
    const mb = (size / 1024 / 1024).toFixed(1);
    throw new Error(
      `File is ${mb} MB — the Whisper API limit is 25 MB. ` +
      `Please compress or trim your audio before uploading.`
    );
  }

  const formData = new FormData();
  formData.append('model', 'whisper-1');
  formData.append('language', 'en');
  formData.append('response_format', 'text');

  // Append the file stream — Node 22 fetch supports FormData with Blob/File
  const { Blob } = await import('buffer');
  const { readFileSync } = await import('fs');
  const fileBuffer = readFileSync(audioPath);
  const fileName = basename(audioPath);
  const mimeMap = { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac' };
  const mime = mimeMap[extname(audioPath).toLowerCase()] ?? 'audio/mpeg';
  formData.append('file', new Blob([fileBuffer], { type: mime }), fileName);

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper API error ${res.status}: ${err}`);
  }

  return (await res.text()).trim();
}
