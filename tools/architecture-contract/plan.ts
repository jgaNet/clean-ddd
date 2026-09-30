import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { load } from 'js-yaml';

import { ArchitectureContract, Checklist, ContractError, Rule, SUPPORTED_SCHEMA_VERSION } from './types';
import { getChecklist, getConcept, getRule, getVerbs } from './query';

/**
 * A feature plan: what someone intends to change, written before writing it, in the contract's
 * own words. It is not a second source of truth and it generates no code — it is a statement of
 * intent the contract can check (`plan validate`) and expand into the files, rules and canonical
 * examples it implies (`plan explain`).
 *
 * The plan is useful twice: before the work, as a pre-flight check that the shape is legal; and
 * after it, because `new: true` on a part that already exists (or the reverse) is reported.
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
  context: string;
  intent: string;
  changes: PlannedChange[];
  invariants: string[];
  events: string[];
  crossContext?: { context: string; strategy: 'integration-event' | 'owned-port'; why?: string };
  /** True only when the plan means to change the building blocks, the shared kernel or the conventions. */
  architectureChanges?: boolean;
}

const PROTECTED = ['src/Architecture', 'src/SharedKernel', 'conventions', 'docs/adr'];
/**
 * Except this: the integration events are where a context publishes its contracts, and adding
 * one is what a cross-context feature does. Changing the shared kernel's model (a Role, the
 * Email, the guard) is an architecture change; publishing a new fact is not.
 */
const PUBLISHABLE = ['src/SharedKernel/Application/IntegrationEvents'];
const STRATEGIES = ['integration-event', 'owned-port'];

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
    context: plan.context as string,
    intent: plan.intent as string,
    changes: plan.changes,
    invariants: plan.invariants ?? [],
    events: plan.events ?? [],
    crossContext: plan.crossContext,
    architectureChanges: plan.architectureChanges ?? false,
  };
}

/** The checklist's placeholders, filled with the plan's names: a path or a part becomes concrete. */
const fill = (text: string, plan: FeaturePlan, change: PlannedChange): string =>
  text
    .replaceAll('<Context>', change.kind === 'context' ? change.name : plan.context)
    .replaceAll('<Aggregate>', change.aggregate ?? change.name)
    .replaceAll(/<Name>|<Rule>|<UseCase>/g, change.name);

/** Where a planned change goes: the checklist's path, with the plan's names in it. */
export const placeOf = (checklist: Checklist, plan: FeaturePlan, change: PlannedChange): string =>
  fill(checklist.place, plan, change);

/** Everything the plan gets wrong against the contract, one line each; empty means it is legal. */
export function validatePlan(plan: FeaturePlan, contract: ArchitectureContract, root: string): string[] {
  const problems: string[] = [];
  const where = `${plan.feature}`;

  if (!contract.contexts.includes(plan.context) && !plan.changes.some(change => change.kind === 'context')) {
    problems.push(
      `${where}: the context ${plan.context} is not declared in ${contract.sources.architecture}; a new context is a change of kind "context" and needs architectureChanges: true (ARCH-CONTEXT-DECLARED)`,
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
    const exists = existsSync(join(root, place));
    if (change.new === false && !exists)
      problems.push(`${where}: "${change.name}" is not new, but ${place} does not exist`);
    if (change.new !== false && exists)
      problems.push(`${where}: "${change.name}" is planned as new, but ${place} already exists`);
    const guarded = PROTECTED.some(tree => place.startsWith(tree)) && !PUBLISHABLE.some(tree => place.startsWith(tree));
    if (!plan.architectureChanges && guarded) {
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
    context: plan.context,
    intent: plan.intent,
    changes,
    rules: [...ruleIds]
      .map(id => getRule(contract, id))
      .filter((rule): rule is Rule => rule !== undefined)
      .map(({ id, statement, remediation }) => ({ id, statement, remediation })),
    checks: [
      'yarn check:conventions',
      'yarn format:check',
      'yarn lint',
      'yarn typecheck',
      'yarn test:units',
      'yarn test:e2e',
    ],
  };
}
