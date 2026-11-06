# Booking 2.0 — innloggingsbaserte priser og rabatter

**Fast krav fra eier 24. oktober 2026:** Eksisterende prisordninger på GolfKongen skal overføres til det nye bookingsystemet. Brukeren nevner **ansattpriser**, **klubbpriser**, **Team GolfKongen-priser** og **flere andre aktive ordninger**. Listen er IKKE uttømmende.

## Prinsipp
- Pris for HYZR gjelder per simulator og tidsrom, ikke per spiller.
- Kundevisningen viser korrekt pris for **pålogget og autorisert kunde**; gjest ser ordinær pris, med mindre eksisterende praksis tilsier noe annet.
- Rabatt/medlemspris må komme fra den faktisk godkjente kundegruppen, og beregnes av betrodd server – aldri bare via Javascript, URL-parametere, localStorage eller en fritt valgt dropdown.
- Både full pris, gyldig kundegruppe/tilbud og faktisk kassebeløp skal stemme før booking bekreftes.
- Behold gjeldende priser og eksisterende rabattordninger inntil ny prisliste og migrering er testet/godkjent.

## Undersøk ved neste økt
1. Finn ALLE eksisterende kundegrupper/roller/rabattordninger i GolfKongen/Quickbutik, inklusive ansatte, klubber og Team GolfKongen – dette er eksempler, ikke full oversikt.
2. Kartlegg hvilke ordninger som gjelder HYZR, dart, hele lokalet, klubbkveld og eventuelle produkter/andre ytelser.
3. Kartlegg om en kunde kan tilhøre flere grupper, og hvordan eksisterende system velger rabatten (prioritet, beste pris, eksklusivitet og eventuell kombinasjon med kupong/gavekort). **Ikke finn opp ny rabattsammenlegging.**
4. Finn autoritativ kilde til kundelogin og gruppemedlemskap. Verifiser at medlemskapet ikke kan forfalskes, og at ingen får ansattpris ved bare å oppgi e-post.
5. Verifiser Quickbutiks rabatter og aktuell betalt ordre mot checkout-prisen. Spesialpriser, rabattkoder og gavekort kan gi forskjell mellom ordinær produktpris og faktisk betalt beløp.
6. Sjekk at admin kan forhåndsvise pris for ordinær kunde og hver kundegruppe, og at regler kan endres uten å svekke tilgangsstyring.
7. Test gjest, innlogget ordinær kunde, ansatt, klubbmedlem, Team GolfKongen, kunde med flere kvalifiserende grupper, rabattkode, gavekort, utløpt medlemskap og manipulert klientpris.
8. Ikke la nye prisregler overstyre allerede betalte bookinger. Eksisterende Pushover-varsel skal fortsette å vise riktig faktisk pris uten duplikater.

## Lanseringskrav
Booking 2.0 **kan ikke publiseres** før aktivt gruppesystem, alle eksisterende rabatter som gjelder booking, kundeidentifikasjon og prislogikk er kartlagt, implementert og testet i kontrollert betalingsflyt.

**Status:** Krav dokumentert. Dagens rabattregler og medlemskilde er IKKE ennå verifisert i detalj; ingen priser, roller eller integrasjoner er endret i produksjon.

## Verifisert fra Quickbutiks egne brukerveiledninger 25.10.2026
- `Innstillinger > Kunder og markedsføring` er stedet funksjonen Kundegrupper aktiveres, men eksisterende grupper finnes via `Kunder > Kundegrupper`.
- Kombinasjonen **Innloggingskonto + Kundegrupper** brukes for individuelle priser og andre kundegruppebegrensninger. Veiledning: https://quickbutik.com/no/hjelp/hvordan-oppretter-jeg-kundegrupper
- `Rabatter` er en separat menydel. Rabatter kan målrettes etter produkt, kategori eller hele ordre, og kan blant annet utelukke kundegrupper.
- Quickbutik sier at mer enn én aktiv rabatt på **hele ordren** kombineres; standardrabatt og rabattkode kan ikke kombineres på samme produkt; én rabattkode per ordre; rabatt på én bestemt variant støttes ikke i standard rabattfunksjon. Verifiser faktisk butikkinnstilling før implementering: https://quickbutik.com/no/hjelp/hvordan-oppretter-jeg-rabatter-i-quickbutik
- Dagens booking-JS legger varer i kassen med `/cart/add` og konkret `product_id` + `variant`, mens den viser pris fra produkt/variant. Frontenden har ikke en tydelig autoritativ kundegruppeutregning. **Ikke anta at synlig forhåndspris automatisk er kundens pris i kassen**.
- Neste konkrete, sikre steg: Eier viser liste over grupper i kontrollpanelet via skjermbilde (uten kundeopplysninger). Deretter kartlegges prisreglene og `Rabatter` (read-only), og til slutt testes korrekt checkout-beløp med innlogget testkonto.

## Bekreftet av eier 25.10.2026: alle sju eksisterende kundegrupper og fordeler

Tabellen er bekreftet av eieren og skjermbilde av Quickbutik-gruppene. Prisene er **ikke** verifisert med den virkelige kassen ennå.

| Eksisterende Quickbutik-kundegruppe | HYZR per time | Dart per time (A/B) | Hele lokalet | Utstyr i butikken |
| --- | --- | --- | --- | --- |
| Betalt disc medlemskap + dartklubb | 100 kr | 100 kr | Ordinær | 10 % på disc og dart |
| Team GolfKongen | 100 kr | Ordinær | Ordinær | 30 % på disc |
| Frisbee + Dart | 120 kr | 100 kr | Ordinær | 10 % på disc og dart |
| Ansatte | 98 % rabatt | 98 % rabatt | 98 % rabatt | 30 % på hele butikken |
| Ambassadører | 100 kr | Ordinær | Ordinær | 15 % på disc |
| Frisbeeklubber | 120 kr | Ordinær | Ordinær | 10 % på disc |
| Dartklubber | Ordinær | 100 kr | Ordinær | 10 % på dart |

**Ordinær** = ikke oppgitt en egen gruppespesialpris for aktiviteten; eksisterende generelle tilbud/rabattregler må fortsatt gjelde som før.

**Avgjørende:** Ansatte skal ha 98 % på *booking* (også hele lokalet), 30 % på butikkvarer; ikke automatisk stable 30 % og 98 % på samme booking. Gjenbruk eksisterende Quickbutik-kundegrupper og rabattordninger for utstyr; ikke lag en separat kopi av butikkens rabattmotor.

### Åpent før integrasjon
- Per-time-satser er avklart for 60 minutter. Må teste/avklare beregning for 30/90/120+ minutter, spesielt avrunding og minimumspris. Ikke gjett 30-minutterspriser.
- Flere gruppemedlemskap hos samme kunde: bekreft faktisk prioritet og kombinasjonsregler i Quickbutik.
- Særskilt klubbkveld/andre bookingprodukter: verifiser om de er del av «all booking» for ansatte.
- Vist pris før checkout må matche korrekt innlogget pris i handlekurven og betalt ordre, med gyldige rabattkoder/gavekort.
- Pushover må sende faktisk totalbeløp for bekreftet booking, ikke generell listepris.
- Gruppeidentifikasjon og pris valideres server-side mot Quickbutik; aldri stol på UI-valg, lokale variabler eller bare oppgitt e-post.

### Quickbutik-dokumentasjon
Quickbutik støtter generell grupperabatt og produktspesifikke priser. Produktspesifikk pris kan overstyre generell grupperabatt: https://quickbutik.com/no/hjelp/hvordan-tilpasser-jeg-priser-for-en-kundegruppe

Gruppespesifikk kampanjerabatt kan være synlig først i checkout: https://quickbutik.com/no/hjelp/hvordan-aktiverer-jeg-en-rabattkampanje-spesifikt-for-kundegruppe

### Neste verifikasjon i kontrollpanelet
1. Klikk rediger (blyant) på **Ansatte** i `Kunder > Kundegrupper`. Se kun generelt prisavslag og eventuelle spesifikke priser for bookingprodukter, uten kundedata.
2. Deretter åpne Team GolfKongen og Frisbeeklubber for et eksempel på hver timepris (100/120).
3. Se bookingproduktene 1316, 1317, 1320, 1349 samt rabattoversikten for mulige tilleggsregler. Ikke lagre eller endre noe ennå.
4. Etter verifisering velges egnet testkunde for en kontrollert checkout-test og Pushover-verifisering uten risiko for nye faktiske bookinger.
