const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  getPublicPlans,
  getPlanById,
  formatPlanPriceRub,
  paymentLegalNote,
} = require('../lib/planPricing');

describe('planPricing', () => {
  it('exposes RUB prices for all tiers', () => {
    const plans = getPublicPlans();
    assert.equal(plans.length, 3);
    assert.equal(getPlanById('free').priceRub, 0);
    assert.equal(getPlanById('pro').priceRub, 299);
    assert.equal(getPlanById('premium').priceRub, 799);
  });

  it('formats ruble labels', () => {
    assert.equal(formatPlanPriceRub(getPlanById('free')), '0 ₽');
    assert.equal(formatPlanPriceRub(getPlanById('pro')), '299 ₽ / 30 дн.');
  });

  it('mentions card payment in legal note', () => {
    assert.match(paymentLegalNote(), /рубл/i);
    assert.match(paymentLegalNote(), /карт/i);
    assert.match(paymentLegalNote(), /Tribute/i);
  });
});
