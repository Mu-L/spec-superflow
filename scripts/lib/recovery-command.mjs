import { parseArgs } from 'node:util';
import { RecoveryError, createRecoverySummary, resolveChangeTarget } from './change-recovery.mjs';

export async function runRecoveryCommand(command, args, { requireTarget = false } = {}) {
  let values = { json: args.includes('--json') };

  try {
    const parsed = parseArgs({
      args,
      allowPositionals: true,
      options: { json: { type: 'boolean', default: false } },
    });
    values = parsed.values;

    if (requireTarget && !parsed.positionals[0]) {
      throw new RecoveryError(
        'TARGET_REQUIRED',
        'switch requires an explicit change target',
        {},
        2,
      );
    }

    const selection = resolveChangeTarget(parsed.positionals[0], process.cwd());
    const summary = createRecoverySummary(selection.path);
    printRecoverySummary(values.json, {
      ok: summary.ok,
      command,
      change: { ...summary.change, ...selection },
      state: summary.state,
      workflow: summary.workflow,
      terminal: summary.terminal,
      checkpoint: summary.checkpoint,
      handoffs: summary.handoffs,
      execution: summary.execution,
      blockers: summary.blockers,
      next_action: summary.next_action,
    });
  } catch (error) {
    printRecoveryError(command, error, values.json);
  }
}

function printRecoverySummary(json, summary) {
  if (json) {
    console.log(JSON.stringify(summary));
    return;
  }

  const checkpoint = summary.checkpoint
    ? `${summary.checkpoint.status} (${summary.checkpoint.record.task_id})`
    : 'none';
  const execution = summary.execution.required
    ? `current ${summary.execution.current ? 'yes' : 'no'}`
    : 'current n/a';
  const handoffs = summary.handoffs;
  const nextAction = summary.next_action.command
    ?? `${summary.next_action.skill}: ${summary.next_action.reason}`;

  console.log([
    `Change: ${summary.change.name}`,
    `State: ${summary.state}`,
    `Checkpoint: ${checkpoint}`,
    `Handoffs: active ${handoffs.active.length}, result-ready ${handoffs.result_ready.length}, resolved ${handoffs.resolved.length}`,
    `Execution: ${execution}`,
    summary.blockers.length === 0
      ? 'Blockers: none'
      : `Blockers: ${summary.blockers.map(blocker => blocker.message).join('; ')}`,
    `Next action: ${nextAction}`,
  ].join('\n'));
}

function printRecoveryError(command, error, json) {
  const recoveryError = error instanceof RecoveryError
    ? error
    : new RecoveryError('INVALID_ARGUMENTS', error instanceof Error ? error.message : String(error), {}, 2);
  const payload = {
    ok: false,
    command,
    error: {
      code: recoveryError.code,
      message: recoveryError.message,
      details: recoveryError.details,
    },
  };

  if (json) console.log(JSON.stringify(payload));
  else console.error(`${recoveryError.code}: ${recoveryError.message}`);
  process.exitCode = recoveryError.exitCode;
}
