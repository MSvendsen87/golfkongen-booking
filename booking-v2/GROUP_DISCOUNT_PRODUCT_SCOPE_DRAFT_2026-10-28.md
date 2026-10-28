# Booking 2.0 — DRAFT customer-group discounts scoped to booking products

**NOT LIVE, DO NOT APPLY WITHOUT TESTING.** The existing 121 special prices have only been reported as entered and are not verified for all timed variants.

Quickbutik lets discounts apply to a whole product (rather than a specific variant) and a hidden discount can be assigned to one customer group:
- https://quickbutik.com/no/hjelp/hvordan-aktiverer-jeg-en-rabattkampanje-spesifikt-for-kundegruppe
- https://quickbutik.com/no/hjelp/hvordan-oppretter-jeg-rabatter-i-quickbutik

A potential correction is one fixed-NOK product-scoped discount for each group+duration price difference. This would cover newly created time variants without adding each variant to the group-price register.

**CRITICAL:** First test in checkout without paying for HYZR 30 min group Ansatte (regular 90 kr, intended 10 kr, possible discount 80 kr). Compare a variant with existing group price (2026-11-01 10:00–10:30) and a different variant (10:30–11:00). If reductions stack with old special prices and make the amount lower than intended, DO NOT launch. Quickbutik documentation does not establish precedence/stacking with existing specific group prices. A support-confirmed migration or a different integration would then be required.

All source prices below come from `gk2_private.price_policies` and `checkout_product_plans`, **not a verified read of Quickbutik live group prices**. Do not modify ordinary store prices, existing orders, or member/group assignments. Each proposed discount must apply ONLY to the named booking product and customer group; never store-wide.

| QB product | Activity | Minutes | Group | Regular NOK | Group NOK | Difference NOK |
|---|---|---:|---|---:|---:|---:|
| 1474 | hyzr | 30 | ambassador | 90.00 | 50.00 | 40.00 |
| 1474 | hyzr | 30 | ansatte | 90.00 | 10.00 | 80.00 |
| 1474 | hyzr | 30 | betalt_medlem | 90.00 | 50.00 | 40.00 |
| 1474 | hyzr | 30 | frisbee_dart | 90.00 | 60.00 | 30.00 |
| 1474 | hyzr | 30 | frisbeeklubb | 90.00 | 60.00 | 30.00 |
| 1474 | hyzr | 30 | teamgolfkongen | 90.00 | 50.00 | 40.00 |
| 1475 | dart_a | 30 | ansatte | 80.00 | 10.00 | 70.00 |
| 1475 | dart_a | 30 | betalt_medlem | 80.00 | 50.00 | 30.00 |
| 1475 | dart_a | 30 | dartklubb | 80.00 | 50.00 | 30.00 |
| 1475 | dart_a | 30 | frisbee_dart | 80.00 | 50.00 | 30.00 |
| 1476 | dart_b | 30 | ansatte | 80.00 | 10.00 | 70.00 |
| 1476 | dart_b | 30 | betalt_medlem | 80.00 | 50.00 | 30.00 |
| 1476 | dart_b | 30 | dartklubb | 80.00 | 50.00 | 30.00 |
| 1476 | dart_b | 30 | frisbee_dart | 80.00 | 50.00 | 30.00 |
| 1477 | hyzr | 60 | ambassador | 150.00 | 100.00 | 50.00 |
| 1477 | hyzr | 60 | ansatte | 150.00 | 15.00 | 135.00 |
| 1477 | hyzr | 60 | betalt_medlem | 150.00 | 100.00 | 50.00 |
| 1477 | hyzr | 60 | frisbee_dart | 150.00 | 120.00 | 30.00 |
| 1477 | hyzr | 60 | frisbeeklubb | 150.00 | 120.00 | 30.00 |
| 1477 | hyzr | 60 | teamgolfkongen | 150.00 | 100.00 | 50.00 |
| 1478 | hyzr | 90 | ambassador | 240.00 | 150.00 | 90.00 |
| 1478 | hyzr | 90 | ansatte | 240.00 | 25.00 | 215.00 |
| 1478 | hyzr | 90 | betalt_medlem | 240.00 | 150.00 | 90.00 |
| 1478 | hyzr | 90 | frisbee_dart | 240.00 | 180.00 | 60.00 |
| 1478 | hyzr | 90 | frisbeeklubb | 240.00 | 180.00 | 60.00 |
| 1478 | hyzr | 90 | teamgolfkongen | 240.00 | 150.00 | 90.00 |
| 1479 | hyzr | 120 | ambassador | 300.00 | 200.00 | 100.00 |
| 1479 | hyzr | 120 | ansatte | 300.00 | 30.00 | 270.00 |
| 1479 | hyzr | 120 | betalt_medlem | 300.00 | 200.00 | 100.00 |
| 1479 | hyzr | 120 | frisbee_dart | 300.00 | 240.00 | 60.00 |
| 1479 | hyzr | 120 | frisbeeklubb | 300.00 | 240.00 | 60.00 |
| 1479 | hyzr | 120 | teamgolfkongen | 300.00 | 200.00 | 100.00 |
| 1480 | hyzr | 150 | ambassador | 390.00 | 250.00 | 140.00 |
| 1480 | hyzr | 150 | ansatte | 390.00 | 40.00 | 350.00 |
| 1480 | hyzr | 150 | betalt_medlem | 390.00 | 250.00 | 140.00 |
| 1480 | hyzr | 150 | frisbee_dart | 390.00 | 300.00 | 90.00 |
| 1480 | hyzr | 150 | frisbeeklubb | 390.00 | 300.00 | 90.00 |
| 1480 | hyzr | 150 | teamgolfkongen | 390.00 | 250.00 | 140.00 |
| 1481 | hyzr | 180 | ambassador | 450.00 | 300.00 | 150.00 |
| 1481 | hyzr | 180 | ansatte | 450.00 | 45.00 | 405.00 |
| 1481 | hyzr | 180 | betalt_medlem | 450.00 | 300.00 | 150.00 |
| 1481 | hyzr | 180 | frisbee_dart | 450.00 | 360.00 | 90.00 |
| 1481 | hyzr | 180 | frisbeeklubb | 450.00 | 360.00 | 90.00 |
| 1481 | hyzr | 180 | teamgolfkongen | 450.00 | 300.00 | 150.00 |
| 1482 | hyzr | 210 | ambassador | 540.00 | 350.00 | 190.00 |
| 1482 | hyzr | 210 | ansatte | 540.00 | 55.00 | 485.00 |
| 1482 | hyzr | 210 | betalt_medlem | 540.00 | 350.00 | 190.00 |
| 1482 | hyzr | 210 | frisbee_dart | 540.00 | 420.00 | 120.00 |
| 1482 | hyzr | 210 | frisbeeklubb | 540.00 | 420.00 | 120.00 |
| 1482 | hyzr | 210 | teamgolfkongen | 540.00 | 350.00 | 190.00 |
| 1483 | hyzr | 240 | ambassador | 600.00 | 400.00 | 200.00 |
| 1483 | hyzr | 240 | ansatte | 600.00 | 60.00 | 540.00 |
| 1483 | hyzr | 240 | betalt_medlem | 600.00 | 400.00 | 200.00 |
| 1483 | hyzr | 240 | frisbee_dart | 600.00 | 480.00 | 120.00 |
| 1483 | hyzr | 240 | frisbeeklubb | 600.00 | 480.00 | 120.00 |
| 1483 | hyzr | 240 | teamgolfkongen | 600.00 | 400.00 | 200.00 |
| 1484 | dart_a | 90 | ansatte | 200.00 | 25.00 | 175.00 |
| 1484 | dart_a | 90 | betalt_medlem | 200.00 | 150.00 | 50.00 |
| 1484 | dart_a | 90 | dartklubb | 200.00 | 150.00 | 50.00 |
| 1484 | dart_a | 90 | frisbee_dart | 200.00 | 150.00 | 50.00 |
| 1485 | dart_a | 120 | ansatte | 240.00 | 30.00 | 210.00 |
| 1485 | dart_a | 120 | betalt_medlem | 240.00 | 200.00 | 40.00 |
| 1485 | dart_a | 120 | dartklubb | 240.00 | 200.00 | 40.00 |
| 1485 | dart_a | 120 | frisbee_dart | 240.00 | 200.00 | 40.00 |
| 1486 | dart_a | 60 | ansatte | 120.00 | 15.00 | 105.00 |
| 1486 | dart_a | 60 | betalt_medlem | 120.00 | 100.00 | 20.00 |
| 1486 | dart_a | 60 | dartklubb | 120.00 | 100.00 | 20.00 |
| 1486 | dart_a | 60 | frisbee_dart | 120.00 | 100.00 | 20.00 |
| 1487 | dart_a | 150 | ansatte | 320.00 | 40.00 | 280.00 |
| 1487 | dart_a | 150 | betalt_medlem | 320.00 | 250.00 | 70.00 |
| 1487 | dart_a | 150 | dartklubb | 320.00 | 250.00 | 70.00 |
| 1487 | dart_a | 150 | frisbee_dart | 320.00 | 250.00 | 70.00 |
| 1488 | dart_a | 210 | ansatte | 440.00 | 55.00 | 385.00 |
| 1488 | dart_a | 210 | betalt_medlem | 440.00 | 350.00 | 90.00 |
| 1488 | dart_a | 210 | dartklubb | 440.00 | 350.00 | 90.00 |
| 1488 | dart_a | 210 | frisbee_dart | 440.00 | 350.00 | 90.00 |
| 1489 | dart_a | 180 | ansatte | 360.00 | 45.00 | 315.00 |
| 1489 | dart_a | 180 | betalt_medlem | 360.00 | 300.00 | 60.00 |
| 1489 | dart_a | 180 | dartklubb | 360.00 | 300.00 | 60.00 |
| 1489 | dart_a | 180 | frisbee_dart | 360.00 | 300.00 | 60.00 |
| 1490 | dart_b | 60 | ansatte | 120.00 | 15.00 | 105.00 |
| 1490 | dart_b | 60 | betalt_medlem | 120.00 | 100.00 | 20.00 |
| 1490 | dart_b | 60 | dartklubb | 120.00 | 100.00 | 20.00 |
| 1490 | dart_b | 60 | frisbee_dart | 120.00 | 100.00 | 20.00 |
| 1491 | dart_a | 240 | ansatte | 480.00 | 60.00 | 420.00 |
| 1491 | dart_a | 240 | betalt_medlem | 480.00 | 400.00 | 80.00 |
| 1491 | dart_a | 240 | dartklubb | 480.00 | 400.00 | 80.00 |
| 1491 | dart_a | 240 | frisbee_dart | 480.00 | 400.00 | 80.00 |
| 1492 | dart_b | 90 | ansatte | 200.00 | 25.00 | 175.00 |
| 1492 | dart_b | 90 | betalt_medlem | 200.00 | 150.00 | 50.00 |
| 1492 | dart_b | 90 | dartklubb | 200.00 | 150.00 | 50.00 |
| 1492 | dart_b | 90 | frisbee_dart | 200.00 | 150.00 | 50.00 |
| 1493 | dart_b | 120 | ansatte | 240.00 | 30.00 | 210.00 |
| 1493 | dart_b | 120 | betalt_medlem | 240.00 | 200.00 | 40.00 |
| 1493 | dart_b | 120 | dartklubb | 240.00 | 200.00 | 40.00 |
| 1493 | dart_b | 120 | frisbee_dart | 240.00 | 200.00 | 40.00 |
| 1494 | dart_b | 150 | ansatte | 320.00 | 40.00 | 280.00 |
| 1494 | dart_b | 150 | betalt_medlem | 320.00 | 250.00 | 70.00 |
| 1494 | dart_b | 150 | dartklubb | 320.00 | 250.00 | 70.00 |
| 1494 | dart_b | 150 | frisbee_dart | 320.00 | 250.00 | 70.00 |
| 1495 | dart_b | 180 | ansatte | 360.00 | 45.00 | 315.00 |
| 1495 | dart_b | 180 | betalt_medlem | 360.00 | 300.00 | 60.00 |
| 1495 | dart_b | 180 | dartklubb | 360.00 | 300.00 | 60.00 |
| 1495 | dart_b | 180 | frisbee_dart | 360.00 | 300.00 | 60.00 |
| 1496 | dart_b | 210 | ansatte | 440.00 | 55.00 | 385.00 |
| 1496 | dart_b | 210 | betalt_medlem | 440.00 | 350.00 | 90.00 |
| 1496 | dart_b | 210 | dartklubb | 440.00 | 350.00 | 90.00 |
| 1496 | dart_b | 210 | frisbee_dart | 440.00 | 350.00 | 90.00 |
| 1497 | dart_b | 240 | ansatte | 480.00 | 60.00 | 420.00 |
| 1497 | dart_b | 240 | betalt_medlem | 480.00 | 400.00 | 80.00 |
| 1497 | dart_b | 240 | dartklubb | 480.00 | 400.00 | 80.00 |
| 1497 | dart_b | 240 | frisbee_dart | 480.00 | 400.00 | 80.00 |
| 1498 | venue | 240 | ansatte | 800.00 | 20.00 | 780.00 |
| 1499 | venue | 300 | ansatte | 1000.00 | 30.00 | 970.00 |
| 1500 | venue | 360 | ansatte | 1200.00 | 40.00 | 1160.00 |
| 1501 | venue | 420 | ansatte | 1400.00 | 50.00 | 1350.00 |
| 1502 | venue | 480 | ansatte | 1600.00 | 60.00 | 1540.00 |
| 1503 | venue | 540 | ansatte | 1800.00 | 70.00 | 1730.00 |
| 1504 | venue | 600 | ansatte | 2000.00 | 80.00 | 1920.00 |
| 1505 | venue | 660 | ansatte | 2200.00 | 90.00 | 2110.00 |
| 1506 | venue | 720 | ansatte | 2400.00 | 100.00 | 2300.00 |

Totals: 121 proposed product+group-specific discounts across 33 booking products.
Group counts: ambassador 8, ansatte 33, betalt_medlem 24, frisbee_dart 24, frisbeeklubb 8, teamgolfkongen 8, dartklubb 16.

**DO NOT ACTIVATE IN LIVE BEFORE CHECKOUT AND DISCOUNT-CONFLICT TESTING.**
