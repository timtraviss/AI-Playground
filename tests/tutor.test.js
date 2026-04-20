import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlToMarkdown, slugify } from '../server/lib/docxToMarkdown.js';

// slugify
test('slugify converts display name to safe filename id', () => {
  assert.equal(slugify('Arson & Intentional Damage'), 'arson_intentional_damage');
});

test('slugify lowercases and strips special chars', () => {
  assert.equal(slugify('Robbery and Blackmail Module v5'), 'robbery_and_blackmail_module_v5');
});

// h1/h2/h3
test('htmlToMarkdown converts h1', () => {
  assert.equal(htmlToMarkdown('<h1>Title</h1>').trim(), '# Title');
});

test('htmlToMarkdown converts h2', () => {
  assert.equal(htmlToMarkdown('<h2>Sub</h2>').trim(), '## Sub');
});

test('htmlToMarkdown converts h3', () => {
  assert.equal(htmlToMarkdown('<h3>Minor</h3>').trim(), '### Minor');
});

// paragraphs
test('htmlToMarkdown converts p to plain text with blank line', () => {
  const result = htmlToMarkdown('<p>Hello world</p>');
  assert.ok(result.includes('Hello world'));
});

// bold and italic inline
test('htmlToMarkdown converts strong to **', () => {
  assert.ok(htmlToMarkdown('<p><strong>bold</strong></p>').includes('**bold**'));
});

test('htmlToMarkdown converts em to *', () => {
  assert.ok(htmlToMarkdown('<p><em>italic</em></p>').includes('*italic*'));
});

// blockquote (Quote DDP)
test('htmlToMarkdown converts blockquote to >', () => {
  const result = htmlToMarkdown('<blockquote><p>Callout text</p></blockquote>');
  assert.ok(result.includes('> Callout text'));
});

// list items
test('htmlToMarkdown converts ul/li to - bullets', () => {
  const result = htmlToMarkdown('<ul><li>First</li><li>Second</li></ul>');
  assert.ok(result.includes('- First'));
  assert.ok(result.includes('- Second'));
});

// annotation text (rendered by mammoth as <p class="annotation">)
test('htmlToMarkdown converts annotation class to italic', () => {
  const result = htmlToMarkdown('<p class="annotation">Note text</p>');
  assert.ok(result.includes('*Note text*'));
});

// legislation table
test('htmlToMarkdown converts two-column table to **LABEL** / > content', () => {
  const html = `<table><tbody><tr><td><p>LEGISLATION</p></td><td><p>Section 267 Crimes Act 1961</p></td></tr></tbody></table>`;
  const result = htmlToMarkdown(html);
  assert.ok(result.includes('**LEGISLATION**'));
  assert.ok(result.includes('> Section 267 Crimes Act 1961'));
});
