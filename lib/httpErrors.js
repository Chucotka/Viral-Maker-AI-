/** Безопасные HTTP-ответы: не отдаём клиенту внутренние детали ошибок. */

const GENERIC_MESSAGE = 'Внутренняя ошибка сервера. Попробуйте позже.';

/**
 * @param {import('http').ServerResponse} res
 * @param {unknown} err
 * @param {string} [context] — метка для server logs
 * @param {number} [status=500]
 */
function sendSafeError(res, err, context = 'api', status = 500) {
  const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err);
  console.error(`[${context}]`, msg);
  if (!res.headersSent) {
    res.status(status).json({
      error: 'internal_error',
      message: GENERIC_MESSAGE,
    });
  }
}

/** Явная ошибка с безопасным пользовательским сообщением. */
function sendClientError(res, status, code, message) {
  if (!res.headersSent) {
    res.status(status).json({ error: code, message });
  }
}

module.exports = {
  GENERIC_MESSAGE,
  sendSafeError,
  sendClientError,
};
