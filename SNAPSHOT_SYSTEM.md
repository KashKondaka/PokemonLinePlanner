# Turn-Based Snapshot System

## Overview
Implemented a robust turn-based snapshot system that captures and restores Pokemon state at each turn, preventing issues like Intimidate applying multiple times when clicking Calc repeatedly.

## Architecture

### Data Structure
Each `TurnLine` contains:
- **`startSnapshot`**: State of all Pokemon at the START of this turn
- **`endSnapshot`**: State of all Pokemon at the END of this turn (after Run is clicked)

```typescript
type TeamSnapshot = {
  my: (MemberEx | undefined)[];
  enemy: (MemberEx | undefined)[];
};
```

Each snapshot stores complete Pokemon state:
- HP (pct, curHP, maxHP)
- Stat stages (atk, def, spatk, spdef, spd)
- Status conditions
- Berry state (name, consumed)
- Item

## Flow

### Turn 1 (Initial State)
1. **Start Snapshot**: All Pokemon at 100% HP, 0 stat stages
2. **Calc Button**:
   - Restores to startSnapshot
   - Applies Intimidate (if applicable)
   - Calculates damage
3. **Run Button**:
   - Applies damage/stat changes
   - Creates endSnapshot
   - endSnapshot becomes Turn 2's startSnapshot

### Subsequent Turns
1. **Start Snapshot**: Automatically set from previous turn's endSnapshot
2. **Calc Button**: Same flow as Turn 1
3. **Run Button**: Same flow as Turn 1

## Key Functions

### `getStartSnapshotForTurn(turnIndex)`
Determines the correct start snapshot for a turn:
- Turn 0: Uses initial team state
- Turn N: Uses Turn N-1's endSnapshot
- Falls back to current team state if snapshots missing

### `restoreFromSnapshot(snapshot)`
Restores both teams to the exact state in the snapshot:
```typescript
setMyTeam(snapshot.my.map(cloneMember));
setEnemyTeam(snapshot.enemy.map(cloneMember));
```

### `cloneSnapshot(snapshot)`
Deep clones a snapshot to prevent reference issues.

## Calc Button Behavior

```typescript
async function doCalc(i: number) {
  // STEP 1: Get or create start snapshot
  let startSnap = turns[i].startSnapshot;
  if (!startSnap) {
    startSnap = getStartSnapshotForTurn(i);
    // Save it
  }
  
  // STEP 2: Restore to start snapshot (KEY!)
  restoreFromSnapshot(startSnap);
  await new Promise(resolve => setTimeout(resolve, 0));
  
  // STEP 3: Apply Intimidate
  // Only happens once because state is reset each Calc
  if (attackerFirstTurnOut && hasIntimidate) {
    lowerDefenderAttack();
  }
  
  // STEP 4: Calculate damage
  // ...
}
```

## Run Button Behavior

```typescript
function applySelectedRoll(i: number) {
  // Apply damage/stat changes
  // ...
  
  // Create end snapshot
  setTimeout(() => {
    setTurns(prev => prev.map((x, idx) => {
      if (idx !== i) return x;
      return {
        ...x,
        endSnapshot: {
          my: myTeam.map(cloneMember),
          enemy: enemyTeam.map(cloneMember),
        }
      };
    }));
    
    // Set next turn's start snapshot
    setTurns(prev => {
      if (i + 1 >= prev.length) return prev;
      return prev.map((x, idx) => {
        if (idx !== i + 1) return x;
        return {
          ...x,
          startSnapshot: cloneSnapshot(prev[i].endSnapshot),
        };
      });
    });
  }, 50);
}
```

## Undo Button Behavior

Simplified to just restore the start snapshot:

```typescript
function undoRun(i: number) {
  // Restore to start snapshot
  if (turns[i].startSnapshot) {
    restoreFromSnapshot(turns[i].startSnapshot);
  }
  
  // Clear run state and end snapshot
  setTurns(prev => prev.map((x, idx) => idx === i
    ? { ...x, runApplied: false, endSnapshot: undefined }
    : x));
  
  // Invalidate next turn's start snapshot
  if (i + 1 < turns.length) {
    setTurns(prev => prev.map((x, idx) => idx === i + 1
      ? { ...x, startSnapshot: undefined }
      : x));
  }
}
```

## Delete Turn Behavior

Restores state and recalculates snapshots:

```typescript
function deleteTurn(i: number) {
  // Restore to start snapshot if turn was applied
  if (turns[i].runApplied && turns[i].startSnapshot) {
    restoreFromSnapshot(turns[i].startSnapshot);
  }
  
  // Remove turn
  setTurns(prev => prev.filter((_, idx) => idx !== i));
  
  // Recalculate subsequent turn snapshots
  setTimeout(() => {
    setTurns(prev => prev.map((turn, idx) => {
      if (idx < i) return turn;
      const startSnap = getStartSnapshotForTurn(idx);
      return { ...turn, startSnapshot: startSnap };
    }));
  }, 100);
}
```

## Benefits

### 1. **Idempotent Calc**
Clicking Calc multiple times always starts from the same state:
- Intimidate only applies once
- Damage calculations are consistent
- No accidental state mutations

### 2. **Clean Turn Progression**
Each turn builds on the previous turn's final state:
- Turn 1 ends with Pokemon at 50 HP
- Turn 2 starts with Pokemon at 50 HP
- No HP mysteriously changing between turns

### 3. **Reliable Undo**
Undo simply restores the start snapshot:
- No need to manually track individual changes
- Works for all types of changes (HP, stats, berries, status)
- Invalidates dependent snapshots automatically

### 4. **Delete Safety**
Deleting a turn properly restores state and recalculates:
- No orphaned state
- Subsequent turns get correct start snapshots
- Timeline stays consistent

## Example Scenario

```
Initial State: Combusken (100 HP), Hitmontop (100 HP, Intimidate)

Turn 1: "Combusken use Thunder Punch on Hitmontop"
  - Check "P2 first" (Hitmontop's Intimidate)
  - Click Calc:
    * Restores to 100 HP each
    * Applies Intimidate: Combusken Atk -1
    * Calculates damage with -1 Attack
  - Click Calc again:
    * Restores to 100 HP each
    * Applies Intimidate: Combusken Atk -1 (same as before!)
    * Same damage calculation
  - Click Run: Hitmontop takes 20 damage (80 HP remaining)
  - End snapshot: Combusken 100 HP (-1 Atk), Hitmontop 80 HP

Turn 2: "Hitmontop use Mach Punch on Combusken"
  - Start snapshot: Combusken 100 HP (-1 Atk), Hitmontop 80 HP
  - Click Calc: Restores to above state, calculates damage
  - Click Run: Combusken takes 15 damage
  - End snapshot: Combusken 85 HP (-1 Atk), Hitmontop 80 HP

Undo Turn 2:
  - Restores to Turn 2 start: Combusken 100 HP (-1 Atk), Hitmontop 80 HP
```

## Implementation Details

### Memory Efficiency
- Snapshots are only created when needed
- Deep cloning prevents reference issues
- Old snapshots are cleaned up on delete/undo

### Timing
- Uses `setTimeout` with 0-50ms delays to ensure React state updates complete
- Async/await in Calc ensures restoration completes before calculations

### Robustness
- Handles missing snapshots with fallbacks
- Works for both damage moves and stat-changing moves
- Properly chains snapshots across turns

## Future Enhancements
- Could compress snapshots (only store deltas)
- Could add snapshot history for multi-level undo
- Could export/import snapshot timelines

