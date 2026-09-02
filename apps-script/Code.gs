/**
 * WhatsApp follow-up for a Google Sheets contact list.
 *
 * After a call: click the contact's row, pick a template in the side panel,
 * adjust the text and press the green button. WhatsApp opens with the message
 * already typed for that number; you only press Send. The time is written back
 * into the sheet so you can see who has been contacted.
 *
 * No API keys, no Meta Business account, no risk of a number ban.
 * See CloudApi.gs for the fully automatic (zero-click) alternative.
 */

const CONFIG = {
  // Country code used when a number has no international prefix (420 = CZ).
  defaultCountryCode: '420',
  // Row that holds the column headers.
  headerRow: 1,
  // Column the script writes the "sent at" timestamp into. Created if missing.
  sentColumnHeader: 'WhatsApp odesláno',
  // Checkbox column that acts as a per-row send button (used by CloudApi.gs).
  sendColumnHeader: 'Odeslat',
};

// Header names recognised automatically, in Czech and English. Diacritics and
// letter case are ignored, so "Jméno" and "jmeno" both match. If your headers
// are different, use "WhatsApp -> Nastavit sloupce" instead of editing this.
const COLUMN_ALIASES = {
  name: ['jmeno', 'jmeno a prijmeni', 'name', 'kontakt', 'osoba', 'klient', 'prijmeni', 'firma'],
  phone: ['telefon', 'tel', 'mobil', 'cislo', 'telefonni cislo', 'phone', 'number', 'kontakt telefon'],
  note: ['poznamka', 'poznamky', 'note', 'notes', 'popis', 'detail'],
  status: ['stav', 'status', 'hovor', 'volano', 'volani', 'vysledek'],
};

// Message templates offered in the side panel.
// Placeholders: {jmeno}, {poznamka}, {datum}
const TEMPLATES = [
  {
    name: 'Po hovoru – shrnutí',
    body: 'Dobrý den {jmeno},\n\nděkuji za dnešní telefonát. Posílám shrnutí toho, na čem jsme se domluvili:\n\n- \n- \n\nKdyby cokoliv, klidně mi napište sem.\n\nHezký den',
  },
  {
    name: 'Nedovolala jsem se',
    body: 'Dobrý den {jmeno},\n\nzkoušela jsem se Vám dnes dovolat, bohužel jsem Vás nezastihla. Ozvěte se prosím, až budete mít chvíli, nebo mi napište, kdy se Vám to hodí.\n\nDěkuji a hezký den',
  },
  {
    name: 'Poslání informací',
    body: 'Dobrý den {jmeno},\n\njak jsme se domluvili po telefonu, posílám slíbené informace:\n\n\nDejte mi prosím vědět, jestli je to takhle v pořádku.\n\nS pozdravem',
  },
  {
    name: 'Připomenutí schůzky',
    body: 'Dobrý den {jmeno},\n\njen připomínám naši domluvenou schůzku. Kdyby se něco změnilo, dejte mi prosím včas vědět.\n\nTěším se',
  },
];

const FIELD_LABELS = {
  name: 'Jméno',
  phone: 'Telefon',
  note: 'Poznámka',
  status: 'Stav',
  sent: 'Odesláno',
  send: 'Odeslat (tlačítko)',
};

/** Adds the custom menu when the spreadsheet is opened. */
function onOpen() {
  const menu = SpreadsheetApp.getUi()
    .createMenu('WhatsApp')
    .addItem('Otevřít panel', 'showSidebar')
    .addSeparator()
    .addItem('Nastavit sloupce', 'showColumnPicker');

  // The automatic sending (CloudApi.gs) is optional - only offer it when that
  // file has actually been added to the project.
  if (typeof showApiSettings === 'function') {
    menu.addItem('Automatické odesílání – nastavení', 'showApiSettings');
    menu.addItem('Vytvořit tlačítka Odeslat', 'setupSendButtons');
  }

  // The lead webhook (Webhook.gs) is optional in the same way.
  if (typeof showWebhookInfo === 'function') {
    menu.addSeparator().addItem('Webhook pro inzerát', 'showWebhookInfo');
  }

  menu.addToUi();
}

/** Opens the side panel. */
function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('WhatsApp');
  SpreadsheetApp.getUi().showSidebar(html);
}

/** Opens the dialog for mapping sheet columns onto the fields the script uses. */
function showColumnPicker() {
  const html = HtmlService.createHtmlOutputFromFile('Columns').setWidth(420).setHeight(430);
  SpreadsheetApp.getUi().showModalDialog(html, 'Nastavit sloupce');
}

// --- called from the HTML files ---------------------------------------------

/** Returns the templates and the saved "open in" preference. */
function getPanelSettings() {
  return {
    templates: TEMPLATES,
    target: PropertiesService.getUserProperties().getProperty('linkTarget') || 'web',
  };
}

/** Remembers whether links open WhatsApp Web or the app. */
function saveLinkTarget(target) {
  PropertiesService.getUserProperties().setProperty('linkTarget', target === 'app' ? 'app' : 'web');
}

/** Headers of the active sheet plus the current mapping, for the dialog. */
function getColumnSetup() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const width = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(CONFIG.headerRow, 1, 1, width).getDisplayValues()[0];
  return {
    sheetName: sheet.getName(),
    headers: headers.map(function (header, index) {
      return { index: index + 1, label: columnLetter_(index + 1) + ' – ' + (header || '(prázdné)') };
    }),
    detected: findColumns_(sheet),
    saved: readSavedMap_(sheet),
    fields: FIELD_LABELS,
  };
}

/** Stores the mapping chosen in the dialog. Values are 1-based, 0 = auto. */
function saveColumnMap(map) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const cleaned = {};
  Object.keys(FIELD_LABELS).forEach(function (field) {
    const value = Number(map && map[field]);
    if (value > 0) cleaned[field] = value;
  });
  PropertiesService.getDocumentProperties().setProperty(mapKey_(sheet), JSON.stringify(cleaned));
  return findColumns_(sheet);
}

/** Forgets the mapping, so the automatic header detection is used again. */
function clearColumnMap() {
  const sheet = SpreadsheetApp.getActiveSheet();
  PropertiesService.getDocumentProperties().deleteProperty(mapKey_(sheet));
  return findColumns_(sheet);
}

/**
 * Reads the currently selected row and returns everything the panel needs.
 * Called on load and while polling for a new selection.
 */
function getSelection() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const range = SpreadsheetApp.getActiveRange();
  if (!range) {
    return { ok: false, error: 'Není vybrán žádný řádek.' };
  }

  const row = range.getRow();
  if (row <= CONFIG.headerRow) {
    return { ok: false, error: 'Klikněte na řádek s kontaktem (ne na hlavičku).' };
  }

  const columns = findColumns_(sheet);
  if (!columns.phone) {
    return {
      ok: false,
      error: 'Nenašla jsem sloupec s telefonem. Otevřete WhatsApp → Nastavit sloupce.',
    };
  }

  // Display values keep the number formatted exactly as it looks in the sheet,
  // which avoids losing a leading "+" or "00".
  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const cell = function (index) {
    return index ? String(values[index - 1] || '').trim() : '';
  };

  const rawPhone = cell(columns.phone);
  const phone = normalizePhone_(rawPhone);

  return {
    ok: true,
    row: row,
    sheetName: sheet.getName(),
    name: cell(columns.name),
    firstName: firstName_(cell(columns.name)),
    note: cell(columns.note),
    status: cell(columns.status),
    rawPhone: rawPhone,
    phone: phone,
    phoneValid: phone.length >= 9,
    sentAt: cell(columns.sent),
  };
}

/**
 * Builds the click-to-chat link.
 * "web" goes straight into WhatsApp Web; "app" uses wa.me, which hands over to
 * the desktop or mobile app (with one extra confirmation click).
 * https://faq.whatsapp.com/5913398998672934
 */
function buildLink(phone, message, target) {
  const digits = normalizePhone_(phone);
  const text = encodeURIComponent(message);
  return target === 'app'
    ? 'https://wa.me/' + digits + '?text=' + text
    : 'https://web.whatsapp.com/send?phone=' + digits + '&text=' + text;
}

/** Writes the current time into the "sent" column of the given row. */
function markSent(row) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const columns = findColumns_(sheet);
  const column = columns.sent || createSentColumn_(sheet);
  const stamp = Utilities.formatDate(
    new Date(),
    sheet.getParent().getSpreadsheetTimeZone(),
    'd.M.yyyy H:mm'
  );
  sheet.getRange(row, column).setValue(stamp);
  return stamp;
}

/** Fills {jmeno}, {poznamka} and {datum} in a template body. */
function renderTemplate(body, contact) {
  const today = Utilities.formatDate(
    new Date(),
    SpreadsheetApp.getActive().getSpreadsheetTimeZone(),
    'd.M.yyyy'
  );
  return String(body)
    .replace(/\{jmeno\}/g, contact.firstName || contact.name || '')
    .replace(/\{poznamka\}/g, contact.note || '')
    .replace(/\{datum\}/g, today);
}

// --- helpers ---------------------------------------------------------------

/**
 * Maps the logical fields onto column indexes (1-based, 0 = not found).
 * A mapping saved from the dialog wins; the rest is guessed from the headers.
 */
function findColumns_(sheet) {
  const width = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(CONFIG.headerRow, 1, 1, width).getDisplayValues()[0];
  const found = { name: 0, phone: 0, note: 0, status: 0, sent: 0, send: 0 };
  const sentKey = simplify_(CONFIG.sentColumnHeader);
  const sendKey = simplify_(CONFIG.sendColumnHeader);

  const saved = readSavedMap_(sheet);
  Object.keys(found).forEach(function (field) {
    const value = Number(saved[field]);
    if (value > 0 && value <= width) found[field] = value;
  });

  headers.forEach(function (header, index) {
    const key = simplify_(header);
    if (!key) return;
    if (key === sentKey) {
      found.sent = found.sent || index + 1;
      return;
    }
    if (key === sendKey) {
      found.send = found.send || index + 1;
      return;
    }
    Object.keys(COLUMN_ALIASES).forEach(function (field) {
      if (found[field]) return;
      if (COLUMN_ALIASES[field].indexOf(key) !== -1) {
        found[field] = index + 1;
      }
    });
  });

  return found;
}

function mapKey_(sheet) {
  return 'columnMap:' + sheet.getSheetId();
}

function readSavedMap_(sheet) {
  const raw = PropertiesService.getDocumentProperties().getProperty(mapKey_(sheet));
  if (!raw) return {};
  try {
    return JSON.parse(raw) || {};
  } catch (error) {
    return {};
  }
}

/** Appends the timestamp column and returns its index. */
function createSentColumn_(sheet) {
  const column = sheet.getLastColumn() + 1;
  sheet.getRange(CONFIG.headerRow, column).setValue(CONFIG.sentColumnHeader).setFontWeight('bold');
  return column;
}

/** Lower-cases a header and strips diacritics, punctuation and spacing. */
function simplify_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Turns "+420 777 123 456", "00420777123456" or "777 123 456" into
 * "420777123456".
 */
function normalizePhone_(raw) {
  let value = String(raw || '').replace(/[^\d+]/g, '');
  if (!value) return '';

  if (value.charAt(0) === '+') {
    value = value.slice(1);
  } else if (value.slice(0, 2) === '00') {
    value = value.slice(2);
  } else if (
    value.length <= 10 &&
    value.slice(0, CONFIG.defaultCountryCode.length) !== CONFIG.defaultCountryCode
  ) {
    // A local number without a prefix - assume the default country.
    value = CONFIG.defaultCountryCode + value.replace(/^0+/, '');
  }

  return value.replace(/\D/g, '');
}

/** First word of the full name, used for the greeting. */
function firstName_(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || '';
}

/** 1 -> A, 27 -> AA */
function columnLetter_(column) {
  let letter = '';
  let n = column;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    n = Math.floor((n - remainder) / 26);
  }
  return letter;
}
