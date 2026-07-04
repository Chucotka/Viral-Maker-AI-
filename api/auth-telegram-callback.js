const { validateTelegramLoginWidget } = require('../lib/telegramLoginWidget');
const { readSessionToken, verifySession, signSession, setSessionCookie } = require('../lib/webSession');
const { resolveWebAppUrl } = require('../lib/webOrigin');
const { mergeGuestIntoTelegram, readGuestUserIdFromRequest } = require('../lib/guestAccountMerge');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = resolveWebAppUrl();

  if (!botToken) {
    return res.redirect(302, `${appUrl}?auth_error=server`);
  }

  const validated = validateTelegramLoginWidget(req.query || {}, botToken);
  if (!validated) {
    return res.redirect(302, `${appUrl}?auth_error=invalid`);
  }

  try {
    const userId = String(validated.user.id);
    let mergedGuest = false;
    const guestUserId = readGuestUserIdFromRequest(req);
    if (guestUserId) {
      const mergeResult = await mergeGuestIntoTelegram(guestUserId, userId, validated.user);
      mergedGuest = mergeResult.merged === true;
    }

    const existingPayload = verifySession(readSessionToken(req));
    const startParam = existingPayload?.startParam || null;
    const sessionToken = signSession({
      userId,
      user: validated.user,
      authKind: 'telegram',
      startParam,
    });
    setSessionCookie(res, sessionToken);
    const redirectUrl = new URL(appUrl);
    if (mergedGuest) redirectUrl.searchParams.set('guest_merged', '1');
    return res.redirect(302, redirectUrl.toString());
  } catch (e) {
    return res.redirect(302, `${appUrl}?auth_error=session`);
  }
};
