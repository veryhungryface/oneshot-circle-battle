'use client';

import {
  CircleDot,
  Crown,
  Gauge,
  Medal,
  Play,
  Plus,
  QrCode,
  Radio,
  RotateCcw,
  Send,
  Sparkles,
  Target,
  Timer,
  Trophy,
  UsersRound
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  circleModes,
  getTeam,
  targetCircle,
  teams,
  type CircleEstimate,
  type CircleMode,
  type CirclePoint,
  type CircleSubmission,
  type RoomState,
  type TeamId
} from '@/lib/circleBattle';
import styles from './circle-battle.module.css';

type ViewMode = 'teacher' | 'student';
type ApiResponse = {
  room: RoomState;
  now: number;
};
type ApplyRoomOptions = {
  allowRoomChange?: boolean;
  preserveMissingPlayers?: boolean;
};

const defaultRoomCode = '7312';
const teacherStorageKey = 'circle-battle-teacher-id';
const playerStorageKey = 'circle-battle-player-id';
const playerNameStorageKey = 'circle-battle-player-name';
const playerTeamStorageKey = 'circle-battle-player-team';

export default function CircleBattlePage() {
  const [roomCode, setRoomCode] = useState(defaultRoomCode);
  const [view, setView] = useState<ViewMode>('teacher');
  const [teacherId, setTeacherId] = useState('');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [origin, setOrigin] = useState('');
  const [isMutating, setIsMutating] = useState(false);
  const mutationSeqRef = useRef(0);
  const pendingMutationsRef = useRef(0);
  const completedTeacherClaimRef = useRef(false);

  const applyRoomPayload = useCallback((payload: ApiResponse, options: ApplyRoomOptions = {}) => {
    setRoom((current) => {
      if (!current) return payload.room;
      if (payload.room.code !== current.code) {
        return options.allowRoomChange === false ? current : payload.room;
      }
      if (payload.room.updatedAt < current.updatedAt) return current;

      return mergeRoomSnapshot(current, payload.room, options);
    });
    setNow(payload.now);
  }, []);

  const loadRoom = useCallback(async () => {
    if (pendingMutationsRef.current > 0) return;
    const mutationSeq = mutationSeqRef.current;
    const response = await fetch(`/api/circle-battle?room=${encodeURIComponent(roomCode)}`, {
      cache: 'no-store'
    });
    const payload = (await response.json()) as ApiResponse;
    if (pendingMutationsRef.current > 0 || mutationSeqRef.current !== mutationSeq) return;
    applyRoomPayload(payload);
  }, [applyRoomPayload, roomCode]);

  const postAction = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      if (pendingMutationsRef.current > 0) return;

      const mutationSeq = mutationSeqRef.current + 1;
      mutationSeqRef.current = mutationSeq;
      pendingMutationsRef.current += 1;
      setIsMutating(true);

      try {
        const response = await fetch('/api/circle-battle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, roomCode, ...payload })
        });

        if (!response.ok) return;

        const nextPayload = (await response.json()) as ApiResponse;
        if (mutationSeqRef.current !== mutationSeq) return;
        applyRoomPayload(nextPayload, { preserveMissingPlayers: action !== 'reset' });
      } finally {
        pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
        if (pendingMutationsRef.current === 0) setIsMutating(false);
      }
    },
    [applyRoomPayload, roomCode]
  );

  const createNewTeacherRoom = useCallback(() => {
    const nextRoomCode = createClientRoomCode(roomCode);
    mutationSeqRef.current += 1;
    pendingMutationsRef.current = 0;
    completedTeacherClaimRef.current = false;
    setIsMutating(false);
    setRoom(null);
    setRoomCode(nextRoomCode);
    setView('teacher');

    const url = new URL(window.location.href);
    url.searchParams.set('view', 'teacher');
    url.searchParams.set('room', nextRoomCode);
    window.history.pushState(null, '', url);
  }, [roomCode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paramRoom = params.get('room');
    const paramView = params.get('view');
    const nextView: ViewMode = paramView === 'student' ? 'student' : 'teacher';

    setRoomCode(paramRoom?.trim() || (nextView === 'teacher' ? createClientRoomCode() : defaultRoomCode));
    setView(nextView);

    const storedTeacherId = window.localStorage.getItem(teacherStorageKey);
    const nextTeacherId = storedTeacherId || `teacher-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    window.localStorage.setItem(teacherStorageKey, nextTeacherId);
    setTeacherId(nextTeacherId);
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (view !== 'teacher' || !teacherId || !roomCode) return undefined;

    let mounted = true;

    async function claimRoom() {
      if (pendingMutationsRef.current > 0) return;
      const mutationSeq = mutationSeqRef.current;
      const allowReassign = !completedTeacherClaimRef.current;
      const response = await fetch('/api/circle-battle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claimRoom', roomCode, teacherId, allowReassign })
      });

      if (!response.ok || !mounted) return;

      const payload = (await response.json()) as ApiResponse;
      if (pendingMutationsRef.current > 0 || mutationSeqRef.current !== mutationSeq) return;
      applyRoomPayload(payload, { allowRoomChange: allowReassign });
      completedTeacherClaimRef.current = true;

      const url = new URL(window.location.href);
      url.searchParams.set('view', 'teacher');
      url.searchParams.set('room', payload.room.code);
      window.history.replaceState(null, '', url);
      if (payload.room.code !== roomCode && allowReassign) setRoomCode(payload.room.code);
    }

    claimRoom().catch(() => undefined);
    const timer = window.setInterval(() => {
      claimRoom().catch(() => undefined);
    }, 15000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [applyRoomPayload, roomCode, teacherId, view]);

  useEffect(() => {
    let mounted = true;

    async function poll() {
      if (!mounted) return;
      await loadRoom().catch(() => undefined);
    }

    poll();
    const timer = window.setInterval(poll, 800);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [loadRoom]);

  const studentUrl = useMemo(() => {
    if (!origin) return '';
    return `${origin}/circle-battle?view=student&room=${roomCode}`;
  }, [origin, roomCode]);

  return (
    <main className={styles.app} data-view={view}>
      {!room ? (
        <section className={styles.loadingPanel}>
          <Target size={42} />
          <strong>원샷 서클 배틀 준비 중</strong>
        </section>
      ) : view === 'student' ? (
        <StudentScreen isMutating={isMutating} now={now} room={room} postAction={postAction} />
      ) : (
        <TeacherBoard
          isMutating={isMutating}
          now={now}
          onCreateNewRoom={createNewTeacherRoom}
          room={room}
          studentUrl={studentUrl}
          postAction={postAction}
        />
      )}
    </main>
  );
}

function createClientRoomCode(exceptCode?: string): string {
  let nextCode = '';
  do {
    nextCode = String(1000 + Math.floor(Math.random() * 9000));
  } while (nextCode === exceptCode);

  return nextCode;
}

function mergeRoomSnapshot(current: RoomState, incoming: RoomState, options: ApplyRoomOptions): RoomState {
  const preserveMissingPlayers = options.preserveMissingPlayers ?? true;

  return {
    ...incoming,
    players: mergePlayers(current.players, incoming.players, preserveMissingPlayers),
    round: mergeRound(current.round, incoming.round, preserveMissingPlayers)
  };
}

function mergePlayers(
  currentPlayers: RoomState['players'],
  incomingPlayers: RoomState['players'],
  preserveMissingPlayers: boolean
): RoomState['players'] {
  if (!preserveMissingPlayers) return incomingPlayers;

  const merged = new Map(incomingPlayers.map((player) => [player.id, player]));
  currentPlayers.forEach((player) => {
    if (!player.isBot && !merged.has(player.id)) merged.set(player.id, player);
  });

  return Array.from(merged.values());
}

function mergeRound(
  currentRound: RoomState['round'],
  incomingRound: RoomState['round'],
  preserveMissingSubmissions: boolean
): RoomState['round'] {
  const sameRunningRound =
    currentRound.index === incomingRound.index &&
    currentRound.mode.id === incomingRound.mode.id &&
    Boolean(currentRound.startedAt && incomingRound.startedAt && currentRound.startedAt === incomingRound.startedAt);

  if (!sameRunningRound || !preserveMissingSubmissions) return incomingRound;

  const statusOrder = { lobby: 0, active: 1, revealed: 2 } satisfies Record<RoomState['round']['status'], number>;
  const keepCurrentStatus = statusOrder[incomingRound.status] < statusOrder[currentRound.status];

  return {
    ...incomingRound,
    status: keepCurrentStatus ? currentRound.status : incomingRound.status,
    revealedAt: keepCurrentStatus ? currentRound.revealedAt : incomingRound.revealedAt,
    submissions: mergeSubmissions(currentRound.submissions, incomingRound.submissions)
  };
}

function mergeSubmissions(currentSubmissions: CircleSubmission[], incomingSubmissions: CircleSubmission[]): CircleSubmission[] {
  const merged = new Map(incomingSubmissions.map((submission) => [submission.playerId, submission]));
  currentSubmissions.forEach((submission) => {
    if (!merged.has(submission.playerId)) merged.set(submission.playerId, submission);
  });

  return Array.from(merged.values()).sort((left, right) => left.submittedAt - right.submittedAt);
}

function TeacherBoard({
  isMutating,
  now,
  onCreateNewRoom,
  room,
  studentUrl,
  postAction
}: {
  isMutating: boolean;
  now: number;
  onCreateNewRoom: () => void;
  room: RoomState;
  studentUrl: string;
  postAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const round = room.round;
  const visibleSubmissions = getVisibleSubmissions(room, now);
  const fullSubmissions = round.submissions;
  const boardSubmissions = round.status === 'revealed' ? fullSubmissions : visibleSubmissions;
  const secondsLeft = getSecondsLeft(room, now);
  const submittedCount = visibleSubmissions.length;
  const playerCount = room.players.length;
  const showRanking = room.showRanking ?? true;
  const ranked = [...boardSubmissions].sort((left, right) => right.score - left.score || left.submittedAt - right.submittedAt);
  const best = ranked[0];

  return (
    <section className={styles.teacherWrap}>
      <div className={styles.teacherBoard} data-phase={round.status}>
        <header className={styles.boardHeader}>
          <div className={styles.brandLockup}>
            <span className={styles.logoMark}>
              <CircleDot size={34} />
            </span>
            <div>
              <p>QR CIRCLE ACCURACY GAME</p>
              <h1>{room.title}</h1>
            </div>
          </div>

          <div className={styles.liveStats} aria-label="게임 상태">
            <StatPill icon={<UsersRound size={20} />} label="접속" value={`${playerCount}명`} />
            <StatPill icon={<Send size={20} />} label="제출" value={`${submittedCount}/${playerCount}`} />
            <StatPill icon={<Timer size={20} />} label="남은 시간" value={`${secondsLeft}초`} />
            <StatPill icon={<Target size={20} />} label="모드" value={round.mode.shortName} />
          </div>
        </header>

        {round.status === 'lobby' ? (
          <div className={styles.lobbyLayout}>
            <section className={styles.heroPanel}>
              <img alt="원샷 서클 배틀 인트로 이미지" src="/circle-battle/oneshot-circle-battle-intro.png" />
              <div className={styles.heroOverlay}>
                <span>첫 라운드 준비</span>
                <strong>손가락으로 완벽한 원에 도전!</strong>
              </div>
            </section>

            <section className={styles.controlPanel}>
              <div className={styles.qrCard}>
                <div className={styles.qrHeader}>
                  <QrCode size={24} />
                  <span>방 코드 {room.code}</span>
                </div>
                {studentUrl ? (
                  <img alt="학생 접속 QR" className={styles.qrImage} src={`/api/circle-battle/qr?text=${encodeURIComponent(studentUrl)}`} />
                ) : (
                  <div className={styles.qrFallback} />
                )}
              </div>

              <div className={styles.modePanel}>
                <div>
                  <span>게임 모드</span>
                  <strong>{round.mode.name}</strong>
                </div>
                <div className={styles.modeGrid}>
                  {circleModes.map((mode) => (
                    <button
                      aria-pressed={round.mode.id === mode.id}
                      disabled={isMutating}
                      key={mode.id}
                      onClick={() => postAction('setMode', { mode: mode.id })}
                      title={mode.description}
                      type="button"
                    >
                      {mode.shortName}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.actionStack}>
                <button className={styles.primaryButton} disabled={isMutating} onClick={() => postAction('startRound')} type="button">
                  <Play size={24} /> 라운드 시작
                </button>
                <button className={styles.secondaryButton} disabled={isMutating} onClick={() => postAction('seedDemo')} type="button">
                  <Sparkles size={21} /> 데모 학생 채우기
                </button>
                <button className={styles.secondaryButton} disabled={isMutating} onClick={() => postAction('clearDemo')} type="button">
                  <RotateCcw size={21} /> 데모 학생 비우기
                </button>
                <button className={styles.secondaryButton} disabled={isMutating} onClick={onCreateNewRoom} type="button">
                  <Plus size={21} /> 새 방
                </button>
              </div>
            </section>
          </div>
        ) : (
          <div className={styles.roundLayout}>
            <section className={styles.stagePanel}>
              <div className={styles.stageBanner}>
                <div>
                  <span>
                    Round {round.index + 1} · {round.mode.name}
                  </span>
                  <strong>{round.status === 'revealed' ? '결과 공개' : '원들이 날아오는 중'}</strong>
                </div>
                {best && round.status === 'revealed' ? (
                  <div className={styles.winnerBadge}>
                    <Crown size={22} />
                    {best.playerName} {best.score}%
                  </div>
                ) : null}
              </div>

              <CircleStage mode={round.mode} phase={round.status} submissions={boardSubmissions} />
            </section>

            <aside className={styles.resultRail}>
              <section className={`${styles.resultCard} ${styles.rankCard}`}>
                <div className={styles.resultTitle}>
                  <Trophy size={22} />
                  <span>TOP 5</span>
                  <button
                    aria-pressed={showRanking}
                    className={styles.rankToggle}
                    disabled={isMutating}
                    onClick={() => postAction('setRankingVisible', { value: !showRanking })}
                    type="button"
                  >
                    {showRanking ? '공개' : '비공개'}
                  </button>
                </div>
                {round.status === 'revealed' && showRanking && ranked.length > 0 ? (
                  <ol className={styles.rankList}>
                    {ranked.slice(0, 5).map((submission, index) => (
                      <li key={submission.playerId}>
                        <span style={{ '--team': getTeam(submission.team).color } as CSSProperties}>{index + 1}</span>
                        <strong>{submission.playerName}</strong>
                        <em>{formatMetric(submission.metrics.roundness)} 원형도</em>
                        <b>{submission.score}%</b>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className={styles.hiddenRank}>
                    <Radio size={30} />
                    <span>{round.status === 'revealed' ? '순위 비공개' : '제출 대기'}</span>
                  </div>
                )}
              </section>

              <TeamAverages submissions={boardSubmissions} />
              <ClassSummary submissions={boardSubmissions} />

              <div className={styles.controlDock}>
                {round.status === 'active' ? (
                  <button className={styles.primaryButton} disabled={isMutating} onClick={() => postAction('reveal')} type="button">
                    <Sparkles size={23} /> 결과 공개
                  </button>
                ) : (
                  <button className={styles.primaryButton} disabled={isMutating} onClick={() => postAction('nextRound')} type="button">
                    <Play size={23} /> 다음 라운드
                  </button>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}

function StudentScreen({
  isMutating,
  now,
  room,
  postAction
}: {
  isMutating: boolean;
  now: number;
  room: RoomState;
  postAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const [playerId, setPlayerId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<TeamId>('A');
  const round = room.round;
  const player = room.players.find((candidate) => candidate.id === playerId);
  const submission = round.submissions.find((candidate) => candidate.playerId === playerId);
  const secondsLeft = getSecondsLeft(room, now);
  const guideVisible = round.mode.showGuide || (round.mode.id === 'blind' && secondsLeft > round.mode.durationSec - 2);

  useEffect(() => {
    const storedId = window.localStorage.getItem(playerStorageKey);
    const storedName = window.localStorage.getItem(playerNameStorageKey);
    const storedTeam = window.localStorage.getItem(playerTeamStorageKey) as TeamId | null;

    if (storedId) setPlayerId(storedId);
    if (storedName) setStudentName(storedName);
    if (storedTeam && teams.some((team) => team.id === storedTeam)) setSelectedTeam(storedTeam);
  }, []);

  async function joinRoom() {
    if (isMutating) return;
    const id = playerId || `student-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const name = studentName.trim() || '학생';
    setPlayerId(id);
    setStudentName(name);
    window.localStorage.setItem(playerStorageKey, id);
    window.localStorage.setItem(playerNameStorageKey, name);
    window.localStorage.setItem(playerTeamStorageKey, selectedTeam);
    await postAction('join', { playerId: id, name, team: selectedTeam });
  }

  const submitPath = useCallback(
    async (path: CirclePoint[]) => {
      if (isMutating || !playerId || submission) return;
      await postAction('submit', {
        playerId,
        name: studentName,
        team: selectedTeam,
        path
      });
    },
    [isMutating, playerId, postAction, selectedTeam, studentName, submission]
  );

  return (
    <section className={styles.studentWrap}>
      <div className={styles.phoneFrame}>
        <div className={styles.phoneSensor} />
        <header className={styles.phoneHeader}>
          <div>
            <p>원샷 서클 배틀</p>
            <strong>방 코드 {room.code}</strong>
          </div>
          <span style={{ '--team': getTeam(player?.team ?? selectedTeam).color } as CSSProperties}>
            {player ? getTeam(player.team).name : getTeam(selectedTeam).name}
          </span>
        </header>

        {!player ? (
          <div className={styles.joinCard}>
            <div className={styles.joinIcon}>
              <CircleDot size={58} />
            </div>
            <h2>이름을 쓰고 입장</h2>
            <label>
              이름
              <input
                maxLength={10}
                onChange={(event) => setStudentName(event.target.value)}
                placeholder="예: 12 민준"
                value={studentName}
              />
            </label>
            <div className={styles.teamPicker} aria-label="팀 선택">
              {teams.map((team) => (
                <button
                  className={selectedTeam === team.id ? styles.selectedTeam : undefined}
                  key={team.id}
                  onClick={() => setSelectedTeam(team.id)}
                  style={{ '--team': team.color, '--team-soft': team.softColor } as CSSProperties}
                  type="button"
                >
                  {team.name}
                </button>
              ))}
            </div>
            <button className={styles.phonePrimary} disabled={isMutating} onClick={joinRoom} type="button">
              <Send size={20} /> 입장
            </button>
          </div>
        ) : round.status === 'active' && !submission ? (
          <div className={styles.drawCard}>
            <div className={styles.mobileRoundHeader}>
              <span>{round.mode.shortName}</span>
              <strong>{secondsLeft}초</strong>
            </div>
            <CircleDrawingPad
              disabled={isMutating}
              guideVisible={guideVisible}
              onSubmit={submitPath}
              roundKey={`${round.index}-${round.startedAt ?? 0}`}
            />
            <p className={styles.drawHint}>{round.mode.id === 'blind' && !guideVisible ? '이제 기억해서 그려요.' : '손가락을 떼면 자동 제출돼요.'}</p>
          </div>
        ) : round.status === 'revealed' && submission ? (
          <div className={styles.resultPhoneCard}>
            <div className={styles.resultHero}>
              <span>정확도</span>
              <strong>{submission.score}%</strong>
            </div>
            <MiniCircle submission={submission} />
            <MetricGrid submission={submission} />
          </div>
        ) : (
          <div className={styles.waitCard}>
            <CircleDot size={68} />
            <h2>{submission ? '제출 완료' : '기다리는 중'}</h2>
            <p>{submission ? '전자칠판에서 결과를 공개할 거예요.' : '선생님이 라운드를 시작하면 캔버스가 열려요.'}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function CircleDrawingPad({
  disabled,
  guideVisible,
  onSubmit,
  roundKey
}: {
  disabled: boolean;
  guideVisible: boolean;
  onSubmit: (path: CirclePoint[]) => Promise<void>;
  roundKey: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointsRef = useRef<CirclePoint[]>([]);
  const startTimeRef = useRef(0);
  const [points, setPoints] = useState<CirclePoint[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const size = Math.max(1, Math.min(rect.width, rect.height));
    const dpr = window.devicePixelRatio || 1;
    const nextSize = Math.floor(size * dpr);
    if (canvas.width !== nextSize || canvas.height !== nextSize) {
      canvas.width = nextSize;
      canvas.height = nextSize;
    }

    const context = canvas.getContext('2d');
    if (!context) return;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, size, size);
    if (pointsRef.current.length < 2) return;

    context.lineWidth = Math.max(7, size * 0.026);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#151515';
    context.shadowColor = 'rgba(244, 93, 72, 0.25)';
    context.shadowBlur = 12;
    context.beginPath();
    pointsRef.current.forEach((point, index) => {
      const x = point.x * size;
      const y = point.y * size;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  }, []);

  useEffect(() => {
    pointsRef.current = [];
    setPoints([]);
    setIsDrawing(false);
    setSubmitted(false);
    redraw();
  }, [redraw, roundKey]);

  useEffect(() => {
    pointsRef.current = points;
    redraw();
  }, [points, redraw]);

  useEffect(() => {
    const onResize = () => redraw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [redraw]);

  function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>): CirclePoint {
    const rect = event.currentTarget.getBoundingClientRect();
    const size = Math.max(1, Math.min(rect.width, rect.height));
    const offsetX = (event.clientX - rect.left - (rect.width - size) / 2) / size;
    const offsetY = (event.clientY - rect.top - (rect.height - size) / 2) / size;

    return {
      x: clamp(offsetX, 0, 1),
      y: clamp(offsetY, 0, 1),
      t: Date.now() - startTimeRef.current
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled || submitted) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    startTimeRef.current = Date.now();
    const nextPoint = pointFromEvent(event);
    pointsRef.current = [nextPoint];
    setPoints([nextPoint]);
    setIsDrawing(true);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing || disabled || submitted) return;
    const nextPoint = pointFromEvent(event);
    const previous = pointsRef.current.at(-1);
    if (previous && Math.hypot(nextPoint.x - previous.x, nextPoint.y - previous.y) < 0.0035) return;

    const nextPoints = [...pointsRef.current, nextPoint];
    pointsRef.current = nextPoints;
    setPoints(nextPoints);
  }

  function finishStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing || disabled || submitted) return;
    const nextPoint = pointFromEvent(event);
    const nextPoints = [...pointsRef.current, nextPoint];
    pointsRef.current = nextPoints;
    setPoints(nextPoints);
    setIsDrawing(false);

    if (nextPoints.length >= 12) {
      setSubmitted(true);
      void onSubmit(nextPoints);
    }
  }

  return (
    <div className={styles.drawPad} data-guide-visible={guideVisible}>
      <svg aria-hidden="true" className={styles.guideCircle} viewBox="0 0 1000 1000">
        <circle cx={targetCircle.x * 1000} cy={targetCircle.y * 1000} r={targetCircle.r * 1000} />
        <path d="M500 150 L500 850 M150 500 L850 500" />
      </svg>
      <canvas
        ref={canvasRef}
        aria-label="원 그리기 캔버스"
        onPointerCancel={finishStroke}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishStroke}
      />
      {submitted ? (
        <div className={styles.submittedMark}>
          <Medal size={34} />
          제출 완료
        </div>
      ) : null}
    </div>
  );
}

function CircleStage({
  mode,
  phase,
  submissions
}: {
  mode: CircleMode;
  phase: RoomState['round']['status'];
  submissions: CircleSubmission[];
}) {
  const averageCircle = phase === 'revealed' ? getAverageCircle(submissions) : null;
  const stageViewBox = getCircleStageViewBox(submissions, averageCircle);

  return (
    <div className={styles.circleStage}>
      <svg
        aria-label="학생 원 제출 결과"
        className={styles.circleArena}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        viewBox={stageViewBox}
      >
        <defs>
          <filter id="circleGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>
        {mode.showGuide || phase === 'revealed' ? (
          <circle className={styles.targetRing} cx={targetCircle.x * 1000} cy={targetCircle.y * 1000} r={targetCircle.r * 1000} />
        ) : null}
        <circle className={styles.centerDot} cx={targetCircle.x * 1000} cy={targetCircle.y * 1000} r="8" />
        {averageCircle ? (
          <circle
            className={styles.averageRing}
            cx={averageCircle.center.x * 1000}
            cy={averageCircle.center.y * 1000}
            r={averageCircle.radius * 1000}
          />
        ) : null}
        {submissions.map((submission, index) => (
          <SubmissionPath index={index} key={submission.playerId} phase={phase} submission={submission} />
        ))}
      </svg>
      <div className={styles.stageLegend}>
        <span>
          <i className={styles.legendTarget} /> 기준 원
        </span>
        <span>
          <i className={styles.legendAverage} /> 반 평균 원
        </span>
      </div>
    </div>
  );
}

type CircleStageBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function getCircleStageViewBox(submissions: CircleSubmission[], averageCircle: CircleEstimate | null): string {
  const bounds: CircleStageBounds = {
    minX: 0,
    minY: 0,
    maxX: 1,
    maxY: 1
  };

  includeCircleBounds(bounds, targetCircle.x, targetCircle.y, targetCircle.r);
  if (averageCircle) {
    includeCircleBounds(bounds, averageCircle.center.x, averageCircle.center.y, averageCircle.radius);
  }

  submissions.forEach((submission) => {
    submission.path.forEach((point) => includePointBounds(bounds, point.x, point.y));
  });

  const padding = 0.075;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const size = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 1) + padding * 2;
  const minX = centerX - size / 2;
  const minY = centerY - size / 2;

  return `${minX * 1000} ${minY * 1000} ${size * 1000} ${size * 1000}`;
}

function includePointBounds(bounds: CircleStageBounds, x: number, y: number) {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.maxY = Math.max(bounds.maxY, y);
}

function includeCircleBounds(bounds: CircleStageBounds, x: number, y: number, radius: number) {
  includePointBounds(bounds, x - radius, y - radius);
  includePointBounds(bounds, x + radius, y + radius);
}

function SubmissionPath({
  index,
  phase,
  submission
}: {
  index: number;
  phase: RoomState['round']['status'];
  submission: CircleSubmission;
}) {
  const points = submission.path.map((point) => `${point.x * 1000},${point.y * 1000}`).join(' ');
  if (!points) return null;

  return (
    <polyline
      className={styles.submissionPath}
      data-phase={phase}
      points={points}
      style={
        {
          '--team': getTeam(submission.team).color,
          '--delay': `${Math.min(index * 0.045, 1.2)}s`,
          '--score': submission.score
        } as CSSProperties
      }
      vectorEffect="non-scaling-stroke"
    />
  );
}

function TeamAverages({ submissions }: { submissions: CircleSubmission[] }) {
  return (
    <section className={styles.teamAverages}>
      <div className={styles.resultTitle}>
        <Gauge size={22} />
        <span>팀 평균 정확도</span>
      </div>
      {teams.map((team) => {
        const teamSubmissions = submissions.filter((submission) => submission.team === team.id);
        const average =
          teamSubmissions.length > 0
            ? teamSubmissions.reduce((sum, submission) => sum + submission.score, 0) / teamSubmissions.length
            : null;
        const width = average === null ? 6 : Math.max(6, average);

        return (
          <div className={styles.teamBar} key={team.id}>
            <span style={{ '--team': team.color } as CSSProperties}>{team.name}</span>
            <i>
              <b style={{ '--team': team.color, width: `${width}%` } as CSSProperties} />
            </i>
            <em>{average === null ? '-' : `${Math.round(average)}%`}</em>
          </div>
        );
      })}
    </section>
  );
}

function ClassSummary({ submissions }: { submissions: CircleSubmission[] }) {
  const average =
    submissions.length > 0 ? submissions.reduce((sum, submission) => sum + submission.score, 0) / submissions.length : 0;
  const overNinety = submissions.filter((submission) => submission.score >= 90).length;

  return (
    <section className={styles.summaryCard}>
      <div>
        <span>반 평균</span>
        <strong>{submissions.length ? `${Math.round(average)}%` : '-'}</strong>
      </div>
      <div>
        <span>90% 이상</span>
        <strong>{submissions.length ? `${overNinety}명` : '-'}</strong>
      </div>
    </section>
  );
}

function MetricGrid({ submission }: { submission: CircleSubmission }) {
  const metrics = [
    ['원형도', submission.metrics.roundness],
    ['닫힘', submission.metrics.closure],
    ['부드러움', submission.metrics.smoothness],
    ['중심 안정도', submission.metrics.centerStability]
  ] as const;

  return (
    <div className={styles.metricGrid}>
      {metrics.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{formatMetric(value)}</strong>
        </div>
      ))}
    </div>
  );
}

function MiniCircle({ submission }: { submission: CircleSubmission }) {
  const points = submission.path.map((point) => `${point.x * 1000},${point.y * 1000}`).join(' ');

  return (
    <svg className={styles.miniCircle} viewBox="0 0 1000 1000">
      <circle cx={targetCircle.x * 1000} cy={targetCircle.y * 1000} r={targetCircle.r * 1000} />
      <polyline points={points} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function StatPill({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className={styles.statPill}>
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getVisibleSubmissions(room: RoomState, now: number): CircleSubmission[] {
  if (room.round.status === 'revealed') return room.round.submissions;
  return room.round.submissions.filter((submission) => submission.submittedAt <= now);
}

function getSecondsLeft(room: RoomState, now: number): number {
  if (room.round.status !== 'active' || !room.round.startedAt) return room.round.durationSec;
  const endsAt = room.round.startedAt + room.round.durationSec * 1000;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

function getAverageCircle(submissions: CircleSubmission[]): CircleEstimate | null {
  if (submissions.length === 0) return null;

  return {
    center: {
      x: submissions.reduce((sum, submission) => sum + submission.estimate.center.x, 0) / submissions.length,
      y: submissions.reduce((sum, submission) => sum + submission.estimate.center.y, 0) / submissions.length
    },
    radius: submissions.reduce((sum, submission) => sum + submission.estimate.radius, 0) / submissions.length,
    radiusStd: submissions.reduce((sum, submission) => sum + submission.estimate.radiusStd, 0) / submissions.length,
    coverage: submissions.reduce((sum, submission) => sum + submission.estimate.coverage, 0) / submissions.length
  };
}

function formatMetric(value: number): string {
  return `${Math.round(value)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
