/**
 * K4, task 4's answer (docs/evaluations/knowledge/k4-pilot/README.md, "Measures"): the YAML block of the agent's final
 * message, scored against the ground truth's `expected`.
 *
 * - `files` and `tests` by exact path: a hit is a predicted path in `required`; a predicted path in `tolerated` is
 *   neither a hit nor a miss; precision is hits over the predictions not tolerated, recall hits over `required`. Each
 *   is given for `files`, for `tests` and for the two pooled; success asks the pooled F1 to be 0.6 or more.
 * - `rules` are matched by a judge (claude-sonnet-5-5, given only the answer's rules and `expected.rules`) to a
 *   required id, a distractor or nothing; the operator reads every match (`judgePrompt`, `readJudgement`).
 */

export const SUCCESS_F1 = 0.6;

/** The last fenced YAML block of a message (```yaml … ```), or undefined. */
export function lastYamlBlock(text) {
  const blocks = [...String(text ?? '').matchAll(/```ya?ml[^\n]*\n([\s\S]*?)```/g)];
  return blocks.length ? blocks[blocks.length - 1][1] : undefined;
}

/** A path as the answer wrote it, made comparable: no `./`, no trailing comment, no root when `root` is given. */
export function normalisePath(path, root) {
  let each = String(path ?? '').trim();
  each = each.replace(/\s+#.*$/, '').replace(/^[`'"]|[`'"]$/g, '');
  if (root && each.startsWith(`${root.replace(/\/+$/, '')}/`)) each = each.slice(root.replace(/\/+$/, '').length + 1);
  return each.replace(/^\.\//, '');
}

const list = value => (Array.isArray(value) ? value : []);

/**
 * The answer, parsed: `{ parses, rules, files, tests, problem? }`. `load` is js-yaml's `load`; an answer parses when
 * its block is a mapping (lists absent are empty).
 */
export function parseAnswer(text, load, root) {
  const block = lastYamlBlock(text);
  if (block === undefined)
    return { parses: false, problem: 'no YAML block in the final message', rules: [], files: [], tests: [] };
  let data;
  try {
    data = load(block);
  } catch (error) {
    return {
      parses: false,
      problem: `the YAML block does not parse: ${String(error.message ?? error).split('\n')[0]}`,
      rules: [],
      files: [],
      tests: [],
    };
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data))
    return { parses: false, problem: 'the YAML block is not a mapping', rules: [], files: [], tests: [] };
  const paths = key => [
    ...new Set(
      list(data[key])
        .filter(each => typeof each === 'string')
        .map(each => normalisePath(each, root))
        .filter(Boolean),
    ),
  ];
  const rules = list(data.rules).map(each => (typeof each === 'string' ? each : JSON.stringify(each)));
  return { parses: true, rules, files: paths('files'), tests: paths('tests') };
}

/** Precision, recall and F1 of predicted paths against `{ required, tolerated }`. */
export function precisionRecall(predicted, { required = [], tolerated = [] } = {}) {
  const requiredSet = new Set(required);
  const toleratedSet = new Set(tolerated);
  const unique = [...new Set(predicted)];
  const hits = unique.filter(each => requiredSet.has(each));
  const counted = unique.filter(each => !toleratedSet.has(each));
  const precision = counted.length ? hits.length / counted.length : 0;
  const recall = requiredSet.size ? hits.length / requiredSet.size : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const round = value => Number(value.toFixed(4));
  return {
    predicted: unique.length,
    hits: hits.length,
    tolerated: unique.filter(each => toleratedSet.has(each)).length,
    misses: counted.filter(each => !requiredSet.has(each)),
    missed: [...requiredSet].filter(each => !hits.includes(each)),
    precision: round(precision),
    recall: round(recall),
    f1: round(f1),
  };
}

/** The answer's score against `expected`: files, tests, the two pooled, and whether it succeeds (with `unchanged`). */
export function scoreAnswer(answer, expected, { unchanged = true } = {}) {
  const files = precisionRecall(answer.files, expected.files);
  const tests = precisionRecall(answer.tests, expected.tests);
  const pooled = precisionRecall([...answer.files, ...answer.tests], {
    required: [...(expected.files?.required ?? []), ...(expected.tests?.required ?? [])],
    tolerated: [...(expected.files?.tolerated ?? []), ...(expected.tests?.tolerated ?? [])],
  });
  return {
    parses: answer.parses,
    ...(answer.problem && { problem: answer.problem }),
    unchanged,
    files,
    tests,
    pooled,
    score: pooled.f1,
    success: answer.parses && unchanged && pooled.f1 >= SUCCESS_F1,
  };
}

/** What the judge is given: the answer's rules and `expected.rules`, nothing else. */
export function judgePrompt(rules, expectedRules) {
  const required = list(expectedRules?.required)
    .map(each => `- ${each.id}: ${each.says}`)
    .join('\n');
  const distractors = list(expectedRules?.distractors)
    .map(each => `- ${each.id}: ${each.says}`)
    .join('\n');
  const predicted = rules.map((each, index) => `${index + 1}. ${each}`).join('\n');
  return [
    'You match predicted rules to reference rules. Do not use any tool; answer from this message only.',
    '',
    'Reference rules (each with an id):',
    required,
    '',
    'Look-alike rules that are NOT the right answer (distractors, each with an id):',
    distractors,
    '',
    'Predicted rules (numbered):',
    predicted || '(none)',
    '',
    'For each predicted rule, give the id of the one reference rule or distractor it states, or null when it states',
    'none of them. Answer with one JSON block and nothing after it:',
    '```json',
    '[{ "predicted": 1, "match": "window" }, { "predicted": 2, "match": null }]',
    '```',
  ].join('\n');
}

/** The judge's matches, read from its answer, with the recall and precision they give; undefined when unreadable. */
export function readJudgement(text, rules, expectedRules) {
  const blocks = [...String(text ?? '').matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)];
  let matches;
  try {
    matches = JSON.parse(blocks.length ? blocks[blocks.length - 1][1] : text);
  } catch {
    return undefined;
  }
  if (!Array.isArray(matches)) return undefined;
  const required = new Set(list(expectedRules?.required).map(each => each.id));
  const distractors = new Set(list(expectedRules?.distractors).map(each => each.id));
  const read = rules.map((rule, index) => {
    const match = matches.find(each => Number(each.predicted) === index + 1)?.match ?? null;
    return { rule, match, kind: required.has(match) ? 'required' : distractors.has(match) ? 'distractor' : 'none' };
  });
  const found = new Set(read.filter(each => each.kind === 'required').map(each => each.match));
  // Every predicted rule counts: one that states no rule of the change is as wrong as a distractor.
  const counted = read.length;
  return {
    matches: read,
    recall: required.size ? Number((found.size / required.size).toFixed(4)) : 0,
    precision: counted ? Number((read.filter(each => each.kind === 'required').length / counted).toFixed(4)) : 0,
    distractors: read.filter(each => each.kind === 'distractor').map(each => each.match),
  };
}

/** The answer the ground truth expects, as a final message: the required paths, and one rule per required id. */
export function expectedAnswer(expected) {
  const lines = ['```yaml', 'rules:'];
  for (const rule of list(expected.rules?.required))
    lines.push(`  - ${JSON.stringify(`${rule.id}: ${rule.says.replace(/\s+/g, ' ')}`)}`);
  lines.push('files:');
  for (const path of list(expected.files?.required)) lines.push(`  - ${path}`);
  lines.push('tests:');
  for (const path of list(expected.tests?.required)) lines.push(`  - ${path}`);
  lines.push('```');
  return lines.join('\n');
}
