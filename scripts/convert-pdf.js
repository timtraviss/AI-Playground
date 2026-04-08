import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// pdf-parse works with require, so we use createRequire
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const pdfPath = resolve(projectRoot, 'Investigative interviewing witness guide.pdf');
const outputPath = resolve(projectRoot, 'server/data/peace-reference.md');

async function convert() {
  console.log('Reading PDF...');
  const pdfBuffer = readFileSync(pdfPath);

  console.log('Parsing PDF...');
  const data = await pdfParse(pdfBuffer);

  // Clean up the extracted text
  let text = data.text;

  // Remove excessive blank lines (more than 2 consecutive)
  text = text.replace(/\n{3,}/g, '\n\n');

  // Remove page headers/footers that repeat (common pattern in PDFs)
  text = text.replace(/Page \d+ of \d+/gi, '');
  text = text.replace(/New Zealand Police/gi, '');

  // Trim leading/trailing whitespace
  text = text.trim();

  // Wrap in markdown with a header
  const markdown = `# Investigative Interviewing Witness Guide
## New Zealand Police Manual

*This document is the reference framework used to evaluate investigative interviews. It describes the PEACE model, ten principles of investigative interviewing, TEDS questioning technique, and cognitive interview methods.*

---

${text}
`;

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, markdown, 'utf8');

  console.log(`✓ Converted ${data.numpages} pages to markdown`);
  console.log(`✓ Output: ${outputPath}`);
  console.log(`  Characters: ${markdown.length.toLocaleString()}`);
}

convert().catch(err => {
  console.error('Conversion failed:', err);
  process.exit(1);
});
