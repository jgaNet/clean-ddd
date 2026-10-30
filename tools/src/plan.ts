import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { load } from 'js-yaml';

import { ArchitectureContract, Checklist, ContractError, Rule, SUPPORTED_SCHEMA_VERSION } from './types';
import { getChecklist, getConcept, getRule, getVerbs } from './query';
import { loadDomainMap } from './domain';

/**
 * A feature plan: what someone intends to change, written before writing it, in the contract's
 * own words. It is not a second source of truth and it generates no code — it is a statement of
 * intent the contract can check (`plan validate`) and expand into the files, rules and canonical
 * examples it implies (`plan explain`).
 *
 * The plan is useful twice: before the work, as a pre-flight check that the shape is legal; and
 * after it, because `new: true` on a part that already exists (or the reverse) is reported.
 *
 * A plan is written for one language — its `language` names the binding whose checklists say
 * where each part goes; when it says nothing, the tooling's own language is meant.
 */

export interface PlannedChange {
  /** A checklist kind: aggregate, value-object, domain-service, command, query, context. */
  kind: string;
  name: string;
  /** The aggregate a value object or a domain service belongs to. */
  aggregate?: string;
  /** For a command or a query: the intent from the contract's verb table. */
  verb?: string;
  /** For a command or a query: the route, as written in the routes file. */
  route?: string;
  /** False when the part exists already and the plan only touches it. */
  new?: boolean;
}

export interface FeaturePlan {
  schemaVersion: number;
  feature: string;
  /** The binding the plan is written against; the tooling's own language when absent. */
  language?: string;
  context: string;
  intent: string;
  changes: PlannedChange[];
  invariants: string[];
  events: string[];
  crossContext?: { context: string; strategy: 'integration-event' | 'owned-port'; why?: string };
  /** True only when the plan means to change the building blocks, the shared kernel or the conventions. */
  architectureChanges?: boolean;
  /**
   * Files this plan's work reads and must not change, wherever they live: what the contract stage
   * froze for the other slices — a read model another context's adapter imports, a stub's
   * signature. A slice that needs more adds a port of its own beside them, or asks for an
   * amendment; it never edits them (phase 4 found one moved and extended in place).
   */
  frozen?: string[];
}

const STRATEGIES = ['integration-event', 'owned-port'];

/**
 * What a plan may not touch unless it says architectureChanges — the same trees the feature
 * mode protects, taken from the contract so the two cannot drift. The integration events are
 * the exception on both: publishing a fact is what a cross-context feature does.
 */
const guarded = (contract: ArchitectureContract, place: string): boolean => {
  const mode = contract.modes.feature ?? {};
  const under = (trees: string[] = []) => trees.some(tree => place === tree || place.startsWith(`${tree}/`));
  return under(mode.protected) && !under(mode.allowed);
};

export function loadFeaturePlan(file: string, root: string): FeaturePlan {
  const path = join(root, file);
  if (!existsSync(path)) throw new ContractError(`${file} not found`, 'malformed');
  const raw = load(readFileSync(path, 'utf8'));
  if (typeof raw !== 'object' || raw === null) throw new ContractError(`${file} is not a YAML mapping`, 'malformed');
  const plan = raw as Partial<FeaturePlan>;
  if (plan.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new ContractError(
      `${file} is schemaVersion ${plan.schemaVersion}; this tooling understands ${SUPPORTED_SCHEMA_VERSION}`,
      plan.schemaVersion === undefined ? 'malformed' : 'unsupported-schema-version',
    );
  }
  for (const field of ['feature', 'context', 'intent'] as const) {
    if (typeof plan[field] !== 'string') throw new ContractError(`${file}: "${field}" is missing`, 'malformed');
  }
  if (!Array.isArray(plan.changes) || !plan.changes.length) {
    throw new ContractError(`${file}: "changes" must list at least one change`, 'malformed');
  }
  return {
    schemaVersion: plan.schemaVersion,
    feature: plan.feature as string,
    language: typeof plan.language === 'string' ? plan.language : undefined,
    context: plan.context as string,
    intent: plan.intent as string,
    changes: plan.changes,
    invariants: plan.invariants ?? [],
    events: plan.events ?? [],
    crossContext: plan.crossContext,
    architectureChanges: plan.architectureChanges ?? false,
    frozen: Array.isArray(plan.frozen) ? plan.frozen.map(String) : [],
  };
}

/** `NoteSharing` as a Rust path wants it: `note_sharing`. */
const snake = (name: string): string => name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

/**
 * The checklist's placeholders, filled with the plan's names: a path or a part becomes concrete.
 * A PascalCase placeholder (`<Aggregate>`) takes the name as written, which is what a TypeScript
 * path wants; a lowercase one (`<aggregate>`) takes it in snake_case, which is what a Rust path
 * wants. A binding uses the ones its language needs.
 */
const fill = (text: string, plan: FeaturePlan, change: PlannedChange): string => {
  const context = change.kind === 'context' ? change.name : plan.context;
  const aggregate = change.aggregate ?? change.name;
  return text
    .replaceAll('<Context>', context)
    .replaceAll('<Aggregate>', aggregate)
    .replaceAll(/<Name>|<Rule>|<UseCase>/g, change.name)
    .replaceAll('<context>', snake(context))
    .replaceAll('<aggregate>', snake(aggregate))
    .replaceAll(/<name>|<rule>|<use_case>/g, snake(change.name));
};

/** Where a planned change goes: the checklist's path, with the plan's names in it. */
export const placeOf = (checklist: Checklist, plan: FeaturePlan, change: PlannedChange): string =>
  fill(checklist.place, plan, change);

/**
 * Whether the planned part is already there. A place is usually the part's own file or directory;
 * a context's integration-events file holds every contract of the context, so there the part is
 * the class named inside it, and a second contract of a context can be planned as new.
 */
const partExists = (root: string, place: string, change: PlannedChange): boolean => {
  const path = join(root, place);
  if (!existsSync(path)) return false;
  if (change.kind !== 'integration-event' || !change.name) return true;
  try {
    return readFileSync(path, 'utf8').includes(change.name);
  } catch {
    return true;
  }
};

/** Everything the plan gets wrong against the contract, one line each; empty means it is legal. */
/**
 * `before`: the plan is about to be worked on, so nothing it calls new may exist yet (`plan
 * validate`). `held`: the plan is kept in the repository and held on every build; it may be
 * partly written, and is refused once every new part exists and it still says new.
 * `in-progress`: its feature's storm is not done yet, so the feature is still being written —
 * by several agents at once, each writing all of its own plan — and nothing it calls new is
 * refused for existing (ADR 29).
 */
export type PlanMoment = 'before' | 'held' | 'in-progress';

export function validatePlan(
  plan: FeaturePlan,
  contract: ArchitectureContract,
  root: string,
  moment: PlanMoment = 'before',
): string[] {
  const problems: string[] = [];
  const where = `${plan.feature}`;
  for (const file of plan.frozen ?? []) {
    if (!existsSync(join(root, file))) problems.push(`${where}: "${file}" is frozen, but there is no such file`);
  }
  const written: string[] = [];
  let unwritten = 0;

  if (plan.language && plan.language !== contract.language.id) {
    problems.push(
      `${where}: the plan is written for ${plan.language}, and is being checked against the ${contract.language.id} binding`,
    );
  }
  if (!contract.contexts.includes(plan.context) && !plan.changes.some(change => change.kind === 'context')) {
    problems.push(
      `${where}: the context ${plan.context} is not declared in ${contract.sources.binding}; a new context is a change of kind "context" and needs architectureChanges: true (ARCH-CONTEXT-DECLARED)`,
    );
  }

  for (const change of plan.changes) {
    const checklist = getChecklist(contract, change.kind);
    if (!checklist) {
      problems.push(
        `${where}: "${change.name}" is of kind ${change.kind}, which is not one of ${contract.checklists.map(entry => entry.kind).join(', ')}`,
      );
      continue;
    }
    if (!change.name) problems.push(`${where}: a change of kind ${change.kind} has no name`);
    if (['value-object', 'domain-service'].includes(change.kind) && !change.aggregate) {
      problems.push(`${where}: "${change.name}" is a ${change.kind}, so it must say which aggregate it belongs to`);
    }
    if (change.kind === 'context' && !plan.architectureChanges) {
      problems.push(
        `${where}: adding the context ${change.name} declares it in the conventions, so the plan must say architectureChanges: true`,
      );
    }

    const place = placeOf(checklist, plan, change);
    const exists = partExists(root, place, change);
    if (change.new === false && !exists)
      problems.push(`${where}: "${change.name}" is not new, but ${place} does not exist`);
    if (change.new !== false && exists)
      written.push(`${where}: "${change.name}" is planned as new, but ${place} already exists`);
    if (change.new !== false && !exists) unwritten += 1;
    if (!plan.architectureChanges && guarded(contract, place)) {
      problems.push(
        `${where}: "${change.name}" would go in ${place}, which is protected; a plan that touches it says architectureChanges: true`,
      );
    }

    if (change.verb) {
      const verbs = getVerbs(contract, change.verb);
      if (!verbs.length) {
        problems.push(
          `${where}: "${change.name}" names the intent ${change.verb}, which the verb table does not have (yarn architecture verbs)`,
        );
      } else if (change.route && !verbs.some(verb => change.route?.startsWith(`${verb.verb} `))) {
        problems.push(
          `${where}: "${change.name}" is ${change.verb}, so its route starts with ${verbs.map(verb => verb.verb).join(' or ')}, not "${change.route}"`,
        );
      }
    } else if (['command', 'query'].includes(change.kind)) {
      problems.push(
        `${where}: "${change.name}" is a ${change.kind} exposed over HTTP, so it names an intent from the verb table`,
      );
    }
  }

  for (const event of plan.events) {
    if (!/^[A-Z][A-Za-z]*Event$/.test(event))
      problems.push(`${where}: the event "${event}" should be PascalCase and end in Event`);
  }
  if (plan.crossContext) {
    const { context, strategy } = plan.crossContext;
    if (!contract.contexts.includes(context))
      problems.push(`${where}: crossContext names ${context}, which is not a context`);
    if (!STRATEGIES.includes(strategy)) {
      problems.push(
        `${where}: crossContext strategy must be ${STRATEGIES.join(' or ')} — those are the only two contracts between contexts (CTX-CONTRACTS)`,
      );
    }
  }
  if (plan.crossContext && STRATEGIES.includes(plan.crossContext.strategy)) {
    const map = loadDomainMap(root);
    const { context: other, strategy } = plan.crossContext;
    const related = map?.relationships.some(
      relationship =>
        relationship.mechanism === strategy &&
        ((relationship.upstream === plan.context && relationship.downstream === other) ||
          (relationship.upstream === other && relationship.downstream === plan.context)),
    );
    if (map && !related) {
      problems.push(
        `${where}: crosses between ${plan.context} and ${other} over an ${strategy}, a relationship ${map.source} does not declare; a new relationship between two contexts is a decision (CTX-MAP-DECLARED), so declare it in the map first`,
      );
    }
  }
  if (
    plan.crossContext?.strategy === 'integration-event' &&
    !plan.changes.some(change => change.kind === 'integration-event')
  ) {
    problems.push(
      `${where}: the plan crosses into ${plan.crossContext.context} through an integration event, so it lists the contract it publishes or reuses as a change of kind "integration-event" (CTX-CONTRACTS)`,
    );
  }
  if (
    plan.crossContext?.strategy === 'owned-port' &&
    !plan.changes.some(change => ['port', 'domain-service'].includes(change.kind))
  ) {
    problems.push(
      `${where}: the plan asks ${plan.crossContext.context} through a port it owns, so it lists the domain service that uses it among its changes (CTX-CONTRACTS)`,
    );
  }
  if (
    !plan.invariants.length &&
    plan.changes.some(change => ['aggregate', 'value-object', 'domain-service'].includes(change.kind))
  ) {
    problems.push(`${where}: a plan that touches the domain says which rules it is adding, in "invariants"`);
  }
  // Before the work, a new part that exists is a plan for something already there. Held, a plan
  // with some of its new parts written is in progress; one with all of them written is done and
  // still says new, which is stale.
  if (moment === 'before') problems.push(...written);
  else if (moment === 'held' && written.length && !unwritten)
    problems.push(...written.map(line => `${line}; the plan is carried: mark it new: false`));
  return problems;
}

export interface ExplainedChange {
  kind: string;
  name: string;
  place: string;
  new: boolean;
  parts: string[];
  canonical: string[];
  rules: string[];
  route?: string;
  verb?: { verb: string; shape: string; when: string };
}

export interface ExplainedPlan {
  feature: string;
  language: string;
  context: string;
  intent: string;
  changes: ExplainedChange[];
  /** The rules this plan must respect, deduced from what it touches. */
  rules: Pick<Rule, 'id' | 'statement' | 'remediation'>[];
  checks: string[];
}

/** The plan expanded: what to write, where, which rules bind it, what to copy. */
export function explainPlan(plan: FeaturePlan, contract: ArchitectureContract): ExplainedPlan {
  const ruleIds = new Set<string>(['ARCH-INWARD', 'DOMAIN-RESULT']);
  const changes: ExplainedChange[] = [];

  for (const change of plan.changes) {
    const checklist = getChecklist(contract, change.kind);
    if (!checklist) continue;
    const concept = getConcept(contract, checklist.concept);
    concept?.rules.forEach(id => ruleIds.add(id));
    const verb = change.verb ? getVerbs(contract, change.verb)[0] : undefined;
    changes.push({
      kind: change.kind,
      name: change.name,
      place: placeOf(checklist, plan, change),
      new: change.new !== false,
      parts: checklist.parts.map(part => fill(part, plan, change)),
      canonical: concept?.canonical ?? [],
      rules: concept?.rules ?? [],
      route: change.route,
      verb: verb && { verb: verb.verb, shape: verb.shape, when: verb.when },
    });
  }

  // A contract published into another context is consumed there by an anti-corruption handler:
  // the plan's context names only one side, so the other side's handler is added here.
  const handlerChecklist = getChecklist(contract, 'event-handler');
  if (plan.crossContext?.strategy === 'integration-event' && handlerChecklist) {
    const consuming = { ...plan, context: plan.crossContext.context };
    const concept = getConcept(contract, handlerChecklist.concept);
    for (const contractChange of plan.changes.filter(change => change.kind === 'integration-event')) {
      const change = { kind: 'event-handler', name: contractChange.name.replace(/IntegrationEvent$/, '') };
      changes.push({
        kind: 'event-handler',
        name: `${change.name}: the anti-corruption handler in ${plan.crossContext.context}`,
        place: placeOf(handlerChecklist, consuming, change),
        new: true,
        parts: handlerChecklist.parts.map(part => fill(part, consuming, change)),
        canonical: concept?.canonical ?? [],
        rules: concept?.rules ?? [],
      });
    }
  }

  if (plan.events.length) {
    ruleIds.add('DOMAIN-RECORDS-EVENTS');
    ruleIds.add('EVENT-AFTER-COMMIT');
  }
  if (plan.crossContext) ruleIds.add('CTX-CONTRACTS');
  if (plan.changes.some(change => change.kind === 'aggregate')) {
    ruleIds.add('DOMAIN-IDENTITY');
    ruleIds.add('DOMAIN-CREATE-VS-RECONSTITUTE');
    ruleIds.add('CONC-OPTIMISTIC');
  }
  if (plan.changes.some(change => change.kind === 'query')) ruleIds.add('QUERY-READ-MODELS');

  return {
    feature: plan.feature,
    language: contract.language.id,
    context: plan.context,
    intent: plan.intent,
    changes,
    rules: [...ruleIds]
      .map(id => getRule(contract, id))
      .filter((rule): rule is Rule => rule !== undefined)
      .map(({ id, statement, remediation }) => ({ id, statement, remediation })),
    checks: contract.checks,
  };
}
