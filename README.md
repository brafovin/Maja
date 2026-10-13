# Blockwelt

Ein 3D-Open-World-Spiel im Block-Stil, das direkt im Browser läuft. Du erstellst deine eigene Figur
(Körperbau wie Steve aus Minecraft), erkundest eine Insel mit Dörfern, Tempeln, Tieren und Monstern,
baust Blöcke ab und findest versteckte Schätze.

## Spielen

- **Einfach:** `index.html` im Browser öffnen (Doppelklick genügt, es wird kein Server gebraucht).
- **Über einen kleinen Server** (z. B. für das Handy im gleichen WLAN):
  `python3 -m http.server 8000` im Projektordner starten und `http://localhost:8000` öffnen.

Das Spiel speichert automatisch im Browser (Figur, Welt, Inventar, gebaute Blöcke).

## Was es gibt

- **Eigene Figur:** Hautfarbe, Haare, Augen, T-Shirt, Hose, Schuhe und Frisur wählen.
  Der **Name kann nur ein einziges Mal** festgelegt werden, das Aussehen jederzeit.
- **Realistische Laufanimation:** Knie und Ellbogen beugen sich, Hüfte und Schultern drehen
  gegeneinander, der Körper federt mit jedem Schritt, beim Rennen lehnt sich die Figur nach vorne.
  Die Schritte sind an die echte Geschwindigkeit gekoppelt, damit die Füße nicht rutschen.
- **Offene Welt:** eine Insel mit Wiesen, Wäldern, Wüste, Dschungel, Schneeland, Bergen, Höhlen und Erzen.
- **Häuser und Dörfer** mit Betten, Werkbänken und Truhen voller nützlicher Dinge.
- **Tempel mit verstecktem Gold:**
  - Im **Wüstentempel** liegt unter dem blauen Stein in der Mitte eine Geheimkammer.
  - Im **Dschungeltempel** ist der Schatz hinter einer Wand aus Steinziegeln verborgen.
- **Tiere:** Schweine, Kühe, Schafe und Hühner.
- **Monster:** Zombies, Skelette (schießen Pfeile), Spinnen, Creeper (explodieren) und Mumien,
  die die Tempel bewachen. Sie greifen an und du verlierst Herzen. Monster lassen sich im Menü ausschalten.
- **Werkzeuge:** Spitzhacken, Äxte, Schaufeln und Schwerter aus Holz, Stein, Eisen und Diamant.
  Gold- und Diamanterz braucht eine Eisenspitzhacke, Eisenerz eine Steinspitzhacke.
- **Herstellen** von Brettern, Stöcken, Fackeln, Werkzeugen, Truhen, Betten und mehr.
- **Tag und Nacht** mit Sonne, Mond und Sternen. Im Bett kannst du die Nacht überspringen.
- **Wetter:** Regen, **Gewitter mit Blitzen und Donner** und **Schnee**.
- **Karte oben rechts** und eine große Karte der ganzen Insel (Taste **M** oder auf die Karte tippen).
- Steuerung mit **Tastatur und Maus** oder per **Touch** auf Handy und Tablet.

## Steuerung (Computer)

| Taste | Aktion |
| --- | --- |
| W A S D | Laufen |
| Maus | Umsehen |
| Leertaste | Springen, im Wasser schwimmen |
| Umschalt | Rennen |
| Linke Maustaste (halten) | Abbauen und angreifen |
| Rechte Maustaste | Bauen, Truhe öffnen, essen, schlafen |
| 1 – 9 / Mausrad | Gegenstand wählen |
| E | Inventar und Herstellen |
| M | Große Karte |
| V | Kamera wechseln (hinter der Figur / Ich-Sicht) |
| Q | Gegenstand fallen lassen |
| Esc | Menü (Wetter, Tageszeit, Monster, Sichtweite, Ton …) |

Auf dem Handy: links der Joystick zum Laufen, wischen zum Umsehen, rechts die Knöpfe
**Sprung**, **Hacken** (gedrückt halten), **Bauen** und **Rennen**.

## Technik

- Reines HTML, CSS und JavaScript, keine Installation nötig.
- 3D-Grafik mit [three.js](https://threejs.org) (r149, liegt in `lib/`, MIT-Lizenz).
- Alle Texturen, Figuren und Geräusche werden beim Start vom Programm selbst erzeugt.

| Datei | Inhalt |
| --- | --- |
| `js/blocks.js` | Blöcke und ihre Pixel-Texturen |
| `js/items.js` | Gegenstände, Werkzeuge, Rezepte, Inventar |
| `js/world.js` | Weltgenerierung, Bauwerke, Licht, Chunk-Meshes, Karte |
| `js/character.js` | Figur im Steve-Körperbau und Laufanimation |
| `js/mobs.js` | Tiere und Monster |
| `js/entities.js` | Gegenstände am Boden, Partikel, Pfeile, Explosionen |
| `js/sky.js` | Tag/Nacht, Wolken, Regen, Schnee, Gewitter |
| `js/player.js` | Steuerung, Kamera, Abbauen und Bauen |
| `js/ui.js` | Anzeigen, Karte, Inventar, Menüs, Figuren-Editor |
| `js/main.js` | Start, Spielschleife, Speichern |
