const CONFIG = {
  defaultCountryCode: '420',   // předvolba pro čísla bez ní
  headerRow: 1,                // řádek s hlavičkami
};

// Tlačítkové sloupce. Každý má vlastní barvu stavu a vlastní přednastavenou
// šablonu. Sloupec se hledá podle hlavičky; když ji nenajde, použije se column.
const BUTTON_COLUMNS = [
  { header: 'WhatsApp', column: 9, template: 0 },    // I – po hovoru
  { header: 'WhatsApp 2', column: 10, template: 1 }, // J – den před schůzkou
];

const COLUMN_ALIASES = {
  name: ['jmeno', 'jmeno a prijmeni', 'name', 'kontakt', 'osoba', 'klient', 'prijmeni', 'firma'],
  phone: ['telefon', 'tel', 'mobil', 'cislo', 'telefonni cislo', 'phone', 'number'],
  note: ['poznamka', 'poznamky', 'note', 'notes', 'popis', 'detail'],
  status: ['stav', 'status', 'volano', 'volani', 'vysledek'],
};

// Značky: {jmeno} = 5. pád (Martine), {jmeno1} = jak je v tabulce (Martin),
// {termin} = celý termín ze sloupce G, {cas} = jen čas z něj,
// {poznamka}, {datum}
const TEMPLATES = [
  {
    name: 'Po hovoru',
    body:
      'Dobrý den, {jmeno},\n\n' +
      'potvrzuji naši konzultaci.\n\n' +
      'Termín: {termin}\n' +
      'Adresa: Vrbnovská 1414/11, Hořovice\n' +
      'Mapa: https://maps.google.com/?q=49.838714,13.908064\n\n' +
      'Uložte si prosím toto číslo. Těším se na setkání.\n\n' +
      'Marek Šíma, džim\n' +
      'www.dzimhorovice.cz',
  },
  {
    name: 'Potvrzení den předem',
    body:
      'Dobrý den, {jmeno},\n\n' +
      'potvrďte prosím zítřejší konzultaci odpovědí „ANO“.\n\n' +
      'Počítáme s Vámi v {cas}, máme pro Vás vyhrazený blok.\n\n' +
      'Adresa: Vrbnovská 1414/11, Hořovice\n' +
      'Mapa: https://maps.google.com/?q=49.838714,13.908064\n\n' +
      'Pokud se nemůžete dostavit, dejte prosím vědět, ať termín nabídneme dalšímu zájemci.\n\n' +
      'Marek Šíma, džim',
  },
];

const PENDING_COLOR = '#EA4335';   // ještě neodesláno
const SENT_COLOR = '#34A853';      // odesláno
const BUTTON_COLUMN_WIDTH = 70;
const MEETING_COLUMN = 7;          // sloupec G – termín schůzky

const FIELD_LABELS = {
  name: 'Jméno',
  phone: 'Telefon',
  note: 'Poznámka',
  status: 'Stav',
};

const VOCATIVE_EXCEPTIONS = {
  petr: 'Petře',
  pavel: 'Pavle',
  karel: 'Karle',
  daniel: 'Danieli',
  gabriel: 'Gabrieli',
  marcel: 'Marceli',
  dagmar: 'Dagmar',
  ester: 'Ester',
  miriam: 'Miriam',
  karin: 'Karin',
  ingrid: 'Ingrid',
  nikol: 'Nikol',
  sarah: 'Sarah',
  ruth: 'Ruth',
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('WhatsApp')
    .addItem('Otevřít panel', 'showSidebar')
    .addItem('Vytvořit tlačítka', 'setupButtons')
    .addSeparator()
    .addItem('Nastavit sloupce', 'showColumnPicker')
    .addToUi();

  showSidebar();
}

function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('WhatsApp');
  SpreadsheetApp.getUi().showSidebar(html);
}

function showColumnPicker() {
  const html = HtmlService.createHtmlOutputFromFile('Columns').setWidth(420).setHeight(430);
  SpreadsheetApp.getUi().showModalDialog(html, 'Nastavit sloupce');
}

// --- tlačítkové sloupce -----------------------------------------------------

/** Sloupce tlačítek, dohledané podle hlavičky, jinak podle nastavení. */
function buttonColumns_(sheet) {
  const width = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(CONFIG.headerRow, 1, 1, width).getDisplayValues()[0];
  return BUTTON_COLUMNS.map(function (button) {
    const key = simplify_(button.header);
    let column = 0;
    headers.forEach(function (header, index) {
      if (!column && simplify_(header) === key) column = index + 1;
    });
    return { header: button.header, template: button.template, column: column || button.column };
  });
}

/** Tlačítko, kterému patří daný sloupec, nebo null. */
function buttonForColumn_(sheet, column) {
  const found = buttonColumns_(sheet).filter(function (button) {
    return button.column === column;
  });
  return found.length ? found[0] : null;
}

/** Naposledy zmáčknuté tlačítko – panel podle něj vybírá šablonu. */
function activeButton_(sheet) {
  const stored = Number(PropertiesService.getUserProperties().getProperty('activeButtonColumn'));
  const buttons = buttonColumns_(sheet);
  const match = buttons.filter(function (button) {
    return button.column === stored;
  });
  return match.length ? match[0] : buttons[0];
}

function setupButtons() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const columns = findColumns_(sheet);

  if (!columns.phone) {
    ui.alert('Nenašel jsem sloupec s telefonem. Otevřete nejdřív WhatsApp → Nastavit sloupce.');
    return;
  }

  const buttons = buttonColumns_(sheet);
  const report = [];

  for (let b = 0; b < buttons.length; b++) {
    const button = buttons[b];

    if (sheet.getMaxColumns() < button.column) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), button.column - sheet.getMaxColumns());
    }

    const headerCell = sheet.getRange(CONFIG.headerRow, button.column);
    const existing = headerCell.getDisplayValue().trim();
    if (existing && simplify_(existing) !== simplify_(button.header)) {
      ui.alert(
        'Sloupec ' + columnLetter_(button.column) + ' obsahuje "' + existing + '".\n\n' +
          'Uvolněte ho, nebo v BUTTON_COLUMNS změňte číslo sloupce pro "' + button.header + '".'
      );
      return;
    }
    if (!existing) headerCell.setValue(button.header).setFontWeight('bold');

    let written = 0;
    const lastRow = sheet.getLastRow();
    for (let row = CONFIG.headerRow + 1; row <= lastRow; row++) {
      if (writeButtonForRow_(sheet, row, columns, button)) written++;
    }
    sheet.setColumnWidth(button.column, BUTTON_COLUMN_WIDTH);
    report.push(button.header + ' (' + columnLetter_(button.column) + '): ' + written + ' kontaktů');
  }

  ui.alert('Hotovo', report.join('\n'), ui.ButtonSet.OK);
}

/** Zaškrtávátko a barva stavu pro jedno tlačítko v jednom řádku. */
function writeButtonForRow_(sheet, row, columns, button) {
  const cell = sheet.getRange(row, button.column);
  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const phone = normalizePhone_(columns.phone ? values[columns.phone - 1] : '');

  if (phone.length < 9) {
    if (ownsCell_(cell)) cell.clearContent().clearDataValidations().setBackground(null);
    return false;
  }

  const done = isDone_(cell);
  cell.insertCheckboxes();
  cell.uncheck();
  cell.setHorizontalAlignment('center').setBackground(done ? SENT_COLOR : PENDING_COLOR);
  return true;
}

function isDone_(cell) {
  return String(cell.getBackground() || '').toLowerCase() === SENT_COLOR.toLowerCase();
}

function ownsCell_(cell) {
  const background = String(cell.getBackground() || '').toLowerCase();
  return background === SENT_COLOR.toLowerCase() || background === PENDING_COLOR.toLowerCase();
}

// --- volané z panelu --------------------------------------------------------

function getPanelSettings() {
  return { templates: TEMPLATES, target: linkTarget_() };
}

function saveLinkTarget(target) {
  const allowed = ['web', 'app', 'macapp'];
  PropertiesService.getUserProperties().setProperty(
    'linkTarget',
    allowed.indexOf(target) !== -1 ? target : 'macapp'
  );
}

function linkTarget_() {
  const stored = PropertiesService.getUserProperties().getProperty('linkTarget');
  return ['web', 'app', 'macapp'].indexOf(stored) !== -1 ? stored : 'macapp';
}

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

function clearColumnMap() {
  const sheet = SpreadsheetApp.getActiveSheet();
  PropertiesService.getDocumentProperties().deleteProperty(mapKey_(sheet));
  return findColumns_(sheet);
}

function getSelection() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const range = SpreadsheetApp.getActiveRange();
  if (!range) return { ok: false, error: 'Není vybrán žádný řádek.' };

  const row = range.getRow();
  if (row <= CONFIG.headerRow) {
    return { ok: false, error: 'Klikněte na řádek s kontaktem (ne na hlavičku).' };
  }

  const columns = findColumns_(sheet);
  if (!columns.phone) {
    return { ok: false, error: 'Nenašel jsem sloupec s telefonem. Otevřete WhatsApp → Nastavit sloupce.' };
  }

  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const cell = function (index) {
    return index ? String(values[index - 1] || '').trim() : '';
  };

  const rawPhone = cell(columns.phone);
  const phone = normalizePhone_(rawPhone);
  const button = activeButton_(sheet);

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
    buttonColumn: button.column,
    buttonName: button.header,
    templateIndex: button.template,
    sentAt: isDone_(sheet.getRange(row, button.column)) ? 'ano' : '',
    progress: getProgress_(sheet, columns, button),
  };
}

function goToNextUncontacted() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const columns = findColumns_(sheet);
  if (!columns.phone) return { ok: false, error: 'Nenašel jsem sloupec s telefonem.' };

  const count = sheet.getLastRow() - CONFIG.headerRow;
  if (count < 1) return { ok: false, error: 'V tabulce nejsou žádné kontakty.' };

  const button = activeButton_(sheet);
  const phones = sheet.getRange(CONFIG.headerRow + 1, columns.phone, count, 1).getDisplayValues();
  const states = sheet.getRange(CONFIG.headerRow + 1, button.column, count, 1).getBackgrounds();

  const active = SpreadsheetApp.getActiveRange();
  const start = active ? Math.max(active.getRow() - CONFIG.headerRow, 0) : 0;

  for (let step = 0; step < count; step++) {
    const index = (start + step) % count;
    if (normalizePhone_(phones[index][0]).length < 9) continue;
    if (String(states[index][0]).toLowerCase() === SENT_COLOR.toLowerCase()) continue;
    sheet.setActiveRange(sheet.getRange(CONFIG.headerRow + 1 + index, 1));
    return getSelection();
  }

  return { ok: false, error: 'Hotovo – ' + button.header + ' má odesláno u všech.' };
}

function getProgress_(sheet, columns, button) {
  const count = sheet.getLastRow() - CONFIG.headerRow;
  if (count < 1 || !columns.phone) return { total: 0, done: 0 };

  const phones = sheet.getRange(CONFIG.headerRow + 1, columns.phone, count, 1).getDisplayValues();
  const states = sheet.getRange(CONFIG.headerRow + 1, button.column, count, 1).getBackgrounds();

  let total = 0;
  let done = 0;
  for (let i = 0; i < count; i++) {
    if (normalizePhone_(phones[i][0]).length < 9) continue;
    total++;
    if (String(states[i][0]).toLowerCase() === SENT_COLOR.toLowerCase()) done++;
  }
  return { total: total, done: done };
}

function buildLink(phone, message, target) {
  const digits = normalizePhone_(phone);
  const text = encodeURIComponent(message);
  if (target === 'macapp') return 'whatsapp://send?phone=' + digits + '&text=' + text;
  if (target === 'app') {
    return 'https://api.whatsapp.com/send/?phone=' + digits + '&text=' + text +
      '&type=phone_number&app_absent=0';
  }
  return 'https://web.whatsapp.com/send?phone=' + digits + '&text=' + text;
}

/** Zezelená to tlačítko, přes které se zpráva otevírala. */
function markSent(row) {
  const sheet = SpreadsheetApp.getActiveSheet();
  sheet.getRange(row, activeButton_(sheet).column).setBackground(SENT_COLOR);
  return 'ano';
}

function renderTemplate(body, contact) {
  const today = Utilities.formatDate(
    new Date(),
    SpreadsheetApp.getActive().getSpreadsheetTimeZone(),
    'd.M.yyyy'
  );
  const first = contact.firstName || contact.name || '';

  let meeting = '';
  if (contact.row) {
    meeting = String(
      SpreadsheetApp.getActiveSheet().getRange(contact.row, MEETING_COLUMN).getDisplayValue() || ''
    ).trim();
  }

  return String(body)
    .replace(/\{jmeno1\}/g, first)
    .replace(/\{jmeno\}/g, vocative_(first))
    .replace(/\{termin\}/g, meeting)
    .replace(/\{cas\}/g, timeOnly_(meeting))
    .replace(/\{poznamka\}/g, contact.note || '')
    .replace(/\{datum\}/g, today);
}

// Z "Čtvrtek 17.9 od 15:00" udělá "15:00", z "11.9. 5pm" udělá "5pm".
function timeOnly_(text) {
  const value = String(text || '').trim();
  if (!value) return '';

  // 15:00 - checked first, so a date like 17.09.2026 cannot be mistaken for it
  const clock = value.match(/\d{1,2}:\d{2}/);
  if (clock) return clock[0];

  // 5pm
  const ampm = value.match(/\d{1,2}\s*[ap]\.?m\.?/i);
  if (ampm) return ampm[0].replace(/\s+/g, '');

  // "v 9.30" / "od 9.30" - a dot form only where a preposition marks it as a
  // time, otherwise 17.09 in a date would match
  const dotted = value.match(/\b(?:v|od)\s+(\d{1,2})\.(\d{2})(?!\d)/i);
  if (dotted) return dotted[1] + ':' + dotted[2];

  // 18h
  const hour = value.match(/\d{1,2}\s*h(od)?\b/i);
  if (hour) return hour[0];

  return value;
}

// --- spouštěče --------------------------------------------------------------

function installPanelTrigger() {
  const spreadsheet = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'onCheckboxEdit') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('onCheckboxEdit').forSpreadsheet(spreadsheet).onEdit().create();
  SpreadsheetApp.getUi().alert('Hotovo. Kliknutí do políčka teď otevře panel.');
}

function installAutoFillTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'fillMissingCheckboxes') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('fillMissingCheckboxes').timeBased().everyMinutes(5).create();
  SpreadsheetApp.getUi().alert('Hotovo. Nové kontakty dostanou políčka samy, do pěti minut.');
}

function onCheckboxEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const row = e.range.getRow();
  if (row <= CONFIG.headerRow) return;
  if (e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return;

  const edited = e.range.getColumn();
  const button = buttonForColumn_(sheet, edited);

  if (button) {
    if (e.range.getValue() !== true) return;
    e.range.uncheck();
    // Panel si podle toho vybere šablonu a ví, které políčko zezelenit.
    PropertiesService.getUserProperties().setProperty('activeButtonColumn', String(button.column));
    showSidebar();
    return;
  }

  const columns = findColumns_(sheet);
  if (columns.phone && edited === columns.phone) {
    buttonColumns_(sheet).forEach(function (each) {
      writeButtonForRow_(sheet, row, columns, each);
    });
  }
}

function fillMissingCheckboxes() {
  SpreadsheetApp.getActive().getSheets().forEach(function (sheet) {
    const columns = findColumns_(sheet);
    if (!columns.phone) return;

    const count = sheet.getLastRow() - CONFIG.headerRow;
    if (count < 1) return;

    const headers = sheet
      .getRange(CONFIG.headerRow, 1, 1, Math.max(sheet.getLastColumn(), 1))
      .getDisplayValues()[0];
    const phones = sheet.getRange(CONFIG.headerRow + 1, columns.phone, count, 1).getDisplayValues();

    buttonColumns_(sheet).forEach(function (button) {
      // Jen tam, kde sloupec s tou hlavičkou opravdu je - jinak by se založil
      // na jiném listu, kde nemá co dělat.
      const present = headers.filter(function (header) {
        return simplify_(header) === simplify_(button.header);
      }).length;
      if (!present) return;

      const states = sheet
        .getRange(CONFIG.headerRow + 1, button.column, count, 1)
        .getBackgrounds();

      for (let i = 0; i < count; i++) {
        const background = String(states[i][0]).toLowerCase();
        const has =
          background === PENDING_COLOR.toLowerCase() || background === SENT_COLOR.toLowerCase();
        if (has) continue;
        if (normalizePhone_(phones[i][0]).length < 9) continue;
        writeButtonForRow_(sheet, CONFIG.headerRow + 1 + i, columns, button);
      }
    });
  });
}

// --- skloňování -------------------------------------------------------------

function vocative_(name) {
  const word = String(name || '').trim();
  if (word.length < 2) return word;

  const key = word.toLowerCase();
  if (VOCATIVE_EXCEPTIONS[key]) return VOCATIVE_EXCEPTIONS[key];

  const stem = function (cut) {
    return word.slice(0, word.length - cut);
  };

  // Jana -> Jano, Honza -> Honzo
  if (/[aá]$/.test(key)) return stem(1) + 'o';
  // Marie, Lucie, Jiří, Ivo - already in the right shape
  if (/[eéiíyýoóuúů]$/.test(key)) return word;
  // Marek -> Marku, Vašek -> Vašku, Zdeněk -> Zdeňku
  if (/[eě]k$/.test(key)) {
    let base = stem(2);
    if (key.charAt(key.length - 2) === 'ě' && /n$/.test(base)) base = base.slice(0, -1) + 'ň';
    return base + 'ku';
  }
  // Pavel -> Pavle
  if (/el$/.test(key)) return stem(2) + 'le';
  // Vojtěch -> Vojtěchu, Dominik -> Dominiku
  if (/[kgh]$/.test(key)) return word + 'u';
  // Tomáš -> Tomáši, Ondřej -> Ondřeji, Denis -> Denisi
  if (/[cjsřščťžďň]$/.test(key)) return word + 'i';
  // Martin -> Martine, David -> Davide
  return word + 'e';
}

function testSklonovani() {
  ['Martin', 'Jana', 'Lukáš', 'Petr', 'Marek', 'Kateřina'].forEach(function (name) {
    Logger.log(name + ' -> ' + vocative_(name));
  });
}

// --- pomocné ----------------------------------------------------------------

function findColumns_(sheet) {
  const width = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(CONFIG.headerRow, 1, 1, width).getDisplayValues()[0];
  const found = { name: 0, phone: 0, note: 0, status: 0 };

  const saved = readSavedMap_(sheet);
  Object.keys(found).forEach(function (field) {
    const value = Number(saved[field]);
    if (value > 0 && value <= width) found[field] = value;
  });

  headers.forEach(function (header, index) {
    const key = simplify_(header);
    if (!key) return;
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

function simplify_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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
    value = CONFIG.defaultCountryCode + value.replace(/^0+/, '');
  }

  return value.replace(/\D/g, '');
}

function firstName_(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || '';
}

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
