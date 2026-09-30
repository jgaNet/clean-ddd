import { ArchitectureContract, Rule } from './types';

/**
 * The import table, exercised. For every tree the contract describes — each context, the
 * building blocks, the shared kernel — and every layer of it, this writes one probe per unit
 * the table allows (the linter must allow it) and one per unit it does not (the linter must
 * refuse it, naming the rule), plus the two relative-import cases.
 *
 * They are generated rather than listed so that a new context is covered the day it is
 * declared, and so that a project with other contexts — or none — probes its own table. What
 * they prove is not the table, which is the source of truth, but its translation into
 * `no-restricted-imports`: this file reads the contract the way eslint.config.js reads it, and
 * if the two ever disagree about what a row means, a probe fails.
 */

export interface Probe {
  /** A file that does not exist; the linter is asked what it would allow there. */
  file: string;
  specifier: string;
  expected: 'allowed' | 'refused';
  /** The rule whose row this probe exercises, for the message when it fails. */
  rule: string;
}

/** A tree of layers with its own row set: a context, or one of the two outside them. */
interface Scope {
  root: string;
  alias: string;
  /** Aliases nothing may be imported from (the other contexts, and for the building blocks the kernel). */
  others: string[];
  /** The trees this one may see per layer, by the prefix the table uses. */
  trees: Record<string, string>;
}

const scopesOf = (contract: ArchitectureContract): Scope[] => {
  const contexts = contract.contexts.map(context => `@Contexts/${context}`);
  const architecture = contract.architecture.alias;
  const kernel = contract.kernel.alias;
  return [
    { root: contract.architecture.path, alias: architecture, others: [...contexts, kernel], trees: {} },
    { root: contract.kernel.path, alias: kernel, others: contexts, trees: { architecture } },
    ...contract.contexts.map(context => ({
      root: `src/Contexts/${context}`,
      alias: `@Contexts/${context}`,
      others: contexts.filter(other => other !== `@Contexts/${context}`),
      trees: { architecture, kernel },
    })),
  ];
};

/**
 * Every unit a file in this scope could name, and the import specifiers landing in it. The
 * units are the ones eslint.config.js enumerates; one the scope does not have (kernel.* for
 * the building blocks) is absent here as it is there. `others.*` is asked once per other tree,
 * not once, so that a tree left out of the forbidden patterns is caught — for the building
 * blocks, the shared kernel is one of the others, and that is the refusal that matters most.
 */
function unitsOf(scope: Scope, contract: ArchitectureContract): [string, string][] {
  const wiring = (alias: string) => `${alias}/${contract.wiring.replace(/\.ts$/, '')}`;
  const units: [string, string][] = [
    ['bootstrap', '@Bootstrap/Fastify/application.settings'],
    ['libraries', contract.libraries[0]],
    ['own.wiring', wiring(scope.alias)],
    ...scope.others.map((other): [string, string] => ['others.wiring', wiring(other)]),
  ];
  for (const layer of contract.layers) {
    units.push([`own.${layer}`, `${scope.alias}/${layer}/Probe`]);
    for (const [prefix, alias] of Object.entries(scope.trees))
      units.push([`${prefix}.${layer}`, `${alias}/${layer}/Probe`]);
    for (const other of scope.others) units.push([`others.${layer}`, `${other}/${layer}/Probe`]);
  }
  return units;
}

const expand = (contract: ArchitectureContract, allowed: string[]): Set<string> =>
  new Set(
    allowed.flatMap(unit =>
      unit === 'own.*'
        ? [...contract.layers.map(layer => `own.${layer}`), 'own.wiring']
        : unit.endsWith('.*')
          ? contract.layers.map(layer => `${unit.slice(0, -2)}.${layer}`)
          : [unit],
    ),
  );

/** The rule of a layer, of a layer's specs, or of one of the two kinds of file that are not a layer. */
const ruleFor = (contract: ArchitectureContract, layer: string): Rule | undefined =>
  contract.rules.find(rule => rule.dependency?.layer === layer);

export function generateProbes(contract: ArchitectureContract): Probe[] {
  const probes: Probe[] = [];
  const relative = ruleFor(contract, 'relative_imports');

  const probeFile = (scope: Scope, file: string, rule: Rule | undefined, mayImport: string[]) => {
    if (!rule) return;
    const allowed = expand(contract, mayImport);
    for (const [unit, specifier] of unitsOf(scope, contract)) {
      probes.push({ file, specifier, expected: allowed.has(unit) ? 'allowed' : 'refused', rule: rule.id });
    }
    probes.push({ file, specifier: './Sibling', expected: 'allowed', rule: relative?.id ?? 'ARCH-RELATIVE' });
    probes.push({ file, specifier: '../Elsewhere', expected: 'refused', rule: relative?.id ?? 'ARCH-RELATIVE' });
  };

  for (const scope of scopesOf(contract)) {
    for (const layer of contract.layers) {
      const rule = ruleFor(contract, layer);
      probeFile(scope, `${scope.root}/${layer}/Probe.ts`, rule, rule?.dependency?.mayImport ?? []);
      // A spec in a layer that has a spec row is held to both rows, as in eslint.config.js.
      const specs = ruleFor(contract, `${layer} specs`);
      if (specs) {
        probeFile(scope, `${scope.root}/${layer}/Probe.spec.ts`, specs, [
          ...(rule?.dependency?.mayImport ?? []),
          ...(specs.dependency?.mayImport ?? []),
        ]);
      }
    }
    const e2e = ruleFor(contract, 'e2e_specs');
    probeFile(scope, `${scope.root}/Probe.e2e.spec.ts`, e2e, e2e?.dependency?.mayImport ?? []);
    const wiring = ruleFor(contract, 'wiring_file');
    probeFile(scope, `${scope.root}/${contract.wiring}`, wiring, wiring?.dependency?.mayImport ?? []);
  }
  return probes;
}
