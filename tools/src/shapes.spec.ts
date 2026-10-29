import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { compareInventories, inspectInventory, loadInventories } from './inventory';
import { loadArchitectureContract, repositoryRoot } from './load';
import { inspectEventStorm, oneHandlerProblems } from './storm';

/**
 * The readers recognise the canonical shapes the guides teach, and no other — by design: a
 * reading that guessed at every way a command could be built would be a second guide, drifting
 * from the first. What that stance costs is a shape a reader does not see, and the question that
 * matters is whether such a shape can stay silent. These probes write unusual but valid shapes
 * into a copy of the tree and ask what the checks say: the command is still read as the
 * committed inventory expects (recognised), or the copy is refused — by the inventory held equal
 * to the other languages (ARCH-ONE-APPLICATION), or by the one-handler rule (ARCH-ONE-HANDLER).
 * A probe that is neither is a false negative, and fails here; a reader that starts recognising
 * a shape moves its probe to "recognised", which is a change to the guides as much as to the
 * tool.
 */

const root = repositoryRoot();
const committed = loadInventories(root).get('typescript')!;

const NOTES = 'typescript/src/Contexts/Notes';
const CONTROLLER = `${NOTES}/Presentation/API/REST/Controllers/FastifyNoteController.ts`;
const ROUTES = `${NOTES}/Presentation/API/REST/Routes/note.routes.ts`;
const WIRING = `${NOTES}/module.local.ts`;
const HANDLER = `${NOTES}/Application/Commands/ShareNote/ShareNoteCommandHandler.ts`;

const SHARE_BUILT = 'ShareNoteCommandEvent.set({ noteId: req.params.id, recipientId: req.body.recipientId })';
const SHARE_LISTED =
  '{ event: ShareNoteCommandEvent, handlers: [new ShareNoteCommandHandler(noteRepository, noteSharing)] },';
const SHARE_BOUND = 'controller.shareNote.bind(controller),';

interface Verdict {
  /** The copy's inventory says what the committed one says, and every command has its one handler. */
  recognised: boolean;
  /** What refused the copy, when something did. */
  caught: string[];
}

/** A copy of the tree with one unusual shape written into it, and what the checks say of it. */
function probe(...edits: Array<[file: string, from: string, to: string]>): Verdict {
  const copy = mkdtempSync(join(tmpdir(), 'clean-ddd-shape-'));
  try {
    for (const dir of ['conventions', 'docs/inventory', 'typescript/src']) {
      cpSync(join(root, dir), join(copy, dir), { recursive: true });
    }
    for (const [file, from, to] of edits) {
      const path = join(copy, file);
      const text = readFileSync(path, 'utf8');
      if (text.split(from).length !== 2) throw new Error(`${file} does not contain exactly once: ${from}`);
      writeFileSync(path, text.replace(from, to));
    }
    const contract = loadArchitectureContract(copy);
    const caught = [
      ...compareInventories(inspectInventory(contract, copy), committed).map(line => `ARCH-ONE-APPLICATION: ${line}`),
      ...oneHandlerProblems(inspectEventStorm(contract, copy)),
    ];
    return { recognised: caught.length === 0, caught };
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}

const about = (verdict: Verdict, rule: string) => verdict.caught.filter(line => line.startsWith(rule));

describe('the readers, challenged with unusual shapes: recognised, or caught, never silent', () => {
  it('the tree as it is: every shape recognised, nothing caught', () => {
    expect(probe()).toEqual({ recognised: true, caught: [] });
  });

  it('a handler class named for its use case rather than its command is recognised: the command is named by its event', () => {
    const verdict = probe(
      [HANDLER, 'export class ShareNoteCommandHandler', 'export class ShareNoteUseCase'],
      [
        WIRING,
        'new ShareNoteCommandHandler(noteRepository, noteSharing)',
        'new ShareNoteUseCase(noteRepository, noteSharing)',
      ],
      [WIRING, '  ShareNoteCommandHandler,\n', '  ShareNoteUseCase,\n'],
    );
    expect(verdict).toEqual({ recognised: true, caught: [] });
  });

  it('a command built through an alias of its class is not seen by the route reading: caught by the inventory', () => {
    const verdict = probe(
      [CONTROLLER, SHARE_BUILT, 'Share.set({ noteId: req.params.id, recipientId: req.body.recipientId })'],
      [
        CONTROLLER,
        'export class FastifyNoteController',
        'const Share = ShareNoteCommandEvent;\n\nexport class FastifyNoteController',
      ],
    );
    expect(verdict.recognised).toBe(false);
    expect(about(verdict, 'ARCH-ONE-APPLICATION').join('\n')).toContain('ShareNote');
  });

  it('a command built by a helper the route method calls is not seen by the route reading: caught by the inventory', () => {
    const verdict = probe(
      [CONTROLLER, SHARE_BUILT, 'share(req.params.id, req.body.recipientId)'],
      [
        CONTROLLER,
        'export class FastifyNoteController',
        'const share = (noteId: string, recipientId: string) => ShareNoteCommandEvent.set({ noteId, recipientId });\n\nexport class FastifyNoteController',
      ],
    );
    expect(verdict.recognised).toBe(false);
    expect(about(verdict, 'ARCH-ONE-APPLICATION').join('\n')).toContain('ShareNote');
  });

  it('a route bound through an arrow function instead of bind() is not seen: caught by the inventory', () => {
    const verdict = probe([ROUTES, SHARE_BOUND, '(req, reply) => controller.shareNote(req, reply),']);
    expect(verdict.recognised).toBe(false);
    expect(about(verdict, 'ARCH-ONE-APPLICATION').join('\n')).toContain('ShareNote');
  });

  it('a handlers list held in a variable is not seen by the wiring reading: caught by the inventory and by ARCH-ONE-HANDLER', () => {
    const verdict = probe(
      [WIRING, SHARE_LISTED, '{ event: ShareNoteCommandEvent, handlers: shareHandlers },'],
      [
        WIRING,
        'export const localNotesModule',
        'const shareHandlers = [new ShareNoteCommandHandler(noteRepository, noteSharing)];\n\nexport const localNotesModule',
      ],
    );
    expect(verdict.recognised).toBe(false);
    expect(about(verdict, 'ARCH-ONE-APPLICATION').join('\n')).toContain('ShareNote');
    expect(about(verdict, 'ARCH-ONE-HANDLER')).toEqual([
      'ARCH-ONE-HANDLER: Notes: command ShareNote is built by a route and no handler in the Module answers it',
    ]);
  });

  it('a handler built by a factory instead of new is not seen: caught by ARCH-ONE-HANDLER, zero handlers', () => {
    const verdict = probe(
      [WIRING, SHARE_LISTED, '{ event: ShareNoteCommandEvent, handlers: [shareHandler()] },'],
      [
        WIRING,
        'export const localNotesModule',
        'const shareHandler = () => new ShareNoteCommandHandler(noteRepository, noteSharing);\n\nexport const localNotesModule',
      ],
    );
    expect(verdict.recognised).toBe(false);
    expect(about(verdict, 'ARCH-ONE-HANDLER')).toEqual([
      'ARCH-ONE-HANDLER: Notes: command ShareNote has 0 handlers (); a command has exactly one',
    ]);
  });

  it('a subscription spread into the commands list from a variable is not seen: caught by the inventory and by ARCH-ONE-HANDLER', () => {
    const verdict = probe(
      [WIRING, SHARE_LISTED, '...shareCommands,'],
      [
        WIRING,
        'export const localNotesModule',
        `const shareCommands = [${SHARE_LISTED.slice(0, -1)}];\n\nexport const localNotesModule`,
      ],
    );
    expect(verdict.recognised).toBe(false);
    expect(about(verdict, 'ARCH-ONE-APPLICATION').join('\n')).toContain('ShareNote');
    expect(about(verdict, 'ARCH-ONE-HANDLER')).toEqual([
      'ARCH-ONE-HANDLER: Notes: command ShareNote is built by a route and no handler in the Module answers it',
    ]);
  });

  it('a command listed under an alias of its event class is not seen: caught by the inventory and by ARCH-ONE-HANDLER', () => {
    const verdict = probe(
      [WIRING, SHARE_LISTED, '{ event: Share, handlers: [new ShareNoteCommandHandler(noteRepository, noteSharing)] },'],
      [
        WIRING,
        'export const localNotesModule',
        'const Share = ShareNoteCommandEvent;\n\nexport const localNotesModule',
      ],
    );
    expect(verdict.recognised).toBe(false);
    expect(about(verdict, 'ARCH-ONE-HANDLER')).toEqual([
      'ARCH-ONE-HANDLER: Notes: command ShareNote is built by a route and no handler in the Module answers it',
    ]);
  });
});
