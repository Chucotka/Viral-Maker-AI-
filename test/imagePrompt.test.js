const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildImageModelPrompt,
  isUsableImageEnhancement,
  stripImagePromptFences,
} = require('../lib/buildTextPrompt');

describe('imagePrompt', () => {
  it('buildImageModelPrompt keeps user subject first', () => {
    const prompt = buildImageModelPrompt({
      prompt: 'красная спортивная машина на закате',
      aspectRatio: '9:16',
      style: 'фотореализм, кинематографичный свет',
    });
    assert.match(prompt, /красная спортивная машина на закате/);
    assert.match(prompt, /accurately depicts/i);
    assert.doesNotMatch(prompt, /визуальный директор/i);
  });

  it('rejects meta-style critic output', () => {
    const bad = 'Ты визуальный директор. Перепиши исходный prompt...';
    assert.equal(isUsableImageEnhancement(bad, 'кот в космосе'), false);
  });

  it('accepts concise scene enhancement', () => {
    const good = 'A red sports car at sunset, photorealistic, cinematic lighting, 9:16 vertical shot';
    assert.equal(isUsableImageEnhancement(good, 'красная машина на закате'), true);
  });

  it('stripImagePromptFences removes markdown fences', () => {
    assert.equal(stripImagePromptFences('```text\nhello\n```'), 'hello');
  });
});
