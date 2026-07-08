/**
 * Публичные тарифы для лендинга, UI и legal-документов.
 * Основная валюта отображения — рубли (РФ).
 */
const PUBLIC_PLANS = [
  {
    id: 'free',
    name: 'Free',
    priceRub: 0,
    periodDays: null,
    summary: '5 бесплатных генераций на аккаунт',
    starsAlternative: null,
  },
  {
    id: 'pro',
    name: 'Pro',
    priceRub: 299,
    periodDays: 30,
    summary: 'Безлимит генераций · аналитика · 2 AI-варианта',
    starsAlternative: 99,
  },
  {
    id: 'premium',
    name: 'Premium',
    priceRub: 799,
    periodDays: 30,
    summary: 'Pro + картинки в канал · 3 AI-варианта',
    starsAlternative: 299,
  },
];

function getPublicPlans() {
  return PUBLIC_PLANS.map((p) => ({ ...p }));
}

function getPlanById(planId) {
  return PUBLIC_PLANS.find((p) => p.id === String(planId || '').toLowerCase()) || null;
}

function formatPlanPriceRub(plan) {
  if (!plan || plan.priceRub === 0) return '0 ₽';
  const period = plan.periodDays ? ` / ${plan.periodDays} дн.` : '';
  return `${plan.priceRub} ₽${period}`;
}

function planPriceLabel(planId) {
  const plan = getPlanById(planId);
  if (!plan) return '';
  return formatPlanPriceRub(plan);
}

function paymentLegalNote() {
  return (
    'Оплата подписки в рублях через банковскую карту (Tribute). ' +
    'В Telegram дополнительно доступна оплата через Telegram Stars — внутреннюю платёжную единицу Telegram (не криптовалюту).'
  );
}

module.exports = {
  PUBLIC_PLANS,
  getPublicPlans,
  getPlanById,
  formatPlanPriceRub,
  planPriceLabel,
  paymentLegalNote,
};
