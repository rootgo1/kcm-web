/**
 * Local prototype rules, not a trained/validated model. No I/O or risk-score math.
 * Replace analyzeRiskText at this boundary when a real classifier is available.
 * Conservative phrase patterns intentionally do not cover every Korean expression.
 */
export const TEXT_RISK_RULE_VERSION = 'local-text-rules-v4';
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
const personTarget = String.raw`(?:너(?:를|한테|도)?|네놈(?:을|도)?|당신(?:을|한테|도)?|(?:직원|상담사)(?:님|분)?(?:을|를|한테|도)?)`;
const futureStatement = String.raw`거(?:야|예요|니까)`;
const attackVisit = String.raw`(?:찾아\s*가서|가서)`;
const destructionEnding = String.raw`(?:놓(?:는다|겠(?:다|어|습니다)|을\s*${futureStatement})|버(?:린다|리겠(?:다|어|습니다)|릴\s*${futureStatement}))`;
const destructionVerbs = [
  String.raw`(?:뒤집어|엎어|부숴|부셔)\s*${destructionEnding}`,
  String.raw`부순다|(?:부수|뒤집|엎)겠(?:다|어|습니다)`,
  String.raw`박살\s*(?:낸다|내겠(?:다|어|습니다)|내\s*${destructionEnding})`,
].join('|');
const disturbanceIntent = String.raw`(?:난리\s*(?:친다|치겠(?:다|어|습니다)|칠\s*${futureStatement})|난동(?:을)?\s*(?:부린다|부리겠(?:다|어|습니다)|부릴\s*${futureStatement}))`;
const assaultVerbs = String.raw`(?:팬다|팰\s*${futureStatement}|패\s*버(?:린다|리겠(?:다|어|습니다)|릴\s*${futureStatement})|때린다|때릴\s*${futureStatement}|패준다|두들겨\s*팬다)`;

/** @type {{ type: import('../src/live/types.js').LiveSignalType; expression: RegExp; reason: string }[]} */
const rules = [
  { type: 'profanity', expression: new RegExp(String.raw`(?<![가-힣A-Za-z0-9])(?:${profanityGroups.join('|')})`, 'gu'), reason: '명확한 욕설·비속어 표현' },
  // An explicit person target + an assertive visit is different from visiting a store.
  { type: 'threat', expression: /(?:너(?:를|한테)?|네놈(?:을)?|당신(?:을|한테)?|상담사(?:분)?(?:를|을)|직원(?:분)?(?:를|을))\s*(?:직접\s*)?찾아(?:간다|갈\s*거야|가겠(?:다|어))/gu, reason: '상대방을 지목한 위협적 방문 의사' },
  { type: 'threat', expression: new RegExp(String.raw`가만\s*(?:안|못)\s*(?:둔다|두겠(?:다|어)|둘\s*줄\s*알아|둘\s*${futureStatement})|가만\s*두지\s*않겠(?:다|어)`, 'gu'), reason: '보복 의사를 명시한 표현' },
  { type: 'threat', expression: /(?:죽여|패|때려|박살내)\s*(?:버린다|버리겠(?:다|어))|(?:죽이|때리|패주)겠(?:다|어)/gu, reason: '직접적인 위해·폭력 의사' },
  { type: 'threat', expression: new RegExp(String.raw`${facilityTarget}\s*(?:(?:직접\s*)?(?:찾아\s*가서|가서)\s*)?(?:다\s*)?(?:${destructionVerbs})`, 'gu'), reason: '시설·매장을 대상으로 한 파괴 의사' },
  { type: 'threat', expression: new RegExp(String.raw`(?<![가-힣A-Za-z0-9])(?:가서\s*)?다\s*(?:${destructionVerbs})`, 'gu'), reason: '전부 파괴하겠다는 명시적 의사' },
  { type: 'threat', expression: new RegExp(String.raw`(?:찾아\s*가서|${facilityTarget}\s*가서)\s*${disturbanceIntent}`, 'gu'), reason: '방문하여 난동·업무방해를 하겠다는 의사' },
  { type: 'threat', expression: new RegExp(String.raw`${personTarget}\s*(?:${attackVisit}\s*)?${assaultVerbs}`, 'gu'), reason: '상대방을 지목한 폭행 의사' },
  { type: 'threat', expression: new RegExp(String.raw`${attackVisit}\s*${assaultVerbs}`, 'gu'), reason: '찾아가서 폭행하겠다는 의사' },
  { type: 'threat', expression: /(?<![가-힣A-Za-z0-9])두들겨\s*팬다/gu, reason: '명시적으로 두들겨 패겠다는 의사' },
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
      (/^[\s”’"']*(?:고|는|이?라는|이?라고|이?란|니|던)\s*(?:신고|보고|전했|전하|말|뜻|얘기|이야기|하|했|한|협박|위협|들었|들으|단어|표현|문장)/u.test(after) ||
        /^[\s”’"']*(?:는|이?라는)\s*(?:건|게|것(?:은|이)?)\s*(?:아니|아닙)/u.test(after)));
}

/** @param {string} text @param {import('../src/live/types.js').LiveSignalType | null} [onlyType] */
function findRiskSignals(text, onlyType = null) {
  /** @type {(TextRisk['signals'][number] & { start: number; end: number })[]} */
  const found = [];
  for (const rule of rules) {
    if (onlyType && rule.type !== onlyType) continue;
    for (const match of text.matchAll(rule.expression)) {
      const start = match.index, end = start + match[0].length;
      if (isNonAssertion(text, start, end, rule.type)) continue;
      // Overlapping alternatives in the same category represent one occurrence.
      if (found.some(signal => signal.type === rule.type && start < signal.end && end > signal.start)) continue;
      found.push({ type: rule.type, matchedText: match[0], reason: rule.reason, start, end });
    }
  }
  found.sort((a, b) => a.start - b.start);
  return found;
}

/** @param {string} text @returns {TextRisk} */
export function analyzeRiskText(text) {
  const found = findRiskSignals(text);
  const signals = found.map(({ start: _start, end: _end, ...signal }) => signal);
  const count = (/** @type {import('../src/live/types.js').LiveSignalType} */ type) => signals.filter(signal => signal.type === type).length;
  const threatCount = count('threat');
  return { profanityCount: count('profanity'), threatCount, threatDetected: threatCount > 0, blameCount: count('blame'), sexualCount: count('sexual'), signals };
}

// Bridge only a small number of unfinished USER fragments, never full transcript history.
// Unknown timestamps use the turn/character bounds; known starts must be within 30 seconds.
const CONTEXT_USER_TURNS = 2, CONTEXT_FRAGMENT_CHARS = 120, CONTEXT_ACTION_CHARS = 160, CONTEXT_SECONDS = 30;
const fragmentEnding = new RegExp(String.raw`(?:${facilityTarget}|${personTarget}|${attackVisit})\s*$`, 'u');
/** @param {Message} message */
function unfinishedFragment(message) {
  if (message.content.length > CONTEXT_FRAGMENT_CHARS) return null;
  const content = message.content.trim();
  if (!content || /[“”‘’"']/u.test(content)
    || /신고|보고|들었|들으|들은|말했|말하|고객이|(?:라는|라고)\s*(?:말|표현|문장)/u.test(content)) return null;
  const fragment = content.split(/[.!?。\n]/u).at(-1)?.trim() ?? '';
  return fragment && fragmentEnding.test(fragment) ? fragment : null;
}

/** @param {Message[]} messages */
function contextFrames(messages) {
  // Resolve ID/role corrections first; AGENT text is never a context source.
  const users = [...new Map(messages.map(message => [message.turn_id, message])).values()].filter(message => message.role === 'user');
  const fragments = users.map(unfinishedFragment);
  return users.map((message, index) => {
    /** @type {[string, string][]} */
    const context = [];
    for (let at = index - 1; at >= Math.max(0, index - CONTEXT_USER_TURNS); at--) {
      const previous = users[at], fragment = fragments[at];
      if (!fragment) break;
      if (message.start_sec !== null && previous.start_sec !== null
        && (message.start_sec < previous.start_sec || message.start_sec - previous.start_sec > CONTEXT_SECONDS)) break;
      context.unshift([previous.turn_id, fragment]);
    }
    return { message, context, fingerprint: JSON.stringify(context) };
  });
}

/** Add only a cross-boundary threat and attribute its actual action text to the current USER turn.
 * @param {string} text @param {[string, string][]} context @param {TextRisk} independent @returns {TextRisk}
 */
function withFragmentContext(text, context, independent) {
  if (!context.length) return independent;
  const prefix = context.map(([, fragment]) => fragment).join(' ') + ' ';
  const bounded = prefix + text.slice(0, CONTEXT_ACTION_CHARS);
  const fullCurrent = prefix + text;
  const additions = findRiskSignals(bounded, 'threat').filter(signal => {
    if (signal.start >= prefix.length || signal.end <= prefix.length
      || isNonAssertion(fullCurrent, signal.start, signal.end, 'threat')) return false;
    const action = text.slice(0, signal.end - prefix.length);
    // A complete threat already found in this action is the same occurrence, not a second event.
    return findRiskSignals(action, 'threat').length === 0;
  }).map(signal => ({ type: /** @type {const} */ ('threat'), matchedText: text.slice(0, signal.end - prefix.length).trim(),
    reason: '이전 USER의 미완성 대상·행동 문맥을 이어받은 위협 의사' }));
  if (!additions.length) return independent;
  const threatCount = independent.threatCount + additions.length;
  return { ...independent, threatCount, threatDetected: threatCount > 0, signals: [...additions, ...independent.signals] };
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
  const old = new Map(contextFrames(previousMessages).map(frame => [frame.message.turn_id, frame]));
  const current = contextFrames(messages);
  const analysisByTurn = Object.fromEntries(current.map(({ message, context, fingerprint }) => {
    const id = message.turn_id, oldFrame = old.get(id);
    const cached = previous?.ruleVersion === TEXT_RISK_RULE_VERSION && Object.hasOwn(previous.analysisByTurn, id)
      ? previous.analysisByTurn[id] : undefined;
    return [id, cached && oldFrame?.message.content === message.content && oldFrame.fingerprint === fingerprint
      ? cached : withFragmentContext(message.content, context, analyze(message.content))];
  }));
  const turns = Object.values(analysisByTurn);
  const sum = (/** @type {'profanityCount' | 'threatCount' | 'blameCount' | 'sexualCount'} */ field) => turns.reduce((total, turn) => total + turn[field], 0);
  const threatCount = sum('threatCount');
  return { ruleVersion: TEXT_RISK_RULE_VERSION, analyzedUserTurns: turns.length, analysisByTurn,
    profanityCount: sum('profanityCount'), threatCount, threatDetected: threatCount > 0, blameCount: sum('blameCount'), sexualCount: sum('sexualCount') };
}
