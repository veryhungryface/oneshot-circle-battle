import { NextRequest, NextResponse } from 'next/server';
import {
  botSubmittedAt,
  circleModes,
  createInitialRoom,
  createNextRound,
  createSubmission,
  generateBotPath,
  getMode,
  seedDemoPlayers,
  teamFromCount,
  type CirclePoint,
  type GameModeId,
  type Player,
  type RoomState,
  type TeamId
} from '@/lib/circleBattle';

type StoredRooms = Map<string, RoomState>;
const defaultRoomCode = '7312';
const teacherRoomTtlMs = 5 * 60 * 1000;

declare global {
  // eslint-disable-next-line no-var
  var __circleBattleRooms: StoredRooms | undefined;
}

const rooms = globalThis.__circleBattleRooms ?? new Map<string, RoomState>();
globalThis.__circleBattleRooms = rooms;

type RequestBody = {
  action?: string;
  roomCode?: string;
  teacherId?: string;
  playerId?: string;
  name?: string;
  team?: TeamId;
  mode?: GameModeId;
  path?: CirclePoint[];
  value?: number | boolean | string;
  allowReassign?: boolean;
};

export async function GET(request: NextRequest) {
  const room = getRoom(request.nextUrl.searchParams.get('room') ?? undefined);

  return NextResponse.json({ room, now: Date.now() });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const now = Date.now();

  if (body.action === 'claimRoom') {
    const room = claimRoom(body.roomCode, normalizeTeacherId(body.teacherId, now), body.allowReassign !== false, now);
    return NextResponse.json({ room, now });
  }

  const room = getRoom(body.roomCode);

  switch (body.action) {
    case 'join': {
      const playerId = body.playerId?.trim() || `student-${now}`;
      const existing = room.players.find((player) => player.id === playerId);
      const name = normalizeName(body.name, existing?.name ?? '학생');
      const team = body.team ?? existing?.team ?? teamFromCount(room.players.length);

      if (existing) {
        existing.name = name;
        existing.team = team;
      } else {
        room.players.push({
          id: playerId,
          name,
          team,
          totalScore: 0,
          streak: 0
        });
      }
      break;
    }

    case 'seedDemo': {
      room.players = seedDemoPlayers(room.players);
      break;
    }

    case 'clearDemo': {
      const botIds = new Set(room.players.filter((player) => player.isBot).map((player) => player.id));
      room.players = room.players.filter((player) => !player.isBot);
      room.round.submissions = room.round.submissions.filter((submission) => !botIds.has(submission.playerId));
      break;
    }

    case 'setMode': {
      if (room.round.status !== 'lobby') break;

      const modeId = normalizeModeId(body.mode ?? String(body.value ?? 'guide'));
      const mode = getMode(modeId);
      room.round = {
        ...room.round,
        mode,
        durationSec: mode.durationSec,
        submissions: []
      };
      break;
    }

    case 'startRound': {
      if (room.round.status !== 'lobby') break;

      const startedAt = now;
      room.round = {
        ...room.round,
        status: 'active',
        startedAt,
        revealedAt: undefined,
        durationSec: room.round.mode.durationSec,
        submissions: []
      };

      room.players
        .filter((player) => player.isBot)
        .forEach((player) => {
          addSubmission(
            room,
            player,
            generateBotPath(player.id, room.round.index, room.round.mode.id),
            botSubmittedAt(startedAt, player.id)
          );
        });
      break;
    }

    case 'submit': {
      if (room.round.status !== 'active') {
        return NextResponse.json({ error: 'round is not active' }, { status: 409 });
      }

      if (!Array.isArray(body.path) || body.path.length === 0) {
        return NextResponse.json({ error: 'path is required' }, { status: 400 });
      }

      let player = room.players.find((candidate) => candidate.id === body.playerId);
      if (!player) {
        player = {
          id: body.playerId?.trim() || `student-${now}`,
          name: normalizeName(body.name, '학생'),
          team: body.team ?? teamFromCount(room.players.length),
          totalScore: 0,
          streak: 0
        };
        room.players.push(player);
      }

      addSubmission(room, player, body.path, now);
      break;
    }

    case 'reveal': {
      if (room.round.status !== 'active') break;

      room.round.status = 'revealed';
      room.round.revealedAt = now;
      break;
    }

    case 'nextRound': {
      if (room.round.status !== 'revealed') break;

      room.round = createNextRound(room.round);
      break;
    }

    case 'reset': {
      const resetRoom = createInitialRoom(room.code);
      resetRoom.teacherId = room.teacherId;
      resetRoom.teacherLastSeenAt = now;
      resetRoom.showRanking = room.showRanking ?? true;
      rooms.set(room.code, resetRoom);
      return NextResponse.json({ room: rooms.get(room.code), now });
    }

    case 'setRankingVisible': {
      room.showRanking = body.value !== false;
      break;
    }

    default:
      return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  }

  room.updatedAt = now;
  return NextResponse.json({ room, now });
}

function addSubmission(room: RoomState, player: Player, path: CirclePoint[], submittedAt: number) {
  if (room.round.submissions.some((submission) => submission.playerId === player.id)) return;

  const submission = createSubmission(player, path, room.round.mode.id, submittedAt);
  room.round.submissions.push(submission);
  room.round.submissions.sort((left, right) => left.submittedAt - right.submittedAt);

  player.lastScore = submission.score;
  player.bestScore = Math.max(player.bestScore ?? 0, submission.score);
  player.totalScore += submission.score;
  player.streak = submission.score >= 90 ? player.streak + 1 : 0;
}

function getRoom(code = defaultRoomCode): RoomState {
  const normalized = normalizeRoomCode(code);
  const existing = rooms.get(normalized);

  if (existing) return existing;

  const room = createInitialRoom(normalized);
  rooms.set(normalized, room);
  return room;
}

function claimRoom(preferredCode = defaultRoomCode, teacherId: string, allowReassign: boolean, now: number): RoomState {
  const preferredRoom = getRoom(preferredCode);

  if (isRoomClaimedByOther(preferredRoom, teacherId, now)) {
    if (!allowReassign) return preferredRoom;

    const nextRoom = getRoom(createAvailableRoomCode(now));
    nextRoom.teacherId = teacherId;
    nextRoom.teacherLastSeenAt = now;
    nextRoom.updatedAt = now;
    return nextRoom;
  }

  preferredRoom.teacherId = teacherId;
  preferredRoom.teacherLastSeenAt = now;
  preferredRoom.updatedAt = now;
  return preferredRoom;
}

function createAvailableRoomCode(now: number): string {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const code = String(1000 + Math.floor(Math.random() * 9000));
    const room = rooms.get(code);
    if (!room || !isRoomClaimed(room, now)) return code;
  }

  return String(1000 + (now % 9000));
}

function isRoomClaimed(room: RoomState, now: number): boolean {
  return Boolean(room.teacherId && now - (room.teacherLastSeenAt ?? room.updatedAt) < teacherRoomTtlMs);
}

function isRoomClaimedByOther(room: RoomState, teacherId: string, now: number): boolean {
  return Boolean(room.teacherId && room.teacherId !== teacherId && isRoomClaimed(room, now));
}

function normalizeRoomCode(code: string | undefined): string {
  const normalized = code?.trim();
  return normalized || defaultRoomCode;
}

function normalizeTeacherId(value: string | undefined, now: number): string {
  const normalized = value?.trim().slice(0, 80);
  return normalized || `teacher-${now}-${Math.floor(Math.random() * 10000)}`;
}

function normalizeName(value: string | undefined, fallback: string): string {
  const normalized = value?.trim().slice(0, 10);
  return normalized || fallback;
}

function normalizeModeId(value: string): GameModeId {
  return circleModes.some((mode) => mode.id === value) ? (value as GameModeId) : 'guide';
}
