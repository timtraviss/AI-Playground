import { spawn } from 'child_process';
import { readFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import { resolve, basename, extname } from 'path';

const TMP_OUT = '/tmp/podcast_review';

// Ensure output dir exists
mkdirSync(TMP_OUT, { recursive: true });

/**
 * Transcribe an audio file using the local Whisper CLI.
 * Returns the plain-text transcript string.
 * Throws if Whisper is not installed or transcription fails.
 */
export async function transcribe(audioPath) {
  return new Promise((resolve2, reject) => {
    // Try 'whisper' CLI first, fall back to 'python3 -m whisper'
    const args = [
      audioPath,
      '--output_format', 'txt',
      '--output_dir', TMP_OUT,
      '--language', 'en',
    ];

    let proc = spawn('whisper', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let usedFallback = false;

    const tryFallback = () => {
      usedFallback = true;
      proc = spawn('python3', ['-m', 'whisper', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
      attachListeners();
    };

    const attachListeners = () => {
      let stderr = '';
      proc.stderr.on('data', d => { stderr += d.toString(); });

      proc.on('error', (err) => {
        if (!usedFallback && (err.code === 'ENOENT' || err.code === 'EACCES')) {
          tryFallback();
        } else {
          reject(new Error(
            `Whisper not found. Install it with:\n  pip install openai-whisper --break-system-packages`
          ));
        }
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`Whisper exited with code ${code}:\n${stderr}`));
        }

        // Whisper writes {filename}.txt to TMP_OUT
        const base = basename(audioPath, extname(audioPath));
        const txtPath = `${TMP_OUT}/${base}.txt`;

        if (!existsSync(txtPath)) {
          return reject(new Error(`Whisper output not found at ${txtPath}`));
        }

        const transcript = readFileSync(txtPath, 'utf8').trim();

        // Clean up transcript file
        try { unlinkSync(txtPath); } catch {}

        resolve2(transcript);
      });
    };

    attachListeners();
  });
}
