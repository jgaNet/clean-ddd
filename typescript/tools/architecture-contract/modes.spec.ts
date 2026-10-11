import { loadArchitectureContract, repositoryRoot } from './index';
import { checkMode } from './modes';

const contract = loadArchitectureContract(repositoryRoot());
const check = (mode: 'feature' | 'architecture', changed: string[]) =>
  checkMode(mode, changed, contract, 'origin/main');

describe('development modes', () => {
  it('feature mode lets a feature change its context, its tests and its plan', () => {
    const verdict = check('feature', [
      'typescript/src/Contexts/Notes/Domain/Note/Note.ts',
      'typescript/src/Contexts/Notes/Presentation/API/REST/Routes/note.routes.ts',
      'typescript/src/Contexts/Notes/module.local.ts',
      'conventions/plans/a-feature.yaml',
      'README.md',
    ]);
    expect(verdict).toMatchObject({ ok: true, offending: [] });
  });

  it('feature mode refuses the building blocks, the kernel model, the conventions, the ADRs and the tools', () => {
    const verdict = check('feature', [
      'typescript/src/Architecture/Domain/Entity.ts',
      'typescript/src/SharedKernel/Domain/Role.ts',
      'conventions/architecture.yaml',
      'conventions/typescript.yaml',
      'docs/adr/0001-result-instead-of-exceptions.md',
      'typescript/tools/check-conventions.ts',
      'typescript/eslint.config.js',
    ]);
    expect(verdict.ok).toBe(false);
    expect(verdict.offending).toHaveLength(7);
    expect(verdict.problems[0]).toMatch(/that is the finding/);
  });

  it('feature mode allows publishing a contract: the integration events are not protected', () => {
    expect(
      check('feature', ['typescript/src/SharedKernel/Application/IntegrationEvents/NoteIntegrationEvents.ts']),
    ).toMatchObject({ ok: true });
  });

  it('architecture mode asks for the decision, and is satisfied by one in the same change', () => {
    const silent = check('architecture', ['typescript/src/Architecture/Domain/Entity.ts']);
    expect(silent.ok).toBe(false);
    expect(silent.problems[0]).toMatch(/records no decision/);

    const recorded = check('architecture', [
      'typescript/src/Architecture/Domain/Entity.ts',
      'docs/adr/0010-something.md',
    ]);
    expect(recorded).toMatchObject({ ok: true });
  });

  it('architecture mode has nothing to say about a change that decides nothing', () => {
    expect(check('architecture', ['typescript/src/Contexts/Notes/Domain/Note/Note.ts'])).toMatchObject({ ok: true });
  });
});
