#!/usr/bin/env node
/**
 * casp — the Coding-Agent State Protocol.
 *
 * A git-native, local-only state file every AI coding agent can read, plus a
 * validator that blocks the push the moment your project drifts.
 *
 * https://github.com/ThalesGnimavo/casp
 * MIT License.
 */

import { argv, exit } from 'node:process';
import { runInit } from './init.js';
import { runUpgrade } from './upgrade.js';
import { runCheck } from './check.js';
import { runStatus } from './status.js';
import { runSchedule } from './schedule-report.js';
import { runNew } from './new.js';
import { runNext } from './next.js';
import { runShip } from './ship.js';
import { runClose } from './close.js';
import { runInstallHook } from './install-hook.js';
import { runVerify } from './verify.js';
import { runState } from './state.js';
import { runAudit } from './audit.js';
import { runFact } from './fact.js';
import { runExplain, runRules } from './explain.js';
import { runDoctor } from './doctor.js';
import { runLive } from './live.js';
import { runVersion } from './version.js';
import { pkgVersion } from './shared.js';
import {
  topLevelHelp,
  commandHelp,
  runHelp,
  unknownCommandMessage
} from './help.js';

const VERSION = pkgVersion();

async function main(): Promise<void> {
  const args = argv.slice(2);
  const [cmd, ...rest] = args;

  // Version wins over everything, like every CLI.
  if (args.includes('-V') || args.includes('--version')) {
    console.log(VERSION);
    exit(0);
  }
  // No command, or a help flag standing in for one → the top-level overview.
  if (!cmd || cmd === '-h' || cmd === '--help') {
    console.log(topLevelHelp(VERSION));
    exit(0);
  }
  // `casp help [command]` — first-class, exit 0 for known, 1 for bogus.
  if (cmd === 'help') {
    exit(runHelp(rest));
  }
  // `casp <command> --help` / `-h` → that command's focused block.
  if (rest.includes('-h') || rest.includes('--help')) {
    const block = commandHelp(cmd);
    if (block) {
      console.log(block);
      exit(0);
    }
    console.error(unknownCommandMessage(cmd));
    exit(1);
  }

  switch (cmd) {
    case 'init':
      runInit(rest);
      break;
    case 'upgrade':
      runUpgrade(rest);
      break;
    case 'status':
      runStatus(rest);
      break;
    case 'check':
      runCheck(rest);
      break;
    case 'schedule':
      runSchedule(rest);
      break;
    case 'next':
      runNext(rest);
      break;
    case 'ship':
      runShip(rest);
      break;
    case 'close':
      await runClose(rest);
      break;
    case 'new':
      runNew(rest);
      break;
    case 'install-hook':
      runInstallHook(rest);
      break;
    case 'verify':
      runVerify(rest);
      break;
    case 'state':
      runState(rest);
      break;
    case 'audit':
      runAudit(rest);
      break;
    case 'fact':
      await runFact(rest);
      break;
    case 'rules':
      runRules(rest);
      break;
    case 'explain':
      runExplain(rest);
      break;
    case 'doctor':
      runDoctor(rest);
      break;
    case 'live':
      runLive(rest);
      break;
    case 'version':
      runVersion(rest);
      break;
    default:
      console.error(unknownCommandMessage(cmd));
      exit(1);
  }
}

/**
 * The last line of defence, and deliberately the least important one.
 *
 * Every verb's read paths return results instead of throwing (src/shared.ts), so
 * nothing should reach here. What reaches here anyway must still leave the
 * operator with a SENTENCE and a stable exit code — a Node stack trace is not a
 * verdict, and an agent parsing exit codes cannot tell a crash from drift.
 *
 * Exit 1, never 0: a command that did not complete has proven nothing.
 */
main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`casp: ${argv[2] ?? 'command'} could not complete — ${message.split('\n')[0]}`);
  console.error('      this is a casp bug; please report it with the command above');
  exit(1);
});
