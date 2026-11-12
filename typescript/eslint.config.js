/**
 * Architecture boundaries, enforced.
 *
 * The table lives in conventions/architecture.yaml — which layer may import from which — and
 * this language's trees in conventions/typescript.yaml: the contexts, the aliases, the wiring
 * file, the libraries. Both sit in the repository's `conventions/`, found by walking up from this
 * file (one level up here; the same directory in an application `yarn architecture create` made).
 * This file translates them into `no-restricted-imports` rules, one block per context and
 * per layer, so that every context is held to the same standard. Two more blocks hold three rules
 * of the contract that are not about imports: an application has one clock (DOMAIN-ONE-CLOCK), so
 * nothing but the system clock and the tests reads the machine's time with `new Date()` or
 * `Date.now()`; a command's body is refused for its shape only (API-BODY-SHAPE), so a request
 * schema's `body` declares types and required fields and no value rule; and a command whose outcome is read later needs a caller at the transport
 * (API-CALLER-AT-TRANSPORT), so a route publishes a command and answers `202` only through
 * `acceptCommand()`, which refuses a caller who is not signed in with `401` first.
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

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { load } from 'js-yaml';
import tseslint from 'typescript-eslint';

/** The nearest directory at or above this one holding the contract: the repository root. */
function conventionsDir(from) {
  let dir = from;
  for (;;) {
    if (existsSync(join(dir, 'conventions/architecture.yaml'))) return join(dir, 'conventions');
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`conventions/architecture.yaml not found at or above ${from}`);
    dir = parent;
  }
}
const conventions = conventionsDir(dirname(fileURLToPath(import.meta.url)));
const architecture = load(readFileSync(join(conventions, 'architecture.yaml'), 'utf8'));
const binding = load(readFileSync(join(conventions, 'typescript.yaml'), 'utf8'));
const LAYERS = Object.keys(architecture.layers);
const WIRING = binding.wiring.replace(/\.ts$/, '');

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
    bootstrap: [`${binding.bootstrap.alias}/**`],
    libraries: binding.libraries,
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
      // A row that forbids nothing (a wiring file in an application with one context) yields an
      // empty group, which the rule's schema rejects; it is left out rather than written empty.
      patterns: [
        { group: forbidden(scope, rule.may_import), message: message(rule) },
        { group: RELATIVE_ACROSS_DIRECTORIES, message: message(architecture.relative_imports) },
      ].filter(({ group }) => group.length),
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
    files: [`${root}/${binding.wiring}`],
    rules: restrict(units, architecture.wiring_file),
  });

  return blocks;
}

const CONTEXTS_TREE = binding.contexts_tree;
const contextAlias = context => `${CONTEXTS_TREE.alias}/${context}`;
/** The JSON Schema keywords that decide whether a value is allowed, not what shape it has. */
const VALUE_RULES = [
  'enum',
  'const',
  'pattern',
  'format',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minItems',
  'maxItems',
  'uniqueItems',
];
const CALLER_AT_TRANSPORT =
  'API-CALLER-AT-TRANSPORT: a command whose outcome is read later needs a signed-in caller, refused at once with 401 before anything is published. Answer the route with `acceptCommand(req, reply, module, command)` (@Architecture/Presentation/AcceptCommand), never by publishing on the bus or answering 202 yourself; a command anyone may ask for says so on its handler (`anyoneMayAsk()`) (`yarn architecture rule API-CALLER-AT-TRANSPORT`).';
const CONTEXTS = binding.contexts;
const ARCHITECTURE = binding.architecture;
const KERNEL = binding.kernel;
/** DOMAIN-ONE-CLOCK: the machine's time is read by the system clock alone; everything else is passed a clock. */
const ONE_CLOCK_MESSAGE =
  "DOMAIN-ONE-CLOCK: an application has one now. Take a `Clock` (@Architecture/Application) in the constructor, pass `systemClock` from the wiring file, and give `clock()` to the behaviour; a domain method's time parameter has no default (`yarn architecture rule DOMAIN-ONE-CLOCK`).";
const ONE_CLOCK = [
  { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: ONE_CLOCK_MESSAGE },
  { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: ONE_CLOCK_MESSAGE },
];
/** The files that may read the machine's time: the system clock, and the tests, which build the time they need. */
const ONE_CLOCK_EXCEPT = [
  `${ARCHITECTURE.path}/Infrastructure/Clock/SystemClock.ts`,
  '**/*.spec.ts',
  '**/*.spec-helper.ts',
  '**/*.acceptance.ts',
];

export default tseslint.config(
  // `.claude/` is the flow a created application carries (scripts of its own, not of this tree).
  { ignores: ['dist/', 'coverage/', '.claude/', '**/*.d.ts', '**/*.min.js'] },
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
  // DOMAIN-ONE-CLOCK, everywhere in src but the system clock and the tests (ADR 42).
  {
    files: ['src/**/*.ts'],
    ignores: ONE_CLOCK_EXCEPT,
    rules: { 'no-restricted-syntax': ['error', ...ONE_CLOCK] },
  },
  // Two rules of the contract held on a context's Presentation files, in one block: ESLint keeps the
  // last `no-restricted-syntax` a file matches, so a second block would silence the first.
  // API-BODY-SHAPE: a request body's schema says its shape; whether a value is allowed is the domain's,
  // refused on the operation with the rule's exception, never as a 400 from the schema.
  // API-CALLER-AT-TRANSPORT: a route whose command's outcome is read later goes through
  // acceptCommand(), which answers 401 to a caller who is not signed in before anything is published;
  // a route that publishes on the bus, or answers 202, by itself would skip that refusal.
  {
    files: [`${CONTEXTS_TREE.path}/*/Presentation/**/*.ts`],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: `Property[key.name='body'] Property[key.name=/^(${VALUE_RULES.join('|')})$/]`,
          message:
            "API-BODY-SHAPE: a command's body is refused for its shape only (`type`, `required`); whether a value is allowed is the domain's to decide, on the operation. Remove the keyword and let the value object refuse the value (`yarn architecture rule API-BODY-SHAPE`).",
        },
        {
          selector: `CallExpression[callee.property.name='publish']:matches([callee.object.name='eventBus'], [callee.object.property.name='eventBus'])`,
          message: CALLER_AT_TRANSPORT,
        },
        {
          selector: `CallExpression[callee.property.name=/^(code|status)$/][arguments.0.value=202]`,
          message: CALLER_AT_TRANSPORT,
        },
        // Repeated here, since this block replaces the one above on these files.
        ...ONE_CLOCK,
      ],
    },
  },
  // The building blocks know no context and not even the shared kernel: mechanics, no vocabulary.
  ...rulesFor(ARCHITECTURE.path, ARCHITECTURE.alias, [...CONTEXTS.map(contextAlias), KERNEL.alias], {}),
  // The shared kernel is built on the building blocks and knows no context.
  ...rulesFor(KERNEL.path, KERNEL.alias, CONTEXTS.map(contextAlias), { architecture: ARCHITECTURE.alias }),
  ...CONTEXTS.flatMap(context =>
    rulesFor(
      `${CONTEXTS_TREE.path}/${context}`,
      contextAlias(context),
      CONTEXTS.filter(other => other !== context).map(contextAlias),
      {
        architecture: ARCHITECTURE.alias,
        kernel: KERNEL.alias,
      },
    ),
  ),
);
