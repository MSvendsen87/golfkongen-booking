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
