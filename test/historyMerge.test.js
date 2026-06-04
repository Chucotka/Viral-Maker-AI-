const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { historyItemKey, mergeHistoryLists } = require('../lib/historyMerge');

describe('historyMerge', () => {
  it('image keys use ts only (prompt length must not split entries)', () => {
    const ts = 1710000000000;
    const short = { ts, type: 'image', prompt: 'a'.repeat(240) };
    const long = { ts, type: 'image', prompt: 'a'.repeat(400) };
    assert.equal(historyItemKey(short), historyItemKey(long));
  });

  it('merge keeps dataUrl from local when server entry has metadata only', () => {
    const ts = 1710000000001;
    const server = [{ ts, type: 'image', prompt: 'кот в шляпе', directorApplied: true }];
    const local = [
      {
        ts,
        type: 'image',
        prompt: 'кот',
        dataUrl: 'data:image/png;base64,abc',
        mimeType: 'image/png',
      },
    ];
    const merged = mergeHistoryLists(server, local);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].dataUrl, 'data:image/png;base64,abc');
    assert.equal(merged[0].prompt, 'кот в шляпе');
  });
});
