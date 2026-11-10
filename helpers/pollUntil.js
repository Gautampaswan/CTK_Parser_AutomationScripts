/**
 * Poll fn until predicate(result) is truthy or timeout.
 * @returns result, or throws on timeout.
 */
async function pollUntil(fn, predicate, { timeoutMs = 180000, intervalMs = 5000, label = 'condition' } = {}) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = await fn();
    if (predicate(last)) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${label}. Last: ${JSON.stringify(last)}`);
}

/** Assert nothing appears within the window (negative checks). */
async function expectNoneWithin(fn, { windowMs = 90000, intervalMs = 10000, label = 'records' } = {}) {
  const start = Date.now();
  while (Date.now() - start < windowMs) {
    const r = await fn();
    if (Array.isArray(r) ? r.length > 0 : r) throw new Error(`Unexpected ${label} found: ${JSON.stringify(r)}`);
    await new Promise((res) => setTimeout(res, intervalMs));
  }
}

module.exports = { pollUntil, expectNoneWithin };
