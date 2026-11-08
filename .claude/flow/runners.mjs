/**
 * The agent runners a driver can start an agent with (RFC 0001, `AgentRunner`): the provider
 * changes, the flow does not. Each takes the same task and answers the same shape:
 *
 *   run({ prompt, cwd, model?, again?, env, timeoutMs, maxBudgetUsd?, onProcess }) →
 *     { exitCode?, signal?, stoppedBy?, wallClockMs, isError?, numTurns?, durationMs?, costUsd?, modelUsage?, report?, usage? }
 *
 * `again` continues the latest conversation in `cwd` instead of starting one: a slice sent back,
 * or a slice whose driver died. `costUsd` and `modelUsage` are what the runner reports and nothing
 * more; for a continued conversation both runners report the conversation's running total, so a
 * driver keeps the latest figure per conversation rather than adding them up (phase 3 found the
 * phase-2 driver adding them). `onProcess({ stop })` hands the driver what stops the agent, for
 * a cancel; `pgid`, when there is one, is recorded in the slice's lease so that a driver that died
 * can find the agent it left behind. `maxBudgetUsd` is the agent's reservation (supervision.mjs),
 * a cap it may not spend past. `stoppedBy` says why an agent was stopped before it finished:
 * `timeout` when it ran past `timeoutMs`, `cancel` when the driver stopped it.
 *
 * When the agent has stopped, for whatever reason, both runners `reap` what it left running in
 * `cwd`: a background command the agent started runs in a process group of its own, so the
 * group kill misses it, and an end-to-end suite that never exits outlives the agent and holds the
 * memory the next step needs (J5, 8 November: a gate and a hung `jest` left by two timed-out
 * steps, 2 GB each). `reaped` counts them, when there were any.
 *
 * - `claude-cli`: Claude Code headless (`claude -p --output-format json`), in its own process
 *   group, stopped by group.
 * - `claude-sdk`: the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`), resolved from the
 *   project, or from `CLAUDE_AGENT_SDK` (the package's directory); stopped through its abort
 *   controller.
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
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

/**
 * Kills every process whose working directory is `dir` or under it, but this one and its parent,
 * and says how many. Reads `/proc`: where there is none, it kills nothing.
 */
export function reap(dir) {
  const root = resolve(dir);
  let entries;
  try {
    entries = readdirSync('/proc');
  } catch {
    return 0;
  }
  let killed = 0;
  for (const entry of entries) {
    if (!/^\d+$/.test(entry) || [process.pid, process.ppid].includes(Number(entry))) continue;
    let cwd;
    try {
      cwd = readlinkSync(`/proc/${entry}/cwd`);
    } catch {
      continue;
    }
    if (cwd !== root && !cwd.startsWith(`${root}/`)) continue;
    try {
      process.kill(Number(entry), 'SIGKILL');
      killed++;
    } catch {
      // gone, or not ours
    }
  }
  return killed;
}
const reaped = dir => {
  const count = reap(dir);
  return count > 0 ? { reaped: count } : {};
};

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
  run({ prompt, cwd, model, again, env, timeoutMs, maxBudgetUsd, onProcess }) {
    const started = Date.now();
    let stoppedBy;
    const args = [
      '-p',
      prompt,
      '--output-format',
      'json',
      ...(model ? ['--model', model] : []),
      '--allowedTools',
      TOOLS.join(' '),
      ...(again ? ['--continue'] : []),
      ...(maxBudgetUsd !== undefined ? ['--max-budget-usd', String(maxBudgetUsd)] : []),
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
      onProcess?.({
        pgid: child.pid,
        stop: () => {
          stoppedBy ??= 'cancel';
          stop();
        },
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', chunk => (stdout += chunk));
      child.stderr.on('data', chunk => (stderr += chunk));
      const timer = setTimeout(() => {
        stoppedBy ??= 'timeout';
        stop();
      }, timeoutMs);
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        const json = parse(stdout);
        done({
          exitCode: code,
          signal: signal ?? undefined,
          ...(stoppedBy && { stoppedBy }),
          ...reaped(cwd),
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
  async run({ prompt, cwd, model, again, env, timeoutMs, maxBudgetUsd, onProcess, project }) {
    const started = Date.now();
    let stoppedBy;
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
    onProcess?.({
      stop: () => {
        stoppedBy ??= 'cancel';
        stop();
      },
    });
    const timer = setTimeout(() => {
      stoppedBy ??= 'timeout';
      stop();
    }, timeoutMs);
    let last;
    try {
      for await (const message of sdk.query({
        prompt,
        options: {
          cwd,
          ...(model && { model }),
          allowedTools: TOOLS,
          ...(again && { continue: true }),
          ...(maxBudgetUsd !== undefined && { maxBudgetUsd }),
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
        ...(stoppedBy && { stoppedBy }),
        ...reaped(cwd),
        ...(last ? fromResult(last) : { usage: 'absent: the SDK returned no result message' }),
        stderrTail: [String(error)],
      };
    }
    clearTimeout(timer);
    return {
      exitCode: last && !last.is_error ? 0 : 1,
      ...reaped(cwd),
      wallClockMs: Date.now() - started,
      ...(last ? fromResult(last) : { usage: 'absent: the SDK returned no result message' }),
    };
  },
};

export const runners = { [claudeCli.name]: claudeCli, [claudeSdk.name]: claudeSdk };
