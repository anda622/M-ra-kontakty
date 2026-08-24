/**
 * WhatsApp follow-up for a Google Sheets contact list.
 *
 * Adds a "WhatsApp" menu to the spreadsheet. After a call, select the row of
 * the person you just spoke to, open the side panel, pick a template, adjust
 * the text and click the button - WhatsApp Web (or the desktop app) opens with
 * the message already typed for that number. The time is written back to the
 * sheet so you can see who has already been contacted.
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
};

// Header names the script recognises, in Czech and English. Diacritics and
// letter case are ignored, so "Jméno" and "jmeno" both match.
const COLUMN_ALIASES = {
  name: ['jmeno', 'jmeno a prijmeni', 'name', 'kontakt', 'osoba', 'klient', 'prijmeni'],
  phone: ['telefon', 'tel', 'mobil', 'cislo', 'telefonni cislo', 'phone', 'number'],
  note: ['poznamka', 'poznamky', 'note', 'notes', 'popis', 'detail'],
  status: ['stav', 'status', 'hovor', 'volano', 'volani'],
};

// Message templates offered in the side panel.
// Placeholders: {jmeno}, {poznamka}, {datum}
const TEMPLATES = [
  {
    name: 'Po hovoru – shrnutí',
    body: 'Dobrý den {jmeno},\n\nděkuji za dnešní telefonát. Posílám shrnutí toho, na čem jsme se domluvili:\n\n- \n- \n\nKdyby cokoliv, klidně mi napište sem.\n\nHezký den,\nMarta',
  },
  {
    name: 'Nedovolala jsem se',
    body: 'Dobrý den {jmeno},\n\nzkoušela jsem se Vám dnes dovolat, bohužel jsem Vás nezastihla. Ozvete se prosím, až budete mít chvíli, nebo mi napište, kdy se Vám to hodí.\n\nDěkuji a hezký den,\nMarta',
  },
  {
    name: 'Poslání informací',
    body: 'Dobrý den {jmeno},\n\njak jsme se domluvili po telefonu, posílám slíbené informace:\n\n\nDejte mi prosím vědět, jestli je to takhle v pořádku.\n\nS pozdravem,\nMarta',
  },
  {
    name: 'Připomenutí schůzky',
    body: 'Dobrý den {jmeno},\n\njen připomínám naši domluvenou schůzku. Kdyby se něco změnilo, dejte mi prosím včas vědět.\n\nTěším se,\nMarta',
  },
];

/** Adds the custom menu when the spreadsheet is opened. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('WhatsApp')
    .addItem('Otevřít panel', 'showSidebar')
    .addSeparator()
    .addItem('Zkontrolovat nastavení', 'checkSetup')
    .addToUi();
}

/** Opens the side panel. */
function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('WhatsApp');
  SpreadsheetApp.getUi().showSidebar(html);
}

/** Reports which columns were detected, so header problems are easy to spot. */
function checkSetup() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const columns = findColumns_(sheet);
  const label = function (key) {
    return columns[key] ? columnLetter_(columns[key]) : 'NENALEZENO';
  };
  const message =
    'List: ' + sheet.getName() + '\n\n' +
    'Jméno: ' + label('name') + '\n' +
    'Telefon: ' + label('phone') + '\n' +
    'Poznámka: ' + label('note') + '\n' +
    'Stav: ' + label('status') + '\n' +
    'Odesláno: ' + label('sent') + '\n\n' +
    'Pokud něco chybí, přejmenujte hlavičku sloupce nebo přidejte název do ' +
    'COLUMN_ALIASES v souboru Code.gs.';
  SpreadsheetApp.getUi().alert('Nastavení', message, SpreadsheetApp.getUi().ButtonSet.OK);
}

/** Returns the templates for the side panel. */
function getTemplates() {
  return TEMPLATES;
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
    return { ok: false, error: 'Vyberte řádek s kontaktem (ne hlavičku).' };
  }

  const columns = findColumns_(sheet);
  if (!columns.phone) {
    return { ok: false, error: 'Nenašla jsem sloupec s telefonem. Použijte "Zkontrolovat nastavení".' };
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
 * Builds the click-to-chat link. WhatsApp expects digits only, no "+".
 * https://faq.whatsapp.com/5913398998672934
 */
function buildLink(phone, message) {
  return 'https://wa.me/' + normalizePhone_(phone) + '?text=' + encodeURIComponent(message);
}

/** Writes the current time into the "sent" column of the given row. */
function markSent(row) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const columns = findColumns_(sheet);
  const column = columns.sent || createSentColumn_(sheet);
  const stamp = Utilities.formatDate(new Date(), sheet.getParent().getSpreadsheetTimeZone(), 'd.M.yyyy H:mm');
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

/** Maps the logical column names onto column indexes (1-based). */
function findColumns_(sheet) {
  const width = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(CONFIG.headerRow, 1, 1, width).getDisplayValues()[0];
  const found = { name: 0, phone: 0, note: 0, status: 0, sent: 0 };
  const sentKey = simplify_(CONFIG.sentColumnHeader);

  headers.forEach(function (header, index) {
    const key = simplify_(header);
    if (!key) return;
    if (key === sentKey) {
      found.sent = found.sent || index + 1;
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
    .replace(/[^a-z0-9 ]/g, '')
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
  } else if (value.length <= 10 && value.slice(0, CONFIG.defaultCountryCode.length) !== CONFIG.defaultCountryCode) {
    // A local number without a prefix - assume the default country.
    value = CONFIG.defaultCountryCode + value.replace(/^0+/, '');
  }

  return value.replace(/\D/g, '');
}

/** "Jan Novák" -> "Jane" is not attempted; we just take the first word. */
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
