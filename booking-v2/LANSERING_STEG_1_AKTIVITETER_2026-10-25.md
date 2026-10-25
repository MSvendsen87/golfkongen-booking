# Første publisering – /aktiviteter (25.10.2026)

**Dette er en visuelt oppgradert aktivitetsside, IKKE full Booking 2.0 i produksjon.**

## Kan publiseres før Booking 2.0-integrasjonen
- Behold eksisterende produkt-/variantbooking, all regelkontroll, Quickbutik kasse, medlemsfordeler, Pushover, klubbtider og historikk uendret.
- Bytt kun selve innholdet på `https://golfkongen.no/aktiviteter` ved å lime inn isolert HTML/CSS i Quickbutiks sideeditor.
- Seksjonen har foto/kort for ny HYZR One (leverandørfoto, merket produktillustrasjon), dart (fra GolfKongens eksisterende Quickbutik-produktbilde) og leie hele lokalet (GolfKongens produktbilde).
- HYZR-leverandørfoto er tredjeparts materiale: **be om markedsføringstillatelse eller erstatt med eget foto fra installasjonen før offentlig publisering**. Ikke anta at et offentlig bilde kan fritt brukes.
- Aktivitetssiden lenker til dagens booking: `/sider/disc-booking`, `/sider/dart-booking`, `/sider/leie-hele-lokalet`, `/sider/klubbkveld-lyngdal-dart`.
- Kopier eksisterende sideinnhold til sikkerhetskopi før endring; test mobil og alle fire knapper; verifiser eksisterende rabatt i innlogget handlekurv. Rull tilbake ved feil.
- Ved denne første publiseringen må teksten **ikke** love nye 30-minuttersvarigheter før funksjonen faktisk finnes i produksjon. HTML'en har ingen prisutregning eller bookingkode.

## Må fortsatt gjøres før full Booking 2.0 publiseres
1. Sikker, serverbasert 30-minutters ressursallokering inkl. hele lokalet og dart A/B.
2. Verifisert Quickbutik checkout, inkludert alle sju eksisterende kundegrupper og 98 % ansattbookingrabatt.
3. Migrering av historiske betalte (ikke annullerte) bookinger og eksisterende stenginger.
4. Pushover-varsel per betalt booking, dokumentert test med eksisterende Make/Worker-kobling.
5. Ekte, rollebeskyttet admin med sperringer, priser, medlemmer og synkstatus.
6. Verifisert test- og rollback-rutine.

## Begrensning for ChatGPT-koblingen
Den aktive Quickbutik-koblingen i denne samtalen har produkter/ordre/bilder, men ikke redigering av Quickbutik-sider eller tema. Selve sideoppdateringen må derfor gjøres i Quickbutiks administrator eller gjennom en egnet UI-arbeidsflyt med brukerens godkjenning. Ingen liveendring utført av dette dokumentet.

## Eksisterende anbefalt design
Behold stilretningen fra `booking-v2-members-preview.html`, og administrasjonsdelen i separat admin-kontroll. En offentlig HTML-demo med falske bookinger skal aldri brukes som faktisk booking.
