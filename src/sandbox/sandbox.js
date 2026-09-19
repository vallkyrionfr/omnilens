/**
 * OmniLens Sandboxed Execution Worker
 * Safely runs arbitrary user scripts without violating Chrome Extension CSP.
 */

window.addEventListener('message', async (event) => {
  const { id, code } = event.data || {};
  if (!id || typeof code !== 'string') return;

  const logs = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args) => {
    logs.push({ type: 'log', message: formatArgs(args) });
    originalLog.apply(console, args);
  };
  console.warn = (...args) => {
    logs.push({ type: 'warn', message: formatArgs(args) });
    originalWarn.apply(console, args);
  };
  console.error = (...args) => {
    logs.push({ type: 'error', message: formatArgs(args) });
    originalError.apply(console, args);
  };

  const startTime = performance.now();
  let result = undefined;
  let error = null;

  try {
    // Executed inside sandbox page where eval is permitted
    result = window.eval(code);
    if (result instanceof Promise) {
      result = await result;
    }
  } catch (err) {
    error = {
      name: err.name,
      message: err.message,
      stack: err.stack
    };
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }

  const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

  event.source.postMessage({
    id,
    success: !error,
    result: formatResult(result),
    error,
    logs,
    durationMs
  }, event.origin || '*');
});

function formatArgs(args) {
  return args.map(a => {
    if (typeof a === 'object' && a !== null) {
      try {
        return JSON.stringify(a, null, 2);
      } catch {
        return String(a);
      }
    }
    return String(a);
  }).join(' ');
}

function formatResult(val) {
  if (val === undefined) return 'undefined';
  if (val === null) return 'null';
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  }
  return String(val);
}
