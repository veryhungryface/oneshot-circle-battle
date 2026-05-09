export type TeamId = 'A' | 'B' | 'C' | 'D';
export type RoundStatus = 'lobby' | 'active' | 'revealed';
export type GameModeId = 'guide' | 'blind' | 'oneStroke' | 'speed';

export type TeamConfig = {
  id: TeamId;
  name: string;
  color: string;
  softColor: string;
};

export type CirclePoint = {
  x: number;
  y: number;
  t?: number;
};

export type CircleMetrics = {
  accuracy: number;
  roundness: number;
  closure: number;
  smoothness: number;
  radiusStability: number;
  centerStability: number;
  radiusMatch: number;
  pointCount: number;
};

export type CircleEstimate = {
  center: { x: number; y: number };
  radius: number;
  radiusStd: number;
  coverage: number;
};

export type CircleMode = {
  id: GameModeId;
  name: string;
  shortName: string;
  description: string;
  durationSec: number;
  showGuide: boolean;
};

export type Player = {
  id: string;
  name: string;
  team: TeamId;
  totalScore: number;
  streak: number;
  isBot?: boolean;
  lastScore?: number;
  bestScore?: number;
};

export type CircleSubmission = {
  playerId: string;
  playerName: string;
  team: TeamId;
  path: CirclePoint[];
  estimate: CircleEstimate;
  metrics: CircleMetrics;
  score: number;
  durationMs: number;
  submittedAt: number;
};

export type RoundState = {
  index: number;
  status: RoundStatus;
  mode: CircleMode;
  startedAt?: number;
  revealedAt?: number;
  durationSec: number;
  submissions: CircleSubmission[];
};

export type RoomState = {
  code: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  teacherId?: string;
  teacherLastSeenAt?: number;
  showRanking: boolean;
  players: Player[];
  round: RoundState;
};

export const targetCircle = {
  x: 0.5,
  y: 0.5,
  r: 0.31
} as const;

export const teams: TeamConfig[] = [
  { id: 'A', name: 'A팀', color: '#00a7a5', softColor: '#d9fbf4' },
  { id: 'B', name: 'B팀', color: '#f45d48', softColor: '#ffe5df' },
  { id: 'C', name: 'C팀', color: '#f5b82e', softColor: '#fff3c4' },
  { id: 'D', name: 'D팀', color: '#536dff', softColor: '#e4e8ff' }
];

export const circleModes: CircleMode[] = [
  {
    id: 'guide',
    name: '기준 원 보고 그리기',
    shortName: '기준 원',
    description: '흐린 기준 원을 보며 한 번에 최대한 정확히 그려요.',
    durationSec: 18,
    showGuide: true
  },
  {
    id: 'blind',
    name: '블라인드 원',
    shortName: '블라인드',
    description: '처음 2초만 기준 원을 보고 기억해서 그려요.',
    durationSec: 16,
    showGuide: false
  },
  {
    id: 'oneStroke',
    name: '한 붓 원',
    shortName: '한 붓',
    description: '손가락을 떼는 순간 바로 제출돼요.',
    durationSec: 14,
    showGuide: true
  },
  {
    id: 'speed',
    name: '5초 속도전',
    shortName: '속도전',
    description: '정확도 80%, 속도 20%로 순위가 정해져요.',
    durationSec: 8,
    showGuide: true
  }
];

const botNames = [
  '민준',
  '서연',
  '도윤',
  '하린',
  '지우',
  '유찬',
  '서아',
  '준호',
  '예린',
  '현우',
  '다은',
  '시우',
  '나윤',
  '건우',
  '수빈',
  '태오',
  '윤서',
  '지호',
  '채원',
  '은우',
  '아린',
  '민서',
  '주원',
  '소율'
];

export function createInitialRoom(code = '7312'): RoomState {
  return {
    code,
    title: '원샷 서클 배틀',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    showRanking: true,
    players: [],
    round: {
      index: 0,
      status: 'lobby',
      mode: circleModes[0],
      durationSec: circleModes[0].durationSec,
      submissions: []
    }
  };
}

export function getTeam(teamId: TeamId): TeamConfig {
  return teams.find((team) => team.id === teamId) ?? teams[0];
}

export function getMode(modeId: GameModeId): CircleMode {
  return circleModes.find((mode) => mode.id === modeId) ?? circleModes[0];
}

export function createNextRound(currentRound: RoundState): RoundState {
  const index = currentRound.index + 1;
  return {
    index,
    status: 'lobby',
    mode: currentRound.mode,
    durationSec: currentRound.mode.durationSec,
    submissions: []
  };
}

export function seedDemoPlayers(existingPlayers: Player[]): Player[] {
  const knownIds = new Set(existingPlayers.map((player) => player.id));
  const bots = botNames
    .map<Player>((name, index) => ({
      id: `circle-bot-${index + 1}`,
      name,
      team: teams[index % teams.length].id,
      totalScore: 0,
      streak: 0,
      isBot: true
    }))
    .filter((player) => !knownIds.has(player.id));

  return [...existingPlayers, ...bots];
}

export function createSubmission(
  player: Player,
  points: CirclePoint[],
  mode: GameModeId,
  submittedAt = Date.now()
): CircleSubmission {
  const path = normalizePath(points);
  const firstTime = path.at(0)?.t ?? 0;
  const lastTime = path.at(-1)?.t ?? firstTime;
  const durationMs = Math.max(0, lastTime - firstTime);
  const estimate = estimatePathCircle(path);
  const metrics = scoreCirclePath(path, mode, durationMs, estimate);

  return {
    playerId: player.id,
    playerName: player.name,
    team: player.team,
    path,
    estimate: roundEstimate(estimate),
    metrics,
    score: Math.round(metrics.accuracy),
    durationMs,
    submittedAt
  };
}

export function normalizePath(points: CirclePoint[]): CirclePoint[] {
  const sanitized = points
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => ({
      x: round4(clamp(point.x, 0, 1)),
      y: round4(clamp(point.y, 0, 1)),
      t: typeof point.t === 'number' && Number.isFinite(point.t) ? Math.max(0, Math.round(point.t)) : undefined
    }));

  if (sanitized.length <= 180) return sanitized;

  const step = Math.ceil(sanitized.length / 180);
  const sampled = sanitized.filter((_, index) => index % step === 0);
  const last = sanitized.at(-1);
  if (last && sampled.at(-1) !== last) sampled.push(last);

  return sampled;
}

export function estimatePathCircle(points: CirclePoint[]): CircleEstimate {
  if (points.length === 0) {
    return {
      center: { x: targetCircle.x, y: targetCircle.y },
      radius: 0,
      radiusStd: 0,
      coverage: 0
    };
  }

  const center = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x / points.length,
      y: sum.y + point.y / points.length
    }),
    { x: 0, y: 0 }
  );

  const distances = points.map((point) => distance(point, center));
  const radius = average(distances);
  const radiusStd = standardDeviation(distances, radius);
  const angles = points.map((point) => Math.atan2(point.y - center.y, point.x - center.x)).sort((left, right) => left - right);
  const coverage = getAngularCoverage(angles);

  return {
    center,
    radius,
    radiusStd,
    coverage
  };
}

export function scoreCirclePath(
  points: CirclePoint[],
  mode: GameModeId,
  durationMs = 0,
  estimate = estimatePathCircle(points)
): CircleMetrics {
  if (points.length < 12 || estimate.radius < 0.04) {
    const fallback = clampScore(points.length * 2.4);
    return {
      accuracy: round1(fallback),
      roundness: round1(fallback),
      closure: 0,
      smoothness: round1(fallback),
      radiusStability: round1(fallback),
      centerStability: 0,
      radiusMatch: 0,
      pointCount: points.length
    };
  }

  const radiusStability = scoreFromRatio(estimate.radiusStd / estimate.radius, 0.48);
  const coverageScore = scoreFromRange(estimate.coverage, 0.72, 0.98);
  const roundness = clampScore(radiusStability * 0.72 + coverageScore * 0.28);
  const closureDistance = distance(points[0], points.at(-1) ?? points[0]);
  const closure = scoreFromRatio(closureDistance / Math.max(estimate.radius * 0.74, 0.01), 1);
  const centerError = distance(estimate.center, targetCircle) / targetCircle.r;
  const centerStability = scoreFromRatio(centerError, 0.62);
  const radiusError = Math.abs(estimate.radius - targetCircle.r) / targetCircle.r;
  const radiusMatch = scoreFromRatio(radiusError, 0.58);
  const smoothness = calculateSmoothness(points);

  let accuracy = clampScore(
    roundness * 0.26 +
      radiusStability * 0.18 +
      centerStability * 0.17 +
      radiusMatch * 0.14 +
      closure * 0.17 +
      smoothness * 0.08
  );

  if (mode === 'speed') {
    const speedScore = scoreFromRatio(Math.max(0, durationMs - 1200), 5000);
    accuracy = clampScore(accuracy * 0.8 + speedScore * 0.2);
  }

  return {
    accuracy: round1(accuracy),
    roundness: round1(roundness),
    closure: round1(closure),
    smoothness: round1(smoothness),
    radiusStability: round1(radiusStability),
    centerStability: round1(centerStability),
    radiusMatch: round1(radiusMatch),
    pointCount: points.length
  };
}

export function generateBotPath(playerId: string, roundIndex: number, mode: GameModeId): CirclePoint[] {
  const seed = hashString(`${playerId}-${roundIndex}-${mode}`);
  const skill = 0.42 + pseudoRandom(seed) * 0.52;
  const centerNoise = (1 - skill) * 0.16;
  const radiusNoise = (1 - skill) * 0.15;
  const wobble = (1 - skill) * 0.08;
  const jitter = (1 - skill) * 0.025;
  const center = {
    x: targetCircle.x + (pseudoRandom(seed + 1) - 0.5) * centerNoise,
    y: targetCircle.y + (pseudoRandom(seed + 2) - 0.5) * centerNoise
  };
  const radius = targetCircle.r * (1 + (pseudoRandom(seed + 3) - 0.5) * radiusNoise);
  const pointCount = 70 + Math.floor(pseudoRandom(seed + 4) * 70);
  const startAngle = pseudoRandom(seed + 5) * Math.PI * 2;
  const direction = pseudoRandom(seed + 6) > 0.5 ? 1 : -1;
  const closureDrift = (pseudoRandom(seed + 7) - 0.5) * (1 - skill) * 0.45;
  const duration = 1700 + Math.floor((1 - skill) * 2600 + pseudoRandom(seed + 8) * 1800);
  const waveFreq = 2 + Math.floor(pseudoRandom(seed + 9) * 4);
  const wavePhase = pseudoRandom(seed + 10) * Math.PI * 2;

  return Array.from({ length: pointCount }).map((_, index) => {
    const progress = pointCount === 1 ? 0 : index / (pointCount - 1);
    const angle = startAngle + direction * (progress * Math.PI * 2 + progress * closureDrift);
    const wave = Math.sin(angle * waveFreq + wavePhase) * wobble;
    const randomJitter = (pseudoRandom(seed + index * 13) - 0.5) * jitter;
    const r = radius * (1 + wave + randomJitter);

    return {
      x: round4(clamp(center.x + Math.cos(angle) * r, 0.04, 0.96)),
      y: round4(clamp(center.y + Math.sin(angle) * r, 0.04, 0.96)),
      t: Math.round(progress * duration)
    };
  });
}

export function botSubmittedAt(startedAt: number, playerId: string): number {
  const seed = hashString(`circle-submit-${playerId}-${startedAt}`);
  return startedAt + 1600 + Math.floor(pseudoRandom(seed) * 9000);
}

export function teamFromCount(count: number): TeamId {
  return teams[count % teams.length].id;
}

function calculateSmoothness(points: CirclePoint[]): number {
  const segmentLengths: number[] = [];
  const segmentAngles: number[] = [];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const length = distance(previous, current);
    if (length < 0.002) continue;
    segmentLengths.push(length);
    segmentAngles.push(Math.atan2(current.y - previous.y, current.x - previous.x));
  }

  if (segmentAngles.length < 8) return 30;

  const meanLength = average(segmentLengths);
  const lengthVariation = standardDeviation(segmentLengths, meanLength) / Math.max(meanLength, 0.001);
  const turns: number[] = [];

  for (let index = 1; index < segmentAngles.length; index += 1) {
    turns.push(Math.abs(normalizeAngle(segmentAngles[index] - segmentAngles[index - 1])));
  }

  const sharpTurnRatio = turns.filter((turn) => turn > 0.92).length / turns.length;
  const turnVariation = standardDeviation(turns, average(turns));
  const penalty = lengthVariation * 22 + sharpTurnRatio * 145 + turnVariation * 18;

  return clampScore(100 - penalty);
}

function getAngularCoverage(angles: number[]): number {
  if (angles.length < 3) return 0;

  let largestGap = 0;
  for (let index = 1; index < angles.length; index += 1) {
    largestGap = Math.max(largestGap, angles[index] - angles[index - 1]);
  }
  largestGap = Math.max(largestGap, angles[0] + Math.PI * 2 - angles.at(-1)!);

  return clamp((Math.PI * 2 - largestGap) / (Math.PI * 2), 0, 1);
}

function scoreFromRatio(value: number, zeroAt: number): number {
  return clampScore(100 * (1 - value / zeroAt));
}

function scoreFromRange(value: number, minValue: number, fullValue: number): number {
  return clampScore(((value - minValue) / (fullValue - minValue)) * 100);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[], mean = average(values)): number {
  if (values.length === 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function distance(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function normalizeAngle(angle: number): number {
  let next = angle;
  while (next > Math.PI) next -= Math.PI * 2;
  while (next < -Math.PI) next += Math.PI * 2;
  return next;
}

function roundEstimate(estimate: CircleEstimate): CircleEstimate {
  return {
    center: {
      x: round4(estimate.center.x),
      y: round4(estimate.center.y)
    },
    radius: round4(estimate.radius),
    radiusStd: round4(estimate.radiusStd),
    coverage: round4(estimate.coverage)
  };
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function round1(value: number): number {
  return Number(value.toFixed(1));
}

function clampScore(value: number): number {
  return clamp(value, 0, 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash);
}

function pseudoRandom(seed: number): number {
  const value = Math.sin(seed) * 10000;
  return value - Math.floor(value);
}
