/**
 * The dry run's verdict, tested on the defects earlier kits had: `node --test .claude/flow/`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { eslintLines, judge, kitLines } from './dry-run.mjs';

const features = ['comments', 'delete-account'];
const graded = (tree, role, passes, extra = {}) => ({ tree, role, features: passes, hygiene: [], ...extra });

describe('the dry run', () => {
  it('is clean when every test fails before its feature and passes once it is written', () => {
    const verdict = judge(
      [
        graded('a3', 'before', { comments: false, 'delete-account': false }),
        graded('a3', 'solved', { comments: true, 'delete-account': true }),
      ],
      { features },
    );
    assert.deepEqual(verdict, { verdict: 'clean', findings: [] });
  });

  it('calls a defect a test that fails on every solved tree (the deletion test that followed a revoked token)', () => {
    const verdict = judge(
      ['a3', 'd2', 'p2'].map(tree => graded(tree, 'solved', { comments: true, 'delete-account': false })),
      { features },
    );
    assert.equal(verdict.verdict, 'defect');
    assert.match(verdict.findings[0].message, /fails on every solved tree \(a3, d2, p2\)/);
  });

  it("calls a defect the kit's files the tree's own checks refuse (an unused variable, a line too long)", () => {
    const verdict = judge(
      [graded('a3', 'before', { comments: false, 'delete-account': false }, { hygiene: ['lint: unused call'] })],
      { features },
    );
    assert.equal(verdict.verdict, 'defect');
  });

  it('asks to read a test that passes before its feature exists (one process never contended)', () => {
    const verdict = judge([graded('p2', 'before', { comments: true, 'delete-account': false })], { features });
    assert.equal(verdict.verdict, 'read');
    assert.match(verdict.findings[0].message, /passes before the feature is written, on p2/);
  });

  it("asks to read an earlier feature's test that breaks once the kit's features are written (feature 11 superseding feature 4)", () => {
    const verdict = judge(
      [
        graded('p2', 'before', { comments: false }, { regression: { 'share-a-note': true } }),
        graded('p2', 'solved', { comments: true }, { regression: { 'share-a-note': false } }),
        graded('a3', 'before', { comments: false }, { regression: { 'share-a-note': true } }),
        graded('a3', 'solved', { comments: true }, { regression: { 'share-a-note': true } }),
      ],
      { features: ['comments'], regressionFeatures: ['share-a-note'] },
    );
    assert.equal(verdict.verdict, 'read');
    assert.match(verdict.findings[0].message, /on p2: a regression, or an assertion a new feature supersedes/);
  });

  it("keeps only the lines of a check that name the kit's files", () => {
    const output = 'src/app.ts(3,1): error\nsrc/acceptance/9-comments.acceptance.ts(5,7): error TS6133\n';
    assert.deepEqual(kitLines(output, 'src/acceptance'), [
      'src/acceptance/9-comments.acceptance.ts(5,7): error TS6133',
    ]);
  });

  it("reads ESLint's JSON report as one line per problem", () => {
    const report = JSON.stringify([
      {
        filePath: '/runs/p2/src/acceptance/13-search.acceptance.ts',
        messages: [
          { line: 9, column: 13, message: "'call' is assigned a value but never used.", ruleId: 'no-unused-vars' },
        ],
      },
    ]);
    assert.equal(
      eslintLines(report),
      "/runs/p2/src/acceptance/13-search.acceptance.ts:9:13: 'call' is assigned a value but never used. [no-unused-vars]",
    );
  });

  it('groups a problem found in several trees into one finding', () => {
    const verdict = judge(
      ['a3', 'd2'].map(tree =>
        graded(tree, 'before', { comments: false, 'delete-account': false }, { hygiene: ['format: 9-comments'] }),
      ),
      { features },
    );
    assert.deepEqual(verdict.findings, [
      { level: 'defect', feature: undefined, message: 'format: 9-comments (in a3, d2)' },
    ]);
  });
});
