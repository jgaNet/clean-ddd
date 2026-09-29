/**
 * Architecture boundaries, enforced.
 *
 * The table lives in conventions/architecture.yaml: which layer may import from which, per
 * context. This file only translates it into `no-restricted-imports` rules, one override per
 * context and per layer, so that every context is held to the same standard.
 *
 * The translation: the YAML says what a layer MAY import; ESLint wants what it may NOT. So we
 * enumerate every "unit" a file could import (each layer of its own context, of the kernel,
 * of every other context, the wiring files, Bootstrap, the infrastructure libraries) and
 * forbid the ones the table does not allow. Imports are matched on their path alias; a
 * relative import may only name a sibling file (`./Note`), never cross a directory.
 *
 * The patterns are gitignore-style. A parent that is excluded cannot have a child re-included,
 * so "every context but your own" is written by listing the other contexts, not by negation.
 */

const { readFileSync } = require('fs');
const { load } = require('js-yaml');

const architecture = load(readFileSync(`${__dirname}/conventions/architecture.yaml`, 'utf8'));
const LAYERS = Object.keys(architecture.layers);
const WIRING = architecture.wiring.replace(/\.ts$/, '');

/** A relative import may only name a sibling file. */
const RELATIVE_ACROSS_DIRECTORIES = ['../*', '../**', './*/**'];

const layer = (alias, name) => [`${alias}/${name}`, `${alias}/${name}/**`];
const wiring = alias => [`${alias}/${WIRING}`];
const whole = alias => [alias, `${alias}/**`];

/**
 * The patterns of every unit, for a file of context `alias` whose other contexts are `others`,
 * and the pattern of a whole context, used when nothing of it may be imported.
 */
function unitsFor(alias, others) {
  const units = {
    bootstrap: ['@Bootstrap/**'],
    libraries: architecture.libraries,
    'own.wiring': wiring(alias),
    'others.wiring': others.flatMap(wiring),
  };
  for (const name of LAYERS) {
    units[`own.${name}`] = layer(alias, name);
    units[`kernel.${name}`] = layer(architecture.kernel, name);
    units[`others.${name}`] = others.flatMap(other => layer(other, name));
  }
  return { units, wholes: { own: whole(alias), others: others.flatMap(whole) } };
}

const expand = allowed =>
  allowed.flatMap(unit =>
    unit === 'own.*'
      ? [...LAYERS.map(name => `own.${name}`), 'own.wiring']
      : unit === 'kernel.*'
      ? LAYERS.map(name => `kernel.${name}`)
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
  return [...new Set([...group, ...RELATIVE_ACROSS_DIRECTORIES])];
}

const restrict = (scope, { may_import, why }) => ({
  'no-restricted-imports': ['error', { patterns: [{ group: forbidden(scope, may_import), message: why }] }],
});

/**
 * @param folder  the directory under src/Contexts ('Notes', '@SharedKernel')
 * @param alias   how this context is imported ('@Contexts/Notes', '@SharedKernel')
 * @param others  the aliases of every other context
 */
function rulesFor(folder, alias, others) {
  const units = unitsFor(alias, others);
  const overrides = [];

  for (const name of LAYERS) {
    const { may_import, why, specs } = architecture.layers[name];
    overrides.push({ files: [`src/Contexts/${folder}/${name}/**/*.ts`], rules: restrict(units, { may_import, why }) });
    if (specs) {
      overrides.push({
        files: [`src/Contexts/${folder}/${name}/**/*.spec.ts`],
        rules: restrict(units, { may_import: [...may_import, ...specs.may_import], why: specs.why }),
      });
    }
  }

  overrides.push({ files: [`src/Contexts/${folder}/**/*.e2e.spec.ts`], rules: restrict(units, architecture.e2e_specs) });
  overrides.push({ files: [`src/Contexts/${folder}/${architecture.wiring}`], rules: restrict(units, architecture.wiring_file) });

  return overrides;
}

const contextAlias = context => `@Contexts/${context}`;
const CONTEXTS = architecture.contexts;

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint/eslint-plugin', 'import', 'eslint-plugin-tsdoc'],
  extends: ['plugin:@typescript-eslint/recommended'],
  env: {
    jest: true,
    node: true,
  },
  rules: {
    'no-console': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-dupe-class-members': ['error'],
    '@typescript-eslint/no-useless-constructor': ['error'],
    '@typescript-eslint/no-inferrable-types': ['off'],
  },
  overrides: [
    // The shared kernel is not a context: it knows no context at all.
    ...rulesFor(architecture.kernel, architecture.kernel, CONTEXTS.map(contextAlias)),
    ...CONTEXTS.flatMap(context =>
      rulesFor(context, contextAlias(context), CONTEXTS.filter(other => other !== context).map(contextAlias)),
    ),
  ],
};
