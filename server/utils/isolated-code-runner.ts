/**
 * Process-isolated runner for Flow Builder Code Execution nodes.
 *
 * User code is executed in a disposable child process so the main server process
 * is not shared with untrusted continuations. This is still not an OS/container
 * sandbox; keep callers restricted to trusted/admin execution paths.
 */

import { spawn } from 'node:child_process';

export type IsolatedCodeRunOptions = {
  code: string;
  variables?: Record<string, any>;
  timeoutMs?: number;
};

export type IsolatedCodeRunResult = {
  variables: Record<string, any>;
  result: any;
};

type WorkerSuccessMessage = {
  ok: true;
  variables: Record<string, any>;
  result: any;
};

type WorkerErrorMessage = {
  ok: false;
  error: string;
};

type WorkerMessage = WorkerSuccessMessage | WorkerErrorMessage;

/** Strip non-cloneable values so IPC / structured clone succeeds. */
export function sanitizeVariablesForIsolate(input: Record<string, any> | null | undefined): Record<string, any> {
  const source = input && typeof input === 'object' ? input : {};
  try {
    return JSON.parse(
      JSON.stringify(source, (_key, value) => {
        if (typeof value === 'bigint') return value.toString();
        if (typeof value === 'function' || typeof value === 'symbol') return undefined;
        if (value instanceof Error) {
          return { name: value.name, message: value.message };
        }
        return value;
      })
    );
  } catch {
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(source)) {
      try {
        out[key] = JSON.parse(JSON.stringify(value));
      } catch {
        // Skip keys that cannot be serialized
      }
    }
    return out;
  }
}

export async function runIsolatedUserCode(options: IsolatedCodeRunOptions): Promise<IsolatedCodeRunResult> {
  const code = options.code || '';
  const timeoutMs = Math.min(Math.max(100, options.timeoutMs ?? 5000), 30000);
  const sandboxVariables = sanitizeVariablesForIsolate(options.variables);

  return await new Promise<IsolatedCodeRunResult>((resolve, reject) => {
    const worker = spawn(process.execPath, ['-e', CHILD_PROCESS_EXECUTOR_SOURCE], {
      env: {
        NODE_ENV: process.env.NODE_ENV || 'production',
      },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });

    let settled = false;
    let timeout: NodeJS.Timeout | undefined;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      fn();
    };

    const terminateWorker = async () => {
      if (worker.exitCode !== null || worker.killed) return;

      await new Promise<void>((resolveClose) => {
        worker.once('close', () => resolveClose());
        worker.kill('SIGKILL');
      });
    };

    timeout = setTimeout(() => {
      settle(() => {
        terminateWorker()
          .then(() => reject(new Error(`Code execution timeout after ${timeoutMs}ms`)))
          .catch(() => reject(new Error(`Code execution timeout after ${timeoutMs}ms`)));
      });
    }, timeoutMs);

    worker.once('error', (error) => {
      settle(() => reject(error));
    });

    worker.once('exit', (code, signal) => {
      if (!settled && code !== 0) {
        settle(() => reject(new Error(`Code execution worker exited unexpectedly (${signal || code})`)));
      }
    });

    worker.once('message', (message: WorkerMessage) => {
      settle(() => {
        terminateWorker()
          .then(() => {
            if (!message || message.ok !== true) {
              reject(new Error(message?.error || 'Code execution error'));
              return;
            }

            const finalVars = sanitizeVariablesForIsolate(message.variables);
            resolve({
              variables: finalVars,
              result: Object.prototype.hasOwnProperty.call(finalVars, 'result') ? finalVars.result : message.result ?? null,
            });
          })
          .catch(reject);
      });
    });

    worker.send?.({
      code,
      timeoutMs,
      variables: sandboxVariables,
    });
  });
}

const CHILD_PROCESS_EXECUTOR_SOURCE = String.raw`
const vm = require('node:vm');

const sanitizeVariablesForIsolate = (input) => {
  const source = input && typeof input === 'object' ? input : {};
  try {
    return JSON.parse(
      JSON.stringify(source, (_key, value) => {
        if (typeof value === 'bigint') return value.toString();
        if (typeof value === 'function' || typeof value === 'symbol') return undefined;
        if (value instanceof Error) {
          return { name: value.name, message: value.message };
        }
        return value;
      })
    );
  } catch {
    const out = {};
    for (const [key, value] of Object.entries(source)) {
      try {
        out[key] = JSON.parse(JSON.stringify(value));
      } catch {
        // Skip keys that cannot be serialized.
      }
    }
    return out;
  }
};

const send = (message) => {
  if (process.send) process.send(message);
};

process.once('message', async (request) => {
  try {
    const code = request?.code || '';
    const timeoutMs = Math.min(Math.max(100, request?.timeoutMs ?? 5000), 30000);
    const sandboxVariables = sanitizeVariablesForIsolate(request?.variables);

    const safeFetch = async (input, init = {}) => {
      const controller = new AbortController();
      const perRequestTimeout = Math.min(Math.max(100, Number(init?.timeout) || timeoutMs), 30000);
      const timeout = setTimeout(() => controller.abort(), perRequestTimeout);
      try {
        const { timeout: _omitTimeout, ...rest } = init || {};
        return await fetch(input, { ...rest, signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
    };

    const sandbox = {
      variables: sandboxVariables,
      console: {
        log() {},
        error() {},
        warn() {},
        info() {},
        debug() {},
      },
      fetch: (input, init) => safeFetch(input, init),
    };

    const context = vm.createContext(sandbox);
    const wrappedCode =
      '(async () => {\n' +
      '  try {\n' +
      code +
      '\n    return typeof variables !== "undefined" ? variables : undefined;\n' +
      '  } catch (error) {\n' +
      '    throw new Error("Code execution error: " + (error && error.message ? error.message : String(error)));\n' +
      '  }\n' +
      '})()';

    const script = new vm.Script(wrappedCode);
    const result = await script.runInContext(context, { timeout: timeoutMs });
    const finalVars =
      result && typeof result === 'object' ? result : sandboxVariables;
    const sanitizedFinalVars = sanitizeVariablesForIsolate(finalVars);

    send({
      ok: true,
      variables: sanitizedFinalVars,
      result: Object.prototype.hasOwnProperty.call(sanitizedFinalVars, 'result') ? sanitizedFinalVars.result : null,
    });
  } catch (error) {
    send({
      ok: false,
      error: error?.message || 'Code execution error',
    });
  }
});
`;
