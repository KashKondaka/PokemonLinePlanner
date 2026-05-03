import { Dex } from '@pkmn/dex';
import { Generations } from '@pkmn/data';

const gens = new Generations(Dex);

// --- Types ---

export interface RiskEvent {
  type:
    | 'enemy_crit_kill'
    | 'enemy_high_roll_kill'
    | 'secondary_para'
    | 'secondary_flinch'
    | 'secondary_burn'
    | 'secondary_freeze'
    | 'full_para'
    | 'move_miss'
    | 'freeze_immobile';
  description: string;
  probability: number;
  impact: 'fatal' | 'disruptive';
  details?: string;
}

export interface TurnRisk {
  turnNumber: number;
  risks: RiskEvent[];
  turnSuccessProbability: number;
}

export interface RiskSummaryStats {
  totalCritsDodged: number;
  totalSecondaryEffectsDodged: number;
  totalAccuracyChecksPassed: number;
  totalFullParaChecksPassed: number;
}

export interface RiskReport {
  turns: TurnRisk[];
  overallSuccessProbability: number;
  overallFailureProbability: number;
  summaryStats: RiskSummaryStats;
  summary: string;
}

export interface TurnInput {
  turnNumber: number;
  playerAction: {
    type: 'attack' | 'switch';
    moveName?: string;
    attackerName?: string;
    defenderName?: string;
  };
  enemyAction: {
    type: 'attack' | 'switch';
    moveName?: string;
    attackerName?: string;
    defenderName?: string;
    rawRollsNormal?: number[];
    rawRollsCrit?: number[];
  };
  myPokemonHP: number;
  myPokemonMaxHP: number;
  myPokemonStatus?: string;
  enemyMovesFirst?: boolean;
}

export interface RiskAnalysisInput {
  gen: number;
  turns: TurnInput[];
}

// --- Crit rate lookup ---

function getCritRate(gen: number, critRatio: number): number {
  if (gen === 1) {
    return critRatio >= 2 ? 1 / 4 : 1 / 16;
  }
  if (gen <= 5) {
    switch (critRatio) {
      case 1: return 1 / 16;
      case 2: return 1 / 8;
      case 3: return 1 / 4;
      case 4: return 1 / 3;
      default: return 1;
    }
  }
  // Gen 6+
  switch (critRatio) {
    case 1: return 1 / 16;
    case 2: return 1 / 8;
    case 3: return 1 / 2;
    default: return 1;
  }
}

// --- Move metadata lookup ---

interface MoveMetadata {
  accuracy: number | true;
  critRatio: number;
  secondaries: Array<{
    chance: number;
    status?: string;
    volatileStatus?: string;
    boosts?: Record<string, number>;
  }> | null;
  category: string;
}

function getMoveMetadata(gen: number, moveName: string): MoveMetadata | null {
  try {
    const generation = gens.get(gen as any);
    const move = generation.moves.get(moveName);
    if (!move) return null;
    return {
      accuracy: move.accuracy,
      critRatio: (move as any).critRatio ?? 1,
      secondaries: (move as any).secondaries ?? null,
      category: move.category ?? 'Physical',
    };
  } catch {
    return null;
  }
}

// --- Core analysis ---

export function analyzeRisk(input: RiskAnalysisInput): RiskReport {
  const { gen, turns } = input;
  const turnRisks: TurnRisk[] = [];

  let accumulatedParaChance = 0;

  for (const turn of turns) {
    const risks: RiskEvent[] = [];

    const enemyMove = turn.enemyAction.moveName;
    const playerMove = turn.playerAction.moveName;
    const myHP = turn.myPokemonHP;
    const myMaxHP = turn.myPokemonMaxHP;

    // --- Enemy attack risks ---
    if (turn.enemyAction.type === 'attack' && enemyMove && myHP > 0) {
      const enemyMeta = getMoveMetadata(gen, enemyMove);

      // 1. Enemy crit kill
      if (turn.enemyAction.rawRollsCrit && turn.enemyAction.rawRollsCrit.length > 0) {
        const critRolls = turn.enemyAction.rawRollsCrit;
        const normalRolls = turn.enemyAction.rawRollsNormal ?? [];

        const normalMaxDmg = normalRolls.length > 0 ? normalRolls[normalRolls.length - 1] : 0;
        const survivesNormal = normalMaxDmg < myHP;

        const critKillCount = critRolls.filter(r => r >= myHP).length;

        if (survivesNormal && critKillCount > 0) {
          const critRatio = enemyMeta?.critRatio ?? 1;
          const critRate = getCritRate(gen, critRatio);
          const critKillProb = critRate * (critKillCount / critRolls.length);

          risks.push({
            type: 'enemy_crit_kill',
            description: `${turn.enemyAction.attackerName ?? 'Enemy'} can crit with ${enemyMove} and KO (${critKillCount}/${critRolls.length} crit rolls kill)`,
            probability: critKillProb,
            impact: 'fatal',
            details: `Crit rate: ${(critRate * 100).toFixed(1)}%, KO rolls: ${critKillCount}/${critRolls.length}`,
          });
        }
      }

      // 2. Enemy high roll kill (non-crit)
      if (turn.enemyAction.rawRollsNormal && turn.enemyAction.rawRollsNormal.length > 0) {
        const normalRolls = turn.enemyAction.rawRollsNormal;
        const killCount = normalRolls.filter(r => r >= myHP).length;

        if (killCount > 0 && killCount < normalRolls.length) {
          const highRollKillProb = killCount / normalRolls.length;
          risks.push({
            type: 'enemy_high_roll_kill',
            description: `${turn.enemyAction.attackerName ?? 'Enemy'}'s ${enemyMove} can high-roll KO (${killCount}/${normalRolls.length} rolls kill)`,
            probability: highRollKillProb,
            impact: 'fatal',
            details: `${killCount} of ${normalRolls.length} damage rolls are lethal at ${myHP}/${myMaxHP} HP`,
          });
        }
      }

      // 3. Secondary effects from enemy move
      if (enemyMeta?.secondaries) {
        for (const secondary of enemyMeta.secondaries) {
          const chance = secondary.chance / 100;

          if (secondary.status === 'par') {
            risks.push({
              type: 'secondary_para',
              description: `${enemyMove} has ${secondary.chance}% chance to paralyze`,
              probability: chance,
              impact: 'disruptive',
              details: `Paralysis from ${enemyMove} would reduce speed by 75% and cause 25% full-para chance each turn`,
            });
            accumulatedParaChance = 1 - (1 - accumulatedParaChance) * (1 - chance);
          }

          if (secondary.volatileStatus === 'flinch' && turn.enemyMovesFirst) {
            risks.push({
              type: 'secondary_flinch',
              description: `${enemyMove} has ${secondary.chance}% chance to flinch (enemy moves first)`,
              probability: chance,
              impact: 'fatal',
              details: `Flinch prevents your action this turn`,
            });
          }

          if (secondary.status === 'brn') {
            risks.push({
              type: 'secondary_burn',
              description: `${enemyMove} has ${secondary.chance}% chance to burn`,
              probability: chance,
              impact: 'disruptive',
              details: `Burn halves physical attack damage and deals 1/8 max HP per turn`,
            });
          }

          if (secondary.status === 'frz') {
            risks.push({
              type: 'secondary_freeze',
              description: `${enemyMove} has ${secondary.chance}% chance to freeze`,
              probability: chance,
              impact: 'fatal',
              details: `Freeze prevents all actions until thawed (20% chance per turn in Gen 4+)`,
            });
          }
        }
      }
    }

    // --- Player action risks ---
    if (turn.playerAction.type === 'attack' && playerMove) {
      const playerMeta = getMoveMetadata(gen, playerMove);

      // 4. Move accuracy miss
      if (playerMeta && playerMeta.accuracy !== true && playerMeta.accuracy < 100) {
        const missChance = 1 - (playerMeta.accuracy / 100);
        risks.push({
          type: 'move_miss',
          description: `${playerMove} can miss (${playerMeta.accuracy}% accuracy)`,
          probability: missChance,
          impact: 'fatal',
          details: `${(missChance * 100).toFixed(1)}% chance to miss`,
        });
      }

      // 5. Full paralysis check
      const isPara = turn.myPokemonStatus === 'par';
      if (isPara) {
        const fullParaChance = 0.25;
        risks.push({
          type: 'full_para',
          description: `Paralyzed Pokemon has 25% chance of not moving`,
          probability: fullParaChance,
          impact: 'fatal',
          details: `Full paralysis prevents action this turn`,
        });
      }

      // 6. Freeze immobility
      if (turn.myPokemonStatus === 'frz') {
        const stayFrozenChance = gen <= 4 ? 0.80 : 0.80;
        risks.push({
          type: 'freeze_immobile',
          description: `Frozen Pokemon has 80% chance of staying frozen`,
          probability: stayFrozenChance,
          impact: 'fatal',
          details: `20% chance to thaw each turn`,
        });
      }
    }

    // Calculate turn success probability (only fatal risks compound)
    const fatalRisks = risks.filter(r => r.impact === 'fatal');
    const turnSuccess = fatalRisks.reduce(
      (prob, risk) => prob * (1 - risk.probability),
      1.0
    );

    turnRisks.push({
      turnNumber: turn.turnNumber,
      risks,
      turnSuccessProbability: turnSuccess,
    });
  }

  // Overall line probability
  const overallSuccess = turnRisks.reduce(
    (prob, tr) => prob * tr.turnSuccessProbability,
    1.0
  );

  // Summary stats
  const summaryStats: RiskSummaryStats = {
    totalCritsDodged: turnRisks.reduce(
      (sum, tr) => sum + tr.risks.filter(r => r.type === 'enemy_crit_kill').length,
      0
    ),
    totalSecondaryEffectsDodged: turnRisks.reduce(
      (sum, tr) => sum + tr.risks.filter(r =>
        r.type === 'secondary_para' || r.type === 'secondary_flinch' ||
        r.type === 'secondary_burn' || r.type === 'secondary_freeze'
      ).length,
      0
    ),
    totalAccuracyChecksPassed: turnRisks.reduce(
      (sum, tr) => sum + tr.risks.filter(r => r.type === 'move_miss').length,
      0
    ),
    totalFullParaChecksPassed: turnRisks.reduce(
      (sum, tr) => sum + tr.risks.filter(r => r.type === 'full_para').length,
      0
    ),
  };

  // Build summary string
  const parts: string[] = [];
  if (summaryStats.totalCritsDodged > 0) {
    parts.push(`dodging ${summaryStats.totalCritsDodged} crit${summaryStats.totalCritsDodged > 1 ? 's' : ''}`);
  }
  if (summaryStats.totalSecondaryEffectsDodged > 0) {
    parts.push(`avoiding ${summaryStats.totalSecondaryEffectsDodged} secondary effect${summaryStats.totalSecondaryEffectsDodged > 1 ? 's' : ''}`);
  }
  if (summaryStats.totalAccuracyChecksPassed > 0) {
    parts.push(`hitting ${summaryStats.totalAccuracyChecksPassed} accuracy check${summaryStats.totalAccuracyChecksPassed > 1 ? 's' : ''}`);
  }
  if (summaryStats.totalFullParaChecksPassed > 0) {
    parts.push(`passing ${summaryStats.totalFullParaChecksPassed} full-para check${summaryStats.totalFullParaChecksPassed > 1 ? 's' : ''}`);
  }

  const successPct = (overallSuccess * 100).toFixed(1);
  let summary = `Line success: ${successPct}%`;
  if (parts.length > 0) {
    summary += ` — This line requires ${parts.join(', ')}.`;
  }
  summary += ` Total crits dodged: ${summaryStats.totalCritsDodged}. Total secondary effects dodged: ${summaryStats.totalSecondaryEffectsDodged}. Accuracy checks: ${summaryStats.totalAccuracyChecksPassed}.`;

  return {
    turns: turnRisks,
    overallSuccessProbability: overallSuccess,
    overallFailureProbability: 1 - overallSuccess,
    summaryStats,
    summary,
  };
}
