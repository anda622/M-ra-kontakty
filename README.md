# WhatsApp follow-up po telefonátu

Odesílání WhatsApp zprávy kontaktu z Google Sheets hned po hovoru.

## Jaké jsou možnosti

| | Jak to funguje | Klikání | Cena | Nároky na nastavení | Riziko |
|---|---|---|---|---|---|
| **A. Click-to-chat odkaz** (v tomto repu) | Skript v tabulce vygeneruje `wa.me` odkaz s předvyplněnou zprávou, otevře se WhatsApp Web / aplikace, vy jen zmáčknete Odeslat | 2 kliknutí na kontakt | zdarma | 10 minut, žádný účet navíc | žádné |
| **B. WhatsApp Business Cloud API** (Meta) | Skript zavolá oficiální API a zprávu odešle sám | 0 – spustí se změnou stavu v tabulce | platí se za zprávu, servisní zprávy v 24h okně zdarma | Meta Business účet, ověření firmy, **samostatné telefonní číslo**, schválené šablony | žádné, je to oficiální cesta |
| **C. Poskytovatel (Twilio, 360dialog, Infobip…)** | Totéž co B, ale registraci u Mety vyřídí poskytovatel | 0 | cena Mety + marže poskytovatele | jednodušší než B, pořád samostatné číslo | žádné |
| **D. Zapier / Make / n8n** | Tabulka → hotový konektor na WhatsApp (pod kapotou B nebo C) | 0 | předplatné + cena zpráv | bez programování, ale pořád účet u B/C | žádné |
| **E. Neoficiální knihovny** (whatsapp-web.js, Baileys, „levné WhatsApp API“) | Automatizují váš osobní WhatsApp přes reverzně vytvořeného klienta | 0 | zdarma / levné | běžící server, časté rozbití při aktualizaci | **porušuje podmínky WhatsAppu, číslo může být zablokováno** – nedoporučuji |

### Co doporučuju

**Začněte s A.** Na seznam kontaktů, který procházíte telefonicky, je to naprosto dostačující: zpráva je připravená včetně jména a poznámky, vy ji jen zkontrolujete a odešlete ze svého normálního čísla. Žádné schvalování šablon, žádné riziko blokace, funguje to dnes.

**Na B/C přejděte, až vám bude vadit to jedno kliknutí** – tedy když budete posílat desítky zpráv denně, nebo když má zpráva odejít bez vaší přítomnosti. Zásadní háček: číslo napojené na Cloud API **už nejde používat v běžné aplikaci WhatsApp**, potřebujete tedy druhé číslo. Kód pro tuhle variantu je připravený v `apps-script/CloudApi.gs`, stačí doplnit přístupové údaje.

**D** dává smysl, jen pokud nechcete sahat na kód – jinak přidává předplatné za něco, co těch pár řádků v `CloudApi.gs` udělá taky.

## Varianta A – instalace (10 minut)

1. V tabulce: **Rozšíření → Apps Script**.
2. Do editoru zkopírujte obsah souborů ze složky `apps-script/`:
   - `Code.gs` → soubor `Kód.gs`
   - `Sidebar.html` → nový soubor typu HTML pojmenovaný `Sidebar`
   - `CloudApi.gs` → jen pokud budete chtít variantu B (jinak vynechte)
3. Uložte a zavřete editor, tabulku načtěte znovu (F5).
4. V menu přibude **WhatsApp**. Klikněte na **WhatsApp → Zkontrolovat nastavení** – ukáže, které sloupce skript našel. Když některý chybí, buď přejmenujte hlavičku sloupce, nebo přidejte její název do `COLUMN_ALIASES` v `Code.gs`.
5. **WhatsApp → Otevřít panel**. Klikněte na řádek kontaktu, vyberte šablonu, případně text upravte a dejte **Otevřít WhatsApp**. Do sloupce `WhatsApp odesláno` se zapíše čas.

### Co skript očekává od tabulky

Nic zvláštního – hlavičky v prvním řádku a sloupec s telefonem. Rozpozná běžné názvy (`Jméno`, `Telefon`, `Mobil`, `Poznámka`, `Stav`, anglické varianty, na diakritice a velikosti písmen nezáleží). Sloupec `WhatsApp odesláno` si vytvoří sám.

Telefonní čísla si srovná sám: `+420 777 123 456`, `00420777123456` i `777 123 456` skončí jako `420777123456`. Čísla bez předvolby bere jako česká – jiná země se nastaví v `CONFIG.defaultCountryCode`.

### Šablony zpráv

Jsou v `Code.gs` v poli `TEMPLATES`, klidně je přepište. V textu můžete použít `{jmeno}`, `{poznamka}` a `{datum}`.

## Varianta B – co je potřeba navíc

1. Meta Business účet, WhatsApp Business app, ověření firmy.
2. Samostatné telefonní číslo pro API.
3. Schválená šablona zprávy – zpráva, kterou zahajujete vy (ne odpověď do 24 hodin od zprávy zákazníka), musí být šablona schválená Metou. Aktuální pravidla a ceník: <https://developers.facebook.com/docs/whatsapp/pricing>.
4. V Apps Scriptu **Nastavení projektu → Vlastnosti skriptu** vyplnit `WHATSAPP_TOKEN` a `WHATSAPP_PHONE_NUMBER_ID` (volitelně `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANG`).
5. Spustit jednou funkci `installEditTrigger()`. Od té chvíle se zpráva odešle sama, jakmile ve sloupci `Stav` nastavíte `zavoláno`.

## Na co si dát pozor

- **Souhlas a GDPR.** Reakce na hovor, který si člověk vyžádal, je v pohodě. Hromadné obchodní sdělení lidem, kteří o něj nepožádali, v pohodě není – u varianty B navíc Meta blokuje účty, které sbírají stížnosti.
- **24hodinové okno.** U oficiálního API smíte volný text posílat jen 24 hodin od poslední zprávy od protistrany. Mimo to jen schválené šablony. U varianty A tohle neřešíte, protože píšete ručně ze svého účtu.
- **Záloha.** Skript zapisuje jen do sloupce s časem odeslání, ale než ho pustíte na ostrá data, udělejte si kopii tabulky.
