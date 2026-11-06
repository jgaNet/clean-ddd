import { ContextLink } from './domain';
import { crossedRelationships, missingRelationshipTests, relationshipName } from './relationships';
import { ArchitectureContract } from './types';

const contract = { contextsTree: { alias: '@Contexts', path: 'src/Contexts' } } as unknown as ArchitectureContract;
const event = (upstream: string, downstream: string, name: string): ContextLink => ({
  mechanism: 'integration-event',
  upstream,
  downstream,
  contracts: [name],
  evidence: [],
});
const port = (upstream: string, downstream: string, name: string): ContextLink => ({
  mechanism: 'owned-port',
  upstream,
  downstream,
  contracts: [name],
  evidence: [],
});
const links = [
  event('Messaging', 'Moderation', 'MessageReported'),
  event('Reviews', 'Moderation', 'ReviewReported'),
  port('Accounts', 'Moderation', 'Administrators'),
];

describe('the relationships a change crosses', () => {
  it('counts a downstream file that consumes the contract, and an upstream file that builds the event', () => {
    const crossed = crossedRelationships(
      links,
      [
        {
          path: 'src/Contexts/Moderation/Application/Events/MessageReportedIntegrationEventHandler.ts',
          text: 'class X extends EventHandler<MessageReportedIntegrationEvent> {}',
        },
        {
          path: 'src/Contexts/Reviews/Application/Events/ReviewReportedHandler.ts',
          text: 'publishIntegrationEvent(ReviewReportedIntegrationEvent.set({ reportId }), context);',
        },
      ],
      contract,
    );
    expect(crossed.map(relationshipName)).toEqual(['Messaging → Moderation', 'Reviews → Moderation']);
  });

  it('counts a port the downstream side adapts, and nothing a context says of a contract it does not take part in', () => {
    const crossed = crossedRelationships(
      links,
      [
        {
          path: 'src/Contexts/Moderation/Application/Ports/IAdministrators.ts',
          text: 'export interface IAdministrators {}',
        },
        { path: 'src/Contexts/Booking/Domain/Note.ts', text: '// MessageReportedIntegrationEvent is not ours' },
      ],
      contract,
    );
    expect(crossed.map(relationshipName)).toEqual(['Accounts → Moderation']);
  });

  it('asks each one crossed for a test changed with it, named for the pair', () => {
    const crossed = [links[0], links[1]];
    const missing = missingRelationshipTests(
      crossed,
      [
        {
          path: 'src/Bootstrap/Fastify/CrossContext/reports.e2e.spec.ts',
          text: "describe('Messaging → Moderation', () => {});",
        },
        { path: 'src/Contexts/Reviews/x.spec.ts', text: "describe('Reviews → Moderation', () => {});" },
      ],
      '.e2e.spec.ts',
    );
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatch(/^Reviews → Moderation \(ReviewReported\) is crossed by this change/);
  });
});
