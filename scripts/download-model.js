import { pipeline, env } from '@huggingface/transformers';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
env.cacheDir = join(__dirname, '../models');

console.log('Downloading Whisper tiny.en model to ./models/ …');
await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', { dtype: 'fp32' });
console.log('Done.');
process.exit(0);
