/**
 * Inbound leads: turns this spreadsheet into an endpoint that an ad form can
 * post into, so a new contact appears as a row without anyone retyping it.
 *
 * Works with anything that can send an HTTP POST: Google Ads lead forms
 * (native webhook), landing page builders, Typeform, Zapier / Make / n8n.
 * Facebook and Instagram lead ads cannot post directly - route them through
 * Zapier, Make or n8n, which then post here (or straight into the sheet).
 *
 * Setup: WhatsApp -> Webhook pro inzerát, then in the Apps Script editor
 * Nasadit -> Nové nasazení -> Webová aplikace, "Spustit jako: já",
 * "Kdo má přístup: kdokoli". Paste the resulting /exec URL into the ad form
 * and add the key it shows you.
 */

const WEBHOOK = {
  // Sheet the leads are written into. Empty = the first sheet.
  sheetName: '',
  // Skip a lead whose phone number is already in the sheet.
  skipDuplicates: true,
  // Value written into the status column for a fresh lead. Empty = nothing.
  newLeadStatus: 'nový',
};

// Field names accepted in the incoming payload, on top of the sheet's own
// header names (which are matched too).
const WEBHOOK_ALIASES = {
  name: ['name', 'full_name', 'fullname', 'jmeno', 'jmeno a prijmeni', 'first_name', 'kontakt'],
  phone: ['phone', 'phone_number', 'telefon', 'tel', 'mobil', 'cislo', 'number'],
  note: ['note', 'message', 'poznamka', 'zprava', 'text', 'comment', 'popis'],
};

/** Shows the endpoint key and what to do with it. */
function showWebhookInfo() {
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    'Webhook pro inzerát',
    'Klíč: ' + getWebhookKey_() + '\n\n' +
      'V editoru skriptu: Nasadit → Nové nasazení → typ Webová aplikace,\n' +
      'Spustit jako: já, Kdo má přístup: kdokoli.\n\n' +
      'Adresu, která vznikne (končí /exec), vložte do inzerátu jako webhook\n' +
      'a připojte klíč: ...exec?key=' + getWebhookKey_() + '\n\n' +
      'Formulář může posílat pole name / phone / note (nebo česky jmeno,\n' +
      'telefon, poznamka), případně přesné názvy sloupců této tabulky.',
    ui.ButtonSet.OK
  );
}

/** Endpoint. Called by the ad form / automation tool. */
function doPost(e) {
  try {
    const payload = parsePayload_(e);
    if (!keyMatches_(e, payload)) {
      return jsonResponse_({ ok: false, error: 'invalid key' });
    }
    if (payload.is_test || payload.isTest) {
      return jsonResponse_({ ok: true, test: true });
    }
    return jsonResponse_(appendLead_(payload));
  } catch (error) {
    // Return 200 with an error body: most ad platforms retry or disable the
    // webhook on an HTTP error, which is worse than a visible failure here.
    return jsonResponse_({ ok: false, error: error.message });
  }
}

/** Accepts JSON, form-encoded bodies and plain query parameters. */
function parsePayload_(e) {
  const payload = {};
  if (e && e.parameter) {
    Object.keys(e.parameter).forEach(function (key) {
      payload[key] = e.parameter[key];
    });
  }
  if (e && e.postData && e.postData.contents) {
    try {
      const parsed = JSON.parse(e.postData.contents);
      Object.keys(parsed).forEach(function (key) {
        payload[key] = parsed[key];
      });
    } catch (parseError) {
      // Not JSON - the form-encoded values from e.parameter are enough.
    }
  }
  return flattenGoogleAdsLead_(payload);
}

/**
 * Google Ads lead forms post {user_column_data: [{column_id, string_value}]}.
 * Flatten that into plain fields so the normal mapping can handle it.
 */
function flattenGoogleAdsLead_(payload) {
  const data = payload.user_column_data;
  if (Array.isArray(data)) {
    data.forEach(function (item) {
      if (item && item.column_id) payload[item.column_id] = item.string_value;
    });
  }
  return payload;
}

function appendLead_(payload) {
  const spreadsheet = SpreadsheetApp.getActive();
  const sheet = WEBHOOK.sheetName
    ? spreadsheet.getSheetByName(WEBHOOK.sheetName)
    : spreadsheet.getSheets()[0];
  if (!sheet) throw new Error('sheet not found: ' + WEBHOOK.sheetName);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const columns = findColumns_(sheet);
    if (!columns.phone) throw new Error('phone column not configured');

    const width = Math.max(sheet.getLastColumn(), 1);
    const headers = sheet.getRange(CONFIG.headerRow, 1, 1, width).getDisplayValues()[0];
    const values = pickFields_(payload, headers);

    const phone = normalizePhone_(values.phone);
    if (phone.length < 9) throw new Error('missing or invalid phone number');

    if (WEBHOOK.skipDuplicates) {
      const existing = findRowByPhone_(sheet, columns.phone, phone);
      if (existing) return { ok: true, duplicate: true, row: existing };
    }

    const row = new Array(width).fill('');
    const put = function (column, value) {
      if (column && value) row[column - 1] = value;
    };
    put(columns.name, values.name);
    put(columns.phone, '+' + phone);
    put(columns.note, values.note);
    put(columns.status, WEBHOOK.newLeadStatus);

    // Anything the payload sent under an exact header name goes to that column.
    headers.forEach(function (header, index) {
      const key = simplify_(header);
      if (!key || row[index]) return;
      const match = matchByKey_(payload, [key]);
      if (match) row[index] = match;
    });

    sheet.appendRow(row);
    return { ok: true, row: sheet.getLastRow() };
  } finally {
    lock.releaseLock();
  }
}

/** Pulls name / phone / note out of the payload by alias or header name. */
function pickFields_(payload, headers) {
  const headerKeys = headers.map(simplify_);
  const result = {};
  Object.keys(WEBHOOK_ALIASES).forEach(function (field) {
    result[field] = matchByKey_(payload, WEBHOOK_ALIASES[field]) || '';
  });
  // A header the sheet uses but the alias list does not know about.
  if (!result.phone) result.phone = matchByKey_(payload, headerKeys) || '';
  return result;
}

function matchByKey_(payload, keys) {
  const wanted = keys.map(simplify_);
  const found = Object.keys(payload).filter(function (key) {
    return wanted.indexOf(simplify_(key)) !== -1;
  });
  for (let i = 0; i < found.length; i++) {
    const value = payload[found[i]];
    if (value !== '' && value !== null && value !== undefined && typeof value !== 'object') {
      return String(value).trim();
    }
  }
  return '';
}

function findRowByPhone_(sheet, phoneColumn, phone) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= CONFIG.headerRow) return 0;
  const existing = sheet
    .getRange(CONFIG.headerRow + 1, phoneColumn, lastRow - CONFIG.headerRow, 1)
    .getDisplayValues();
  for (let i = 0; i < existing.length; i++) {
    if (normalizePhone_(existing[i][0]) === phone) return CONFIG.headerRow + 1 + i;
  }
  return 0;
}

/** Shared secret, so the endpoint cannot be filled by anyone who finds it. */
function getWebhookKey_() {
  const properties = PropertiesService.getScriptProperties();
  let key = properties.getProperty('WEBHOOK_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '').slice(0, 20);
    properties.setProperty('WEBHOOK_KEY', key);
  }
  return key;
}

function keyMatches_(e, payload) {
  const expected = getWebhookKey_();
  const supplied =
    (e && e.parameter && e.parameter.key) || payload.key || payload.google_key || '';
  return String(supplied) === expected;
}

function jsonResponse_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON
  );
}
