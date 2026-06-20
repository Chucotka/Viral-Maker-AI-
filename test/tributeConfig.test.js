const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  decodeTributeSlug,
  extractSlugFromWebLink,
  getTributePlanConfig,
  resolveTributePlanByProductId,
} = require('../lib/tributeConfig');

describe('tributeConfig', () => {
  it('decodes Tribute /p/ slug to numeric product id', () => {
    assert.equal(decodeTributeSlug('vya'), 121282);
    assert.equal(decodeTributeSlug('vyk'), 121292);
  });

  it('extracts slug from webLink', () => {
    assert.equal(extractSlugFromWebLink('https://web.tribute.tg/p/vya'), 'vya');
  });

  it('resolves plan from product id when only WEBLINK is set', () => {
    const prev = {
      pro: process.env.TRIBUTE_PRO_WEBLINK,
      premium: process.env.TRIBUTE_PREMIUM_WEBLINK,
      proId: process.env.TRIBUTE_PRO_PRODUCT_ID,
      premiumId: process.env.TRIBUTE_PREMIUM_PRODUCT_ID,
    };
    process.env.TRIBUTE_PRO_WEBLINK = 'https://web.tribute.tg/p/vya';
    process.env.TRIBUTE_PREMIUM_WEBLINK = 'https://web.tribute.tg/p/vyk';
    delete process.env.TRIBUTE_PRO_PRODUCT_ID;
    delete process.env.TRIBUTE_PREMIUM_PRODUCT_ID;

    assert.equal(getTributePlanConfig('pro').productId, 121282);
    assert.equal(getTributePlanConfig('premium').productId, 121292);
    assert.equal(resolveTributePlanByProductId(121282), 'pro');
    assert.equal(resolveTributePlanByProductId(121292), 'premium');

    if (prev.pro) process.env.TRIBUTE_PRO_WEBLINK = prev.pro;
    else delete process.env.TRIBUTE_PRO_WEBLINK;
    if (prev.premium) process.env.TRIBUTE_PREMIUM_WEBLINK = prev.premium;
    else delete process.env.TRIBUTE_PREMIUM_WEBLINK;
    if (prev.proId) process.env.TRIBUTE_PRO_PRODUCT_ID = prev.proId;
    if (prev.premiumId) process.env.TRIBUTE_PREMIUM_PRODUCT_ID = prev.premiumId;
  });
});
