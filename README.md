# WhatsApp follow-up po telefonátu

Skript pro Google Sheets. Po hovoru kliknete na řádek kontaktu, vyberete
šablonu a otevře se WhatsApp s už napsanou zprávou pro dané číslo – vy jen
zkontrolujete text a dáte Odeslat. Do tabulky se zapíše čas.

Tabulka: <https://docs.google.com/spreadsheets/d/1vW3h5mdPgMT1eUcgI4u66yW4Ry-KSaR64SuwPxuXriY/edit>

**Zdarma. Žádné API, žádný účet u Mety, žádné externí služby.** Píše se
z vašeho běžného WhatsAppu a vaše číslo zůstane normálně používatelné
v aplikaci – skript se ho nijak nedotkne.

## Instalace

V tabulce **Rozšíření → Apps Script** a vytvořte tři soubory. Názvy HTML
souborů musí sedět přesně, skript je podle nich hledá.

| Soubor v `apps-script/` | Kam v editoru |
|---|---|
| `Code.gs` | přepsat stávající `Kód.gs` |
| `Sidebar.html` | **+ → HTML**, název `Sidebar` |
| `Columns.html` | **+ → HTML**, název `Columns` |

Uložte, tabulku načtěte znovu (F5) – v menu přibude **WhatsApp**. Při prvním
spuštění Google požádá o oprávnění: **Rozšířené → Přejít na (název projektu) →
Povolit**. Skript vidí jen tuhle tabulku a otevírá odkazy, nikam nic neposílá.

### Nastavení sloupců

**WhatsApp → Nastavit sloupce.** Skript je zkusí najít sám podle hlaviček
(`Jméno`, `Telefon`, `Mobil`, `Poznámka`, `Stav` i anglicky, na diakritice
a velikosti písmen nezáleží); v dialogu to můžete přepsat. Povinný je jen
**Telefon**. Nastavení se pamatuje zvlášť pro každý list.

Čísla si skript srovná sám: `+420 777 123 456`, `00420777123456`
i `777 123 456` skončí jako `420777123456`. Čísla bez předvolby bere jako
česká (`CONFIG.defaultCountryCode` v `Code.gs`).

## Jak se to používá

**WhatsApp → Otevřít panel.**

1. Zavoláte kontaktu.
2. Kliknete na jeho řádek – panel se sám přepne na ten řádek. Nebo použijte
   **Další nekontaktovaný ▸**, který skočí na první kontakt bez odeslané
   zprávy.
3. Vyberete šablonu, doplníte, co jste si domluvili.
4. **Otevřít WhatsApp** → otevře se karta s předvyplněnou zprávou →
   **Odeslat**. Do sloupce `WhatsApp odesláno` se zapíše čas a ukazatel dole
   v panelu se posune.

Sloupec `WhatsApp odesláno` si skript vytvoří sám na konci tabulky. Do ničeho
jiného nezapisuje.

Přepínač **Otevírat v**:

- **WhatsApp Web** – jde rovnou do chatu. Vyžaduje jednou naskenovat QR kód
  (WhatsApp v telefonu → Nastavení → Propojená zařízení). O kliknutí míň.
- **aplikace (wa.me)** – předá zprávu desktopové nebo mobilní aplikaci,
  zobrazí mezikrok „Pokračovat do chatu“.

### Šablony zpráv

V `Code.gs` v poli `TEMPLATES`. Přepište je podle sebe, přidat můžete
libovolný počet. Značky `{jmeno}` (křestní jméno), `{poznamka}` a `{datum}`
se doplní z řádku. Po úpravě soubor uložte a tabulku načtěte znovu.

## Co tenhle nástroj nedělá

**Neodešle zprávu úplně sám** – poslední kliknutí je vždycky vaše. Není to
omezení skriptu: WhatsApp nedovolí automatické odesílání jinak než přes placené
WhatsApp Business Cloud API, které navíc vyžaduje samostatné telefonní číslo
(číslo napojené na API přestane fungovat v běžné aplikaci WhatsApp).

Službám a knihovnám, které slibují automatizaci běžného WhatsAppu
(whatsapp-web.js, Baileys, levná „WhatsApp API“), se vyhněte – porušují
podmínky WhatsAppu a číslo může skončit zablokované.

## Kdyby něco nefungovalo

| Co vidíte | Co s tím |
|---|---|
| V menu není **WhatsApp** | Načtěte tabulku znovu (F5); menu se přidává při otevření tabulky. |
| „Nenašla jsem sloupec s telefonem“ | **WhatsApp → Nastavit sloupce** a vyberte sloupec ručně. |
| „Neplatné číslo“ | Číslo v buňce je kratší než 9 číslic nebo je v buňce text (třeba dvě čísla najednou). |
| Otevře se WhatsApp Web s QR kódem | Naskenujte ho v telefonu, WhatsApp → Nastavení → Propojená zařízení. |
| Zpráva se otevře prázdná | Číslo nemá WhatsApp, nebo prohlížeč zablokoval vyskakovací okno. |
| Panel ukazuje starý řádek | Obnovuje se po dvou sekundách, nebo dejte **Načíst vybraný řádek**. |
| „Hotovo – všem kontaktům…“ | Všechny řádky s platným číslem už mají čas ve sloupci odesláno. |

## Na co si dát pozor

- **Souhlas a GDPR.** Navázat zprávou na hovor, který člověk čekal, je
  v pořádku. Zprávy lidem, kteří o ně nepožádali, ne.
- **Záloha.** Než skript pustíte na ostrá data, **Soubor → Vytvořit kopii**.

---

## Příloha: soubory, které teď nepotřebujete

V repozitáři zůstávají pro případ, že by se situace změnila. **Do projektu je
nekopírujte** – dokud tam nejsou, menu je vůbec nenabídne.

- `CloudApi.gs` + `Api.html` – zaškrtávátko u řádku, které zprávu odešle samo.
  Vyžaduje WhatsApp Business Cloud API: samostatné telefonní číslo (nesmí být
  používané v běžné aplikaci), Meta Business účet s ověřením firmy, šablonu
  schválenou Metou a platbu za každou odeslanou zprávu.
- `Webhook.gs` – adresa, na kterou může inzertní formulář posílat nové
  kontakty jako řádky tabulky (JSON, běžný formulář i nativní formát Google
  Ads), chráněná klíčem, s přeskakováním duplicit.
