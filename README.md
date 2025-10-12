Poke Fight Planner

Plan Pokémon battles with real, reproducible damage rolls.
Upload your teams, run calcs with the Smogon damage engine, apply rolls turn-by-turn, and track items/status (including berries that auto-consume at thresholds).

Requirements

Node.js 18+ (recommended)

npm 9+

Check versions:

node -v
npm -v

Quick Start

Install dependencies

npm install


Run the API server (Express + ts-node)

npm run server


Defaults to http://localhost:3001

PORT can be overridden with an env var:

PORT=4000 npm run server


Run the web app

npm run dev


Usually starts on http://localhost:5173 (Vite default).

The web app talks to the API at /api/calc (same origin if you proxy; otherwise ensure the frontend is configured to hit localhost:3001).

What’s in the Box

Frontend (React + TypeScript): battle planner UI

src/App.tsx – main planner UI (teams, turn list, rolls)

src/components/TeamBox.tsx – party UI with HP bars, items, status

src/components/QueryEditor.tsx – input for “<attacker> use <move> on <defender>”

src/logic/* – parsers, grammar, HP/berry math

Backend (Express + TypeScript):

src/server.ts – /api/calc endpoint

src/damage.ts – wrapper around @smogon/calc

src/parser.ts, src/types.ts – parsing & types

Running Calcs (How it Works)

Upload two files in the UI:

myteam.txt – Showdown format (full sets, IVs, EVs, level, nature, ability, item, moves)

enemytrainer.txt – compact line format (see below)

The frontend queries POST /api/calc with:

{
  "gen": 9,
  "myText": "<contents of myteam.txt>",
  "enemyText": "<normalized contents of enemytrainer.txt>",
  "attacker": "Kubfu",
  "move": "Brick Break",
  "defender": "Eelektrik"
}


The server uses @smogon/calc to compute damage and returns both damage and remaining values plus a debug block.

The UI then:

Converts remaining-from-full to damage-from-current,

Applies status/berry previews,

Lets you apply a roll so the party HP updates for the next turn.

File Formats
myteam.txt (Showdown format)

Example block:

Staryu @ Oran Berry
Ability: Natural Cure
Level: 25
Calm Nature
IVs: 4 HP / 31 Atk / 21 Def / 23 SpA / 0 SpD / 30 Spe
- Water Pulse
- Rapid Spin
- Psybeam
- Aurora Beam


Multiple Pokémon are separated by a blank line.

Notes

Your team uses the IVs and EVs exactly as provided in myteam.txt.

Items here affect planner behavior (e.g., Sitrus/Oran preview & consumption).

enemytrainer.txt (line-based compact format)

One line per Pokémon:

Scraggy Lv.21 @Eviolite: Feint Attack, Power Up Punch, Rock Tomb, Rest [Impish|Shed Skin]


Item is optional. Everything after : is a comma-separated move list.

The planner auto-fills the Enemy Team from the first 6 lines.

Berries, Status & Turn Logic

Berries supported in planner logic:

Oran: +10 HP if remaining ≤ 50% (Gen-aware threshold)

Sitrus: +25% HP if remaining ≤ 50% (Gen 4+)

Consumption rules

If a roll procs a berry, it’s consumed once and won’t proc on later turns.

If you switch rolls within the same turn, the app first rolls back the previous click (HP, status, berry consumed flag) and then applies the new roll.
→ This guarantees “unconsume on switch” behavior: if the new roll doesn’t proc, the berry is restored to unconsumed.

Status from moves (preview & apply):

Will-O-Wisp → BRN, Thunder Wave/Nuzzle → PAR, Toxic → TOX, Poison Gas/Powder → PSN

End-of-turn residual (Burn/Psn/Toxic) is previewed and applied after berry healing.

API Reference
POST /api/calc

Body

{
  "gen": 9,
  "myText": "string",
  "enemyText": "string",
  "attacker": "string",
  "move": "string",
  "defender": "string",
  "overrides": {
    "attacker": { "item": "string", "status": "brn|par|psn|tox|frz|slp" },
    "defender": { "item": "string", "status": "brn|par|psn|tox|frz|slp" }
  }
}


Response (excerpt)

{
  "defender": "Eelektrik",
  "defenderMaxHP": 70,
  "damage": { "lowPct": 34, "lowHP": 24, "highPct": 40, "highHP": 28, "critPct": 60, "critHP": 42 },
  "remaining": { "lowPct": 60, "lowHP": 42, "highPct": 66, "highHP": 46, "critPct": 40, "critHP": 28 },
  "debug": { "...": "stats, rolls, desc" }
}


damage is from full HP (how much is dealt).

remaining is from full HP (how much is left).
The frontend subtracts from current HP to show the correct post-hit values.

Scripts
# Start API only (Express + ts-node)
npm run server

# Start frontend (Vite)
npm run dev

# (optional) Type-check
npm run typecheck

# (optional) Build frontend
npm run build


If you don’t have typecheck/build in package.json, add them for your setup (Vite/Cra/etc.).

Troubleshooting

TS2339 / missing property errors
Make sure your src/server.ts matches the current code in the repo (some fields like makesContact were removed from the debug echo).

API builds but calc looks wrong
Check the console’s [calc] ... debug output. Confirm that your myteam IVs/EVs are present (the app preserves parsed values and does not force 31).

Berries not consuming
Click a roll that clearly crosses the berry threshold from the current HP. Switching rolls in the same turn should “unconsume” automatically.

Development Tips

The UI shows your current party HP after each applied roll.
Turn 2 calcs start from that updated state.

Enemy items are inferred from enemytrainer.txt when possible; you can still override items/status on your side in the UI.

The server is stateless; all state lives in the UI.
