# Credits & licenses

| Item | Source | License / terms |
|---|---|---|
| NPC sprites (10 characters, 8 directions, walk cycles) and 10 isometric floor tiles | Generated with PixelLab (pixellab.ai) on the owner's account | Generated for and owned by the account holder per PixelLab terms |
| Furniture, walls, skyline, weather, light and UI effects | Drawn procedurally in `app/web/static/game/art.js` / `world.js` | Part of this project |
| Phaser 3.90.0 game engine | phaser.io (vendored in `app/web/static/game/vendor`) | MIT |
| Silkscreen font | Google Fonts / The Silkscreen Project Authors | SIL Open Font License 1.1 (`fonts/OFL-Silkscreen.txt`) |
| VT323 font | Google Fonts / The VT323 Project Authors | SIL Open Font License 1.1 (`fonts/OFL-VT323.txt`) |
| Weather data (optional) | Open-Meteo (open-meteo.com) | Free API, CC BY 4.0 attribution |

To regenerate PixelLab assets: `python tools/pixellab_gen.py chars|anims|tiles|fetch|fetchtiles` with a PixelLab API token
(`PIXELLAB_TOKEN` environment variable). Generation spends PixelLab credits.
