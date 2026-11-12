/**
 * The integrator: the role every multi-agent run has, whichever way the work is split (RFC 0004, decided in ADR 38).
 *
 * Several owners write one feature, each on a branch of its own. The integrator is a driver, not an agent: it decides
 * nothing about the code. In each round it
 *   1. merges every owner's branch onto the feature's start, in a fixed order (the feature's owner last); a conflict is
 *      sent to the owner whose branch conflicted, to merge the others' work into its branch and resolve it;
 *   2. runs the gate on the merged result, the only place a relationship test runs (H2: neither branch is refused
 *      alone for a test that needs both sides);
 *   3. routes each failing step to the owner of a file it names, or, when it names no owned file, to the feature's
 *      owner, and continues those owners' conversations with it (a session that ended is brought back; it is never
 *      replaced by a fresh agent that knows nothing of the work).
 * Rounds are bounded (H3: two). After the last one, the merged head is judged as it stands, and the result says which
 * failure was left and whose it was.
 *
 * Everything that touches git, the gate or an agent is passed in, so the role is the same in every driver that splits
 * work (H1: one module), and is tested without either (integrator.test.mjs).
 */

/** The paths a failure's lines name: `src/…`, `conventions/…`, `docs/…`, with an extension. */
export function filesNamed(text) {
  return [...new Set(String(text).match(/(?:src|conventions|docs|tests?)\/[^\s:()'"`,]+\.[A-Za-z]+/g) ?? [])];
}

/** The owner of a file: the first whose patterns match it; undefined when nobody's do. */
export function ownerOf(file, owners) {
  return owners.find(owner => owner.owns.some(pattern => new RegExp(pattern).test(file)))?.name;
}

/**
 * The files a failure's lines name, by path or by an import's alias (`'@SharedKernel/…/MessagingIntegrationEvents'`
 * is `src/SharedKernel/…/MessagingIntegrationEvents` with the alias `{ '@SharedKernel': 'src/SharedKernel' }`); an
 * alias names a module, with no extension.
 */
export function filesAndModulesNamed(text, aliases = {}) {
  const modules = [...String(text).matchAll(/["'](@[\w-]+)(\/[^"'\s]+)["']/g)]
    .filter(([, alias]) => aliases[alias])
    .map(([, alias, rest]) => `${aliases[alias]}${rest}`);
  return [...new Set([...filesNamed(text), ...modules])];
}

/**
 * An owner's failures, apart from those that wait on another owner (next campaign, correction 13). A line that names a
 * file or a module another owner owns (a member that owner's integration events do not export yet, its context's
 * declaration) waits on that owner: the owner cannot fix it alone, and only the merged result can say whether it
 * holds. A step whose every line that names a file waits is waiting; a step with a line of the owner's own, or that
 * names no file at all, is the owner's, without its waiting lines. Answers `{ own, waiting }`, each a list of steps.
 */
export function splitWaiting(steps, ownerName, owners, aliases = {}) {
  const own = [];
  const waiting = [];
  for (const step of steps) {
    const lines = step.lines ?? [];
    const waits = line =>
      filesAndModulesNamed(line, aliases).some(file => {
        const owner = ownerOf(file, owners);
        return owner !== undefined && owner !== ownerName;
      });
    const naming = lines.filter(line => filesAndModulesNamed(line, aliases).length > 0);
    const waited = lines.filter(waits);
    if (naming.length > 0 && waited.length === naming.length) waiting.push(step);
    else {
      own.push({ ...step, lines: lines.filter(line => !waits(line)) });
      if (waited.length) waiting.push({ ...step, lines: waited });
    }
  }
  return { own, waiting };
}

/**
 * Each failing step, to the owners of the files it names, or to the feature's owner when it names none of theirs. A
 * step that names files of two owners goes to both: each fixes what is its own, and they settle the rest between them.
 */
export function routeFailures(steps, owners, featureOwner, routeStep = () => []) {
  const routed = Object.fromEntries(owners.map(owner => [owner.name, []]));
  for (const step of steps) {
    const lines = [`${step.name}:`, ...(step.lines ?? []).slice(-60).map(line => `  ${line}`)];
    // A driver may know whose a step is better than the files it names (a relationship's test is its downstream
    // owner's, ADR 33); otherwise the files decide.
    const known = (routeStep(step) ?? []).filter(name => routed[name]);
    const named = new Set(
      known.length
        ? known
        : filesNamed([step.name, ...(step.lines ?? [])].join('\n'))
            .map(file => ownerOf(file, owners))
            .filter(Boolean),
    );
    if (named.size === 0) named.add(featureOwner);
    for (const name of named) routed[name].push(...lines);
  }
  return Object.fromEntries(Object.entries(routed).filter(([, lines]) => lines.length));
}

/**
 * The rounds. `merge()` answers `{ conflict?: { owner, files } }` (the first branch that did not merge, the merge
 * left undone); `gate()` answers `{ pass, steps: [{ name, lines }] }` on the merged result; `send(owner, kind, lines)`
 * continues that owner's conversation (`kind` is `conflict` or `failures`) and resolves once the owner has stopped.
 * `routeStep(step)`, optional, names the owners of a step the driver knows better than its files do.
 * Answers `{ pass, rounds, left?, conflict? }`.
 */
export async function integrate({ owners, featureOwner, merge, gate, send, rounds = 2, log = () => {}, routeStep }) {
  if (!owners.some(owner => owner.name === featureOwner))
    throw new Error(`the feature's owner ${featureOwner} owns nothing`);
  const history = [];
  for (let round = 1; ; round++) {
    const last = round > rounds;
    const merged = await merge();
    if (merged.conflict) {
      history.push({ round, conflict: merged.conflict });
      log('integrator', { round, conflict: merged.conflict });
      if (last) return { pass: false, rounds: history, conflict: merged.conflict };
      await send(merged.conflict.owner, 'conflict', merged.conflict.files);
      continue;
    }
    const gated = await gate();
    if (gated.pass) {
      history.push({ round, pass: true });
      log('integrator', { round, pass: true });
      return { pass: true, rounds: history };
    }
    const routed = routeFailures(gated.steps ?? [], owners, featureOwner, routeStep);
    const sent = Object.fromEntries(Object.entries(routed).map(([name, lines]) => [name, lines.length]));
    history.push({ round, pass: false, routed: sent });
    log('integrator', { round, pass: false, routed: sent, ...(last && { left: true }) });
    if (last) return { pass: false, rounds: history, left: routed };
    await Promise.all(Object.entries(routed).map(([name, lines]) => send(name, 'failures', lines)));
  }
}
