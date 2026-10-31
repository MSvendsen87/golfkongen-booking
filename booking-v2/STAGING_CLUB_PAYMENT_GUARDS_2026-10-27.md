# Booking 2.0 staging – klubbbetaling, databasevakter og admin (27.10.2026)

## Endringer som ER installert
- `public.gk2_confirm_club_paid(uuid,text,integer)`: service-role-only, kontrollerer matchende 50 NOK/sete (øre), aktivt hold, ordre-ID og dartkonflikt; samme daglås, idempotent bekreftelse; krever server-side forhåndsverifisert Quickbutik-betaling fra caller. **Denne funksjonen verifiserer IKKE betalingen hos Quickbutik selv.**
- `public.gk2_cancel_club_enrolment(uuid,text)`: service-role-only, krever eksakt tilknyttet ordrenummer; samme daglås; idempotent kansellering. Caller må ha verifisert kanselleringen hos Quickbutik. Denne funksjonen sender ennå ikke Nuki-revokasjon.
- SQL rollback-test: feil beløp avvist, korrekt 2-seters betaling 100 NOK akseptert, idempotent duplikat, kansellering frigjør 2 seter. Alt rullet tilbake. 0 klubbpåmeldinger, 0 medlemsidentiteter, offentlige release-gates fremdeles stengt.
- Admin `docs/index.html` på utviklingsgren auto-laster klubbtilgang ved valg av Medlemmer-fanen, slik at nye kontrollene fra forrige commit faktisk viser medlemsoversikten. Commit `a165c32599f097bd454292b92de9b6a1ed0f51e1`.
- Staging API fortsatt v37. **Ingen webhook-kode for klubbordre ble deployet i denne arbeidsøkten.**

## Kritiske forutsetninger for å åpne checkout
1. Innlogget/sertifisert Quickbutik-kundeidentitet må knyttes til klubb-ID gjennom betrodd identitetskilde, ikke klientdata. Ingen klubbhold-endepunkt før den finnes.
2. Eget Quickbutik checkout produkt/variant og eksakt 50 NOK per sete, samt cart lease som gjør hold opprettholdt mens kunde betaler.
3. Betalt ordre leses autoritativt fra Quickbutik server-side, produkt/SKU/antall/e-post matches mot gyldig hold, beløp verifiseres og først deretter brukes `gk2_confirm_club_paid`. Aldri kall DB-confirm direkte fra browser.
4. Nuki/Resend/Pushover/adgang og avbestilling/revokasjon kobles til klubb-ordre og testes med ekte betaling.
5. Først etter E2E test av booking, admin, konkurranse og eldre betalte bestillinger byttes den offentlige /aktiviteter til Booking 2.0.
6. Ikke omgå release-gates. Min Bag produksjon urørt.
