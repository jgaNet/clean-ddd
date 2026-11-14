/**
 * K4, task 4's scorer, tested on the registered ground truth without an agent: `node --test .claude/flow/`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

import { expectedAnswer, judgePrompt, parseAnswer, precisionRecall, readJudgement, scoreAnswer } from './k4-score.mjs';

const yaml = createRequire(new URL('../../package.json', import.meta.url))('js-yaml');
const groundTruth = yaml.load(
  readFileSync(
    new URL(
      '../../docs/evaluations/knowledge/k4-pilot/tasks/4-review-window-impact/ground-truth.yaml',
      import.meta.url,
    ),
    'utf8',
  ),
);
const { expected } = groundTruth;
const ROOT = '/work/runs/10/openstay';

describe("task 4's answer", () => {
  it('scores the answer the ground truth expects 1, and succeeds', () => {
    const score = scoreAnswer(
      parseAnswer(`Here is the impact.\n\n${expectedAnswer(expected)}\n`, yaml.load, ROOT),
      expected,
    );
    assert.equal(score.score, 1);
    assert.equal(score.pooled.recall, 1);
    assert.equal(score.success, true);
  });

  it('scores an empty answer 0, and one with no block as not parsing', () => {
    const empty = scoreAnswer(parseAnswer('```yaml\nrules: []\nfiles: []\ntests: []\n```', yaml.load), expected);
    assert.equal(empty.parses, true);
    assert.equal(empty.score, 0);
    assert.equal(empty.success, false);
    const none = scoreAnswer(parseAnswer('I changed nothing.', yaml.load), expected);
    assert.equal(none.parses, false);
    assert.equal(none.success, false);
  });

  it('counts a tolerated path neither as a hit nor a miss, and a distractor file as a miss', () => {
    const files = precisionRecall(
      [
        'src/Contexts/Reviews/Domain/StayReview/ReviewWindow.ts',
        'src/Contexts/Reviews/Domain/StayReview/StayReviews.ts', // tolerated
        'src/Contexts/Support/Domain/Claim/ClaimRules.ts', // the claim window: another rule
      ],
      expected.files,
    );
    assert.equal(files.hits, 1);
    assert.equal(files.tolerated, 1);
    assert.deepEqual(files.misses, ['src/Contexts/Support/Domain/Claim/ClaimRules.ts']);
    assert.equal(files.precision, 0.5);
    assert.equal(files.recall, 0.5);
  });

  it("reads paths as the agent wrote them: from the tree's root, with ./, absolute, or with a comment", () => {
    const answer = parseAnswer(
      [
        '```yaml',
        'rules:',
        '  - the review window (REVIEW_WINDOW_DAYS)',
        'files:',
        `  - ${ROOT}/src/Contexts/Reviews/Domain/StayReview/ReviewWindow.ts`,
        '  - ./src/Contexts/Reviews/Domain/StayReview/StayReviewExceptions.ts',
        'tests:',
        '  - "src/Bootstrap/Fastify/reviews.e2e.spec.ts"',
        '```',
      ].join('\n'),
      yaml.load,
      ROOT,
    );
    const score = scoreAnswer(answer, expected);
    assert.equal(score.files.recall, 1);
    assert.equal(score.tests.hits, 1);
    // 3 hits of 7 required, every prediction a hit
    assert.equal(score.pooled.precision, 1);
    assert.equal(score.pooled.recall, Number((3 / 7).toFixed(4)));
  });

  it('fails an answer that changed the tree, however good', () => {
    const score = scoreAnswer(parseAnswer(expectedAnswer(expected), yaml.load), expected, { unchanged: false });
    assert.equal(score.score, 1);
    assert.equal(score.success, false);
  });
});

describe('the judge of the rules', () => {
  const rules = ['the review window of 14 days', 'the claim window', 'the weather'];
  it('is given only the predicted rules and the expected ones, distractors included', () => {
    const prompt = judgePrompt(rules, expected.rules);
    for (const each of [...expected.rules.required, ...expected.rules.distractors]) assert.ok(prompt.includes(each.id));
    assert.ok(prompt.includes('3. the weather'));
    assert.ok(!prompt.includes('src/'), 'no path of the ground truth beyond what its rules say');
  });

  it('reads its matches into a recall over the required rules, distractors named', () => {
    const judged = readJudgement(
      'Matches:\n```json\n[{"predicted":1,"match":"window"},{"predicted":2,"match":"claims-window"},{"predicted":3,"match":null}]\n```',
      rules,
      expected.rules,
    );
    assert.deepEqual(
      judged.matches.map(each => each.kind),
      ['required', 'distractor', 'none'],
    );
    assert.equal(judged.recall, 0.2);
    assert.deepEqual(judged.distractors, ['claims-window']);
    assert.equal(readJudgement('no json here', rules, expected.rules), undefined);
  });
});
