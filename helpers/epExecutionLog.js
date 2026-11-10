/** Parse CTK Email Parser execution logs (job / parser related lists). */

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function norm(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

/** Strip Test Results chrome (leading "0", labels). */
function normalizePreview(s) {
  let t = norm(s);
  t = t.replace(/^[\d.]+\s*/, '');
  const pv = /Processed Value\s*:?\s*(.+)/i.exec(t);
  if (pv) t = norm(pv[1]);
  return t;
}

function resolveEpCode(logText, parserName) {
  const text = String(logText || '');
  if (parserName) {
    const near = new RegExp(`${escapeRe(parserName)}[^\\n]*\\((EP-\\d+)\\)`, 'i').exec(text);
    if (near) return near[1];
    const nameBit = escapeRe(String(parserName).slice(0, 50));
    const line = new RegExp(`${nameBit}[\\s\\S]{0,120}?\\((EP-\\d+)\\)`, 'i').exec(text);
    if (line) return line[1];
  }
  const starts = [...text.matchAll(/Email Parser\s*:\s*(EP-\d+)\s*-\s*PROCESSING STARTS/gi)];
  if (starts.length) return starts[starts.length - 1][1];
  const any = [...text.matchAll(/\b(EP-\d+)\b/g)];
  return any.length ? any[any.length - 1][1] : null;
}

function sliceLastEpBlock(logText, epCode) {
  if (!epCode) return '';
  const text = String(logText || '');
  const needle = `Email Parser : ${epCode} - PROCESSING STARTS`;
  let start = -1;
  let pos = 0;
  while (pos < text.length) {
    const i = text.indexOf(needle, pos);
    if (i < 0) break;
    start = i;
    pos = i + 1;
  }
  if (start < 0) {
    const alt = new RegExp(`Email Parser\\s*:\\s*${escapeRe(epCode)}[^\\n]*PROCESSING STARTS`, 'i').exec(text);
    if (!alt) return '';
    start = alt.index;
  }
  const rest = text.slice(start);
  const done = /Email Messageid\s*:[^\n]*\|\s*EXECUTION COMPLETED/i.exec(rest);
  if (done) return rest.slice(0, done.index + done[0].length);
  const short = /EXECUTION COMPLETED/i.exec(rest);
  return short ? rest.slice(0, short.index + short[0].length) : rest.slice(0, 8000);
}

function parsedValueFromBlock(block, referenceName) {
  const ref = escapeRe(referenceName);
  const re = new RegExp(
    `Field Parser\\s*:[^\\n]*\\(${ref}\\)[^\\n]*?Parsed Value\\s*:\\s*([^\\n]+)`,
    'i',
  );
  const m = re.exec(block);
  return m ? norm(m[1]) : '';
}

function parsedDataValueFromBlock(block, referenceName) {
  const re = /Parsed Data\s*:\s*(\{[^}]+\})/gi;
  let m;
  while ((m = re.exec(block)) !== null) {
    try {
      const obj = JSON.parse(m[1]);
      if (Object.prototype.hasOwnProperty.call(obj, referenceName)) {
        const v = obj[referenceName];
        return v === undefined || v === null ? '' : norm(String(v));
      }
    } catch {
      /* try next Parsed Data line */
    }
  }
  return '';
}

/**
 * Primary pass: Parsed Value line matches Parsed Data JSON for referenceName in this EP's last block.
 * Optional: warn if Test Area preview differs from log Parsed Value.
 */
function validateEpExecutionLog(logText, { parserName, referenceName, testAreaPreview, epCode: epCodeHint } = {}) {
  const epCode = epCodeHint || resolveEpCode(logText, parserName);
  const block = sliceLastEpBlock(logText, epCode);
  const parsedValue = parsedValueFromBlock(block, referenceName);
  const dataValue = parsedDataValueFromBlock(block, referenceName);
  const preview = normalizePreview(testAreaPreview);

  const result = {
    ok: false,
    epCode,
    referenceName,
    parsedValue,
    dataValue,
    preview,
    blockSnippet: block.slice(0, 500),
    message: '',
  };

  if (!epCode) {
    result.message = `could not find EP code for parser "${parserName}" in log`;
    return result;
  }
  if (!block) {
    result.message = `no log block for ${epCode} (PROCESSING STARTS … EXECUTION COMPLETED)`;
    return result;
  }
  if (!parsedValue) {
    result.message = `no "Parsed Value" for (${referenceName}) in ${epCode} block`;
    return result;
  }
  if (!dataValue) {
    result.message = `no "Parsed Data" JSON key "${referenceName}" in ${epCode} block`;
    return result;
  }
  if (parsedValue !== dataValue) {
    result.message = `${epCode}: Parsed Value "${parsedValue}" ≠ Parsed Data "${dataValue}"`;
    return result;
  }
  if (!/EXECUTION COMPLETED/i.test(block)) {
    result.message = `${epCode}: parsed values match but EXECUTION COMPLETED not found in block`;
    return result;
  }

  result.ok = true;
  result.message = `${epCode}: Parsed Value and Parsed Data match ("${parsedValue}")`;
  if (preview && preview !== parsedValue) {
    result.previewMismatch = true;
    result.message += `; Test Area preview was "${preview}" (informational)`;
  }
  return result;
}

module.exports = {
  normalizePreview,
  resolveEpCode,
  sliceLastEpBlock,
  validateEpExecutionLog,
};
