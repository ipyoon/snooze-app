export type Mission = 'math' | 'shake' | 'checkpoint';
export type AttemptOutcome = 'verified' | 'snoozed' | 'timeout';

export type WakeLog = {
  id: string;
  at: number;
  mode: 'demo' | 'real';
  mission: Mission;
  contextKey: string;
  outcome: AttemptOutcome;
  responseSeconds: number;
  waitMinutes: number;
  attempt: number;
};

export type RiskMode = 'gentle' | 'balanced' | 'strict';

export type Weights = {
  missedDeadline: number;
  earlyMinute: number;
  interruption: number;
  burden: number;
};

export type Candidate = {
  waitMinutes: number;
  mission: Mission;
  contextKey: string;
  predictedAttemptSuccess: number;
  predictedDeadlineSuccess: number;
  observations: number;
  expectedCost: number;
};

export type OptimizeInput = {
  age?: number;
  remainingMinutes: number;
  attempt: number;
  enabledMissions: Mission[];
  logs: WakeLog[];
  riskMode: RiskMode;
  maxAttempts?: number;
  paced?: boolean;
  retryWaitMinutes?: number[];
};

export const MISSION_LABEL: Record<Mission, string> = {
  math: 'Math check',
  shake: 'Movement check',
  checkpoint: 'Object photo check',
};

export const MISSION_BURDEN: Record<Mission, number> = {
  math: 1,
  shake: 1.25,
  checkpoint: 1.75,
};

export const RISK_WEIGHTS: Record<RiskMode, Weights> = {
  gentle: {
    missedDeadline: 80,
    earlyMinute: 0.9,
    interruption: 3,
    burden: 1.5,
  },
  balanced: {
    missedDeadline: 150,
    earlyMinute: 0.5,
    interruption: 2,
    burden: 1,
  },
  strict: {
    missedDeadline: 300,
    earlyMinute: 0.2,
    interruption: 1,
    burden: 0.5,
  },
};

const ATTEMPT_BUDGET_MINUTES = 2;

/**
 * Coarse bins keep the early personal model from fragmenting into empty groups.
 * No sleep-stage claim is made: these are alarm-response features only.
 */
export function makeContextKey(
  remainingMinutes: number,
  attempt: number,
  waitMinutes: number,
  mission: Mission,
) {
  const deadlineBand = remainingMinutes - waitMinutes <= 6 ? 'near' : 'buffer';
  const attemptBand = attempt === 0 ? 'first' : attempt === 1 ? 'second' : 'later';
  const waitBand = waitMinutes <= 3 ? 'short' : waitMinutes <= 7 ? 'medium' : 'long';
  return `${mission}|${deadlineBand}|${attemptBand}|${waitBand}`;
}

function posteriorFor(logs: WakeLog[], mission: Mission, contextKey: string) {
  // A whole-sequence result must not train a single-mission success estimate.
  const missionRows = logs.filter((row) => row.mission === mission && !row.contextKey.includes('|sequence:'));
  const contextRows = missionRows.filter((row) => row.contextKey === contextKey);
  const missionWins = missionRows.filter((row) => row.outcome === 'verified').length;
  const contextWins = contextRows.filter((row) => row.outcome === 'verified').length;

  // Hierarchical Beta-Binomial shrinkage. The mission-wide posterior becomes
  // a weak prior for a sparse context-specific bucket.
  const missionMean = (missionWins + 2) / (missionRows.length + 4);
  const priorStrength = 4;
  const alpha = missionMean * priorStrength + contextWins;
  const beta = (1 - missionMean) * priorStrength + contextRows.length - contextWins;

  return {
    probability: alpha / (alpha + beta),
    observations: contextRows.length,
  };
}

/**
 * Finite-horizon dynamic programming over every allowed wait and mission.
 * It minimizes expected disruption + failure cost while looking ahead to the
 * best recovery action after an unsuccessful attempt.
 */
export function optimizeWakeAction(input: OptimizeInput): Candidate[] {
  const {
    remainingMinutes,
    attempt,
    enabledMissions,
    logs,
    riskMode,
    maxAttempts: configuredMaxAttempts = 4,
    age,
  } = input;

  if (input.retryWaitMinutes && (input.retryWaitMinutes.length < 1 || input.retryWaitMinutes.length > 3 || !input.retryWaitMinutes.every(n => Number.isInteger(n) && n >= 1 && n <= 10))) {
    throw new Error('Recommended retry waits must contain 1–3 whole-minute intervals from 1 to 10.');
  }
  const maxAttempts = input.retryWaitMinutes ? input.retryWaitMinutes.length + 1 : configuredMaxAttempts;

  if (!Number.isInteger(remainingMinutes) || remainingMinutes < 0 || remainingMinutes > 60) {
    throw new Error('remainingMinutes must be an integer from 0 to 60.');
  }
  if (!Number.isInteger(attempt) || attempt < 0 || attempt >= maxAttempts) {
    throw new Error('attempt is outside the configured horizon.');
  }
  if (!enabledMissions.length) throw new Error('At least one mission must be enabled.');
  if (age !== undefined && (!Number.isInteger(age) || age < 1 || age > 120)) throw new Error('Age must be a whole number from 1 to 120.');

  const weights = RISK_WEIGHTS[riskMode];
  const memo = new Map<string, Candidate[]>();

  function solve(remaining: number, currentAttempt: number): Candidate[] {
    if (remaining < ATTEMPT_BUDGET_MINUTES || currentAttempt >= maxAttempts) return [];
    const stateKey = `${remaining}:${currentAttempt}`;
    const cached = memo.get(stateKey);
    if (cached) return cached;

    const candidates: Candidate[] = [];
    const minimumWait = currentAttempt === 0 ? 0 : 1;
    const maximumWait = remaining - ATTEMPT_BUDGET_MINUTES;

    for (const mission of enabledMissions) {
      for (let wait = minimumWait; wait <= maximumWait; wait += 1) {
        // User-selected window pacing: start at its opening, then spread retries
        // across the remaining time, reserving two minutes for the last check.
        if (input.retryWaitMinutes) {
          const requested = currentAttempt === 0 ? 0 : input.retryWaitMinutes[currentAttempt - 1];
          // Actual elapsed time may leave less room than the planned allowance.
          // Clamp a retry to the remaining window; never schedule past the goal.
          if (wait !== Math.min(requested, maximumWait)) continue;
        } else if (input.paced) {
          const slots = Math.min(maxAttempts-currentAttempt, Math.floor((remaining+1)/3));
          const pacedWait = currentAttempt === 0 ? 0 : Math.max(1, Math.floor((remaining-2)/Math.max(1,slots)));
          if (wait !== pacedWait) continue;
        }
        // Age labels group observed responses. No unvalidated age-specific sleep-cycle
        // length or wake-probability adjustment is imposed on a new user.
        const ageGroup = age === undefined ? '' : age < 18 ? 'under18' : age < 40 ? '18to39' : age < 65 ? '40to64' : '65plus';
        const contextKey = makeContextKey(remaining, currentAttempt, wait, mission) + (ageGroup ? `|age:${ageGroup}` : '');
        const posterior = posteriorFor(logs, mission, contextKey);
        const future = solve(remaining - wait - ATTEMPT_BUDGET_MINUTES, currentAttempt + 1)[0];
        const failureProbability = 1 - posterior.probability;
        const immediateCost =
          weights.interruption +
          weights.burden * MISSION_BURDEN[mission] +
          (currentAttempt === 0 ? weights.earlyMinute * (remaining - wait) : 0);
        const futureCost = future?.expectedCost ?? weights.missedDeadline;
        const missProbability = failureProbability * (1 - (future?.predictedDeadlineSuccess ?? 0));

        candidates.push({
          waitMinutes: wait,
          mission,
          contextKey,
          predictedAttemptSuccess: posterior.probability,
          predictedDeadlineSuccess: 1 - missProbability,
          observations: posterior.observations,
          expectedCost: immediateCost + failureProbability * futureCost,
        });
      }
    }

    candidates.sort(
      (a, b) =>
        a.expectedCost - b.expectedCost ||
        b.predictedDeadlineSuccess - a.predictedDeadlineSuccess ||
        b.waitMinutes - a.waitMinutes,
    );
    memo.set(stateKey, candidates);
    return candidates;
  }

  return solve(remainingMinutes, attempt);
}

export function failurePath(
  input: OptimizeInput,
  maxItems = 4,
): Candidate[] {
  const path: Candidate[] = [];
  let remaining = input.remainingMinutes;
  let attempt = input.attempt;

  while (path.length < maxItems && attempt < (input.retryWaitMinutes ? input.retryWaitMinutes.length + 1 : input.maxAttempts ?? 4)) {
    const next = optimizeWakeAction({ ...input, remainingMinutes: remaining, attempt })[0];
    if (!next) break;
    path.push(next);
    remaining -= next.waitMinutes + ATTEMPT_BUDGET_MINUTES;
    attempt += 1;
  }

  return path;
}

export function makeSeedLogs(): WakeLog[] {
  const rows: WakeLog[] = [];
  const add = (mission: Mission, successCount: number, failureCount: number) => {
    for (let index = 0; index < successCount + failureCount; index += 1) {
      rows.push({
        id: `seed-${mission}-${index}`,
        at: Date.now() - (index + 1) * 86_400_000,
        mode: 'demo',
        mission,
        contextKey: `${mission}|buffer|first|medium`,
        outcome: index < successCount ? 'verified' : 'timeout',
        responseSeconds: 18 + index,
        waitMinutes: 5,
        attempt: 0,
      });
    }
  };
  add('math', 3, 3);
  add('shake', 5, 2);
  add('checkpoint', 6, 1);
  return rows;
}
