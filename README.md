# WhatsApp follow-up po telefonátu

Skript pro Google Sheets: po hovoru kliknete na řádek kontaktu, vyberete šablonu
a otevře se WhatsApp s už napsanou zprávou pro dané číslo. Vy jen zkontrolujete
text a dáte Odeslat. Do tabulky se zapíše čas odeslání.

Tabulka: <https://docs.google.com/spreadsheets/d/1vW3h5mdPgMT1eUcgI4u66yW4Ry-KSaR64SuwPxuXriY/edit>

Zdarma, bez API klíčů, bez účtu u Mety, píše se z vašeho běžného čísla.
(Ostatní varianty včetně plně automatického odesílání jsou popsané níže.)

## Instalace (asi 10 minut)

1. V tabulce otevřete **Rozšíření → Apps Script**.
2. Vytvořte tři soubory a vložte do nich obsah ze složky `apps-script/`:
   - stávající `Kód.gs` (nebo `Code.gs`) přepište obsahem **`Code.gs`**
   - **+ → HTML**, název `Sidebar` → obsah **`Sidebar.html`**
   - **+ → HTML**, název `Columns` → obsah **`Columns.html`**

   Názvy souborů musí sedět přesně (`Sidebar`, `Columns`), skript je podle nich
   hledá. Příponu `.html` Apps Script doplní sám.
3. Uložte (ikona diskety) a tabulku načtěte znovu (F5). V menu přibude
   **WhatsApp**.
4. **WhatsApp → Nastavit sloupce.** Skript se pokusí sloupce najít sám podle
   názvů hlaviček; v dialogu uvidíte, co našel, a můžete to přepsat ručně.
   Povinný je jen **Telefon**, jméno a poznámka jsou volitelné.
5. **WhatsApp → Otevřít panel** a můžete začít.

### Při prvním spuštění

Google se zeptá na oprávnění. Protože je skript váš vlastní a není ověřený
Googlem, projděte: **Rozšířené → Přejít na (název projektu)** → **Povolit**.
Skript vidí jen tuhle tabulku a otevírá odkazy, nikam nic neposílá.

## Jak se to používá

1. Zavoláte kontaktu.
2. Kliknete na jeho řádek v tabulce – panel vpravo se sám přepne na ten řádek.
3. Vyberete šablonu, doplníte, co jste si domluvily.
4. **Otevřít WhatsApp** → otevře se nová karta s předvyplněnou zprávou →
   **Odeslat**. Do sloupce `WhatsApp odesláno` se zapíše čas.

Přepínač **Otevírat v** dole v panelu:

- **WhatsApp Web** – otevře přímo `web.whatsapp.com` (musíte mít v prohlížeči
  přihlášený WhatsApp Web, tj. jednou naskenovat QR kód v telefonu). O jedno
  kliknutí méně.
- **aplikace (wa.me)** – univerzální odkaz, který předá zprávu desktopové nebo
  mobilní aplikaci WhatsApp. Zobrazí mezikrok „Pokračovat do chatu“.

## Co skript očekává od tabulky

Hlavičky v prvním řádku a sloupec s telefonním číslem. Běžné názvy rozpozná sám
(`Jméno`, `Telefon`, `Mobil`, `Poznámka`, `Stav` i anglické varianty; na
diakritice a velikosti písmen nezáleží). Cokoliv jiného doladíte v dialogu
**Nastavit sloupce** – nastavení se pamatuje zvlášť pro každý list.

Sloupec `WhatsApp odesláno` si skript vytvoří sám na konci tabulky, pokud tam
ještě není. Do ničeho jiného nezapisuje.

Telefonní čísla si srovná sám: `+420 777 123 456`, `00420777123456`
i `777 123 456` skončí jako `420777123456`. Čísla bez předvolby bere jako česká,
jiná země se nastaví v `CONFIG.defaultCountryCode` v `Code.gs`.

## Šablony zpráv

Jsou v `Code.gs` v poli `TEMPLATES`. Přepište je podle sebe, přidat můžete
libovolný počet. V textu fungují zástupné značky `{jmeno}` (křestní jméno),
`{poznamka}` a `{datum}`. Po úpravě soubor uložte a tabulku načtěte znovu.

## Kdyby něco nefungovalo

| Co vidíte | Co s tím |
|---|---|
| V menu není **WhatsApp** | Načtěte tabulku znovu (F5); menu se přidává až při otevření tabulky. |
| „Nenašla jsem sloupec s telefonem“ | **WhatsApp → Nastavit sloupce** a vyberte sloupec ručně. |
| „Neplatné číslo“ | Číslo v buňce je kratší než 9 číslic nebo obsahuje text (třeba dvě čísla v jedné buňce). |
| Otevře se WhatsApp Web s QR kódem | Naskenujte ho v telefonu (WhatsApp → Nastavení → Propojená zařízení). |
| Zpráva se otevře prázdná | Číslo nemá WhatsApp, nebo prohlížeč zablokoval vyskakovací okno. |
| Panel ukazoval starý řádek | Panel se obnovuje po dvou sekundách, nebo klikněte na **Načíst vybraný řádek**. |

## Ostatní varianty (pro pozdější rozmyšlenou)

| | Jak to funguje | Klikání | Cena | Nároky na nastavení |
|---|---|---|---|---|
| **A. Click-to-chat** (tenhle skript) | Předvyplněná zpráva, odesíláte vy | 2 kliknutí | zdarma | 10 minut |
| **B. WhatsApp Business Cloud API** (Meta) | Skript zprávu odešle sám | 0 | platí se za zprávu | Meta Business účet, ověření firmy, **samostatné telefonní číslo**, schválené šablony |
| **C. Poskytovatel** (Twilio, 360dialog…) | Totéž co B, registraci vyřídí za vás | 0 | cena Mety + marže | jednodušší než B, pořád samostatné číslo |
| **D. Zapier / Make / n8n** | Hotový konektor, bez programování | 0 | předplatné + zprávy | pořád potřebuje účet u B nebo C |
| **E. Neoficiální knihovny** | Automatizují osobní WhatsApp | 0 | zdarma | **porušuje podmínky WhatsAppu, hrozí zablokování čísla – nedoporučuji** |

Kód pro variantu B je připravený v `apps-script/CloudApi.gs`. Nedělá nic, dokud
mu nedoplníte přístupové údaje – nemusíte ho vůbec kopírovat do projektu.
Hlavní háček: číslo napojené na Cloud API **už nejde používat v běžné aplikaci
WhatsApp**, potřebovala byste tedy druhé číslo.

## Na co si dát pozor

- **Souhlas a GDPR.** Navázat zprávou na hovor, který člověk čekal, je v pořádku.
  Hromadné obchodní sdělení lidem, kteří o něj nepožádali, v pořádku není.
- **Záloha.** Než skript pustíte na ostrá data, udělejte si kopii tabulky
  (**Soubor → Vytvořit kopii**).
