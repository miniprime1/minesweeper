# Third-party notices

The program code and synthesized sound effects are licensed under the [MIT License](LICENSE), © 2026 Kyumin Nam. This license does not relicense the original Microsoft artwork or other third-party resources.

## Artwork and icons

| Files | Source and credit |
| --- | --- |
| `src/assets/Smiley.png`, `Tile.png`, `Counter.png` | Original Microsoft artwork, ripped by Black Squirrel and Emmett N.; obtained from [CobaltXII/Minesweeper](https://github.com/CobaltXII/Minesweeper). That repository's MIT license covers its code; its README reserves sprite ownership to the respective owners. |
| `src/assets/CounterLegacy.png`, `minesweeper.ico` | Original WinMine bitmap and icon from [wildptr/winmine/data](https://github.com/wildptr/winmine/tree/master/data). `420.bmp` was converted losslessly to PNG. The repository supplies no license file. |
| `resources/Minesweeper.icns` | macOS icon converted from `src/assets/minesweeper.ico`; same original artwork and credit. |
| `src/assets/reference.png` | Windows 2000 screenshot supplied by the original requester. |

Original Microsoft artwork remains the property of its respective rights holders. No permission to relicense that artwork under MIT is implied. `sprites.json` and `reference-sprites.json` record bitmap coordinates.

## Fonts

`src/assets/ms-sans-serif.woff2` and `ms-sans-serif-bold.woff2` are converted MS Sans Serif fonts obtained from [98.css](https://github.com/jdan/98.css), version 0.1.21. Copyright 2020 Jordan Scales, MIT License. The full notice is retained in [src/assets/98-CSS-LICENSE.txt](src/assets/98-CSS-LICENSE.txt).

## Runtime and dependencies

The macOS app uses [Electron](https://github.com/electron/electron) and Chromium. Packaged releases include the Electron `LICENSE` and Chromium `LICENSES.chromium.html`. Development dependencies retain their own licenses in their installed packages.

## Behavioral reference

[12UE/XPWinmine](https://github.com/12UE/XPWinmine) was consulted as a reference for classic Minesweeper behavior.
