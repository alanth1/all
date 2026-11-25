# Changelog

## 1.0.0-rc1 — 2026-11-25
First release candidate covering PRD phases 01–11 (with the agreed adjustments: Windows, 8 GB RAM / 12 GB VRAM,
SQLite WAL, APScheduler + persistent jobs table, one Python app with local web UI, START.bat bootstrap,
serial Ollama usage with benchmark + fallback, Etsy API-only research, Shop Stats via import,
Pinterest + YouTube first, Instagram/Facebook unavailable).
- 8 engines, Human Control Center UI, AI Office view, Shared Brain (Obsidian-compatible)
- Demo mode for testing without accounts
- 44 automated tests (validators, approval invalidation, publish blocking, journal balance & immutability,
  reconciliation, restart recovery, duplicate prevention, read-only assets, live adapters against fake servers, UI flow)
