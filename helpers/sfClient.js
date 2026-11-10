require('dotenv').config();
const fs = require('fs');
const jsforce = require('jsforce');

const NS = 'ctkemailparser__';
const OBJ = {
  parser: `${NS}Email_Parser__c`,
  filter: `${NS}EmailFilter__c`,
  fieldParser: `${NS}FieldParser__c`,
  action: `${NS}EmailParserAction__c`,
  job: `${NS}EmailParserJob__c`,
};
// Field API names – verified in Object Manager (04-Nov-2026)
const F = {
  parserName: `${NS}Name__c`,
  parserActive: `${NS}Active__c`,
  parserDescription: `${NS}Description__c`,
  filterEval: `${NS}Filter_Evaluation__c`, // AND | OR | CUSTOM
  customFilter: `${NS}Custom_Filter__c`,
  actionCount: `${NS}ActionCount__c`,
  // Email Filter (Name = Email Filter Name)
  filterParser: `${NS}EmailParser__c`, // master-detail
  filterSource: `${NS}Type__c`, // label "Source"
  filterOperation: `${NS}Operation__c`, // dependent on Source
  filterValue: `${NS}Value__c`,
  filterHeaderName: `${NS}HeaderName__c`,
  filterSequence: `${NS}Sequence__c`,
  // Field Parser (Name = Field Parser Key FP-000000)
  fpParser: `${NS}EmailParser__c`,
  fpType: `${NS}Type__c`,
  fpReferenceName: `${NS}ReferenceName__c`,
  fpOutputType: `${NS}OutputType__c`,
  fpSource: `${NS}Source__c`,
  fpHeaderName: `${NS}HeaderName__c`,
  fpValue: `${NS}SearchValue__c`, // label "Value"
  fpSearchOperation: `${NS}SearchOperation__c`,
  fpRangeStart: `${NS}RangeStart__c`,
  fpRangeStartValue: `${NS}RangeStartValue__c`,
  fpRangeEnd: `${NS}RangeEnd__c`,
  fpRangeEndValue: `${NS}RangeEndValue__c`,
  fpStartLine: `${NS}StartPositionLine__c`,
  fpStartChar: `${NS}StartPositionCharacterNo__c`,
  fpEndLine: `${NS}EndPositionLine__c`,
  fpEndChar: `${NS}EndPositionCharacterNo__c`,
  fpMaxSourceLines: `${NS}MaxSourceLines__c`,
  fpMultipleResults: `${NS}MultipleResultsHandler__c`,
  fpMultipleCustomPos: `${NS}MultipleResultsCustomPosition__c`,
  fpSeparator: `${NS}Separator__c`,
  fpSeparatorMulti: `${NS}SeparatorForMultipleValues__c`,
  fpConvertHtml: `${NS}ConvertHTMLResultToText__c`,
  fpTrim: `${NS}TrimParsedValue__c`,
  fpDeepMode: `${NS}DeepMode__c`,
  fpConvertToNumber: `${NS}ConvertToNumber__c`,
  fpCurrencySymbol: `${NS}CurrencySymbol__c`,
  fpDecimalSep: `${NS}DecimalSeparator__c`,
  fpThousandSep: `${NS}ThousandSeparator__c`,
  fpDateTimeFormat: `${NS}DateTimeFormat__c`,
  // Email Parser Action (Name = Email Parser Action Name)
  actParser: `${NS}EmailParser__c`,
  actType: `${NS}Type__c`, // Create Record | Attach To Record
  actSequence: `${NS}Sequence__c`,
  actObjectType: `${NS}ObjectType__c`,
  actMapping: `${NS}Mapping__c`, // JSON {"TargetFieldApi":"fieldParserReferenceName"} e.g. {"Name":"lastName"}
  actAttachAs: `${NS}AttachAs__c`,
  actEmailStatus: `${NS}EmailStatus__c`,
  actSaveAttachments: `${NS}SaveAttachments__c`,
  actFilterCriteria: `${NS}FilterCriteria__c`,
  actAllowedExt: `${NS}AllowedAttachmentExtensions__c`,
  // Email Parser Job (Name = auto number)
  jobStatus: `${NS}Status__c`,
  jobTotal: `${NS}TotalEmailParsers__c`,
  jobProcessed: `${NS}EmailParsersProcessed__c`,
  jobFailures: `${NS}EmailParserWithFailures__c`,
  jobSubject: `${NS}Subject__c`,
  jobFrom: `${NS}From__c`,
  jobTo: `${NS}To__c`,
  jobMessageId: `${NS}MessageId2__c`,
  jobReplay: `${NS}ReplayJob__c`,
  jobParent: `${NS}ParentEmailParserJob__c`,
};
// NOTE: picklist API values assumed equal to labels [VERIFY via describe() once API login works].

let cached;
async function getConnection() {
  if (cached) return cached;
  if (process.env.SF_API_ENABLED === 'false') {
    throw new Error('API disabled (SF_API_ENABLED=false) – avoids repeated failed logins / user lockout');
  }
  if (process.env.SF_CLIENT_ID && process.env.SF_JWT_KEY_PATH) {
    // JWT bearer flow (Connected App with certificate)
    const conn = new jsforce.Connection({ loginUrl: process.env.SF_LOGIN_URL });
    const privateKey = fs.readFileSync(process.env.SF_JWT_KEY_PATH, 'utf8');
    await conn.authorize({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: buildJwt(process.env.SF_CLIENT_ID, process.env.SF_USERNAME, process.env.SF_LOGIN_URL, privateKey),
    });
    cached = conn;
  } else {
    const { sessionId, serverUrl } = await soapLogin();
    cached = new jsforce.Connection({ instanceUrl: new URL(serverUrl).origin, accessToken: sessionId, version: '61.0' });
  }
  return cached;
}

async function soapLogin() {
  const x = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = `<?xml version="1.0"?><env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:partner.soap.sforce.com"><env:Body><urn:login><urn:username>${x(process.env.SF_USERNAME)}</urn:username><urn:password>${x((process.env.SF_PASSWORD || '') + (process.env.SF_SECURITY_TOKEN || ''))}</urn:password></urn:login></env:Body></env:Envelope>`;
  const res = await fetch(`${process.env.SF_LOGIN_URL}/services/Soap/u/61.0`, { method: 'POST', headers: { 'Content-Type': 'text/xml', SOAPAction: 'login' }, body });
  const t = await res.text();
  const fault = /<faultstring>([^<]+)/.exec(t);
  if (fault) throw new Error(`Salesforce login failed: ${fault[1]}`);
  return { sessionId: /<sessionId>([^<]+)/.exec(t)[1], serverUrl: /<serverUrl>([^<]+)/.exec(t)[1] };
}

function buildJwt(clientId, username, aud, privateKey) {
  const crypto = require('crypto');
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const header = b64({ alg: 'RS256' });
  const claims = b64({ iss: clientId, sub: username, aud, exp: Math.floor(Date.now() / 1000) + 180 });
  const sig = crypto.createSign('RSA-SHA256').update(`${header}.${claims}`).sign(privateKey, 'base64url');
  return `${header}.${claims}.${sig}`;
}

async function query(soql) {
  const conn = await getConnection();
  const res = await conn.query(soql);
  return res.records;
}

const apiEnabled = () => process.env.SF_API_ENABLED !== 'false';
module.exports = { apiEnabled, getConnection, query, OBJ, F, NS };
