/**
 * OPTIONAL - fully automatic sending via the official WhatsApp Business
 * Cloud API (Meta). Nothing here runs until you fill in the two script
 * properties below; the click-to-chat panel in Code.gs works without it.
 *
 * What you need first (see README.md):
 *   1. A Meta Business account + a WhatsApp Business app.
 *   2. A phone number dedicated to the API. It cannot be used in the normal
 *      WhatsApp app at the same time.
 *   3. A message template approved by Meta - business-initiated messages
 *      outside the 24 hour customer service window must use one.
 *
 * Then in the Apps Script editor: Project Settings -> Script Properties, add
 *   WHATSAPP_TOKEN            = permanent access token
 *   WHATSAPP_PHONE_NUMBER_ID  = the number's ID from the Meta dashboard
 *   WHATSAPP_TEMPLATE_NAME    = e.g. po_hovoru
 *   WHATSAPP_TEMPLATE_LANG    = e.g. cs (optional, defaults to cs)
 * and run installEditTrigger() once.
 */

const AUTO_SEND = {
  // The value in the status column that triggers a message.
  triggerStatus: 'zavoláno',
  apiVersion: 'v21.0',
};

/** Run once to install the trigger that watches for status changes. */
function installEditTrigger() {
  const spreadsheet = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'onStatusEdit') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger('onStatusEdit').forSpreadsheet(spreadsheet).onEdit().create();
  SpreadsheetApp.getUi().alert('Automatické odesílání je nainstalováno.');
}

/**
 * Installable onEdit trigger. Sends a template message when the status column
 * of a row is set to AUTO_SEND.triggerStatus.
 */
function onStatusEdit(e) {
  if (!e || !e.range) return;
  if (!isConfigured_()) return;

  const sheet = e.range.getSheet();
  const row = e.range.getRow();
  if (row <= CONFIG.headerRow) return;

  const columns = findColumns_(sheet);
  if (!columns.status || e.range.getColumn() !== columns.status) return;
  if (simplify_(e.range.getDisplayValue()) !== simplify_(AUTO_SEND.triggerStatus)) return;

  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const phone = normalizePhone_(columns.phone ? values[columns.phone - 1] : '');
  const name = firstName_(columns.name ? values[columns.name - 1] : '');
  if (phone.length < 9) {
    sheet.getRange(row, columns.sent || createSentColumn_(sheet)).setValue('CHYBA: neplatné číslo');
    return;
  }

  try {
    sendTemplateMessage_(phone, [name]);
    markSent(row);
  } catch (error) {
    sheet.getRange(row, columns.sent || createSentColumn_(sheet)).setValue('CHYBA: ' + error.message);
  }
}

/**
 * Sends an approved template message. Use this for the first message or any
 * message more than 24 hours after the contact last wrote to you.
 * https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
 */
function sendTemplateMessage_(phone, bodyParameters) {
  const properties = PropertiesService.getScriptProperties();
  const payload = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: {
      name: properties.getProperty('WHATSAPP_TEMPLATE_NAME'),
      language: { code: properties.getProperty('WHATSAPP_TEMPLATE_LANG') || 'cs' },
      components: [
        {
          type: 'body',
          parameters: (bodyParameters || []).map(function (value) {
            return { type: 'text', text: String(value || '') };
          }),
        },
      ],
    },
  };
  return callApi_(payload);
}

/**
 * Sends free text. Only allowed inside the 24 hour window that opens when the
 * contact messages you - otherwise the API rejects it.
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
    'https://graph.facebook.com/' + AUTO_SEND.apiVersion + '/' +
    properties.getProperty('WHATSAPP_PHONE_NUMBER_ID') + '/messages';

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + properties.getProperty('WHATSAPP_TOKEN') },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('WhatsApp API ' + code + ': ' + response.getContentText());
  }
  return JSON.parse(response.getContentText());
}

function isConfigured_() {
  const properties = PropertiesService.getScriptProperties();
  return Boolean(
    properties.getProperty('WHATSAPP_TOKEN') && properties.getProperty('WHATSAPP_PHONE_NUMBER_ID')
  );
}
