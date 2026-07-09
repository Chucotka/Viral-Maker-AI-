/** Безопасные пользовательские сообщения для известных ошибок API. */

const GENERIC_MESSAGE = 'Внутренняя ошибка сервера. Попробуйте позже.';

/**
 * @param {unknown} err
 * @returns {{ status: number, code: string, message: string } | null}
 */
function mapClientSafeError(err) {
  const msg = String(err && typeof err === 'object' && 'message' in err ? err.message : err || '');
  const status = Number(err && typeof err === 'object' && 'status' in err ? err.status : 0) || 0;

  if (msg === 'limit_reached') {
    return {
      status: 403,
      code: 'limit_reached',
      message: 'Лимит исчерпан. Перейди на Pro или пригласи друзей.',
    };
  }

  if (/503|high demand|Service Unavailable|UNAVAILABLE/i.test(msg)) {
    return {
      status: 503,
      code: 'gemini_unavailable',
      message: 'Сервис Google временно перегружен. Подождите минуту и попробуйте снова.',
    };
  }

  if (status === 429 || /429|RESOURCE_EXHAUSTED|quota exceeded|rate limit/i.test(msg)) {
    return {
      status: 429,
      code: 'gemini_rate_limit',
      message: 'Превышен лимит запросов к Google AI. Подождите минуту и попробуйте снова.',
    };
  }

  if (/User location is not supported for the API use/i.test(msg)) {
    return {
      status: 503,
      code: 'gemini_region',
      message:
        'Gemini недоступен из региона сервера. Проверьте GEMINI_HTTPS_PROXY в .env и перезапустите pm2.',
    };
  }

  if (
    /API[_ ]?key|invalid api key|API key not valid|PERMISSION_DENIED/i.test(msg) ||
    status === 401 ||
    (status === 403 && /api key|permission/i.test(msg))
  ) {
    return {
      status: 503,
      code: 'gemini_api_key',
      message: 'Неверный или отсутствующий GEMINI_API_KEY на сервере.',
    };
  }

  if (/billing|payment|enable billing/i.test(msg)) {
    return {
      status: 503,
      code: 'gemini_billing',
      message: 'Для генерации изображений включите биллинг в Google AI Studio.',
    };
  }

  if (/404|not found for API version|no longer available|ListModels|model.*not found/i.test(msg) || status === 404) {
    return {
      status: 502,
      code: 'gemini_model',
      message: 'Модель генерации недоступна. Обновите приложение на сервере.',
    };
  }

  if (/политикой|blockReason|SAFETY|blocked/i.test(msg) || (status === 400 && /block|safety|policy/i.test(msg))) {
    return {
      status: 400,
      code: 'prompt_blocked',
      message: 'Запрос отклонён политикой безопасности. Измените описание.',
    };
  }

  if (/Пустой ответ|нет изображения|empty/i.test(msg) || status === 502) {
    return {
      status: 502,
      code: 'gemini_empty',
      message: 'Модель не вернула результат. Уточните описание или попробуйте позже.',
    };
  }

  if (/Redis is not configured|kv_required/i.test(msg)) {
    return {
      status: 503,
      code: 'kv_required',
      message: 'На сервере не настроен Redis (UPSTASH_REDIS_REST_URL / TOKEN).',
    };
  }

  if (msg && msg.length > 0 && msg.length < 240 && !/secret|password|token/i.test(msg)) {
    return {
      status: status >= 400 && status < 600 ? status : 502,
      code: 'upstream_error',
      message: msg,
    };
  }

  return null;
}

module.exports = { mapClientSafeError, GENERIC_MESSAGE };
