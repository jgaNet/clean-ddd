import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { load } from 'js-yaml';

import { ArchitectureContract, Profile, Rule } from './types';
import type { Inventory, InventoryContext } from './inventory';

/**
 * Architecture profiles (ADR 40): one contract, one engine, profiles as data.
 *
 * The contract names profiles (`profiles` in architecture.yaml) and the floor no profile may drop
 * (`floor`); a binding names the profile of each context (`profiles: { <Context>: <profile> }`), and a
 * context it does not name is held to the default profile. This module is the engine's half: the closed
 * set of triggers a conditional rule may name, the check that holds every profile to the validation
 * contract of RFC 0002 (§9: P1–P4 and P6; P5 is a spec), the matrix rule × profile, and the change of a
 * context's profile, which the architecture mode asks an ADR for.
 *
 * A profile never words a rule: it holds it, waives it with a reason, or holds it where a trigger fires.
 * A rule it holds by review alone is one of its gaps, named, never presented as a guarantee.
 */

/**
 * A trigger: a condition the engine can see in the inventory, so that "holds this rule where X" is
 * mechanical (P4). The set is closed and lives in the engine, not in the contract: a trigger nobody can
 * evaluate would be a rule quietly skipped. Each one reads one context of the inventory.
 */
export interface Trigger {
  id: string;
  means: string;
  fires: (context: InventoryContext, inventory: Inventory) => boolean;
}

const triggers: Trigger[] = [
  {
    id: 'publishes-integration-event',
    means:
      'one of the context’s policies, or a use case it answers at once, publishes an integration event: a fact leaves the context',
    fires: context =>
      context.policies.some(policy => policy.publishes.length > 0) ||
      context.commands.some(command => (command.publishes?.length ?? 0) > 0),
  },
  {
    id: 'reacts-to-integration-event',
    means: 'one of the context’s policies reacts to another context’s integration event',
    fires: context => context.policies.some(policy => policy.kind === 'integration-event'),
  },
  {
    id: 'reacts-to-domain-event',
    means: 'one of the context’s policies reacts to one of its own domain events',
    fires: context => context.policies.some(policy => policy.kind === 'domain-event'),
  },
  {
    id: 'several-writers',
    means: 'two commands of the context or more reach the same aggregate, so two writers can race on it',
    fires: context => {
      const reached = context.commands.map(command => command.aggregate).filter(Boolean);
      return new Set(reached).size < reached.length;
    },
  },
  {
    // Full's grammar answers a command with a 202 and an operation read later; a use case of the Lite
    // profile is answered at once, and the inventory says so (`answered: at-once`).
    id: 'command-answered-later',
    means: 'the context has a command whose outcome is read later (an operation behind a 202)',
    fires: context => context.commands.some(command => command.answered !== 'at-once'),
  },
  {
    id: 'asks-another-context',
    means: 'the context asks another one through a port it owns (it is downstream of an owned-port link)',
    fires: (context, inventory) =>
      inventory.links.some(link => link.mechanism === 'owned-port' && link.downstream === context.id),
  },
];

/** The closed set of triggers a conditional rule may name, by id. */
export const TRIGGERS: Record<string, Trigger> = Object.fromEntries(triggers.map(trigger => [trigger.id, trigger]));

/** Does `trigger` fire for the context `context` of the inventory? False for a context it does not list. */
export function triggerFires(trigger: string, context: string, inventory: Inventory): boolean {
  const found = inventory.contexts.find(candidate => candidate.id === context);
  const known = TRIGGERS[trigger];
  if (!known) throw new Error(`unknown trigger "${trigger}"; one of ${Object.keys(TRIGGERS).join(', ')}`);
  return found !== undefined && known.fires(found, inventory);
}

/** Where a profile stands on a rule. */
export type Stance =
  | { stance: 'held'; gap: boolean }
  | { stance: 'conditional'; trigger: string; gap: boolean }
  | { stance: 'waived'; reason: string }
  | { stance: 'unlisted' };

export function stanceOf(profile: Profile, rule: Rule): Stance {
  const gap = profile.gaps.includes(rule.id);
  if (rule.id in profile.waives) return { stance: 'waived', reason: profile.waives[rule.id] };
  if (rule.id in profile.conditional) return { stance: 'conditional', trigger: profile.conditional[rule.id], gap };
  if (profile.holds === 'all' || profile.holds.includes(rule.id)) return { stance: 'held', gap };
  return { stance: 'unlisted' };
}

/** The default profile: the one a context is held to when its binding names none. */
export const defaultProfile = (contract: ArchitectureContract): Profile | undefined =>
  contract.profiles.find(profile => profile.default);

/**
 * The profile a context is held to: the one its binding names for it, else the binding's own default
 * (`default_profile`, an application created Lite), else the contract's default.
 */
export const profileOf = (contract: ArchitectureContract, context: string): string | undefined =>
  contract.contextProfiles[context] ?? contract.bindingProfile ?? defaultProfile(contract)?.id;

/**
 * The profiles this binding holds: the default, which it holds by being a binding, and every one it
 * says how it holds under `profiles_held`. Another profile is a gap of this language ("Lite: not held",
 * ARCH-ONE-CONTRACT): no context may be held to it here.
 */
export const profilesHeldBy = (contract: ArchitectureContract): string[] => [
  ...contract.profiles.filter(profile => profile.default).map(profile => profile.id),
  ...Object.keys(contract.profilesHeld).filter(id =>
    contract.profiles.some(profile => profile.id === id && !profile.default),
  ),
];

/**
 * The contract as a context held to `profile` reads it: its grammar's verbs, and the checklists the
 * binding gives that profile where they differ from its own (`profiles_held.<id>.checklists`). The
 * default profile, or one this binding does not hold, reads the contract as it is.
 */
export function contractUnder(contract: ArchitectureContract, profile: string): ArchitectureContract {
  const found = contract.profiles.find(candidate => candidate.id === profile);
  const held = contract.profilesHeld[profile];
  if (!found || found.default || !held) return contract;
  return {
    ...contract,
    verbs: found.grammar === 'http' ? contract.verbs : (contract.grammarVerbs[found.grammar] ?? contract.verbs),
    checklists: contract.checklists.map(
      checklist => held.checklists.find(own => own.kind === checklist.kind) ?? checklist,
    ),
  };
}

/**
 * The triggers that fire for each context held to a profile that conditions rules or mechanisms on
 * them, with what each brings in: the rules the profile then holds there, and the mechanisms that come
 * in by an ADR (MechanismRequired, RFC 0002 §2). A context held to Full has none: it holds everything.
 */
export function profileTriggers(
  contract: ArchitectureContract,
  inventory: Inventory,
): { context: string; profile: string; trigger: string; rules: string[]; mechanisms: string[] }[] {
  const found: { context: string; profile: string; trigger: string; rules: string[]; mechanisms: string[] }[] = [];
  for (const context of contract.contexts) {
    const profile = contract.profiles.find(candidate => candidate.id === profileOf(contract, context));
    if (!profile) continue;
    for (const trigger of Object.keys(TRIGGERS)) {
      const rules = Object.entries(profile.conditional)
        .filter(([, on]) => on === trigger)
        .map(([rule]) => rule);
      const mechanisms = Object.entries(profile.mechanisms)
        .filter(([, mechanism]) => mechanism.until === trigger)
        .map(([mechanism]) => mechanism);
      if ((rules.length || mechanisms.length) && triggerFires(trigger, context, inventory)) {
        found.push({ context, profile: profile.id, trigger, rules, mechanisms });
      }
    }
  }
  return found;
}

/** The read model of §3 of RFC 0002: rule × profile → held, waived (with reason) or conditional (with trigger). */
export function profileMatrix(contract: ArchitectureContract): { rule: string; stances: Record<string, Stance> }[] {
  return contract.rules.map(rule => ({
    rule: rule.id,
    stances: Object.fromEntries(contract.profiles.map(profile => [profile.id, stanceOf(profile, rule)])),
  }));
}

/** What a profile may say: it holds, waives and conditions rules; it never words one (ARCH-ONE-CONTRACT). */
const PROFILE_KEYS = [
  'name',
  'why',
  'default',
  'holds',
  'waives',
  'conditional',
  'gaps',
  'grammar',
  'checklists',
  'mechanisms',
];
/** How a profile classifies a mechanism: one of these words, with its reason. */
const MECHANISM_STANCES = ['kept', 'not_used', 'uses'];
/** What holds a floor guarantee that is not a rule: the two modes, which the gate runs. */
const HELD_BY = ['modes'];

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Everything the profiles of a contract, and the binding's profile per context, can get wrong, one line
 * each (ADR 40; RFC 0002, §9):
 *
 * - P1. Every rule is held, waived with a reason, or held conditionally, in every profile, and only once;
 *   a profile names no rule the contract does not define.
 * - P2. No rule of the floor is waived (it may be held conditionally, where the guarantee itself is).
 * - P3. A rule a profile holds by review alone is listed as a gap of that profile; a gap is a rule it holds
 *   by review.
 * - P4. A conditional rule's trigger is one of TRIGGERS.
 * - P6. A binding holds a context it declares to a profile the contract declares.
 *
 * And the frame: exactly one default profile, a grammar and checklists the contract has, a floor whose
 * every guarantee names its rules, its gap, or what else holds it. A contract that declares no profiles
 * is held as written, and a binding may then name none.
 */
export function validateProfiles(contract: ArchitectureContract, root?: string): string[] {
  const problems: string[] = [];
  const { architecture: file, binding } = contract.sources;
  const rules = new Map(contract.rules.map(rule => [rule.id, rule]));
  const declared = contract.profiles.map(profile => profile.id);

  const held = profilesHeldBy(contract);
  const notHeld = (profile: string) =>
    `${contract.language.name} does not hold the profile "${profile}": its binding says how under "profiles_held.${profile}", or reports it as a gap (ARCH-ONE-CONTRACT)`;
  for (const [context, profile] of Object.entries(contract.contextProfiles)) {
    if (!contract.contexts.includes(context)) {
      problems.push(`${binding}: names a profile for ${context}, which it does not declare under "contexts" (P6)`);
    }
    if (!declared.includes(profile)) {
      problems.push(
        `${binding}: holds ${context} to the profile "${profile}", which ${file} does not declare${declared.length ? `: one of ${declared.join(', ')}` : ''} (P6)`,
      );
    } else if (!held.includes(profile)) {
      problems.push(`${binding}: holds ${context} to the profile "${profile}"; ${notHeld(profile)} (P6)`);
    }
  }
  if (contract.bindingProfile !== undefined) {
    if (!declared.includes(contract.bindingProfile)) {
      problems.push(
        `${binding}: "default_profile" is "${contract.bindingProfile}", which ${file} does not declare${declared.length ? `: one of ${declared.join(', ')}` : ''} (P6)`,
      );
    } else if (!held.includes(contract.bindingProfile)) {
      problems.push(
        `${binding}: "default_profile" is "${contract.bindingProfile}"; ${notHeld(contract.bindingProfile)} (P6)`,
      );
    }
  }
  for (const [id, holding] of Object.entries(contract.profilesHeld)) {
    const profile = contract.profiles.find(candidate => candidate.id === id);
    if (!profile) {
      problems.push(`${binding}: says how it holds the profile "${id}", which ${file} does not declare (P6)`);
      continue;
    }
    if (profile.default) {
      problems.push(
        `${binding}: says how it holds "${id}", the default, which every binding holds by its own sections`,
      );
    }
    for (const mechanism of Object.keys(holding.shows)) {
      const classified = profile.mechanisms[mechanism];
      if (!classified) {
        problems.push(
          `${binding} profiles_held.${id}: shows "${mechanism}", which the profile does not classify (one of ${Object.keys(profile.mechanisms).join(', ')})`,
        );
      } else if (classified.stance === 'not-used') {
        problems.push(`${binding} profiles_held.${id}: shows "${mechanism}", which the profile does not use`);
      }
    }
    for (const [mechanism, classified] of Object.entries(profile.mechanisms)) {
      if (classified.stance === 'uses' && !holding.shows[mechanism]?.length) {
        problems.push(
          `${binding} profiles_held.${id}: names no file that shows "${mechanism}", a shape of the profile's own`,
        );
      }
    }
    for (const checklist of holding.checklists) {
      if (!checklist.place)
        problems.push(`${binding} profiles_held.${id} checklist "${checklist.kind}": "place" is missing`);
      if (!checklist.parts.length)
        problems.push(`${binding} profiles_held.${id} checklist "${checklist.kind}": lists no parts`);
    }
  }
  if (!contract.profiles.length) {
    if (contract.floor.length) problems.push(`${file}: declares a floor and no profile to hold it`);
    return problems;
  }

  // The floor: the guarantees no profile may drop, each with what holds it.
  for (const guarantee of contract.floor) {
    const where = `${file} floor "${guarantee.guarantee || '(unnamed)'}"`;
    if (!guarantee.guarantee) problems.push(`${where}: says no guarantee`);
    for (const id of guarantee.rules) {
      if (!rules.has(id)) problems.push(`${where}: names the rule ${id}, which ${file} does not define`);
    }
    if (!guarantee.rules.length && !guarantee.gap && !guarantee.heldBy) {
      problems.push(`${where}: no rule holds it, and it says neither its gap nor what holds it`);
    }
    const byReview = guarantee.rules.filter(id => rules.get(id)?.enforcement === 'review');
    if (byReview.length && !guarantee.gap) {
      problems.push(`${where}: ${byReview.join(', ')} is held by review alone; say the gap ("gap:")`);
    }
    if (guarantee.heldBy && !HELD_BY.includes(guarantee.heldBy)) {
      problems.push(`${where}: "held_by" must be one of ${HELD_BY.join(', ')}`);
    }
  }
  const floor = new Map(contract.floor.flatMap(guarantee => guarantee.rules.map(id => [id, guarantee.guarantee])));

  const defaults = contract.profiles.filter(profile => profile.default);
  if (defaults.length !== 1) {
    problems.push(
      `${file}: ${defaults.length ? `${defaults.map(profile => profile.id).join(', ')} are each` : 'no profile is'} the default; exactly one is ("default: true")`,
    );
  }

  const raw = root && existsSync(join(root, file)) ? (load(readFileSync(join(root, file), 'utf8')) as Raw) : {};
  const rawProfiles = isObject(raw.profiles) ? raw.profiles : {};
  const kinds = contract.checklists.map(checklist => checklist.kind);

  for (const profile of contract.profiles) {
    const where = `${file} profile "${profile.id}"`;
    const rawProfile = isObject(rawProfiles[profile.id]) ? (rawProfiles[profile.id] as Raw) : {};
    for (const key of Object.keys(rawProfile).filter(key => !PROFILE_KEYS.includes(key))) {
      problems.push(
        `${where}: "${key}" is not a word of a profile (${PROFILE_KEYS.join(', ')}); a profile holds, waives or conditions a rule, it never words one (ARCH-ONE-CONTRACT)`,
      );
    }
    if (!profile.why) problems.push(`${where}: "why" is missing`);

    // P1: every rule, once; no rule the contract does not have.
    const named = [
      ...(profile.holds === 'all' ? [] : profile.holds),
      ...Object.keys(profile.waives),
      ...Object.keys(profile.conditional),
      ...profile.gaps,
    ];
    for (const id of new Set(named)) {
      if (!rules.has(id)) problems.push(`${where}: names the rule ${id}, which ${file} does not define (P1)`);
    }
    for (const id of rules.keys()) {
      const stances = [
        profile.holds !== 'all' && profile.holds.includes(id),
        id in profile.waives,
        id in profile.conditional,
      ].filter(Boolean).length;
      if (profile.holds !== 'all' && stances === 0) {
        problems.push(
          `${where}: leaves the rule ${id} unlisted; hold it, waive it with a reason, or hold it on a trigger (P1)`,
        );
      }
      if (stances > 1) problems.push(`${where}: says more than one thing about the rule ${id} (P1)`);
    }
    for (const [id, reason] of Object.entries(profile.waives)) {
      if (!reason.trim()) problems.push(`${where}: waives ${id} with no reason (P1)`);
      // P2: the floor is held by every profile.
      if (floor.has(id)) {
        problems.push(
          `${where}: waives ${id}, which holds the floor's "${floor.get(id)}"; a profile may hold a floor rule on a trigger, never drop it (P2)`,
        );
      }
    }
    // P4: a trigger the engine can see.
    for (const [id, trigger] of Object.entries(profile.conditional)) {
      if (!TRIGGERS[trigger]) {
        problems.push(
          `${where}: holds ${id} on "${trigger}", which is not a trigger the engine can see; one of ${Object.keys(TRIGGERS).join(', ')} (P4)`,
        );
      }
    }
    // P3: what is held by review alone is a gap, and says so.
    for (const rule of contract.rules) {
      const stance = stanceOf(profile, rule);
      const holds = stance.stance === 'held' || stance.stance === 'conditional';
      if (holds && rule.enforcement === 'review' && !profile.gaps.includes(rule.id)) {
        problems.push(
          `${where}: holds ${rule.id} by review alone, and does not list it under "gaps"; a rule no tool holds is a gap, never a guarantee (P3)`,
        );
      }
      if (profile.gaps.includes(rule.id) && !holds) {
        problems.push(`${where}: lists ${rule.id} as a gap, and does not hold it (P3)`);
      }
      if (profile.gaps.includes(rule.id) && rule.enforcement !== 'review') {
        problems.push(
          `${where}: lists ${rule.id} as a gap, and ${file} holds it by ${rule.enforcement}; remove it from "gaps" (P3)`,
        );
      }
    }

    // The mechanisms (RFC 0002, H2): each kept, not used or replaced, with its reason; one not used
    // comes in on a trigger the engine can see (P4), or by a decision alone.
    const rawMechanisms = isObject(rawProfile.mechanisms) ? rawProfile.mechanisms : {};
    for (const [mechanism, classified] of Object.entries(profile.mechanisms)) {
      const said = isObject(rawMechanisms[mechanism]) ? Object.keys(rawMechanisms[mechanism] as Raw) : undefined;
      const stances = said?.filter(key => MECHANISM_STANCES.includes(key)) ?? [classified.stance];
      if (said && (stances.length !== 1 || said.some(key => !MECHANISM_STANCES.includes(key) && key !== 'until'))) {
        problems.push(
          `${where}: the mechanism "${mechanism}" says one of ${MECHANISM_STANCES.join(', ')}, with its reason, and "until" for one not used`,
        );
      }
      if (!classified.why.trim()) problems.push(`${where}: the mechanism "${mechanism}" says no reason`);
      if (classified.until !== undefined) {
        if (classified.stance !== 'not-used') {
          problems.push(
            `${where}: the mechanism "${mechanism}" is ${classified.stance}; only one not used comes in "until" a trigger`,
          );
        } else if (!TRIGGERS[classified.until]) {
          problems.push(
            `${where}: the mechanism "${mechanism}" comes in on "${classified.until}", which is not a trigger the engine can see; one of ${Object.keys(TRIGGERS).join(', ')} (P4)`,
          );
        }
      }
    }

    if (!contract.grammars.includes(profile.grammar)) {
      problems.push(
        `${where}: answers on the grammar "${profile.grammar}", which is not a section of ${file} with verbs: one of ${contract.grammars.join(', ')}`,
      );
    }
    if (profile.checklists !== 'all') {
      for (const kind of profile.checklists.filter(kind => !kinds.includes(kind))) {
        problems.push(`${where}: names the checklist ${kind}, which ${file} does not define`);
      }
    }
  }
  return problems;
}

/**
 * The contexts whose profile differs between two readings of a binding, one line each (`Notes: full →
 * lite`); a context neither names is held to the binding's default (`default_profile`) or the
 * contract's in both, and a context dropped from the binding is not a change of profile.
 */
export function contextProfileChanges(before: unknown, after: unknown, defaultId: string): string[] {
  const profilesOf = (binding: unknown): Record<string, string> =>
    isObject(binding) && isObject(binding.profiles)
      ? Object.fromEntries(Object.entries(binding.profiles).map(([context, profile]) => [context, String(profile)]))
      : {};
  const contextsOf = (binding: unknown): string[] =>
    isObject(binding) && Array.isArray(binding.contexts) ? binding.contexts.map(String) : [];
  // A context it does not name is held to the binding's own default when it says one (`default_profile`).
  const defaultOf = (binding: unknown): string =>
    isObject(binding) && typeof binding.default_profile === 'string' ? binding.default_profile : defaultId;
  const was = profilesOf(before);
  const is = profilesOf(after);
  const from = (context: string) => was[context] ?? defaultOf(before);
  const to = (context: string) => is[context] ?? defaultOf(after);
  return contextsOf(after)
    .filter(context => from(context) !== to(context))
    .map(context => `${context}: ${from(context)} → ${to(context)}`);
}

/**
 * The bindings a change holds to another profile for one of their contexts, with what moved: read at
 * the base (its merge base with HEAD, or HEAD for `working`) and on disk. A change of profile is a
 * decision (H6): the architecture mode asks for its ADR, the feature mode refuses it with the rest of
 * `conventions`. Only a changed binding is read, so a change that touches none costs nothing.
 */
export function contextProfileChangesSince(
  base: string,
  changed: string[],
  contract: ArchitectureContract,
  root: string,
): { file: string; changes: string[] }[] {
  const bindings = new Set(contract.languages.map(language => `conventions/${language}.yaml`));
  const defaultId = defaultProfile(contract)?.id ?? 'full';
  const git = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  const at = (() => {
    if (base === 'working') return 'HEAD';
    try {
      return git(['merge-base', base, 'HEAD']).trim();
    } catch {
      return base;
    }
  })();
  const read = (text: string | undefined): unknown => (text === undefined ? undefined : load(text));
  return changed
    .filter(file => bindings.has(file))
    .map(file => {
      let before: string | undefined;
      try {
        before = git(['show', `${at}:${file}`]);
      } catch {
        before = undefined;
      }
      const after = existsSync(join(root, file)) ? readFileSync(join(root, file), 'utf8') : undefined;
      return { file, changes: contextProfileChanges(read(before), read(after), defaultId) };
    })
    .filter(entry => entry.changes.length > 0);
}

/**
 * The profiles in words, for a person at a terminal: the floor, each profile with its mechanisms, the
 * profiles this language holds, the profile of each context, and — given what fired (`profileTriggers`)
 * — what a trigger brings into a context held to a profile that conditions on it.
 */
export function describeProfiles(
  contract: ArchitectureContract,
  kinds: Record<string, string> = {},
  fired: ReturnType<typeof profileTriggers> = [],
): string {
  if (!contract.profiles.length) return `${contract.sources.architecture} declares no profiles: it is held as written.`;
  const lines = ['Floor (no profile may drop it):'];
  for (const guarantee of contract.floor) {
    const held = guarantee.rules.length ? guarantee.rules.join(', ') : (guarantee.heldBy ?? 'no rule yet');
    lines.push(`  ${guarantee.guarantee} — ${held}${guarantee.gap ? ` (gap: ${guarantee.gap})` : ''}`);
  }
  for (const profile of contract.profiles) {
    const stances = contract.rules.map(rule => stanceOf(profile, rule));
    const count = (stance: Stance['stance']) => stances.filter(each => each.stance === stance).length;
    lines.push(
      '',
      `${profile.name} (${profile.id})${profile.default ? ', the default' : ''}: holds ${count('held')} rules, ${count('conditional')} on a trigger, waives ${count('waived')}; grammar ${profile.grammar}; checklists ${profile.checklists === 'all' ? 'all' : profile.checklists.join(', ')}`,
      `  ${profile.why}`,
    );
    for (const [id, reason] of Object.entries(profile.waives)) lines.push(`  waives ${id}: ${reason}`);
    for (const [id, trigger] of Object.entries(profile.conditional)) lines.push(`  holds ${id} where ${trigger}`);
    if (profile.gaps.length) lines.push(`  gaps (held by review alone): ${profile.gaps.join(', ')}`);
    for (const [id, mechanism] of Object.entries(profile.mechanisms)) {
      const stance = mechanism.stance === 'not-used' ? 'does not use' : mechanism.stance;
      lines.push(
        `  ${stance} ${id}${mechanism.until ? ` (until ${mechanism.until}, by an ADR)` : ''}: ${mechanism.why}`,
      );
    }
  }
  const held = profilesHeldBy(contract);
  const notHeld = contract.profiles.filter(profile => !held.includes(profile.id)).map(profile => profile.name);
  lines.push(
    '',
    `${contract.language.name} holds ${held.join(', ')}${notHeld.length ? `; ${notHeld.map(name => `${name}: not held`).join(', ')} (a gap of this language)` : ''}.`,
  );
  lines.push('', `Contexts (${contract.language.name}):`);
  for (const context of contract.contexts) {
    const named = contract.contextProfiles[context] !== undefined;
    const by = named ? '' : contract.bindingProfile !== undefined ? ' (the binding’s default)' : ' (the default)';
    lines.push(
      `  ${context} — ${profileOf(contract, context)}${by}${kinds[context] ? `, a ${kinds[context]} subdomain` : ''}`,
    );
    for (const each of fired.filter(entry => entry.context === context)) {
      const brings = [
        ...each.rules.map(rule => `holds ${rule}`),
        ...each.mechanisms.map(mechanism => `${mechanism} comes in by an ADR`),
      ];
      lines.push(`    ${each.trigger} fires: ${brings.join('; ')}`);
    }
  }
  lines.push('', 'Triggers a profile may hold a rule on:');
  for (const trigger of Object.values(TRIGGERS)) lines.push(`  ${trigger.id} — ${trigger.means}`);
  return lines.join('\n');
}
