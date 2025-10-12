Of course\! Here is your README, updated with Markdown for a clean, professional look.

# Poke Fight Planner

> Plan Pokémon battles with real, reproducible damage rolls. Upload your teams, run calcs with the Smogon damage engine, apply rolls turn-by-turn, and track items/status (including berries that auto-consume at thresholds).

-----

## 📋 Table of Contents

  * [Requirements](https://www.google.com/search?q=%23-requirements)
  * [Quick Start](https://www.google.com/search?q=%23-quick-start)
  * [What’s in the Box](https://www.google.com/search?q=%23-whats-in-the-box)
  * [How It Works](https://www.google.com/search?q=%23-how-it-works)
  * [File Formats](https://www.google.com/search?q=%23-file-formats)
  * [Berries, Status & Turn Logic](https://www.google.com/search?q=%23-berries-status--turn-logic)
  * [API Reference](https://www.google.com/search?q=%23-api-reference)
  * [Scripts](https://www.google.com/search?q=%23-scripts)
  * [Troubleshooting](https://www.google.com/search?q=%23-troubleshooting)
  * [Development Tips](https://www.google.com/search?q=%23-development-tips)

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

## ⚡ Quick Start

1.  **Install dependencies:**

    ```bash
    npm install
    ```

2.  **Run the API server** (Express + ts-node):

    ```bash
    npm run server
    ```

      * Defaults to `http://localhost:3001`.
      * Override the port with an environment variable: `PORT=4000 npm run server`

3.  **Run the web app:**

    ```bash
    npm run dev
    ```

      * Usually starts on `http://localhost:5173` (Vite default).
      * The web app calls the API at `/api/calc`. This works via proxy out of the box. Otherwise, ensure the frontend targets the correct API address.

-----

## 📦 What’s in the Box

  * **Frontend** (React + TypeScript): The battle planner UI.

      * `src/App.tsx` – Main planner UI (teams, turn list, rolls).
      * `src/components/TeamBox.tsx` – Party UI with HP bars, items, and status.
      * `src/components/QueryEditor.tsx` – Input for `"<attacker> use <move> on <defender>"`.
      * `src/logic/*` – Parsers, grammar, and HP/berry math.

  * **Backend** (Express + TypeScript):

      * `src/server.ts` – The `/api/calc` endpoint.
      * `src/damage.ts` – A wrapper around `@smogon/calc`.
      * `src/parser.ts`, `src/types.ts` – Parsing logic and types.

-----

## ⚙️ How It Works

1.  **Upload two files** in the UI:

      * `myteam.txt` – Your team in Showdown format.
      * `enemytrainer.txt` – The opponent's team in a compact line format.

2.  The **frontend sends** a request to the API:

    ```json
    {
      "gen": 9,
      "myText": "<contents of myteam.txt>",
      "enemyText": "<normalized contents of enemytrainer.txt>",
      "attacker": "Kubfu",
      "move": "Brick Break",
      "defender": "Eelektrik"
    }
    ```

3.  The **server** uses `@smogon/calc` to compute damage and returns the results.

4.  The **UI then**:

      * Converts the damage values to reflect the Pokémon's *current* HP.
      * Previews status effects or berry consumption.
      * Lets you apply a roll, which updates the party's state for the next turn.

-----

## 📁 File Formats

### `myteam.txt` (Showdown format)

Your team uses the IVs, EVs, nature, ability, and item exactly as provided. Items listed here will enable planner features (e.g., Sitrus/Oran berry previews).

**Example:**

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
```

*Multiple Pokémon are separated by a blank line.*

### `enemytrainer.txt` (compact format)

Each Pokémon is on a single line. The planner auto-fills the enemy team from the first 6 lines of this file.

**Example:**

```
Scraggy Lv.21 @Eviolite: Feint Attack, Power Up Punch, Rock Tomb, Rest [Impish|Shed Skin]
```

*The item (`@...`), moves (`:`), and details (`[...]`) are all optional.*

-----

## 🍓 Berries, Status & Turn Logic

  * **Berries Supported:**

      * **Oran Berry**: Restores 10 HP if remaining HP is ≤ 50%.
      * **Sitrus Berry**: Restores 25% max HP if remaining HP is ≤ 50% (Gen 4+).

  * **Consumption Rules:**

      * If a damage roll triggers a berry, it’s marked as **consumed** for the rest of the battle.
      * If you select a different damage roll *within the same turn*, the app automatically **rolls back** the previous state change, ensuring berries are only consumed if the new roll also crosses the threshold.

  * **Status from Moves:** The app will preview and apply status effects.

      * `Will-O-Wisp` → **BRN**
      * `Thunder Wave`/`Nuzzle` → **PAR**
      * `Toxic` → **TOX**
      * `Poison Gas`/`Poison Powder` → **PSN**

*End-of-turn residual damage (Burn, Poison, Toxic) is previewed and applied after any berry healing.*

-----

## 🌐 API Reference

### `POST /api/calc`

#### Body

```json
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
```

#### Response (excerpt)

```json
{
  "defender": "Eelektrik",
  "defenderMaxHP": 70,
  "damage": { "lowPct": 34, "lowHP": 24, "highPct": 40, "highHP": 28, "critPct": 60, "critHP": 42 },
  "remaining": { "lowPct": 60, "lowHP": 42, "highPct": 66, "highHP": 46, "critPct": 40, "critHP": 28 },
  "debug": { "...": "stats, rolls, desc" }
}
```

**Note:** `damage` is calculated from full HP, while the frontend subtracts from the Pokémon's *current* HP to show the correct post-hit values.

-----

## 📜 Scripts

```bash
# Start API only (Express + ts-node)
npm run server

# Start frontend (Vite)
npm run dev

# (optional) Type-check
npm run typecheck

# (optional) Build frontend
npm run build
```

*If `typecheck` or `build` are not in your `package.json`, add them based on your project setup (Vite, Create React App, etc.).*

-----

## 🔍 Troubleshooting

### TS2339 / missing property errors

Ensure `src/server.ts` matches the current repository code. Some debug fields may have been removed or changed in newer versions.

### API builds but calculations look wrong

Check the `[calc] ...` debug output in your server console. Confirm that your IVs/EVs from `myteam.txt` are being used correctly.

### Berries not consuming

Click a damage roll that clearly crosses the 50% HP threshold *from the Pokémon's current HP*. Remember that switching rolls in the same turn will "unconsume" and re-evaluate the berry condition.

-----

## 💡 Development Tips

  * The UI shows your party's current HP after each applied roll. The next turn's calculations will be based on that updated state.
  * Enemy items are inferred from `enemytrainer.txt` when possible, but you can always override items and status for any Pokémon directly in the UI.
  * The server is **stateless**; all battle state (HP, status, consumed items) lives in the UI.
