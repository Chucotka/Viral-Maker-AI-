/** Безопасные HTTP-ответы: не отдаём клиенту внутренние детали ошибок. */

const { mapClientSafeError, GENERIC_MESSAGE } = require('./apiErrorMap');

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

/** Известные ошибки — понятное сообщение; остальное — generic 500. */
function sendMappedError(res, err, context = 'api') {
  const mapped = mapClientSafeError(err);
  const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err);
  console.error(`[${context}]`, msg);
  if (mapped) {
    return sendClientError(res, mapped.status, mapped.code, mapped.message);
  }
  return sendSafeError(res, err, context);
}

module.exports = {
  GENERIC_MESSAGE,
  sendSafeError,
  sendClientError,
  sendMappedError,
  mapClientSafeError,
};
