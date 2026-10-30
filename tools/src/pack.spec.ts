import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  createApplication,
  describePack,
  loadArchitectureContract,
  loadFeaturePlan,
  packSlice,
  repositoryRoot,
} from './index';

/**
 * What one slice of a feature is given (RFC 0001, phase 3): its own part to write, the other
 * slices' parts named as not its own, the contracts between them frozen, and a file to read for
 * every shape — from the project when it has one, from the reference when it does not (G7).
 */

const root = repositoryRoot();

describe('clean-ddd pack', () => {
  it('splits a cross-context plan into what the slice writes and what the other slice does', () => {
    const contract = loadArchitectureContract(root);
    const plan = loadFeaturePlan('conventions/plans/share-a-note.yaml', root);
    const pack = packSlice(plan, contract, root, 'conventions/plans/share-a-note.yaml');

    expect(pack.context).toBe('Notes');
    expect(pack.yours.every(change => change.place.startsWith('typescript/src/Contexts/Notes/'))).toBe(true);
    expect(pack.yours.map(change => change.kind)).toContain('command');
    // The anti-corruption handler `plan explain` lists is the other slice's.
    expect(pack.notYours).toContainEqual(expect.objectContaining({ context: 'Notifications', kind: 'event-handler' }));
    expect(pack.contracts).toContainEqual({
      name: 'NoteShared',
      direction: 'publishes',
      file: 'typescript/src/SharedKernel/Application/IntegrationEvents/NoteIntegrationEvents.ts',
    });
    expect(pack.frozen).toEqual(
      expect.arrayContaining([
        'conventions/storms/share-a-note.yaml',
        'conventions/plans/share-a-note.yaml',
        'typescript/src/SharedKernel/Application/IntegrationEvents/NoteIntegrationEvents.ts',
      ]),
    );
    expect(pack.storm?.yours?.commands.map(command => command.name)).toEqual(['ShareNote']);
    // What the contract stage froze for the other slices, even inside this slice's context, is frozen too.
    const readModel = 'typescript/src/Contexts/Notes/Domain/Note/Ports/INoteQueries.ts';
    const withFrozen = packSlice(
      { ...plan, frozen: [readModel] },
      contract,
      root,
      'conventions/plans/share-a-note.yaml',
    );
    expect(withFrozen.frozen).toContain(readModel);
    expect(describePack(withFrozen)).toContain('even inside your context');
    // In the reference, every example is the project's own file.
    const command = pack.yours.find(change => change.kind === 'command')!;
    expect(command.examples).toContainEqual({
      path: 'typescript/src/Contexts/Notes/Application/Commands/EditNote/EditNoteCommandHandler.ts',
      from: 'project',
    });
  });

  it('gives an application with no example of its own the reference’s, to read for the shape', () => {
    const directory = mkdtempSync(join(tmpdir(), 'packed-'));
    try {
      createApplication(directory, 'my-app', root);
      // A first context of its own, and a plan for its first command.
      mkdirSync(join(directory, 'conventions/plans'), { recursive: true });
      writeFileSync(
        join(directory, 'conventions/plans/write-a-note.yaml'),
        [
          'schemaVersion: 1',
          'feature: write-a-note',
          'language: typescript',
          'context: Tracker',
          'intent: Anyone writes a note.',
          'changes:',
          '  - { kind: command, name: WriteNote, verb: create, route: POST /notes, new: true }',
          'invariants: []',
          'events: []',
          'architectureChanges: false',
          '',
        ].join('\n'),
      );
      const contract = loadArchitectureContract(directory);
      const plan = loadFeaturePlan('conventions/plans/write-a-note.yaml', directory);
      const pack = packSlice(plan, contract, directory, 'conventions/plans/write-a-note.yaml', root);

      const [command] = pack.yours;
      expect(command.place).toBe('src/Contexts/Tracker/Application/Commands/WriteNote/');
      expect(command.examples).toContainEqual({
        path: expect.stringMatching(
          /typescript\/src\/Contexts\/Notes\/Application\/Commands\/EditNote\/EditNoteCommandHandler\.ts$/,
        ),
        from: 'reference',
      });
      expect(pack.gate).toBe('yarn architecture gate --base <the commit the slice started from>');
      // Just created, its building blocks are the reference's.
      expect(pack.drift).toBeUndefined();

      // Created by an older package: an example may call what the project does not have.
      writeFileSync(join(directory, 'src/Architecture/Application/DomainEvents.ts'), 'export {};\n');
      const older = packSlice(plan, contract, directory, 'conventions/plans/write-a-note.yaml', root);
      expect(older.drift).toEqual({
        tree: 'src/Architecture',
        files: ['src/Architecture/Application/DomainEvents.ts'],
      });
      expect(describePack(older)).toContain('call only what this project has');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
