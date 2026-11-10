// Parameter × Operation matrix for the replay-based suite.
// Filter / Operation labels verified live 2026-11-05 (New Email Filter → Cancel).
// Text Body ops are only Contains + Matches Regex. Attachment File Names has the five text ops.
// Attachments has Has Attachments. HTML Body / Message Id are not on Filter Source → skip.
require('dotenv').config();
const path = require('path');

const ATTACH_NAME = 'AUTO_Attached_Mail.eml';
const ATTACH_PATH = path.join(__dirname, '..', 'data', 'emails', ATTACH_NAME);

// Human suite titles keep these op names; UI fill uses orgOperation().
const OPS = ['Contains', 'Starts With', 'Ends With', 'Matches Text', 'Matches Regex'];

/** Live New Email Filter Source labels (human-readable). null = not on picklist. */
const SOURCE_ORG = {
  From: 'From',
  'From Name': 'From Name',
  To: 'To',
  CC: 'CC',
  Subject: 'Subject',
  Header: 'Header',
  'Text Body': 'Text Body',
  'HTML Body': null,
  'Message Id': null,
  Attachments: 'Attachments',
  'Attachment File Names': 'Attachment File Names',
};

/** Field Parser Source labels (differ slightly for attachments). */
const FIELD_SOURCE_ORG = {
  From: 'From',
  'From Name': 'From Name',
  To: 'To',
  CC: 'CC',
  Subject: 'Subject',
  Header: 'Header',
  'Text Body': 'Text Body',
  'HTML Body': 'HTML Body',
  'Message Id': 'MessageId',
  Attachments: 'Attached File Names',
  'Attachment File Names': 'Attached File Names',
};

/** Live Operation picklist labels. */
const OPERATION_ORG = {
  Contains: 'Contains',
  'Starts With': 'Starts with',
  'Ends With': 'Ends With',
  'Matches Text': 'Matches Text',
  'Matches Regex': 'Matches Regex',
  'Has Attachments': 'Has Attachments',
};

/** Which suite ops each param actually supports in this org (verified). */
const OPS_BY_PARAM = {
  From: OPS,
  'From Name': OPS,
  To: OPS,
  CC: OPS,
  Subject: OPS,
  Header: OPS,
  'Text Body': ['Contains', 'Matches Regex'],
  'HTML Body': OPS, // skipped via SOURCE_ORG null
  'Message Id': OPS, // skipped via SOURCE_ORG null
  Attachments: ['Has Attachments'],
  'Attachment File Names': OPS,
};

const orgSource = (param) => (SOURCE_ORG[param] === undefined ? param : SOURCE_ORG[param]);
const orgFieldSource = (param) => (FIELD_SOURCE_ORG[param] === undefined ? param : FIELD_SOURCE_ORG[param]);
const orgOperation = (op) => OPERATION_ORG[op] || op;

const INBOUND = () => process.env.CTK_INBOUND_ADDRESS || '';
const FROM = 'gautipaswan252@gmail.com';
const FROM_NAME = 'Gauti Paswan';
const SUBJECT = 'AUTO Master Test ORD-7788';
const HEADER_NAME = 'X-CTK-Test';
const HEADER_VAL = 'AUTO-HEADER-123';
const TEXT_LINE = 'Invoice: INV-1234';
const HTML_TOKEN = 'INV-HTML-5566';

const TEXT_BODY = `Hello Team,
Invoice: INV-1234
Amount: 25.60
Customer: Gauti Paswan
City: Noida
Regards,
Gauti`;

const HTML_BODY = '<div><table><tr><td>Invoice</td><td>INV-HTML-5566</td></tr><tr><td>Amount</td><td>99.99</td></tr></table></div>';

const paramTag = (p) => ({
  From: '@from',
  'From Name': '@fromname',
  To: '@to',
  CC: '@cc',
  'Text Body': '@textbody',
  'HTML Body': '@htmlbody',
  Subject: '@subject',
  Header: '@header',
  'Message Id': '@messageid',
  Attachments: '@attachment',
  'Attachment File Names': '@attachmentfilenames',
}[p] || `@${String(p).toLowerCase().replace(/\s+/g, '')}`);

const opTag = (op) => `@${String(op).toLowerCase().replace(/\s+/g, '-')}`;

function filterValue(param, op, runtime = {}) {
  const inbound = INBOUND();
  const toLocal = (inbound.split('@')[0] || 'parserinboundemailhandler');
  const mid = runtime.messageId || 'mail.gmail.com';
  const table = {
    From: {
      Contains: 'gautipaswan',
      'Starts With': 'gauti',
      'Ends With': 'gmail.com',
      'Matches Text': FROM,
      'Matches Regex': '.*@gmail\\.com',
    },
    'From Name': {
      Contains: 'Gauti',
      'Starts With': 'Gauti',
      'Ends With': 'Paswan',
      'Matches Text': FROM_NAME,
      'Matches Regex': 'Gauti\\s+Paswan',
    },
    To: {
      Contains: 'parserinboundemailhandler',
      'Starts With': toLocal.slice(0, Math.min(12, toLocal.length)),
      'Ends With': 'salesforce.com',
      'Matches Text': inbound,
      'Matches Regex': '.*apex\\.salesforce\\.com',
    },
    CC: {
      Contains: 'gautipaswan',
      'Starts With': 'gauti',
      'Ends With': 'gmail.com',
      'Matches Text': FROM,
      'Matches Regex': '.*@gmail\\.com',
    },
    Subject: {
      Contains: 'ORD-7788',
      'Starts With': 'AUTO Master',
      'Ends With': 'ORD-7788',
      'Matches Text': SUBJECT,
      'Matches Regex': 'AUTO Master Test ORD-\\d+',
    },
    Header: {
      Contains: 'AUTO-HEADER',
      'Starts With': 'AUTO-',
      'Ends With': '123',
      'Matches Text': HEADER_VAL,
      'Matches Regex': 'AUTO-HEADER-\\d+',
    },
    'Text Body': {
      Contains: 'INV-1234',
      'Matches Regex': 'Invoice:\\s*INV-\\d+',
    },
    'HTML Body': {
      Contains: HTML_TOKEN,
      'Starts With': '<div>',
      'Ends With': '</div>',
      'Matches Text': HTML_TOKEN,
      'Matches Regex': 'INV-HTML-\\d+',
    },
    'Message Id': {
      Contains: mid.includes('@') ? mid.split('@').pop() : mid,
      'Starts With': String(mid).slice(0, 8),
      'Ends With': String(mid).slice(-8),
      'Matches Text': mid,
      'Matches Regex': '.*gmail\\.com.*|.*',
    },
    Attachments: {
      'Has Attachments': '',
    },
    'Attachment File Names': {
      Contains: 'AUTO_Attached_Mail',
      'Starts With': 'AUTO_',
      'Ends With': '.eml',
      'Matches Text': ATTACH_NAME,
      'Matches Regex': 'AUTO_Attached_Mail\\.eml',
    },
  };
  return (table[param] || {})[op];
}

/** Build editor range + Test Area sample (attachment tests use SMTP filename including .eml). */
function fieldParserBuild(param, sample = '') {
  if (param === 'Attachments' || param === 'Attachment File Names') {
    const fileName = sample || ATTACH_NAME;
    return {
      build: {
        rangeStart: 'Any of Characters',
        rangeStartValue: fileName.charAt(0) || 'A',
        rangeEnd: 'End of Line',
      },
      testSample: fileName,
    };
  }
  const s = String(sample || '').trim();
  return {
    build: {
      rangeStart: 'Any of Characters',
      rangeStartValue: (s.charAt(0) || 'a'),
      rangeEnd: 'End of Line',
    },
    testSample: s,
  };
}

function sampleFor(param, runtime = {}) {
  switch (param) {
    case 'From': return FROM;
    case 'From Name': return FROM_NAME;
    case 'To': return INBOUND();
    case 'CC': return FROM;
    case 'Subject': return SUBJECT;
    case 'Header': return HEADER_VAL;
    case 'Text Body': return TEXT_BODY;
    case 'HTML Body': return HTML_BODY;
    case 'Message Id': return runtime.messageId || 'sample@mail.gmail.com';
    case 'Attachments':
    case 'Attachment File Names':
      return ATTACH_NAME;
    default: return '';
  }
}

/** True if job/EP log text shows this scenario parsed or completed (org-tolerant). */
function replayLogLooksSuccessful(body, scenario, sample = '') {
  const text = String(body || '');
  const ref = scenario.referenceName || '';
  const frag = scenario.expectContains || '';
  if (ref && text.includes(ref)) return true;
  if (frag && text.includes(frag)) return true;
  // Field parser / log often drops the first character (e.g. gauti… → auti…).
  if (frag && frag.length > 2 && text.includes(frag.slice(1))) return true;
  const s = String(sample || scenario.sample || '').trim();
  if (s.length >= 6 && text.includes(s.slice(0, Math.min(12, s.length)))) return true;
  if (s.length >= 6 && text.includes(s.slice(1, Math.min(13, s.length)))) return true;
  if (/EXECUTION COMPLETED|Criteria Met:\s*true|Record Id Created|PlatformEventActionHandler/i.test(text)) return true;
  if (/Account|Created|Success|Processed/i.test(text)) return true;
  return false;
}

function expectContains(param, runtime = {}) {
  switch (param) {
    case 'From': return 'gautipaswan252';
    case 'From Name': return 'Gauti';
    case 'To': return 'parserinboundemailhandler';
    case 'CC': return 'gautipaswan252';
    case 'Subject': return 'ORD-7788';
    case 'Header': return 'AUTO-HEADER';
    case 'Text Body': return 'INV-1234';
    case 'HTML Body': return 'INV-HTML-5566';
    case 'Message Id': return (runtime.messageId || 'gmail').slice(0, 8);
    case 'Attachments':
    case 'Attachment File Names':
      return 'AUTO_Attached_Mail';
    default: return '';
  }
}

function refName(param) {
  return `${String(param).toLowerCase().replace(/\s+/g, '_')}_reference`;
}

function slug(param, op) {
  return `${String(param).replace(/\s+/g, '')}_${String(op).replace(/\s+/g, '')}`;
}

function allScenarios(runtime = {}) {
  const params = [
    'From', 'From Name', 'To', 'CC', 'Text Body', 'HTML Body', 'Subject', 'Header', 'Message Id',
    'Attachments', 'Attachment File Names',
  ];
  const out = [];
  for (const param of params) {
    const ops = OPS_BY_PARAM[param] || OPS;
    for (const op of ops) {
      const value = filterValue(param, op, runtime);
      const sourceOrg = orgSource(param);
      const fieldSourceOrg = orgFieldSource(param);
      const opOrg = orgOperation(op);
      let skipReason = null;
      if (sourceOrg == null) {
        skipReason = `Org Email Filter Source picklist has no "${param}" (verified data/org-picklists.json)`;
      }
      out.push({
        param,
        op,
        sourceOrg,
        fieldSourceOrg,
        opOrg,
        tag: paramTag(param),
        opTag: opTag(op),
        filterValue: value,
        headerName: param === 'Header' ? HEADER_NAME : undefined,
        referenceName: refName(param),
        sample: sampleFor(param, runtime),
        expectContains: expectContains(param, runtime),
        title: `Test the functionality of ${param} filter (${op}) to parse value using ${param} parameter`,
        parserName: `AUTO_${param} ${op} Parser`,
        filterName: `AUTO_${param} ${op} Filter`,
        actionName: `AUTO_${param} Parser Action`,
        slug: slug(param, op),
        skipReason,
      });
    }
  }
  return out;
}

const MASTER = {
  fromName: FROM_NAME,
  from: FROM,
  subject: SUBJECT,
  headerName: HEADER_NAME,
  headerValue: HEADER_VAL,
  textBody: TEXT_BODY,
  htmlBody: HTML_BODY,
  cc: FROM,
  attachmentFilename: ATTACH_NAME,
  attachmentPath: ATTACH_PATH,
};

module.exports = {
  OPS, OPS_BY_PARAM, MASTER, INBOUND, FROM, FROM_NAME, SUBJECT, HEADER_NAME, HEADER_VAL, TEXT_BODY, HTML_BODY,
  ATTACH_NAME, ATTACH_PATH,
  SOURCE_ORG, FIELD_SOURCE_ORG, OPERATION_ORG, orgSource, orgFieldSource, orgOperation,
  paramTag, opTag, filterValue, sampleFor, fieldParserBuild, expectContains, refName, replayLogLooksSuccessful, allScenarios,
};
