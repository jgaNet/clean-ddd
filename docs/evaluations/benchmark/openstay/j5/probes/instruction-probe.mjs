// J5: does a reader take the gate's message the way it is meant? Asked of three small-model readers, for the old
// message and the new one, on the case that showed the ambiguity (request 64 in clean-1).
import { spawn } from 'node:child_process';

const OLD =
  'Messaging → Moderation (MessageReported) is crossed by this change and no test ending in .e2e.spec.ts changed with it is named "Messaging → Moderation": add one that makes the thing in Messaging through the API and finds it in Moderation through the API, by the id Messaging answered.';
const NEW =
  'Messaging → Moderation (MessageReported) is crossed by this change and no test ending in .e2e.spec.ts changed with it is named "Messaging → Moderation". Add one that makes the thing in Messaging through the API and keeps the id that very request answered (its `{ id }`, or its operation\'s result), then reads Moderation through the API and finds the thing by that same id. When the thing is made about another one, the id is the made thing\'s, not the other\'s: a report of a message is found by the report\'s id, which the event must carry, not by the message\'s.';
const CASE = `You are working in an application. Facts:
- POST /v1/conversations/{id}/messages sends a message; GET /v1/conversations/{id} lists messages, each with its id.
- POST /v1/messages/{messageId}/report { reason } reports a message and answers 201 { id }.
- Messaging publishes MessageReportedIntegrationEvent with payload { conversationId, messageId, senderId, reporterId, reason, reportedAt }.
- Moderation consumes it and lists open reports at GET /v1/admin/reports, each { id, kind, subjectId, reporterId, reason }.
Your change touched Moderation's handler of MessageReported, and the gate answered:`;
const QUESTION =
  'Answer only with JSON: {"lookup": "which id your test uses to find the thing in GET /v1/admin/reports, and which field it compares it to", "payload": "what, if anything, you must add to the event payload"}.';

const ask = prompt =>
  new Promise(done => {
    const child = spawn('claude', ['-p', prompt, '--output-format', 'json', '--model', 'claude-haiku-5-5', '--tools', ''], {
      cwd: '/tmp/claude-0/openstay/j5/reading/empty',
    });
    let out = '';
    child.stdout.on('data', chunk => (out += chunk));
    child.on('close', () => {
      try {
        done(JSON.parse(out).result);
      } catch {
        done('');
      }
    });
  });

for (const [name, message] of [
  ['old', OLD],
  ['new', NEW],
]) {
  const answers = await Promise.all([0, 1, 2].map(() => ask(`${CASE}\n\n${message}\n\n${QUESTION}`)));
  console.log(`== ${name}`);
  for (const answer of answers) console.log(String(answer).replace(/\s+/g, ' ').slice(0, 400));
}
