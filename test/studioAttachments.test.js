const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseStudioAttachments,
  buildGeminiPartsFromAttachments,
  attachmentContextSuffix,
} = require('../lib/studioAttachments');

describe('studioAttachments', () => {
  it('parses text and image attachments', () => {
    const list = parseStudioAttachments([
      { type: 'text', name: 'post.md', content: 'Hello world' },
      { type: 'image', mimeType: 'image/png', dataBase64: 'aGVsbG8=' },
    ]);
    assert.equal(list.length, 2);
    assert.equal(list[0].type, 'text');
    assert.equal(list[1].type, 'image');
  });

  it('rejects more than one image', () => {
    assert.throws(
      () =>
        parseStudioAttachments([
          { mimeType: 'image/png', dataBase64: 'aa==' },
          { mimeType: 'image/jpeg', dataBase64: 'bb==' },
        ]),
      /одно изображение/i,
    );
  });

  it('builds gemini parts with reference image', () => {
    const parts = buildGeminiPartsFromAttachments('Rewrite this', [
      { type: 'image', mimeType: 'image/png', dataBase64: 'abc' },
    ]);
    assert.equal(parts.length, 2);
    assert.equal(parts[0].text, 'Rewrite this');
    assert.equal(parts[1].inlineData.mimeType, 'image/png');
  });

  it('adds text file content to prompt suffix', () => {
    const suffix = attachmentContextSuffix([{ type: 'text', name: 'a.txt', content: 'Draft' }]);
    assert.match(suffix, /Draft/);
    assert.match(suffix, /a\.txt/);
  });
});
