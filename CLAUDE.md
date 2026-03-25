# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ioBroker adapter for Victron Cerbo GX devices via MQTT. Acts as an MQTT **client** connecting to the Cerbo GX's built-in MQTT broker (not a server). Based on the Victron Venus OS dbus-flashmq protocol.

## Commands

```bash
npm run build          # TypeScript compilation (src/ → build/)
npm run lint           # ESLint check
npm run test           # Integration tests (mocha)
npm run test:package   # Package file validation only
npm run test:integration  # Full integration tests
```

Pre-commit hook runs `npm run build` automatically.

## Architecture

```
src/main.ts                    # Adapter entry point, lifecycle, message handler (discovery)
src/lib/client.ts              # VictronMqttClient - MQTT connection, message processing, write-back
src/lib/knownStates.ts         # Known state definitions with role/unit/type/states metadata
src/lib/nameInference.ts       # Infers role/unit from state names (e.g. "Voltage" → V)
src/lib/discovery.ts           # mDNS (Bonjour) device discovery + MQTT probe
src/types.d.ts                 # VictronCerboAdapterConfig interface
```

### Victron MQTT Protocol

The Cerbo GX uses three topic prefixes:
- `N/{portalId}/{service}/{instance}/{path}` — read data (Cerbo → adapter)
- `W/{portalId}/{service}/{instance}/{path}` — write commands (adapter → Cerbo), payload: `{"value": ...}`
- `R/{portalId}/keepalive` — must be sent every ~30s or Cerbo stops publishing

All payloads are JSON: `{"value": <scalar|object|array>}`.

### State Creation Strategy

States are created **dynamically** from incoming MQTT messages. Three layers of metadata resolution:
1. **knownStates.ts** — exact match on `{serviceType}/{dbusPath}` (highest priority)
2. **nameInference.ts** — pattern match on the last path segment (e.g. `Temperature`, `ChargeVoltage`, `Connected`)
3. **Type detection from value** — fallback: `typeof value` determines type, generic role assigned

Object/array values are **recursively expanded** into channels and individual states (e.g. `Batteries` array → `Batteries.0.soc`, `Batteries.0.voltage`, etc.).

States with names like `Connected`, `Active`, `Enabled` that arrive as 0/1 are automatically converted to boolean.

### Write-back

When an ioBroker state with `write: true` changes (ack=false), the adapter publishes to the corresponding `W/` topic. Only states defined in knownStates.ts with `write: true` or under writable service paths support this.

## Code Style

- TypeScript strict mode, ES2022, Node16 modules
- ESLint + Prettier via `@iobroker/eslint-config`
- JSDoc not required (rules disabled)
- Run `npx eslint -c eslint.config.mjs --fix src/` to auto-fix formatting

## Admin UI

- JSON-based config UI in `admin/jsonConfig.json`
- 11 translation files in `admin/i18n/` (en, de, ru, fr, es, it, nl, pl, pt, uk, zh-cn)
- Discovery button uses `sendTo` with command `"discover"` handled in main.ts

## Key Design Decisions

- **MQTT Client, not Server**: Unlike the sonoff adapter this was forked from, this adapter connects TO the Cerbo's broker
- **Dynamic state creation**: States are not predefined — they are created as MQTT messages arrive
- **Portal ID auto-discovery**: If not configured, subscribes to `N/+/system/0/Serial` to discover it
- **Keepalive required**: The Cerbo stops publishing if no keepalive is received within 60s
