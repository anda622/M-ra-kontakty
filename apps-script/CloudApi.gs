/**
 * Automatic sending through the official WhatsApp Business Cloud API (Meta).
 *
 * This is what makes a real per-row button possible: tick the checkbox in the
 * "Odeslat" column and the message leaves on its own, always from the same
 * business number, without WhatsApp Web ever opening.
 *
 * Requirements (see README.md - none of them can be skipped):
 *   1. Meta Business account + WhatsApp Business app, business verified.
 *   2. A phone number dedicated to the API. It CANNOT be used in the normal
 *      WhatsApp app at the same time.
 *   3. A message template approved by Meta. Messages you start yourself (which
 *      is every message here) must use one; free text is only allowed within
 *      24 hours of the contact writing to you.
 *
 * Nothing in this file does anything until the access token and phone number ID
 * are filled in through WhatsApp -> Automatické odesílání – nastavení.
 */

const AUTO_SEND = {
  apiVersion: 'v21.0',
  // Also send when the status column is set to this value. Off by default -
  // the checkbox is the button; set to true if you prefer the status column.
  useStatusTrigger: false,
  triggerStatus: 'zavoláno',
  // Fallback for which contact fields fill {{1}}, {{2}}, ... in the approved
  // template. Normally set in the settings dialog instead of here.
  templateParameterFields: ['firstName'],
};

// --- setup ------------------------------------------------------------------

/** Adds the "Odeslat" checkbox column and installs the trigger behind it. */
function setupSendButtons() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const columns = findColumns_(sheet);

  let column = columns.send;
  if (!column) {
    column = sheet.getLastColumn() + 1;
    sheet.getRange(CONFIG.headerRow, column).setValue(CONFIG.sendColumnHeader).setFontWeight('bold');
  }

  const lastRow = sheet.getLastRow();
  if (lastRow > CONFIG.headerRow) {
    const cells = sheet.getRange(CONFIG.headerRow + 1, column, lastRow - CONFIG.headerRow, 1);
    cells.insertCheckboxes();
  }
  sheet.setColumnWidth(column, 80);

  installEditTrigger_();

  ui.alert(
    'Hotovo',
    'Ve sloupci "' + CONFIG.sendColumnHeader + '" je u každého kontaktu ' +
      'zaškrtávátko. Zaškrtnutím se odešle WhatsApp zpráva.\n\n' +
      (isConfigured_()
        ? 'Přístupové údaje k API jsou vyplněné.'
        : 'POZOR: zatím nejsou vyplněné přístupové údaje k API, takže se nic ' +
          'neodešle. Doplňte je v menu WhatsApp → Automatické odesílání – nastavení.'),
    ui.ButtonSet.OK
  );
}

/** (Re)installs the trigger that watches the checkbox column. */
function installEditTrigger_() {
  const spreadsheet = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'onSendEdit') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger('onSendEdit').forSpreadsheet(spreadsheet).onEdit().create();
}

// --- API settings dialog ----------------------------------------------------

/** Opens the dialog for the Meta access token, number ID and template. */
function showApiSettings() {
  const html = HtmlService.createHtmlOutputFromFile('Api').setWidth(460).setHeight(520);
  SpreadsheetApp.getUi().showModalDialog(html, 'Automatické odesílání');
}

/** Current settings for the dialog. The token itself is never sent back. */
function getApiSettings() {
  const properties = PropertiesService.getScriptProperties();
  return {
    hasToken: Boolean(properties.getProperty('WHATSAPP_TOKEN')),
    phoneNumberId: properties.getProperty('WHATSAPP_PHONE_NUMBER_ID') || '',
    templateName: properties.getProperty('WHATSAPP_TEMPLATE_NAME') || '',
    templateLang: properties.getProperty('WHATSAPP_TEMPLATE_LANG') || 'cs',
    templateParameters: templateParameterFields_().join(', '),
  };
}

/**
 * Which contact fields fill {{1}}, {{2}}, ... in the template, in order.
 * Allowed: firstName, name, phone, note, status.
 */
function templateParameterFields_() {
  const stored = PropertiesService.getScriptProperties().getProperty('WHATSAPP_TEMPLATE_PARAMS');
  // null = never configured (use the fallback); '' = deliberately no variables.
  if (stored === null) return AUTO_SEND.templateParameterFields;
  const fields = stored
    .split(',')
    .map(function (field) { return field.trim(); })
    .filter(Boolean);
  return fields.length ? fields : [];
}

/** Stores the settings. An empty token means "keep the existing one". */
function saveApiSettings(settings) {
  const properties = PropertiesService.getScriptProperties();
  if (settings.token) properties.setProperty('WHATSAPP_TOKEN', String(settings.token).trim());
  properties.setProperty('WHATSAPP_PHONE_NUMBER_ID', String(settings.phoneNumberId || '').trim());
  properties.setProperty('WHATSAPP_TEMPLATE_NAME', String(settings.templateName || '').trim());
  properties.setProperty('WHATSAPP_TEMPLATE_LANG', String(settings.templateLang || 'cs').trim());
  properties.setProperty('WHATSAPP_TEMPLATE_PARAMS', String(settings.templateParameters || '').trim());
  return getApiSettings();
}

/** Removes the stored access token. */
function clearApiToken() {
  PropertiesService.getScriptProperties().deleteProperty('WHATSAPP_TOKEN');
  return getApiSettings();
}

/**
 * Sends one template message to a number typed in the dialog, with a
 * placeholder for every variable the template is configured to use.
 */
function sendTestMessage(phone) {
  const digits = normalizePhone_(phone);
  if (digits.length < 9) throw new Error('Neplatné telefonní číslo.');
  const samples = { firstName: 'Jan', name: 'Jan Novák', note: 'zkušební zpráva', status: 'test' };
  const parameters = templateParameterFields_().map(function (field) {
    return samples[field] || 'test';
  });
  sendTemplateMessage_(digits, parameters);
  return 'Odesláno na +' + digits + '. Zkontrolujte telefon příjemce.';
}

// --- sending ----------------------------------------------------------------

/**
 * Installable onEdit trigger: the checkbox in the "Odeslat" column is the
 * per-row send button.
 */
function onSendEdit(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  const row = e.range.getRow();
  if (row <= CONFIG.headerRow) return;
  if (e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return;

  const columns = findColumns_(sheet);
  const editedColumn = e.range.getColumn();

  const checkboxTicked = columns.send && editedColumn === columns.send && e.range.isChecked();
  const statusReached =
    AUTO_SEND.useStatusTrigger &&
    columns.status &&
    editedColumn === columns.status &&
    simplify_(e.range.getDisplayValue()) === simplify_(AUTO_SEND.triggerStatus);

  if (!checkboxTicked && !statusReached) return;

  sendRow_(sheet, row, columns);

  // Reset the button so the row can be sent again later. Programmatic edits do
  // not fire onEdit, so this does not loop.
  if (checkboxTicked) e.range.uncheck();
}

/** Sends the message for one row and writes the result back into the sheet. */
function sendRow_(sheet, row, columns) {
  const resultColumn = columns.sent || createSentColumn_(sheet);
  const write = function (value) {
    sheet.getRange(row, resultColumn).setValue(value);
  };

  if (!isConfigured_()) {
    write('CHYBA: nenastavené API');
    return;
  }
  if (!columns.phone) {
    write('CHYBA: chybí sloupec s telefonem');
    return;
  }

  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const cell = function (index) {
    return index ? String(values[index - 1] || '').trim() : '';
  };

  const phone = normalizePhone_(cell(columns.phone));
  if (phone.length < 9) {
    write('CHYBA: neplatné číslo');
    return;
  }

  const contact = {
    name: cell(columns.name),
    firstName: firstName_(cell(columns.name)),
    note: cell(columns.note),
    status: cell(columns.status),
    phone: phone,
  };
  const parameters = templateParameterFields_().map(function (field) {
    return contact[field] || '';
  });

  try {
    sendTemplateMessage_(phone, parameters);
    write(
      Utilities.formatDate(
        new Date(),
        sheet.getParent().getSpreadsheetTimeZone(),
        'd.M.yyyy H:mm'
      )
    );
  } catch (error) {
    write('CHYBA: ' + error.message);
  }
}

/**
 * Sends an approved template message. Required for any message you start,
 * which is every message sent from this sheet.
 * https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
 */
function sendTemplateMessage_(phone, bodyParameters) {
  const properties = PropertiesService.getScriptProperties();
  const templateName = properties.getProperty('WHATSAPP_TEMPLATE_NAME');
  if (!templateName) throw new Error('není vyplněný název šablony');

  const components = [];
  if (bodyParameters && bodyParameters.length) {
    components.push({
      type: 'body',
      parameters: bodyParameters.map(function (value) {
        return { type: 'text', text: String(value || '') };
      }),
    });
  }

  return callApi_({
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: properties.getProperty('WHATSAPP_TEMPLATE_LANG') || 'cs' },
      components: components,
    },
  });
}

/**
 * Sends free text. Only allowed inside the 24 hour window that opens when the
 * contact messages you first - otherwise the API rejects it.
 */
function sendTextMessage_(phone, text) {
  return callApi_({
    messaging_product: 'whatsapp',
    to: normalizePhone_(phone),
    type: 'text',
    text: { preview_url: false, body: text },
  });
}

function callApi_(payload) {
  const properties = PropertiesService.getScriptProperties();
  const url =
    'https://graph.facebook.com/' +
    AUTO_SEND.apiVersion +
    '/' +
    properties.getProperty('WHATSAPP_PHONE_NUMBER_ID') +
    '/messages';

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + properties.getProperty('WHATSAPP_TOKEN') },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const code = response.getResponseCode();
  const body = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error(describeApiError_(code, body));
  }
  return JSON.parse(body);
}

/** Turns a Meta error response into something readable in a spreadsheet cell. */
function describeApiError_(code, body) {
  try {
    const error = JSON.parse(body).error || {};
    const detail = error.error_user_msg || error.message || body;
    return code + ' – ' + detail;
  } catch (parseError) {
    return code + ' – ' + body;
  }
}

function isConfigured_() {
  const properties = PropertiesService.getScriptProperties();
  return Boolean(
    properties.getProperty('WHATSAPP_TOKEN') && properties.getProperty('WHATSAPP_PHONE_NUMBER_ID')
  );
}
