const { generateContentRobust } = require('./geminiRobust');
const { computeViralScore } = require('./viralScore');
const {
  buildRewriteTextPrompt,
  normalizeIntent,
  normalizeGoal,
  inferPostGoal,
  goalInstruction,
} = require('./buildTextPrompt');

const STOPWORDS = new Set([
  'и', 'в', 'во', 'на', 'но', 'а', 'что', 'это', 'как', 'к', 'ко', 'с', 'со', 'по', 'из', 'у', 'о', 'об', 'от',
  'для', 'же', 'ли', 'не', 'ни', 'да', 'или', 'то', 'бы', 'только', 'уже', 'ещё', 'все', 'всё', 'мы', 'вы', 'они',
  'он', 'она', 'оно', 'я', 'ты', 'мой', 'твой', 'наш', 'ваш', 'его', 'её', 'их', 'the', 'a', 'an', 'of', 'to',
  'in', 'on', 'for', 'and', 'or', 'is', 'are', 'be', 'это', 'как', 'так', 'там', 'тут',
]);

function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeForSimilarity(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-zа-я0-9ё]+/gi, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function jaccardSimilarity(a, b) {
  const left = new Set(normalizeForSimilarity(a));
  const right = new Set(normalizeForSimilarity(b));
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function historyTextList(recentHistory = []) {
  return (Array.isArray(recentHistory) ? recentHistory : [])
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      return String(item.text || item.prompt || item.topic || '').trim();
    })
    .filter(Boolean);
}

function candidateAnglesForGoal(goal) {
  const normalized = normalizeGoal(goal);
  if (normalized === 'sale') {
    return [
      { id: 'proof', title: 'Доказательство', instruction: 'Подай текст через кейс, факт, результат или убедительный пример.' },
      { id: 'offer', title: 'Оффер', instruction: 'Сделай акцент на выгоде, ценности и понятной причине попробовать прямо сейчас.' },
      { id: 'urgency', title: 'Срочность', instruction: 'Добавь ощущение момента и короткий сильный CTA без давления.' },
    ];
  }
  if (normalized === 'trust') {
    return [
      { id: 'case', title: 'Кейс', instruction: 'Подай текст как конкретный кейс, который усиливает доверие и снимает сомнения.' },
      { id: 'clarity', title: 'Ясное объяснение', instruction: 'Объясни тему спокойно, прозрачно и без лишнего шума.' },
      { id: 'reflection', title: 'Честный вывод', instruction: 'Подай текст как честный вывод из опыта, без пафоса и без общих слов.' },
    ];
  }
  if (normalized === 'warmup') {
    return [
      { id: 'story', title: 'Личная история', instruction: 'Подай текст как живую личную историю, наблюдение или честное признание.' },
      { id: 'insight', title: 'Инсайт', instruction: 'Подай текст через неожиданный инсайт, который кажется точным и полезным.' },
      { id: 'practical', title: 'Практика', instruction: 'Подай текст через конкретную практическую пользу и ясный вывод.' },
    ];
  }
  if (normalized === 'reach') {
    return [
      { id: 'hot_take', title: 'Смелый take', instruction: 'Сделай сильный смелый заход с контрастом и яркой первой строкой.' },
      { id: 'contrarian', title: 'Контраргумент', instruction: 'Покажи неожиданный взгляд, который спорит с привычной позицией, но остаётся полезным.' },
      { id: 'debate', title: 'Повод для спора', instruction: 'Сделай текст таким, чтобы он вызывал обсуждение, но не скатывался в дешёвый кликбейт.' },
    ];
  }
  return null;
}

function candidateAnglesForIntent(intent, goal) {
  const goalAngles = candidateAnglesForGoal(goal);
  if (goalAngles) return goalAngles;
  const normalized = normalizeIntent(intent);
  if (normalized === 'sell') {
    return [
      { id: 'proof', title: 'Польза через доказательство', instruction: 'Подай пост через кейс, факт, результат или убедительный пример.' },
      { id: 'offer', title: 'Польза через оффер', instruction: 'Сделай акцент на выгоде, ценности и понятной причине попробовать прямо сейчас.' },
      { id: 'urgency', title: 'Польза через срочность', instruction: 'Добавь ощущение момента и короткий сильный CTA без давления.' },
    ];
  }
  if (normalized === 'personal') {
    return [
      { id: 'story', title: 'Личная история', instruction: 'Подай текст как живую личную историю, наблюдение или честное признание.' },
      { id: 'reflection', title: 'Личный вывод', instruction: 'Подай текст как личный вывод из опыта, без пафоса и без общих слов.' },
      { id: 'detail', title: 'Деталь из жизни', instruction: 'Сделай текст через маленькую деталь, которая цепляет и делает историю живой.' },
    ];
  }
  if (normalized === 'explain') {
    return [
      { id: 'simple', title: 'Простой разбор', instruction: 'Объясни тему максимально просто, понятно и по шагам.' },
      { id: 'myth', title: 'Миф vs правда', instruction: 'Разбей тему через миф/правда и аккуратное объяснение без воды.' },
      { id: 'steps', title: 'Пошагово', instruction: 'Сделай текст в форме короткого пошагового разбора с конкретными действиями.' },
    ];
  }
  if (normalized === 'provocative') {
    return [
      { id: 'hot_take', title: 'Смелый take', instruction: 'Сделай сильный смелый заход с контрастом и яркой первой строкой.' },
      { id: 'contrarian', title: 'Контраргумент', instruction: 'Покажи неожиданный взгляд, который спорит с привычной позицией, но остаётся полезным.' },
      { id: 'debate', title: 'Повод для спора', instruction: 'Сделай текст таким, чтобы он вызывал обсуждение, но не скатывался в дешёвый кликбейт.' },
    ];
  }
  if (normalized === 'surprise') {
    return [
      { id: 'unexpected', title: 'Неожиданный ход', instruction: 'Придумай нестандартную, но уместную подачу, которая сразу цепляет.' },
      { id: 'contrast', title: 'Контраст', instruction: 'Сделай подачу через контраст, который быстро раскрывает мысль.' },
      { id: 'fresh', title: 'Свежий угол', instruction: 'Выбери самый свежий и неочевидный угол из возможных.' },
    ];
  }
  return [
    { id: 'story', title: 'История', instruction: 'Подай текст через короткую сцену, наблюдение или маленькую историю.' },
    { id: 'insight', title: 'Инсайт', instruction: 'Подай текст через неожиданный инсайт, который кажется точным и полезным.' },
    { id: 'practical', title: 'Практика', instruction: 'Подай текст через конкретную практическую пользу и ясный вывод.' },
  ];
}

function buildCandidatePrompt(basePrompt, angle, index, total) {
  return `${basePrompt}

Дополнительная задача для этого варианта:
Сделай подачу именно через угол "${angle.title}".
${angle.instruction}
Верни только один финальный текст, без пояснений.
Это вариант ${index} из ${total}.`;
}

function noveltyPenalty(text, recentHistory = [], otherCandidates = []) {
  const refs = [...historyTextList(recentHistory), ...otherCandidates.filter(Boolean)];
  if (!refs.length) return 0;
  const maxSim = refs.reduce((max, ref) => Math.max(max, jaccardSimilarity(text, ref)), 0);
  const avgSim = refs.reduce((sum, ref) => sum + jaccardSimilarity(text, ref), 0) / refs.length;
  return Math.round(maxSim * 30 + avgSim * 12);
}

function rankCandidate(text, recentHistory = [], otherCandidates = []) {
  const clean = String(text || '').trim();
  const viralScore = computeViralScore(clean);
  const penalty = noveltyPenalty(clean, recentHistory, otherCandidates);
  const length = clean.length;
  const lengthBonus = length >= 180 && length <= 1200 ? 3 : 0;
  const finalScore = viralScore - penalty + lengthBonus;
  return { viralScore, penalty, finalScore, length };
}

function extractJsonObject(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;
  try {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
  } catch (e) {
    return null;
  }
}

function normalizeStringList(value, limit = 4) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeCriticBreakdown(value) {
  const source = value && typeof value === 'object' ? value : {};
  const pick = (key) => {
    const n = Number(source[key]);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(10, Math.round(n)));
  };
  return {
    hook: pick('hook'),
    clarity: pick('clarity'),
    novelty: pick('novelty'),
    cta: pick('cta'),
    fit: pick('fit'),
  };
}

function normalizeCriticVerdict(rawText) {
  const parsed = extractJsonObject(rawText) || {};
  const score = clampScore(parsed.score);
  const issues = normalizeStringList(parsed.issues, 4);
  const strengths = normalizeStringList(parsed.strengths, 4);
  const breakdown = normalizeCriticBreakdown(parsed.breakdown);
  const verdict = String(parsed.verdict || parsed.summary || '').trim().slice(0, 240);
  const rewriteBrief = String(parsed.rewriteBrief || parsed.rewrite_note || parsed.advice || '').trim().slice(0, 240);
  const needsRewrite =
    typeof parsed.needsRewrite === 'boolean' ? parsed.needsRewrite : score > 0 ? score < 82 || issues.length > 0 : true;
  return {
    score,
    needsRewrite,
    verdict,
    issues,
    strengths,
    breakdown,
    rewriteBrief,
    raw: String(rawText || '').trim().slice(0, 1200),
  };
}

function buildCriticPrompt({ topic, platform, tone, profile, intent, recentHistory, draft, risk, goal }) {
  const selectedGoal = normalizeGoal(goal) === 'auto'
    ? inferPostGoal({ topic, intent, profile, recentHistory, risk })
    : normalizeGoal(goal);
  const history = historyTextList(recentHistory);
  const memory = history.length ? history.slice(0, 5).map((item, index) => `${index + 1}) ${item}`).join('\n') : '';
  const niche = profile?.niche ? `Ниша автора: ${String(profile.niche).trim()}.` : '';
  const brandMemory = profile?.brandMemory ? `Память бренда: ${String(profile.brandMemory).trim()}.` : '';
  return `Ты строгий редактор и критик вирусного контента.
Оцени черновик для соцсетей и верни ТОЛЬКО JSON без markdown, без пояснений и без лишнего текста.

Контекст:
Платформа: ${String(platform || 'Telegram')}.
Тон: ${String(tone || 'вирусный')}.
Тема: ${String(topic || '').trim()}.
Intent: ${String(intent || 'auto')}.
${goalInstruction(selectedGoal)}
${risk ? `Желаемая смелость: ${String(risk).trim()}.` : ''}
${niche}
${brandMemory}

Память последних публикаций:
${memory || 'нет'}

Черновик:
${String(draft || '').trim()}

Верни JSON строго такого вида:
{
  "score": 0,
  "needsRewrite": true,
  "verdict": "короткий вывод",
  "strengths": ["..."],
  "issues": ["..."],
  "breakdown": { "hook": 0, "clarity": 0, "novelty": 0, "cta": 0, "fit": 0 },
  "rewriteBrief": "что именно улучшить"
}

Критерии оценки:
1. Сильный ли первый хук.
2. Есть ли конкретика и польза.
3. Не звучит ли текст банально.
4. Есть ли соответствие площадке и тону.
5. Есть ли свежесть относительно последних публикаций.
6. Насколько текст попадает в выбранную цель поста.
`;
}

async function criticReviewText(genAI, modelChain, prompt, opts = {}) {
  try {
    const result = await generateContentRobust(genAI, modelChain, prompt, opts);
    const parsed = normalizeCriticVerdict(result.content);
    return { ...parsed, modelUsed: result.modelUsed };
  } catch (e) {
    return {
      score: 0,
      needsRewrite: true,
      verdict: 'critic_failed',
      issues: ['Не удалось получить оценку критика'],
      strengths: [],
      rewriteBrief: 'Улучшить хук, конкретику и свежесть подачи.',
      raw: '',
      modelUsed: null,
      error: e?.message || 'critic_failed',
    };
  }
}

function isRewriteWorthIt(draft, rewrite) {
  const draftText = String(draft || '').trim();
  const rewriteText = String(rewrite || '').trim();
  if (!draftText || !rewriteText) return false;
  if (rewriteText === draftText) return false;

  const draftScore = computeViralScore(draftText);
  const rewriteScore = computeViralScore(rewriteText);
  const rewriteLen = rewriteText.length;
  const draftLen = draftText.length;
  const lengthOk = rewriteLen >= Math.max(180, Math.floor(draftLen * 0.7));

  if (rewriteScore >= draftScore + 4) return true;
  if (rewriteScore >= draftScore && lengthOk) return true;
  if (draftScore < 60 && rewriteScore >= draftScore - 2 && lengthOk) return true;
  return false;
}

async function generateBestTextContent(genAI, modelChain, prompt, opts = {}) {
  const goal = normalizeGoal(opts.goal) === 'auto'
    ? inferPostGoal(opts)
    : normalizeGoal(opts.goal);
  const angles = candidateAnglesForIntent(opts.intent, goal);
  const candidates = [];
  const baseCandidates = [];

  for (let i = 0; i < angles.length; i += 1) {
    const angle = angles[i];
    try {
      const candidatePrompt = buildCandidatePrompt(prompt, angle, i + 1, angles.length);
      const result = await generateContentRobust(genAI, modelChain, candidatePrompt, opts);
      const metrics = rankCandidate(result.content, opts.recentHistory, baseCandidates);
      const candidate = { ...result, ...metrics, angle: angle.id };
      candidates.push(candidate);
      baseCandidates.push(candidate.content);
    } catch (e) {
      // skip failed candidate and keep the rest
    }
  }

  let selected = candidates[0] || null;
  for (const candidate of candidates) {
    if (!selected || candidate.finalScore > selected.finalScore) selected = candidate;
  }

  if (!selected) {
    const draftResult = await generateContentRobust(genAI, modelChain, prompt, opts);
    selected = {
      ...draftResult,
      ...rankCandidate(draftResult.content, opts.recentHistory, []),
      angle: 'fallback',
    };
  }

  const draftSelected = selected;
  const criticPrompt = buildCriticPrompt({
    topic: opts.topic,
    platform: opts.platform,
    tone: opts.tone,
    profile: opts.profile,
    intent: opts.intent,
    recentHistory: opts.recentHistory,
    draft: draftSelected.content,
    risk: opts.risk,
    goal,
  });
  const critic = await criticReviewText(genAI, modelChain, criticPrompt, opts);

  let rewriteResult = null;
  let rewriteScore = null;
  if (critic.needsRewrite || critic.score < 82) {
    try {
      const rewritePrompt = buildRewriteTextPrompt({
        topic: opts.topic,
        platform: opts.platform,
        tone: opts.tone,
        profile: opts.profile,
        intent: opts.intent,
        recentHistory: opts.recentHistory,
        draft: draftSelected.content,
        critic,
        risk: opts.risk,
        goal,
      });
      rewriteResult = await generateContentRobust(genAI, modelChain, rewritePrompt, opts);
      rewriteScore = computeViralScore(rewriteResult.content);
    } catch (e) {
      rewriteResult = null;
    }
  }

  const useRewrite = rewriteResult && isRewriteWorthIt(draftSelected.content, rewriteResult.content);
  if (useRewrite) {
    selected = {
      ...rewriteResult,
      ...rankCandidate(rewriteResult.content, opts.recentHistory, baseCandidates),
      angle: `${draftSelected.angle}:rewrite`,
    };
  } else {
    selected = draftSelected;
  }

  const rankedCandidates = [...candidates].sort((a, b) => b.finalScore - a.finalScore);
  const runnerUp = rankedCandidates.find((candidate) => candidate.angle !== draftSelected.angle) || null;

  return {
    content: selected.content,
    modelUsed: selected.modelUsed,
    viralScore: selected.viralScore,
    draftScore: draftSelected.viralScore,
    rewriteScore,
    rewriteApplied: !!useRewrite,
    selectedAngle: selected.angle,
    candidateCount: candidates.length,
    candidateSummary: candidates.map((c) => ({ angle: c.angle, viralScore: c.viralScore, penalty: c.penalty, finalScore: c.finalScore })),
    criticScore: critic.score,
    criticNeedsRewrite: !!critic.needsRewrite,
    criticVerdict: critic.verdict,
    criticIssues: critic.issues,
    criticStrengths: critic.strengths,
    criticBreakdown: critic.breakdown,
    alternateContent: runnerUp ? runnerUp.content : '',
    alternateAngle: runnerUp ? runnerUp.angle : '',
    alternateScore: runnerUp ? runnerUp.viralScore : null,
    goal,
  };
}

module.exports = {
  generateBestTextContent,
  isRewriteWorthIt,
  candidateAnglesForIntent,
  buildCandidatePrompt,
  noveltyPenalty,
  rankCandidate,
};
