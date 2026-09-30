import { generateProbes, loadArchitectureContract, repositoryRoot } from './index';

/**
 * The probes are what `yarn check:conventions` runs the linter against; these specs check the
 * table they are generated from, not the linter's answer — that is the check's own business.
 */

const contract = loadArchitectureContract(repositoryRoot());
const probes = generateProbes(contract);

describe('the generated import probes', () => {
  it('covers every context and both trees, in both directions', () => {
    const files = new Set(probes.map(probe => probe.file));
    for (const root of ['src/Architecture', 'src/SharedKernel', ...contract.contexts.map(c => `src/Contexts/${c}`)]) {
      for (const layer of contract.layers) expect(files).toContain(`${root}/${layer}/Probe.ts`);
      expect(files).toContain(`${root}/${contract.wiring}`);
      expect(files).toContain(`${root}/Probe.e2e.spec.ts`);
    }
    expect(probes.some(probe => probe.expected === 'allowed')).toBe(true);
    expect(probes.some(probe => probe.expected === 'refused')).toBe(true);
  });

  it('asks nothing twice, and never asks for two answers to the same question', () => {
    const answers = new Map<string, string>();
    for (const probe of probes) {
      const question = `${probe.file} -> ${probe.specifier}`;
      expect(answers.get(question) ?? probe.expected).toBe(probe.expected);
      answers.set(question, probe.expected);
    }
  });

  it('reads the rows the way the contract writes them', () => {
    const of = (file: string) => probes.filter(probe => probe.file === file);
    const domain = of('src/Contexts/Notes/Domain/Probe.ts');
    // A context's Domain sees the two trees' Domain and nothing further out.
    expect(domain.find(p => p.specifier === '@Architecture/Domain/Probe')?.expected).toBe('allowed');
    expect(domain.find(p => p.specifier === '@Architecture/Application/Probe')?.expected).toBe('refused');
    expect(domain.find(p => p.specifier === '@Contexts/Security/Domain/Probe')?.expected).toBe('refused');
    // The building blocks know no vocabulary, so the shared kernel is another context to them.
    const blocks = of('src/Architecture/Domain/Probe.ts');
    expect(blocks.find(p => p.specifier === '@SharedKernel/Domain/Probe')?.expected).toBe('refused');
    expect(blocks.some(p => p.specifier.startsWith('@Architecture/Domain'))).toBe(true);
    // The shared kernel is built on them.
    const kernel = of('src/SharedKernel/Application/Probe.ts');
    expect(kernel.find(p => p.specifier === '@Architecture/Application/Probe')?.expected).toBe('allowed');
    // An Application spec may reach for its own in-memory adapters, which the layer may not.
    expect(
      of('src/Contexts/Notes/Application/Probe.spec.ts').find(
        p => p.specifier === '@Contexts/Notes/Infrastructure/Probe',
      )?.expected,
    ).toBe('allowed');
    expect(
      of('src/Contexts/Notes/Application/Probe.ts').find(p => p.specifier === '@Contexts/Notes/Infrastructure/Probe')
        ?.expected,
    ).toBe('refused');
    // A relative import may name a sibling and nothing else, everywhere.
    expect(domain.find(p => p.specifier === './Sibling')?.expected).toBe('allowed');
    expect(domain.find(p => p.specifier === '../Elsewhere')?.expected).toBe('refused');
  });

  it('probes only what a project has: no contexts, no context probes', () => {
    const alone = generateProbes({ ...contract, contexts: [] });
    expect(alone.length).toBeGreaterThan(0);
    expect(alone.every(probe => !probe.file.startsWith('src/Contexts/'))).toBe(true);
    expect(alone.every(probe => !probe.specifier.startsWith('@Contexts/'))).toBe(true);
  });
});
