# Stat Changes Implementation

## Overview
Added comprehensive stat stage tracking and stat-changing move support to the Pokemon Line Planner. Players can now use moves like Growl, Swords Dance, etc., and see the stat changes reflected in the UI.

## Changes Made

### 1. Type Definitions

#### TeamBox.tsx
- Added `StatStages` type with fields: `atk`, `def`, `spatk`, `spdef`, `spd` (all numbers)
- Extended `TeamMember` type to include optional `statStages?: StatStages`
- Added helper functions:
  - `formatStatStage(stage: number)`: Formats stat stage display (0 → "—", positive → "+N", negative → "N")
  - `getStatStageColor(stage: number)`: Returns color class based on stage value

#### App.tsx
- Added `StatStages` type definition
- Extended `MemberEx` to include `statStages?: StatStages`
- Extended `AppliedChange` to include `prevStatStages?: StatStages`
- Added `StatChange` type for move effects
- Extended `TurnLine.result` to include:
  - `isStatChange?: boolean`
  - `statChanges?: StatChange[]`
  - `target?: string`

### 2. UI Updates

#### TeamBox Component
- Added stat stage display below Pokemon name showing all 5 stats
- Stats display as "—" when at 0 (neutral)
- Positive stages shown in green with "+" prefix
- Negative stages shown in red
- Format: `Atk: —  Def: —  SpAtk: —  SpDef: —  Spd: —`

#### App Component - Planner Section
- Stat-changing moves now show a message instead of roll slider
- Message format: "{Pokemon}'s {Stat} fell!" or "{Pokemon}'s {Stat} rose!"
- For multi-stat moves: "{Pokemon}: Attack +1, Defense +1"
- "sharply" is added for 2+ stage changes
- No crit toggle button appears for stat-changing moves
- Still includes Run and Undo buttons

### 3. Backend (server.ts)

Added stat-changing move database with 25+ moves:
- **Attack lowering**: Growl (-1), Charm (-2), Baby-Doll Eyes (-1)
- **Defense lowering**: Leer (-1), Tail Whip (-1), Screech (-2)
- **Sp. Atk lowering**: Confide (-1), Eerie Impulse (-2)
- **Sp. Def lowering**: Fake Tears (-2), Metal Sound (-2)
- **Speed lowering**: String Shot (-1), Scary Face (-2), Cotton Spore (-2)
- **Attack boosting**: Swords Dance (+2), Howl (+1), Sharpen (+1)
- **Defense boosting**: Harden (+1), Withdraw (+1), Iron Defense (+2)
- **Sp. Atk boosting**: Nasty Plot (+2), Calm Mind (+1 Sp. Atk + Sp. Def)
- **Sp. Def boosting**: Amnesia (+2)
- **Speed boosting**: Agility (+2), Rock Polish (+2)
- **Multi-stat**: Bulk Up, Dragon Dance, Coil

Modified `/api/calc` endpoint:
- Checks if move is stat-changing before damage calculation
- Returns `isStatChange: true` with `statChanges` array and `target`
- Bypasses damage calculation for pure stat-changing moves

### 4. Logic Implementation

#### statChanges.ts (new file)
Created comprehensive stat change logic:
- `StatType`: Type for stat names
- `StatChange`: Type for individual stat modifications
- `StatChangingMove`: Type for move definitions
- `getStatChanges(moveName)`: Lookup function
- `formatStatChangeMessage()`: Formats display message

#### App.tsx - State Management
- Initialize `statStages` to all 0s when adding Pokemon
- Clone `statStages` in snapshot functions
- Restore `statStages` in undo operations

#### App.tsx - Calc Handler (`doCalc`)
- Detects stat-changing moves from API response
- Sets up result with `isStatChange` flag
- Stores stat change data for display

#### App.tsx - Run Handler (`applySelectedRoll`)
- Special handling for stat-changing moves
- Applies stat changes while clamping to [-6, +6] range
- Saves previous stat stages for undo
- Updates team member with new stat stages

### 5. Helper Functions

Added to App.tsx:
- `formatStatChangeMessage(targetName, changes)`: Creates display message
- `formatStatName(stat)`: Converts stat key to display name

## Usage Example

1. Upload your team files (myteam.txt and enemytrainer.txt)
2. Set up your teams in the UI
3. Write a line like: `Pikachu use growl on Charizard`
4. Click Calc button
5. See message: "Charizard's Attack fell!"
6. Click Run button
7. Charizard's Atk stat now shows "-1" in red in the TeamBox

## Stat Stage Limits
- Stats are clamped between -6 and +6 (Pokemon standard)
- Visual display shows current stage
- Stages persist until manually reset or Pokemon is removed

## Undo Support
- Undo button reverts stat changes
- Preserves all previous state including stat stages
- Works for both damage moves and stat-changing moves

## Future Enhancements
Ideas for expansion:
1. Apply stat stage modifiers to actual damage calculations
2. Add accuracy/evasion stat stages
3. Support secondary effects (e.g., Icy Wind deals damage AND lowers speed)
4. Add visual indicators for maxed out stats (+6 or -6)
5. Reset all stats button
6. Show effective stat multipliers (e.g., "+1 Attack = 1.5x")

## Testing
- Backend compiles without errors
- Frontend compiles without errors
- Both servers start successfully
- No linter errors in modified files

