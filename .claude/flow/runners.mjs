/**
 * The agent runners a driver can start an agent with (RFC 0001, `AgentRunner`): the provider
 * changes, the flow does not. Each takes the same task and answers the same shape:
 *
 *   run({ prompt, cwd, model?, again?, env, timeoutMs, onProcess }) →
 *     { exitCode?, signal?, wallClockMs, isError?, numTurns?, durationMs?, costUsd?, modelUsage?, report?, usage? }
 *
 * `again` continues the latest conversation in `cwd` instead of starting one: a slice sent back,
 * or a slice whose driver died. `costUsd` and `modelUsage` are what the runner reports and nothing
 * more; for a continued conversation both runners report the conversation's running total, so a
 * driver keeps the latest figure per conversation rather than adding them up (phase 3 found the
 * phase-2 driver adding them). `onProcess({ stop })` hands the driver what stops the agent, for
 * a cancel; `pgid`, when there is one, is recorded in the slice's lease so that a driver that died
 * can find the agent it left behind.
 *
 * - `claude-cli`: Claude Code headless (`claude -p --output-format json`), in its own process
 *   group, stopped by group.
 * - `claude-sdk`: the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`), resolved from the
 *   project, or from `CLAUDE_AGENT_SDK` (the package's directory); stopped through its abort
 *   controller.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const TOOLS = ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep'];

const parse = text => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};
const tail = (text, count = 20) =>
  String(text ?? '')
    .split('\n')
    .filter(Boolean)
    .slice(-count);

/** The fields every runner reports, from a Claude result message (the CLI's JSON or the SDK's last message). */
const fromResult = json => ({
  isError: json.is_error,
  numTurns: json.num_turns,
  durationMs: json.duration_ms,
  costUsd: json.total_cost_usd,
  modelUsage: json.modelUsage,
  report: json.result,
});

const claudeCli = {
  name: 'claude-cli',
  run({ prompt, cwd, model, again, env, timeoutMs, onProcess }) {
    const started = Date.now();
    const args = [
      '-p',
      prompt,
      '--output-format',
      'json',
      ...(model ? ['--model', model] : []),
      '--allowedTools',
      TOOLS.join(' '),
      ...(again ? ['--continue'] : []),
    ];
    return new Promise(done => {
      const child = spawn('claude', args, { cwd, env, detached: true });
      const stop = () => {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          // already gone
        }
      };
      onProcess?.({ pgid: child.pid, stop });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', chunk => (stdout += chunk));
      child.stderr.on('data', chunk => (stderr += chunk));
      const timer = setTimeout(stop, timeoutMs);
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        const json = parse(stdout);
        done({
          exitCode: code,
          signal: signal ?? undefined,
          wallClockMs: Date.now() - started,
          ...(json
            ? fromResult(json)
            : { usage: 'absent: the runner printed no JSON result', stderrTail: tail(stderr) }),
        });
      });
    });
  },
};

/** The SDK, from `CLAUDE_AGENT_SDK` or as the project resolves it; absent, the runner says so. */
async function loadSdk(project) {
  const explicit = process.env.CLAUDE_AGENT_SDK;
  const entry = explicit
    ? join(explicit, existsSync(join(explicit, 'sdk.mjs')) ? 'sdk.mjs' : '')
    : createRequire(join(project, 'package.json')).resolve('@anthropic-ai/claude-agent-sdk');
  return import(pathToFileURL(entry).href);
}

const claudeSdk = {
  name: 'claude-sdk',
  async run({ prompt, cwd, model, again, env, timeoutMs, onProcess, project }) {
    const started = Date.now();
    let sdk;
    try {
      sdk = await loadSdk(project ?? cwd);
    } catch (error) {
      return {
        wallClockMs: Date.now() - started,
        usage:
          'absent: the Claude Agent SDK could not be loaded (install @anthropic-ai/claude-agent-sdk, or set CLAUDE_AGENT_SDK)',
        stderrTail: [String(error)],
      };
    }
    const abortController = new AbortController();
    const stop = () => abortController.abort();
    onProcess?.({ stop });
    const timer = setTimeout(stop, timeoutMs);
    let last;
    try {
      for await (const message of sdk.query({
        prompt,
        options: {
          cwd,
          ...(model && { model }),
          allowedTools: TOOLS,
          ...(again && { continue: true }),
          abortController,
          env,
          ...(process.env.CLAUDE_CODE_EXECUTABLE && { pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_EXECUTABLE }),
        },
      })) {
        if (message.type === 'result') last = message;
      }
    } catch (error) {
      clearTimeout(timer);
      return {
        wallClockMs: Date.now() - started,
        signal: abortController.signal.aborted ? 'aborted' : undefined,
        ...(last ? fromResult(last) : { usage: 'absent: the SDK returned no result message' }),
        stderrTail: [String(error)],
      };
    }
    clearTimeout(timer);
    return {
      exitCode: last && !last.is_error ? 0 : 1,
      wallClockMs: Date.now() - started,
      ...(last ? fromResult(last) : { usage: 'absent: the SDK returned no result message' }),
    };
  },
};

export const runners = { [claudeCli.name]: claudeCli, [claudeSdk.name]: claudeSdk };
