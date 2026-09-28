/**
 * Architecture boundaries, enforced.
 *
 * Layers point inward: Domain -> Application -> Infrastructure / Presentation -> wiring -> Bootstrap.
 * Contexts talk through integration events (published in @SharedKernel/Application/IntegrationEvents)
 * and through ports they own; only an infrastructure adapter may read another context's Domain
 * (its ports and read models), and only a wiring file may import another context's wiring.
 *
 * The rules below are generated per context from one table, so that every context is held to
 * the same standard. Imports are matched on their path alias; relative imports are allowed only
 * for a sibling file (`./Note`), never across directories, so nothing can slip past the aliases.
 *
 * The patterns are gitignore-style. A parent that is excluded cannot have a child re-included,
 * so "every context but your own" is written by listing the other contexts, not by negation.
 */

const CONTEXTS = ['Notes', 'Security', 'Notifications', 'Tracker'];
const LAYERS = ['Domain', 'Application', 'Infrastructure', 'Presentation'];

/** A relative import may only name a sibling file. */
const RELATIVE_ACROSS_DIRECTORIES = ['../*', '../**', './*/**'];
const BOOTSTRAP = ['@Bootstrap/**'];
/** Libraries that belong to adapters: the domain and the use cases never see them. */
const INFRASTRUCTURE_LIBRARIES = ['fastify', '@fastify/**', 'jose', 'bcryptjs', 'ws'];

const layer = (alias, name) => [`${alias}/${name}`, `${alias}/${name}/**`];
const wiring = alias => [`${alias}/module.local`];
const whole = alias => [alias, `${alias}/**`];

// Deduplicated: for the shared kernel, "own layers" and "kernel layers" are the same patterns.
const restrict = (message, ...groups) => ({
  'no-restricted-imports': ['error', { patterns: [{ group: [...new Set(groups.flat(2))], message }] }],
});

/**
 * @param folder  the directory under src/Contexts ('Notes', '@SharedKernel')
 * @param alias   how this context is imported ('@Contexts/Notes', '@SharedKernel')
 * @param others  the aliases of every other context
 */
function rulesFor(folder, alias, others) {
  const files = name => [`src/Contexts/${folder}/${name}/**/*.ts`];
  const ownLayers = (...names) => names.map(name => layer(alias, name));
  const othersLayers = (...names) => others.flatMap(other => names.map(name => layer(other, name)));
  const kernelLayers = (...names) => names.map(name => layer('@SharedKernel', name));

  return [
    {
      files: files('Domain'),
      rules: restrict(
        'The Domain layer depends on nothing outside its own Domain and @SharedKernel/Domain.',
        others.map(whole),
        ownLayers('Application', 'Infrastructure', 'Presentation'),
        wiring(alias),
        kernelLayers('Application', 'Infrastructure', 'Presentation'),
        BOOTSTRAP,
        INFRASTRUCTURE_LIBRARIES,
        RELATIVE_ACROSS_DIRECTORIES,
      ),
    },
    {
      files: files('Application'),
      rules: restrict(
        'The Application layer depends on its own Domain and Application, @SharedKernel/Domain and @SharedKernel/Application (integration events included), nothing else.',
        others.map(whole),
        ownLayers('Infrastructure', 'Presentation'),
        wiring(alias),
        kernelLayers('Infrastructure', 'Presentation'),
        BOOTSTRAP,
        INFRASTRUCTURE_LIBRARIES,
        RELATIVE_ACROSS_DIRECTORIES,
      ),
    },
    {
      files: [`src/Contexts/${folder}/Application/**/*.spec.ts`],
      rules: restrict(
        'Application tests may use their own in-memory Infrastructure as test doubles, nothing further out.',
        others.map(whole),
        ownLayers('Presentation'),
        wiring(alias),
        kernelLayers('Presentation'),
        BOOTSTRAP,
        INFRASTRUCTURE_LIBRARIES,
        RELATIVE_ACROSS_DIRECTORIES,
      ),
    },
    {
      files: files('Infrastructure'),
      rules: restrict(
        "The Infrastructure layer implements its own ports; it may read another context's Domain (ports, read models) but not its Application, Infrastructure, Presentation or wiring.",
        othersLayers('Application', 'Infrastructure', 'Presentation'),
        others.map(wiring),
        ownLayers('Presentation'),
        wiring(alias),
        kernelLayers('Presentation'),
        BOOTSTRAP,
        RELATIVE_ACROSS_DIRECTORIES,
      ),
    },
    {
      files: files('Presentation'),
      rules: restrict(
        'The Presentation layer talks to its own Application layer (handlers, module) and Domain (read models, exceptions); never to Infrastructure, wiring, Bootstrap or another context.',
        others.map(whole),
        ownLayers('Infrastructure'),
        wiring(alias),
        kernelLayers('Infrastructure'),
        BOOTSTRAP,
        RELATIVE_ACROSS_DIRECTORIES,
      ),
    },
    {
      files: [`src/Contexts/${folder}/**/*.e2e.spec.ts`],
      rules: restrict(
        'End-to-end tests boot the application through the Bootstrap helper and speak HTTP; they do not reach into any layer.',
        [...others, alias].map(whole),
        kernelLayers(...LAYERS),
        RELATIVE_ACROSS_DIRECTORIES,
      ),
    },
    {
      files: [`src/Contexts/${folder}/module.local.ts`],
      rules: restrict(
        "A wiring file binds its own context and may import another context's wiring for what it exports; it never reaches inside another context.",
        othersLayers(...LAYERS),
        RELATIVE_ACROSS_DIRECTORIES,
      ),
    },
  ];
}

const contextAlias = context => `@Contexts/${context}`;

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
    ...rulesFor('@SharedKernel', '@SharedKernel', CONTEXTS.map(contextAlias)),
    ...CONTEXTS.flatMap(context =>
      rulesFor(context, contextAlias(context), CONTEXTS.filter(other => other !== context).map(contextAlias)),
    ),
  ],
};
