# Poke Fight Planner

> A comprehensive Pokémon battle planner with real damage calculations, stat changes, weather, screens, status effects, and turn-by-turn planning powered by the Smogon damage calculator.

-----

## 📋 Table of Contents

  * [Requirements](#-requirements)
  * [Installation & Setup](#-installation--setup)
  * [Getting Started](#-getting-started)
  * [Features Overview](#-features-overview)
  * [Detailed Feature Guide](#-detailed-feature-guide)
  * [File Formats](#-file-formats)
  * [API Reference](#-api-reference)
  * [Troubleshooting](#-troubleshooting)

-----

## ✅ Requirements

  * **Node.js**: 18+ (recommended)
  * **npm**: 9+

Check your versions with:

```bash
node -v
npm -v
```

-----

## 📦 Installation & Setup

### Step 1: Install Dependencies in Root Directory

First, navigate to the project root directory and install the backend dependencies:

```bash
cd /path/to/PokemonLinePlanner
npm install
```

### Step 2: Install Frontend Dependencies

Navigate to the web-ui folder and install the frontend dependencies:

```bash
cd web-ui
npm install
cd ..
```

-----

## ⚡ Getting Started

### Running the Application

You'll need **two terminal windows** to run both the backend server and the frontend development server.

#### Terminal 1: Start the Backend Server

In the **root directory**, run:

```bash
npm run server
```

You should see output like:
```
> poke-fight-planner@1.0.0 server
> ts-node src/server.ts

API listening on http://localhost:3001
```

**Keep this terminal window open** - the backend must stay running.

#### Terminal 2: Start the Frontend Development Server

Open a **new terminal window**, navigate to the `web-ui` folder, and run:

```bash
cd web-ui
npm run dev
```

You should see output like:
```
  VITE v5.x.x  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

**Open your browser** and navigate to `http://localhost:5173/`

-----

## 🎯 Features Overview

### Core Features
- ✅ **Real Damage Calculations** - Powered by @smogon/calc for accurate damage rolls
- ✅ **Turn-by-Turn Planning** - Plan multiple turns ahead with snapshot system
- ✅ **Singles & Doubles Battle Modes** - Proper spread move and screen modifiers
- ✅ **HP Management** - Edit HP values directly in the HP bar
- ✅ **Item & Berry System** - Auto-consumption at thresholds with visual feedback

### Battle Mechanics
- ✅ **Stat Changes** - Growl, Leer, Swords Dance, etc. with visual indicators
- ✅ **Status Effects** - Burn, Paralysis, Poison, Toxic, Freeze with berry cures
- ✅ **Weather System** - Sunny, Rain, Hail, Sandstorm with damage/boost modifiers
- ✅ **Screen System** - Light Screen, Reflect, Aurora Veil, Tailwind
- ✅ **Abilities** - Intimidate, Inner Focus, Defiant, Drizzle, Drought, Sand Stream, etc.

### Advanced Features
- ✅ **Snapshot System** - Turn-based state management with undo functionality
- ✅ **First Turn Out** - Trigger ability effects (Intimidate, weather abilities)
- ✅ **Export Battle Log** - Export complete turn-by-turn battle plans
- ✅ **Visual Indicators** - Weather symbols, screen icons, status pills, stat stages

-----

## 📚 Detailed Feature Guide

### 1. Setting Up Your Teams

#### Upload Your Team Files

1. **My Team (myteam.txt)**: Your team in Showdown format
2. **Enemy Team (enemytrainer.txt)**: Opponent's team in compact format

Click the file picker buttons to upload these files. See [File Formats](#-file-formats) section for details.

#### Building Your Team

- Drag Pokémon from "Your collection" to the 6 empty slots in "My Team"
- Enemy team auto-fills from the uploaded file
- HP bars show as "MaxHP/MaxHP" by default (e.g., "100/100")
- Click on HP bars to edit current/max HP values directly

### 2. Planning Turns

#### Adding Turns

Click **"+ Add Turn"** to add a new turn to your battle plan.

#### Writing Turn Actions

In the query editor, type actions like:
```
Pikachu use Thunderbolt on Gyarados
Charizard use Flamethrower on Venusaur
Staryu use surf on enemy
```

The editor provides auto-completion for Pokémon names and moves!

#### Battle Mode Selection

Toggle between **Singles** and **Doubles** next to the "Planner" heading:
- **Singles**: Standard 1v1 battles
- **Doubles**: Spread moves deal 75% damage, screens block less damage

### 3. Calculating Damage

#### Basic Calculation

1. Write your action in the turn editor
2. Click the **"Calc"** button
3. View damage rolls on the slider

The slider shows:
- **Low Roll**: Minimum damage (most HP remaining)
- **High Roll**: Maximum damage (least HP remaining)
- **Crit Toggle**: Switch to critical hit damage rolls

#### First Turn Out (Abilities)

Check **"P1 first"** or **"P2 first"** to trigger entry abilities:
- **Intimidate**: Lowers opponent's Attack by 1 stage
  - Blocked by Inner Focus
  - Triggers Defiant (raises Attack by 2 instead)
- **Weather Abilities**: Drizzle (Rain), Drought (Sun), Sand Stream (Sandstorm), Snow Warning (Hail)

#### Stat Changes

Non-damaging stat moves show a message instead of damage:
- **Growl**: "Pikachu's Attack fell!"
- **Swords Dance**: "Charizard's Attack rose sharply!"

Stat stages appear next to each Pokémon:
```
Atk: -1  Def: 0  SpAtk: +2  SpDef: 0  Spd: 0
```
- Positive values (green): Stat boosts
- Negative values (red): Stat drops
- Effects persist across turns and affect damage calculations

### 4. Weather System

#### Setting Weather

Weather can be set by:
- **Moves**: Sunny Day, Rain Dance, Hail, Sandstorm
- **Abilities**: Drizzle, Drought, Snow Warning, Sand Stream (with First Turn Out)

#### Weather Duration

Toggle **"Run and Bun"** (below generation dropdown):
- **OFF**: Weather lasts 5 turns (modern gen standard)
- **ON**: Weather lasts indefinitely

#### Weather Effects

Weather symbols appear next to turn numbers:
- ☀️ **Sunny**: Boosts Fire moves 1.5×, reduces Water moves to 0.5×
- 🌧️ **Rain**: Boosts Water moves 1.5×, reduces Fire moves to 0.5×
- ❄️ **Hail**: 6.25% end-of-turn damage (Ice types immune)
- 🌪️ **Sandstorm**: 6.25% end-of-turn damage (Rock/Steel/Ground immune)

#### Special Weather Mechanics

- **Sand Spit**: If a Pokémon with Sand Spit takes damage, Sandstorm starts immediately
- **Sand Force**: Boosts Rock/Ground/Steel moves in Sandstorm (automatic)

### 5. Screen System

#### Setting Up Screens

Use screen moves like:
- **Light Screen**: Reduces special attack damage by 50% (singles) or 33% (doubles)
- **Reflect**: Reduces physical attack damage by 50% (singles) or 33% (doubles)
- **Aurora Veil**: Reduces both physical and special damage (requires Hail)
- **Tailwind**: Doubles Speed for 5 turns

#### Screen Duration

Screens last **5 turns** and automatically expire.

#### Screen Indicators

Screen symbols appear next to turn numbers:
- 🛡️ Light Screen
- 🪞 Reflect
- ❄️🛡️ Aurora Veil
- 💨 Tailwind

**Hover over symbols** to see which team set the screen and what it does!

### 6. Status Effects

#### Inflicting Status

Status moves show a message instead of damage:
- **Thunder Wave**: "Pikachu was paralyzed!"
- **Will-O-Wisp**: "Charizard was burned!"
- **Toxic**: "Venusaur was badly poisoned!"
- **Poison Powder**: "Bulbasaur was poisoned!"

#### Status Curing Berries

If the target holds a curing berry:
- **Lum Berry**: Cures any status
- **Cheri Berry**: Cures paralysis
- **Rawst Berry**: Cures burn
- **Pecha Berry**: Cures poison
- **Aspear Berry**: Cures freeze

Message shows: "Pikachu was paralyzed but cured by berry!"

#### Status Effects on Damage

- **Burn**: Halves physical attack damage automatically
- **Paralysis**: Speed reduced (visual indicator)
- **Poison**: 12.5% HP damage at end of turn
- **Toxic**: Increasing damage each turn (1/16, 2/16, 3/16...)

Status indicators appear on Pokémon cards with color-coded pills.

### 7. Running Turns

#### Applying Damage

1. After clicking "Calc", select your desired damage roll on the slider
2. Click the **green "Run"** button
3. The damage is applied to the Pokémon's HP
4. Berry consumption, status damage, and weather damage are calculated
5. The turn is locked and becomes the baseline for the next turn

#### Turn Snapshots

Each turn has a **start snapshot** and **end snapshot**:
- **Before Run**: Clicking "Calc" multiple times always uses the same starting state
- **After Run**: The end state becomes the next turn's starting state
- **Intimidate**: Only applies once per turn, even with multiple "Calc" presses

#### Undo Function

Click the **"Undo"** button (↶) to:
- Revert the Pokémon to its state before the turn was run
- Remove the "Run" lock
- Allow you to select a different damage roll

### 8. Turn Management

#### Deleting Turns

Click the **"–"** button to delete a turn.
- Restores Pokémon to the deleted turn's starting state
- All subsequent turns are recalculated

#### Exporting Battle Log

Click **"Export Lines"** to generate a complete battle log:
```
Turn 1: [Sunny] Charizard use Flamethrower on Venusaur → Venusaur has 45/100 (45%) remaining health
Turn 2: [Light Screen (Your)] Pikachu use Thunderbolt on Gyarados → Gyarados has 60/120 (50%) remaining health after consuming Sitrus Berry
```

### 9. Advanced Features

#### Manual HP Editing (Turn 1)

For Turn 1 only, before clicking "Run":
- Edit HP values directly in "My Team" HP bars
- Change items or status via dropdowns
- These become the **baseline** for Turn 1 calculations
- Useful for mid-battle scenarios or custom starting conditions

#### Stat Stage Tracking

All stat changes persist across turns:
- Visible next to each Pokémon's name
- Automatically applied to damage calculations
- Range: -6 to +6 for each stat

#### Berry Consumption Rules

- Oran Berry: Restores 10 HP at ≤50% HP
- Sitrus Berry: Restores 25% max HP at ≤50% HP
- Consumed berries are marked with "(consumed)" and won't trigger again
- Changing damage rolls before "Run" recalculates berry consumption

-----

## 📁 File Formats

### `myteam.txt` (Showdown Format)

Your team uses standard Pokémon Showdown export format:

```
Staryu @ Oran Berry
Ability: Natural Cure
Level: 25
Calm Nature
IVs: 4 HP / 31 Atk / 21 Def / 23 SpA / 0 SpD / 30 Spe
- Water Pulse
- Rapid Spin
- Psybeam
- Aurora Beam

Pikachu @ Light Ball
Ability: Static
Level: 50
Jolly Nature
EVs: 252 Atk / 4 SpD / 252 Spe
- Thunderbolt
- Volt Tackle
- Iron Tail
- Quick Attack
```

**Important:**
- Each Pokémon separated by a blank line
- Include IVs, EVs, Nature, Ability, and Item
- Items enable planner features (berries, gems, etc.)
- Moves listed with `- Move Name` format

### `enemytrainer.txt` (Compact Format)

Each Pokémon on a single line:

```
Scraggy Lv.21 @Eviolite: Feint Attack, Power Up Punch, Rock Tomb, Rest [Impish|Shed Skin]
Eelektrik Lv.25 @Magnet: Spark, Acid Spray, Crunch, Coil [Modest|Levitate]
Krokorok Lv.22: Crunch, Dig, Scary Face, Torment [Adamant|Intimidate]
Sandile Lv.20 @Soft Sand: Bite, Sand Tomb, Assurance [Jolly|Moxie]
```

**Format breakdown:**
- `Name Lv.XX` - Required
- `@Item` - Optional
- `: Move1, Move2, ...` - Optional
- `[Nature|Ability]` - Optional

The first 6 lines auto-fill the enemy team.

-----

## 🌐 API Reference

### `POST /api/calc`

#### Request Body

```json
{
  "gen": 9,
  "myText": "string (myteam.txt contents)",
  "enemyText": "string (enemytrainer.txt contents)",
  "attacker": "Pikachu",
  "move": "Thunderbolt",
  "defender": "Gyarados",
  "weather": "rain",
  "battleMode": "singles",
  "screens": [
    {
      "type": "light-screen",
      "userTeam": "enemy",
      "turnsRemaining": 5,
      "startedOnTurn": 1
    }
  ],
  "overrides": {
    "attacker": {
      "statStages": { "atk": 1, "def": 0, "spatk": 2, "spdef": 0, "spd": 0 },
      "status": "par"
    },
    "defender": {
      "statStages": { "atk": -1, "def": 0, "spatk": 0, "spdef": 0, "spd": 0 },
      "status": "burn"
    }
  }
}
```

#### Response

```json
{
  "defender": "Gyarados",
  "defenderMaxHP": 170,
  "remaining": {
    "lowPct": 65,
    "lowHP": 110,
    "highPct": 70,
    "highHP": 119,
    "critPct": 40,
    "critHP": 68
  },
  "debug": {
    "rolls": {
      "normal": [51, 51, 54, 54, 54, 57, 57, 57, 60, 60, 60, 63, 63, 63, 66, 66],
      "crit": [99, 102, 105, 108, 111, 114, 117, 120]
    }
  }
}
```

**Note:** 
- `remaining` values are from full HP
- Frontend adjusts based on current HP
- Weather, screens, and stat stages automatically modify damage
- Spread moves in doubles automatically reduced to 75%

-----

## 🔍 Troubleshooting

### Server won't start

**Error:** `Cannot find module 'express'` or similar

**Solution:** Make sure you installed dependencies in the root directory:
```bash
npm install
```

### Frontend won't start

**Error:** `Cannot find module 'react'` or similar

**Solution:** Make sure you installed dependencies in the web-ui folder:
```bash
cd web-ui
npm install
```

### Port already in use

**Error:** `Port 3001 already in use` or `Port 5173 already in use`

**Solution:** Kill the process using that port or change the port in:
- Backend: `src/server.ts` (PORT variable)
- Frontend: `web-ui/vite.config.ts`

### API calculations look wrong

**Check:**
1. Server console shows `[calc] ...` debug output
2. IVs/EVs from `myteam.txt` are correct
3. Status effects and stat stages are as expected
4. Weather/screens are properly set
5. Battle mode (Singles/Doubles) is correct

### Damage rolls don't match in-game

**Remember:**
- Stat stages affect damage (visible next to Pokémon)
- Burn halves physical attack damage
- Weather boosts/reduces certain move types
- Screens reduce damage (different amounts for singles/doubles)
- Spread moves in doubles deal 75% damage

### HP bars show "—/—"

This means the Pokémon's max HP hasn't been fetched yet:
1. Wait a moment after uploading files (HP is fetched asynchronously)
2. Refresh the page and re-upload files
3. Check that your team file is in proper Showdown format

### Berries not consuming

**Check:**
1. The damage roll crosses the 50% HP threshold from **current HP**
2. The Pokémon actually holds the berry (check item display)
3. The berry hasn't already been consumed (look for "(consumed)" text)
4. Click "Run" to apply the roll - just clicking "Calc" only previews

### Stat changes not applying

**Make sure:**
1. You clicked "Run" to apply the stat change
2. The stat stages display is showing the change (next to Pokémon name)
3. The correct Pokémon is targeted (self vs opponent)
4. Stat stages are capped at -6 to +6

### Weather/Screens not showing

**Verify:**
1. The move is a weather/screen move (check move name spelling)
2. You clicked "Run" to apply the move
3. Weather symbols appear next to subsequent turn numbers
4. For abilities: "P1 first" or "P2 first" is checked

-----

## 💡 Tips & Best Practices

### Planning Strategy
- Use "Calc" multiple times to test different scenarios before "Run"
- Set up screens and weather early for maximum benefit
- Track stat stages carefully - they compound quickly!
- Use the export feature to save and share battle plans

### Managing Complex Battles
- Add all turns first, then calculate them in order
- Use Turn 1 manual editing for mid-battle scenarios
- Delete unwanted turns to recalculate from that point
- Check weather/screen durations (symbols show when active)

### Understanding Damage Variance
- Low roll: Worst case scenario (0-5% damage variation)
- High roll: Best case scenario
- Critical hits: Usually ~50% more damage
- Actual game rolls randomly within this range

### Battle Mode Considerations
- **Singles**: Full damage, screens block 50%
- **Doubles**: Spread moves deal 75%, screens block 33%
- Switch modes before calculating for accurate results

-----

## 🛠️ Development

### Project Structure

```
PokemonLinePlanner/
├── src/                    # Backend (Express + TypeScript)
│   ├── server.ts          # API endpoints
│   ├── damage.ts          # Damage calculator wrapper
│   ├── parser.ts          # File parsing logic
│   └── types.ts           # Type definitions
├── web-ui/                # Frontend (React + TypeScript + Vite)
│   └── src/
│       ├── App.tsx        # Main application
│       ├── components/    # UI components
│       └── logic/         # Game logic utilities
├── myteam.txt             # Example team file
├── enemytrainer.txt       # Example opponent file
└── package.json           # Backend dependencies
```

### Available Scripts

```bash
# Backend
npm run server          # Start API server (root directory)

# Frontend
cd web-ui
npm run dev            # Start development server
npm run build          # Build for production
npm run preview        # Preview production build
```

### Technologies Used

- **Frontend**: React, TypeScript, Vite, TailwindCSS, Monaco Editor
- **Backend**: Express, TypeScript, ts-node
- **Calculation Engine**: @smogon/calc, @pkmn/data
- **Development**: ESLint, TypeScript ESNext

-----

## 📄 License

This project is for educational and planning purposes. Pokémon is © Nintendo/Game Freak.

-----

## 🤝 Contributing

Feel free to open issues or submit pull requests for:
- Bug fixes
- New features
- Documentation improvements
- Battle mechanic implementations

-----

**Happy battling! 🎮⚡**
