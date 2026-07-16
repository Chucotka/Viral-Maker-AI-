const { getPublicPlans, paymentLegalNote } = require('../lib/planPricing');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();
  return res.status(200).json({
    currency: 'RUB',
    plans: getPublicPlans(),
    paymentNote: paymentLegalNote(),
    landingUrl: '/app/landing.html',
    appUrl: '/app/',
  });
};
