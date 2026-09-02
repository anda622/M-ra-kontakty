# WhatsApp follow-up po telefonátu

Řetězec, o který jde:

```
inzerát (formulář)  →  Google Sheets  →  tlačítko u řádku  →  WhatsApp zpráva
     Webhook.gs         tahle tabulka      CloudApi.gs        z jednoho čísla
```

Tabulka: <https://docs.google.com/spreadsheets/d/1vW3h5mdPgMT1eUcgI4u66yW4Ry-KSaR64SuwPxuXriY/edit>

Skript umí dva režimy odesílání. Dají se používat vedle sebe:

- **Panel (zdarma, hned).** Kliknete na řádek, v postranním panelu vyberete
  šablonu a otevře se WhatsApp s předvyplněnou zprávou – odeslání potvrdíte vy.
  Soubory `Code.gs`, `Sidebar.html`, `Columns.html`.
- **Tlačítko u řádku (plně automatické).** Ve sloupci `Odeslat` je u každého
  kontaktu zaškrtávátko. Zaškrtnete → zpráva odejde sama, z jednoho firemního
  čísla, WhatsApp se vůbec neotevře. Soubory `CloudApi.gs`, `Api.html`.
  **Vyžaduje účet u Mety a samostatné telefonní číslo – viz níže.**

## Co musí být splněné pro tlačítko

Tohle není volba skriptu, tak to má nastavené WhatsApp. Automaticky odesílat
zprávy smí jen oficiální **WhatsApp Business Cloud API**:

1. **Samostatné telefonní číslo.** Číslo napojené na API už nejde používat
   v běžné aplikaci WhatsApp. Nemůže to tedy být vaše číslo, ze kterého píšete
   ručně – potřebujete druhé (stačí levná SIM nebo pevná linka, musí jen umět
   přijmout ověřovací kód).
2. **Meta Business účet + ověření firmy.** Ověření trvá řádově dny.
3. **Schválená šablona zprávy.** Zprávu, kterou začínáte vy, nelze poslat jako
   volný text – musí to být šablona předem schválená Metou, s proměnnými typu
   `{{1}}` pro jméno. Schvalování bývá do pár hodin.
4. **Platba za zprávu.** Ceník: <https://developers.facebook.com/docs/whatsapp/pricing>.

Volný text můžete poslat jen do 24 hodin od chvíle, kdy vám člověk napsal.
Po hovoru, který jste iniciovala vy, to okno otevřené není → šablona.

> **Tip k inzerátu:** pokud teprve chystáte kampaň, zvažte reklamu typu
> **Click to WhatsApp**. Člověk z inzerátu napíše prvně on, čímž se otevře
> 24hodinové okno – pak můžete posílat běžný text bez schvalování šablon.

**Čemu se vyhnout:** služby a knihovny, které „automatizují běžný WhatsApp“
(whatsapp-web.js, Baileys, různá levná „WhatsApp API“). Porušují podmínky
WhatsAppu a vaše číslo může skončit zablokované.

## Instalace

V tabulce **Rozšíření → Apps Script**, pak vytvořte soubory podle toho, co
chcete používat. Názvy HTML souborů musí sedět přesně – skript je podle nich
hledá.

| Soubor | V editoru | K čemu |
|---|---|---|
| `Code.gs` | přepsat stávající `Kód.gs` | základ, menu, panel – **povinné** |
| `Sidebar.html` | + → HTML, název `Sidebar` | panel s předvyplněnou zprávou |
| `Columns.html` | + → HTML, název `Columns` | výběr sloupců |
| `CloudApi.gs` | + → Skript, název `CloudApi` | tlačítka a automatické odesílání |
| `Api.html` | + → HTML, název `Api` | zadání přístupových údajů k API |
| `Webhook.gs` | + → Skript, název `Webhook` | příjem kontaktů z inzerátu |

Uložte, tabulku načtěte znovu (F5) – v menu přibude **WhatsApp**. Při prvním
spuštění Google požádá o oprávnění: **Rozšířené → Přejít na (název projektu) →
Povolit**.

### 1. Sloupce

**WhatsApp → Nastavit sloupce.** Skript se je pokusí najít sám podle hlaviček
(`Jméno`, `Telefon`, `Mobil`, `Poznámka`, `Stav` i anglicky, na diakritice
nezáleží), v dialogu to můžete přepsat. Povinný je jen **Telefon**.

Čísla si skript srovná sám: `+420 777 123 456`, `00420777123456` i
`777 123 456` skončí jako `420777123456`. Čísla bez předvolby bere jako česká
(`CONFIG.defaultCountryCode` v `Code.gs`).

### 2. Panel (zdarma)

**WhatsApp → Otevřít panel.** Klikněte na řádek kontaktu, vyberte šablonu,
text upravte a dejte **Otevřít WhatsApp**. Šablony jsou v `Code.gs` v poli
`TEMPLATES`, značky `{jmeno}`, `{poznamka}`, `{datum}`.

Přepínač **Otevírat v**: *WhatsApp Web* jde rovnou do chatu (vyžaduje jednou
naskenovat QR kód), *aplikace (wa.me)* předá zprávu desktopové nebo mobilní
aplikaci.

### 3. Tlačítka u řádků (automatické odesílání)

1. **WhatsApp → Automatické odesílání – nastavení** a vyplňte přístupový token,
   phone number ID, název schválené šablony a její jazyk. Ukládá se to do
   skriptu, ne do tabulky, takže to nikdo, kdo tabulku vidí, nepřečte.
   Tlačítkem **Odeslat test** ověříte, že to chodí.
2. **WhatsApp → Vytvořit tlačítka Odeslat** – přidá sloupec `Odeslat`
   se zaškrtávátky a nainstaluje spouštěč.
3. Po hovoru zaškrtnete políčko u kontaktu. Zpráva odejde, do sloupce
   `WhatsApp odesláno` se zapíše čas (nebo důvod chyby) a zaškrtávátko se zase
   samo vypne, aby šlo poslat znovu.

Které údaje z řádku doplní `{{1}}`, `{{2}}` v šabloně, se nastavuje v
`AUTO_SEND.templateParameterFields` v `CloudApi.gs` (výchozí: křestní jméno).
Když chcete odesílat změnou sloupce `Stav` místo zaškrtávátka, přepněte tam
`useStatusTrigger` na `true`.

### 4. Kontakty z inzerátu

`Webhook.gs` udělá z tabulky adresu, na kterou může formulář posílat nové
kontakty – ty pak naskakují jako nové řádky.

1. **WhatsApp → Webhook pro inzerát** – zobrazí klíč.
2. V editoru skriptu **Nasadit → Nové nasazení → Webová aplikace**,
   *Spustit jako: já*, *Kdo má přístup: kdokoli*.
3. Vzniklou adresu (končí `/exec`) vložte do inzerátu jako webhook a připojte
   klíč: `...exec?key=VÁŠ_KLÍČ`.

Přijímá JSON i běžný formulář, pole `name` / `phone` / `note` (nebo `jmeno`,
`telefon`, `poznamka`, nebo přesné názvy sloupců tabulky) a nativní formát
formulářů Google Ads. Stejné číslo podruhé nezaloží.

Podle toho, kde inzerujete:

| Kde | Jak se to spojí |
|---|---|
| **Google Ads** (formulářové rozšíření) | Webhook přímo, adresa a klíč z bodů výše. Nic dalšího netřeba. |
| **Facebook / Instagram lead ads** | Meta neumí posílat přímo do tabulky. Potřebujete mezičlánek – Zapier, Make nebo n8n (trigger *Facebook Lead Ads* → tenhle webhook nebo rovnou řádek v tabulce). |
| **Vlastní web / landing page** | Formulář posílá POST na tuhle adresu. |
| **Google Forms** | Nejjednodušší – formulář zapisuje do tabulky sám, `Webhook.gs` není potřeba. |

## Kdyby něco nefungovalo

| Co vidíte | Co s tím |
|---|---|
| V menu není **WhatsApp** | Načtěte tabulku znovu (F5). |
| „Nenašla jsem sloupec s telefonem“ | **WhatsApp → Nastavit sloupce**. |
| Ve sloupci odesláno `CHYBA: nenastavené API` | Chybí token nebo phone number ID. |
| `CHYBA: 131030` nebo „not in allowed list“ | Testovací režim Mety umí psát jen na čísla, která si přidáte do seznamu příjemců. |
| `CHYBA: 132001` | Šablona s tímhle názvem nebo jazykem neexistuje / není schválená. |
| `CHYBA: 401` nebo `190` | Vypršel token. Dočasný token z dashboardu platí 24 hodin – použijte trvalý token systémového uživatele. |
| Zaškrtnutí nic neudělá | Spusťte **Vytvořit tlačítka Odeslat** znovu, nainstaluje spouštěč. |
| Z inzerátu nic nepřichází | Klíč v adrese, nasazení jako *kdokoli*, a formulář musí posílat telefonní číslo. |

## Na co si dát pozor

- **Souhlas a GDPR.** Člověk, který sám vyplnil formulář a čeká, že se ozvete,
  je v pořádku. Zprávy lidem, kteří o ně nepožádali, ne – a Meta blokuje účty,
  na které chodí stížnosti.
- **Záloha.** Než skript pustíte na ostrá data, **Soubor → Vytvořit kopii**.
