# WhatsApp follow-up po telefonátu

Skript pro Google Sheets. Po hovoru kliknete na řádek kontaktu, vyberete
šablonu a otevře se WhatsApp s už napsanou zprávou pro dané číslo – vy jen
zkontrolujete text a dáte Odeslat. Do tabulky se zapíše čas.

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

Uložte, tabulku načtěte znovu (F5) – v menu přibude **WhatsApp**.

### Když už v projektu nějaký skript je

Nic nepřepisujte. Stávající `Kód.gs` nechte být a `Code.gs` vložte jako **nový
soubor** (**+ → Skript**, například `WhatsApp`). Soubory v Apps Scriptu sdílí
jeden prostor, takže spolu fungují.

Skript nepoužívá žádný z běžných názvů, které mívá příjem dat z webu
(`doPost`, `doGet`, `json`), takže ke kolizi nedojde. Kdyby přece jen měl
projekt funkci se stejným názvem jako některá zdejší, Apps Script si vezme tu
poslední – proto po vložení zkontrolujte, že se ta původní část pořád chová,
jak má.

Když do tabulky zapisuje nějaký `doPost` z webového formuláře, přidejte si za
jeho `appendRow(...)` tenhle řádek, ať má nový lead odkaz hned:

```js
try { writeLinkForRow_(sheet, sheet.getLastRow(), findColumns_(sheet)); } catch (linkError) {}
```

Je schválně v `try`, aby případná chyba v odkazu nikdy neshodila příjem leadů. Při prvním
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

## Odkaz ve sloupci I

Vaše data zůstanou v A–H beze změny. **WhatsApp → Vytvořit odkazy ve sloupci I**
doplní do každého řádku odkaz **Napsat** – kliknutím se otevře WhatsApp s už
napsanou zprávou pro to číslo.

- Odkaz používá první šablonu z `TEMPLATES` (nastavuje se v
  `CONFIG.linkTemplateIndex`). Když chcete jinou šablonu nebo text upravit,
  použijte panel.
- Když v řádku opravíte telefon, jméno nebo poznámku, odkaz se sám přepíše.
  Po přidání nových řádků spusťte **Vytvořit odkazy** znovu.
- Řádek bez použitelného čísla zůstane prázdný.
- Odkaz v buňce míří na `wa.me` – na Macu z něj jedním kliknutím naskočí
  aplikace WhatsApp. Přímou adresu `whatsapp://` buňka tabulky nepřijme
  („Neplatný argument“), ale v panelu funguje: tam si ji vyberete přepínačem
  **Otevírat v → aplikaci na Macu** a aplikace se otevře rovnou.
- Jiný sloupec než I nastavíte v `CONFIG.linkColumn` (9 = I). Když už ve
  sloupci něco je, skript to nepřepíše a upozorní vás.
- Políčko **Napsat** je zároveň stav kontaktu: **červené** = ještě jste
  nepsala, **zelené** = zpráva odešla. Žádný sloupec s časem není potřeba.

## Jak se to používá přes panel

**WhatsApp → Otevřít panel.**

1. Zavoláte kontaktu.
2. Kliknete na jeho řádek – panel se sám přepne na ten řádek. Nebo použijte
   **Další nekontaktovaný ▸**, který skočí na první kontakt bez odeslané
   zprávy.
3. Vyberete šablonu, doplníte, co jste si domluvili.
4. **Otevřít WhatsApp** → otevře se karta s předvyplněnou zprávou →
   **Odeslat**. Do sloupce `WhatsApp odesláno` se zapíše čas a ukazatel dole
   v panelu se posune.

Sloupec `WhatsApp odesláno` si skript vytvoří sám na konci tabulky (za sloupcem
s odkazy, tedy obvykle J). Do ničeho jiného nezapisuje – sloupců A až H se
nedotkne.

Přepínač **Otevírat v**:

- **WhatsApp Web** – jde rovnou do chatu. Vyžaduje jednou naskenovat QR kód
  (WhatsApp v telefonu → Nastavení → Propojená zařízení). O kliknutí míň.
- **aplikace (wa.me)** – předá zprávu desktopové nebo mobilní aplikaci,
  zobrazí mezikrok „Pokračovat do chatu“.

### Šablony zpráv

V `Code.gs` v poli `TEMPLATES`. Přepište je podle sebe, přidat můžete
libovolný počet. Značky se doplní z řádku:

| Značka | Co doplní |
|---|---|
| `{jmeno}` | křestní jméno v 5. pádu – *Martine*, *Jano*, *Lukáši* |
| `{jmeno1}` | křestní jméno tak, jak je v tabulce – *Martin* |
| `{poznamka}` | obsah sloupce s poznámkou |
| `{termin}` | domluvený termín ze sloupce G (`MEETING_COLUMN`) |
| `{datum}` | dnešní datum |

Skloňování je odhad podle koncovky, ne slovník. Jméno, které netrefí, dopište
do tabulky `VOCATIVE_EXCEPTIONS` v `Code.gs` – klíč malými písmeny, hodnota
přesně tak, jak se má napsat. Po úpravě soubor uložte a tabulku načtěte znovu.

## Žluté zvýraznění den před schůzkou

Termín ve sloupci G je volný text (*„Pátek 18.9 od 16:00"*, *„11.9. 5pm"*),
takže se nedá filtrovat jako datum. Zvýraznění řeší podmíněné formátování –
žádný skript, žádný trigger, obarví se hned a ručně nastavené barvy v G
nepřepíše natrvalo.

Označte `G2:G`, **Formát → Podmíněné formátování → Vlastní vzorec je**:

```
=IFERROR(DATEVALUE(REGEXEXTRACT($G2;"\d{1,2}\.\s*\d{1,2}")&"."&YEAR(TODAY()))=TODAY()+1;NEPRAVDA)
```

Výplň žlutá. `REGEXEXTRACT` vytáhne z textu první `den.měsíc`, doplní se
letošní rok a porovná se se zítřkem. Pokud má tabulka anglické locale,
oddělovač argumentů je čárka a místo `NEPRAVDA` patří `FALSE`.

Volitelné druhé pravidlo pro dnešní schůzky – stejný vzorec s `=TODAY()`
místo `=TODAY()+1` a jiná barva.

Omezení: rok se bere z dneška, takže 31. 12. se schůzka na 1. 1. nezvýrazní.

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
| Po autorizaci se dialog neotevřel | Google prvním povolením akci přeruší a sám ji nedokončí. Klikněte na tu položku v menu znovu. |
| V menu není **WhatsApp** | Načtěte tabulku znovu (F5); menu se přidává při otevření tabulky. |
| „Nenašla jsem sloupec s telefonem“ | **WhatsApp → Nastavit sloupce** a vyberte sloupec ručně. |
| „Neplatné číslo“ | Číslo v buňce je kratší než 9 číslic nebo je v buňce text (třeba dvě čísla najednou). |
| Otevře se WhatsApp Web s QR kódem | Naskenujte ho v telefonu, WhatsApp → Nastavení → Propojená zařízení. |
| Zpráva se otevře prázdná | Číslo nemá WhatsApp, nebo prohlížeč zablokoval vyskakovací okno. |
| Panel ukazuje starý řádek | Obnovuje se po dvou sekundách, nebo dejte **Načíst vybraný řádek**. |
| Odkaz ve sloupci I chybí u nového řádku | Spusťte **Vytvořit odkazy ve sloupci I** znovu. |
| „Sloupec I už obsahuje…“ | Ve sloupci I máte data. Uvolněte ho, nebo změňte `CONFIG.linkColumn` v `Code.gs`. |
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
