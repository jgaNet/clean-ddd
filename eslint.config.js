/**
 * Architecture boundaries, enforced.
 *
 * The table lives in conventions/architecture.yaml: which layer may import from which, per
 * context. This file only translates it into `no-restricted-imports` rules, one block per
 * context and per layer, so that every context is held to the same standard.
 *
 * The translation: the YAML says what a layer MAY import; ESLint wants what it may NOT. So we
 * enumerate every "unit" a file could import (each layer of its own context, of the building
 * blocks, of the shared kernel, of every other context, the wiring files, Bootstrap, the
 * infrastructure libraries) and
 * forbid the ones the table does not allow. Imports are matched on their path alias; a
 * relative import may only name a sibling file (`./Note`), never cross a directory.
 *
 * The patterns are gitignore-style. A parent that is excluded cannot have a child re-included,
 * so "every context but your own" is written by listing the other contexts, not by negation.
 */

import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import tseslint from 'typescript-eslint';

const architecture = load(readFileSync(new URL('./conventions/architecture.yaml', import.meta.url), 'utf8'));
const LAYERS = Object.keys(architecture.layers);
const WIRING = architecture.wiring.replace(/\.ts$/, '');

/** A relative import may only name a sibling file. */
const RELATIVE_ACROSS_DIRECTORIES = ['../*', '../**', './*/**'];

const layer = (alias, name) => [`${alias}/${name}`, `${alias}/${name}/**`];
const wiring = alias => [`${alias}/${WIRING}`];
const whole = alias => [alias, `${alias}/**`];

/**
 * The patterns of every unit, for a file of tree `alias` whose other contexts are `others` and
 * which may see the special trees in `trees` (unit prefix -> alias), plus the pattern of a
 * whole context, used when nothing of it may be imported. A unit the table allows but the tree
 * does not have (kernel.* for the building blocks themselves) is simply absent.
 */
function unitsFor(alias, others, trees) {
  const units = {
    bootstrap: ['@Bootstrap/**'],
    libraries: architecture.libraries,
    'own.wiring': wiring(alias),
    'others.wiring': others.flatMap(wiring),
  };
  for (const name of LAYERS) {
    units[`own.${name}`] = layer(alias, name);
    for (const [prefix, treeAlias] of Object.entries(trees)) units[`${prefix}.${name}`] = layer(treeAlias, name);
    units[`others.${name}`] = others.flatMap(other => layer(other, name));
  }
  return { units, wholes: { own: whole(alias), others: others.flatMap(whole) } };
}

const expand = allowed =>
  allowed.flatMap(unit =>
    unit === 'own.*'
      ? [...LAYERS.map(name => `own.${name}`), 'own.wiring']
      : unit.endsWith('.*')
        ? LAYERS.map(name => `${unit.slice(0, -2)}.${name}`)
        : [unit],
  );

/**
 * Everything the table does not allow, as deduplicated patterns (the schema rejects duplicates).
 * A context of which nothing may be imported is forbidden whole, so a stray file in it is too.
 */
function forbidden({ units, wholes }, allowed) {
  const kept = new Set(expand(allowed));
  const group = [];
  for (const scope of ['own', 'others']) {
    const ofScope = Object.keys(units).filter(unit => unit.startsWith(`${scope}.`));
    if (ofScope.some(unit => kept.has(unit))) continue;
    group.push(...wholes[scope]);
    ofScope.forEach(unit => kept.add(unit));
  }
  for (const [unit, patterns] of Object.entries(units)) {
    if (!kept.has(unit)) group.push(...patterns);
  }
  return [...new Set(group)];
}

/** Every refusal names its rule id first, so a reader, a tool or `yarn architecture rule <id>` can look it up. */
const message = ({ id, why, remediation }) => `${id}: ${why} Fix: ${remediation}`;
const restrict = (scope, rule) => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        { group: forbidden(scope, rule.may_import), message: message(rule) },
        { group: RELATIVE_ACROSS_DIRECTORIES, message: message(architecture.relative_imports) },
      ],
    },
  ],
});

/**
 * @param root    the directory of the tree ('src/Contexts/Notes', 'src/SharedKernel')
 * @param alias   how it is imported ('@Contexts/Notes', '@SharedKernel')
 * @param others  the aliases of every other context (whole, nothing of them may be imported)
 * @param trees   the special trees this one may see per layer: { architecture, kernel } for a context
 */
function rulesFor(root, alias, others, trees) {
  const units = unitsFor(alias, others, trees);
  const blocks = [];

  for (const name of LAYERS) {
    const layerRule = architecture.layers[name];
    blocks.push({ files: [`${root}/${name}/**/*.ts`], rules: restrict(units, layerRule) });
    if (layerRule.specs) {
      blocks.push({
        files: [`${root}/${name}/**/*.spec.ts`],
        rules: restrict(units, {
          ...layerRule.specs,
          may_import: [...layerRule.may_import, ...layerRule.specs.may_import],
        }),
      });
    }
  }

  blocks.push({ files: [`${root}/**/*.e2e.spec.ts`], rules: restrict(units, architecture.e2e_specs) });
  blocks.push({
    files: [`${root}/${architecture.wiring}`],
    rules: restrict(units, architecture.wiring_file),
  });

  return blocks;
}

const contextAlias = context => `@Contexts/${context}`;
const CONTEXTS = architecture.contexts;
const ARCHITECTURE = architecture.architecture;
const KERNEL = architecture.kernel;

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'src/Bootstrap/Fastify/public/', '**/*.d.ts', '**/*.min.js'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-console': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-dupe-class-members': ['error'],
      '@typescript-eslint/no-useless-constructor': ['error'],
      '@typescript-eslint/no-inferrable-types': ['off'],
    },
  },
  // The building blocks know no context and not even the shared kernel: mechanics, no vocabulary.
  ...rulesFor(ARCHITECTURE.path, ARCHITECTURE.alias, [...CONTEXTS.map(contextAlias), KERNEL.alias], {}),
  // The shared kernel is built on the building blocks and knows no context.
  ...rulesFor(KERNEL.path, KERNEL.alias, CONTEXTS.map(contextAlias), { architecture: ARCHITECTURE.alias }),
  ...CONTEXTS.flatMap(context =>
    rulesFor(
      `src/Contexts/${context}`,
      contextAlias(context),
      CONTEXTS.filter(other => other !== context).map(contextAlias),
      {
        architecture: ARCHITECTURE.alias,
        kernel: KERNEL.alias,
      },
    ),
  ),
);
