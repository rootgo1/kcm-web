/**
 * Local prototype rules, not a trained/validated model. No I/O or risk-score math.
 * Replace analyzeRiskText at this boundary when a real classifier is available.
 * Conservative phrase patterns intentionally do not cover every Korean expression.
 */
export const TEXT_RISK_RULE_VERSION = 'local-text-rules-v3';
/** @typedef {import('../src/live/types.js').LiveTextRisk} TextRisk */
/** @typedef {import('../src/live/types.js').LiveRiskAnalysis} RiskAnalysis */
/** @typedef {import('../src/live/types.js').LiveMessage} Message */

// Lexical groups accept simple ASR spacing without treating an isolated '개' as profanity.
const profanityGroups = [
  String.raw`씨\s*[발팔]|시\s*발(?!\s*(?:점|역))`,
  String.raw`개\s*새끼|씹\s*새끼|병\s*신|지\s*랄`,
  String.raw`(?:개\s*판(?:\s*이\s*(?:네(?:요)?|야|군(?:요)?|다))?|(?:개|엿)\s*같(?:\s*(?:다|네(?:요)?|은|아|게))?)(?![가-힣A-Za-z0-9])`,
  // Preserve the existing unequivocal vulgar stem's inflections (e.g. 좆같아서/좆같이).
  String.raw`좆\s*같(?:\s*(?:다|네|은|아|게))?`,
];
const facilityTarget = String.raw`(?:매장|가게|시설|점포|사무실)(?:을|를|에서|에|으로|로)?`;
const destructionEnding = String.raw`(?:놓(?:는다|겠(?:다|어|습니다))|버(?:린다|리겠(?:다|어|습니다)|릴\s*거야))`;
const destructionVerbs = [
  String.raw`(?:뒤집어|엎어|부숴|부셔)\s*${destructionEnding}`,
  String.raw`부순다|(?:부수|뒤집|엎)겠(?:다|어|습니다)`,
  String.raw`박살\s*(?:낸다|내겠(?:다|어|습니다)|내\s*${destructionEnding})`,
].join('|');
const disturbanceIntent = String.raw`(?:난리\s*(?:친다|치겠(?:다|어|습니다))|난동(?:을)?\s*(?:부린다|부리겠(?:다|어|습니다)))`;

/** @type {{ type: import('../src/live/types.js').LiveSignalType; expression: RegExp; reason: string }[]} */
const rules = [
  { type: 'profanity', expression: new RegExp(String.raw`(?<![가-힣A-Za-z0-9])(?:${profanityGroups.join('|')})`, 'gu'), reason: '명확한 욕설·비속어 표현' },
  // An explicit person target + an assertive visit is different from visiting a store.
  { type: 'threat', expression: /(?:너(?:를|한테)?|네놈(?:을)?|당신(?:을|한테)?|상담사(?:분)?(?:를|을)|직원(?:분)?(?:를|을))\s*(?:직접\s*)?찾아(?:간다|갈\s*거야|가겠(?:다|어))/gu, reason: '상대방을 지목한 위협적 방문 의사' },
  { type: 'threat', expression: /가만\s*(?:안|못)\s*(?:둔다|두겠(?:다|어)|둘\s*줄\s*알아)|가만\s*두지\s*않겠(?:다|어)/gu, reason: '보복 의사를 명시한 표현' },
  { type: 'threat', expression: /(?:죽여|패|때려|박살내)\s*(?:버린다|버리겠(?:다|어))|(?:죽이|때리|패주)겠(?:다|어)/gu, reason: '직접적인 위해·폭력 의사' },
  { type: 'threat', expression: new RegExp(String.raw`${facilityTarget}\s*(?:(?:직접\s*)?(?:찾아\s*가서|가서)\s*)?(?:다\s*)?(?:${destructionVerbs})`, 'gu'), reason: '시설·매장을 대상으로 한 파괴 의사' },
  { type: 'threat', expression: new RegExp(String.raw`(?<![가-힣A-Za-z0-9])(?:가서\s*)?다\s*(?:${destructionVerbs})`, 'gu'), reason: '전부 파괴하겠다는 명시적 의사' },
  { type: 'threat', expression: new RegExp(String.raw`(?:찾아\s*가서|${facilityTarget}\s*가서)\s*${disturbanceIntent}`, 'gu'), reason: '방문하여 난동·업무방해를 하겠다는 의사' },
  { type: 'blame', expression: /일을\s*왜\s*이렇게\s*못\s*(?:해요|합니까|하나요)|이것도\s*제대로\s*못\s*(?:해요|합니까|하나요)/gu, reason: '업무 능력에 대한 직접적 비난' },
  { type: 'blame', expression: /말이\s*안\s*통(?:하네(?:요)?|해요|합니다)|처리를\s*왜\s*이렇게\s*(?:합니까|해요)|상담을\s*이렇게밖에\s*못\s*(?:해요|합니까)|뭐\s*하는\s*사람(?:이에요|입니까)/gu, reason: '상담·처리 방식에 대한 직접적 책망' },
  { type: 'sexual', expression: /(?:너|당신|상담사(?:님|분)?|직원(?:님|분)?)(?:랑|와|하고)\s*(?:섹스|성관계)\s*(?:하(?:자|고\s*싶(?:어|어요))|해(?:보자|요))/gu, reason: '상담 상대를 향한 명시적 성적 제안' },
  { type: 'sexual', expression: /(?:너|당신|상담사(?:님|분)?|직원(?:님|분)?)(?:의)?\s*(?:가슴|엉덩이)(?:를|좀|가)?\s*(?:만지(?:고\s*싶(?:어|어요)|게\s*해)|보여\s*(?:줘|주세요))/gu, reason: '상담 상대 신체를 대상으로 한 성희롱 표현' },
  { type: 'sexual', expression: /(?:너|당신|상담사(?:님|분)?)[, ]*\s*옷(?:을)?\s*벗어\s*(?:봐|줘)|야동(?:을)?\s*(?:틀어|보여)\s*(?:봐|줘|주세요)/gu, reason: '명시적인 성적·음란 요구' },
];

/** Basic explicit quotation/report/negation guards; not general intent understanding. */
function isNonAssertion(/** @type {string} */ text, /** @type {number} */ start, /** @type {number} */ end, /** @type {import('../src/live/types.js').LiveSignalType} */ type) {
  // Exclude a quoted example/report. Matching remains conservative for ambiguous quotations.
  for (const quote of text.matchAll(/[“‘"'][^“”‘’"'\n]*[”’"']/gu)) {
    if (quote.index <= start && quote.index + quote[0].length >= end) return true;
  }
  const before = text.slice(0, start).split(/[.!?。\n]/u).at(-1) ?? '';
  const after = text.slice(end).split(/[.!?。\n]/u)[0];
  return /(?:안|않고|않게)\s*$/u.test(before) ||
    /^\s*(?:고|는|라는|라고|니|던)\s*(?:말|뜻|하|했|한|하면|하지|그런|협박|위협|들었|들으)/u.test(after) ||
    /^\s*(?:하지\s*않|지\s*않|않|아니|라는\s*뜻은\s*아니)/u.test(after) ||
    ((type === 'profanity' || type === 'threat') &&
      /^\s*(?:고|는|이?라는|이?라고|이?란|니|던)\s*(?:신고|보고|전했|전하|말|뜻|하|했|한|협박|위협|들었|들으|단어|표현|문장)/u.test(after));
}

/** @param {string} text @returns {TextRisk} */
export function analyzeRiskText(text) {
  /** @type {(TextRisk['signals'][number] & { start: number; end: number })[]} */
  const found = [];
  for (const rule of rules) {
    for (const match of text.matchAll(rule.expression)) {
      const start = match.index, end = start + match[0].length;
      if (isNonAssertion(text, start, end, rule.type)) continue;
      // Overlapping alternatives in the same category represent one occurrence.
      if (found.some(signal => signal.type === rule.type && start < signal.end && end > signal.start)) continue;
      found.push({ type: rule.type, matchedText: match[0], reason: rule.reason, start, end });
    }
  }
  found.sort((a, b) => a.start - b.start);
  const signals = found.map(({ start: _start, end: _end, ...signal }) => signal);
  const count = (/** @type {import('../src/live/types.js').LiveSignalType} */ type) => signals.filter(signal => signal.type === type).length;
  const threatCount = count('threat');
  return { profanityCount: count('profanity'), threatCount, threatDetected: threatCount > 0, blameCount: count('blame'), sexualCount: count('sexual'), signals };
}

/**
 * Rebuild current totals from USER turns only. Reuse unchanged turn results;
 * corrections/removals replace old results instead of incrementing an event counter.
 * @param {Message[]} messages
 * @param {Message[]} previousMessages
 * @param {RiskAnalysis | null | undefined} previous
 * @param {(text: string) => TextRisk} analyze
 * @returns {RiskAnalysis}
 */
export function analyzeTranscriptRisk(messages, previousMessages = [], previous = undefined, analyze = analyzeRiskText) {
  const old = new Map(previousMessages.map(message => [message.turn_id, message]));
  const current = new Map(messages.filter(message => message.role === 'user').map(message => [message.turn_id, message]));
  const analysisByTurn = Object.fromEntries([...current].map(([id, message]) => {
    const cached = previous?.ruleVersion === TEXT_RISK_RULE_VERSION && Object.hasOwn(previous.analysisByTurn, id)
      ? previous.analysisByTurn[id] : undefined;
    return [id, cached && old.get(id)?.role === 'user' && old.get(id)?.content === message.content ? cached : analyze(message.content)];
  }));
  const turns = Object.values(analysisByTurn);
  const sum = (/** @type {'profanityCount' | 'threatCount' | 'blameCount' | 'sexualCount'} */ field) => turns.reduce((total, turn) => total + turn[field], 0);
  const threatCount = sum('threatCount');
  return { ruleVersion: TEXT_RISK_RULE_VERSION, analyzedUserTurns: turns.length, analysisByTurn,
    profanityCount: sum('profanityCount'), threatCount, threatDetected: threatCount > 0, blameCount: sum('blameCount'), sexualCount: sum('sexualCount') };
}
