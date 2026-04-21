import { useEffect, useMemo, useState } from 'react';

import styles from './App.module.css';
import { Button } from './components/Button';
import { DamaqiBoard } from './components/DamaqiBoard';
import { getSectLabel, getTeamLabel } from './game/helpers';
import { type SeatID } from './multiplayer/protocol';
import { useMultiplayerSession } from './multiplayer/useMultiplayerSession';
import { Sect } from './types';

const ALL_SECTS: Sect[] = [
  Sect.QINGXI,
  Sect.LIYUAN,
  Sect.TIANQUAN,
  Sect.GUYUN,
  Sect.SANGENGTIAN,
  Sect.KUANGLAN,
  Sect.ZUIHUAYIN,
  Sect.MOSHANDAO,
  Sect.JIULIUMEN
];

const SEATS: SeatID[] = [0, 1, 2, 3];

function formatStatus(status: string): string {
  if (status === 'connected') {
    return '已连接';
  }
  if (status === 'connecting') {
    return '连接中';
  }
  return '已断线';
}

export default function App() {
  const {
    connectionState,
    rooms,
    room,
    error,
    playerName,
    setPlayerName,
    setError,
    refreshRooms,
    createRoom,
    joinRoom,
    leaveRoom,
    claimSeat,
    leaveSeat,
    setSect,
    updateRoomSettings,
    kickMember,
    startGame,
    sendGameAction
  } = useMultiplayerSession();

  const [createPassword, setCreatePassword] = useState('');
  const [joinRoomCode, setJoinRoomCode] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [lobbyJoinPasswords, setLobbyJoinPasswords] = useState<Record<string, string>>({});
  const [nicknameDraft, setNicknameDraft] = useState(playerName);
  const [roomPasswordDraft, setRoomPasswordDraft] = useState('');
  const [viewSeatId, setViewSeatId] = useState<string>('0');

  const selfMember = useMemo(
    () => room?.members.find((member) => member.id === room.selfMemberId) ?? null,
    [room]
  );
  const mySeatId = selfMember?.seatId ?? null;
  const isHost = room?.hostMemberId === room?.selfMemberId;
  const needsPlayerName = !playerName.trim();

  useEffect(() => {
    setNicknameDraft(playerName);
  }, [playerName]);

  useEffect(() => {
    if (!room) {
      setRoomPasswordDraft('');
      return;
    }

    setRoomPasswordDraft('');
  }, [room]);

  useEffect(() => {
    if (mySeatId !== null) {
      setViewSeatId(String(mySeatId));
      return;
    }

    if (room?.match) {
      setViewSeatId(room.match.ctx.currentPlayer);
    }
  }, [mySeatId, room?.match?.ctx.currentPlayer]);

  const handleCreateRoom = async () => {
    if (!playerName.trim()) {
      return;
    }

    await createRoom({
      name: playerName,
      password: createPassword
    });
    setCreatePassword('');
  };

  const handleJoinRoom = async () => {
    if (!playerName.trim()) {
      return;
    }

    await joinRoom({
      roomCode: joinRoomCode,
      name: playerName,
      password: joinPassword
    });
  };

  const handleJoinLobbyRoom = async (roomCode: string) => {
    if (!playerName.trim()) {
      return;
    }

    const password = lobbyJoinPasswords[roomCode] ?? '';
    const result = await joinRoom({
      roomCode,
      name: playerName,
      password
    });

    if (result.ok) {
      setLobbyJoinPasswords((current) => ({
        ...current,
        [roomCode]: ''
      }));
    }
  };

  const handleConfirmNickname = () => {
    const trimmedName = nicknameDraft.trim();
    if (!trimmedName) {
      setError('请先填写昵称。');
      return;
    }

    setPlayerName(trimmedName);
    setError(null);
  };

  const renderLobby = () => (
    <main className={styles.shell}>
      <section className="mx-auto flex h-full max-w-7xl flex-col gap-6 overflow-auto px-6 py-6">
        {/* <header className="rounded-[28px] border border-ink-700/10 bg-[rgba(255,251,243,0.85)] p-6 shadow-paper">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>连接状态：{formatStatus(connectionState)}</div>
          </div>
        </header> */}

        <section className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-6">
          <div className="grid gap-6">
            <section className="rounded-[28px] border border-ink-700/10 bg-[rgba(255,250,241,0.5)] p-5 shadow-paper">
              <h2 className="m-0 font-display text-2xl text-ink-900">创建新房间</h2>
              <input
                className="mt-4 w-full rounded-[16px] border border-ink-700/12 bg-white/80 px-4 py-3 text-sm text-ink-900"
                onChange={(event) => setCreatePassword(event.target.value)}
                placeholder="房间密码，可留空"
                value={createPassword}
              />
              <Button
                className="mt-4 w-full px-4 py-3 text-sm"
                onClick={handleCreateRoom}
                type="button"
                variant="primary"
              >
                创建房间
              </Button>
            </section>

            <section className="rounded-[28px] border border-ink-700/10 bg-[rgba(255,250,241,0.5)] p-5 shadow-paper">
              <h2 className="m-0 font-display text-2xl text-ink-900">加入房间</h2>
              <input
                className="mt-4 w-full rounded-[16px] border border-ink-700/12 bg-white/80 px-4 py-3 text-sm uppercase text-ink-900"
                onChange={(event) => setJoinRoomCode(event.target.value.toUpperCase())}
                placeholder="房间码"
                value={joinRoomCode}
              />
              <input
                className="mt-3 w-full rounded-[16px] border border-ink-700/12 bg-white/80 px-4 py-3 text-sm text-ink-900"
                onChange={(event) => setJoinPassword(event.target.value)}
                placeholder="房间密码，可留空"
                value={joinPassword}
              />
              <Button
                className="mt-4 w-full px-4 py-3 text-sm"
                onClick={handleJoinRoom}
                type="button"
                variant="secondary"
              >
                加入房间
              </Button>
            </section>
          </div>

          <section className="rounded-[28px] border border-ink-700/10 bg-[rgba(255,250,241,0.5)] p-5 shadow-paper">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="m-0 text-xs uppercase tracking-[0.18em] text-ink-500">房间列表</p>
                <h2 className="m-0 font-display text-2xl text-ink-900">在线房间</h2>
                <div>房间总数：{rooms.length}</div>
              </div>
              <Button
                className="px-4 py-2 text-sm"
                onClick={refreshRooms}
                type="button"
                variant="secondary"
              >
                刷新
              </Button>
            </div>

            <div className="grid gap-4">
              {rooms.length === 0 && (
                <div className="rounded-[20px] border border-dashed border-ink-700/18 px-5 py-10 text-center text-sm text-ink-700">
                  当前没有房间，先创建一个。
                </div>
              )}

              {rooms.map((lobbyRoom) => (
                <article
                  key={lobbyRoom.roomCode}
                  className="rounded-[22px] border border-ink-700/10 bg-[rgba(255,248,236,0.8)] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="m-0 text-xs uppercase tracking-[0.18em] text-ink-500">
                        房主 {lobbyRoom.hostName}
                      </p>
                      <h3 className="m-0 font-display text-2xl text-ink-900">{lobbyRoom.roomCode}</h3>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-ink-700">
                      <span className="rounded-full bg-ink-100 px-3 py-1">{lobbyRoom.status}</span>
                      <span className="rounded-full bg-ink-100 px-3 py-1">{lobbyRoom.memberCount} 人在线</span>
                      <span className="rounded-full bg-ink-100 px-3 py-1">{lobbyRoom.seatedCount}/4 已落座</span>
                      {lobbyRoom.hasPassword && <span className="rounded-full bg-ink-100 px-3 py-1">有密码</span>}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    {lobbyRoom.hasPassword && (
                      <input
                        className="min-w-0 flex-1 border border-ink-700/12 bg-white/80 px-4 py-3 text-sm text-ink-900"
                        onChange={(event) =>
                          setLobbyJoinPasswords((current) => ({
                            ...current,
                            [lobbyRoom.roomCode]: event.target.value
                          }))
                        }
                        placeholder="输入房间密码"
                        value={lobbyJoinPasswords[lobbyRoom.roomCode] ?? ''}
                      />
                    )}
                    <Button
                      className="px-4 py-3 text-sm"
                      onClick={() => {
                        void handleJoinLobbyRoom(lobbyRoom.roomCode);
                      }}
                      type="button"
                      variant="primary"
                    >
                      加入房间
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </section>

        {error && (
          <div className="rounded-[22px] border border-[rgba(139,75,60,0.2)] bg-[rgba(255,243,239,0.9)] px-5 py-4 text-sm text-[#704836]">
            <div>{error}</div>
            <Button className="mt-3 px-3 py-1 text-xs" onClick={() => setError(null)} type="button" variant="secondary">
              关闭
            </Button>
          </div>
        )}

        {needsPlayerName && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(8,16,26,0.62)] p-4">
            <section className="w-full max-w-md border border-ink-700/10 bg-[rgba(255,250,241,0.72)] p-6 shadow-paper backdrop-blur-md">
              <p className="m-0 text-xs uppercase tracking-[0.18em] text-ink-500">进入大厅</p>
              <h2 className="mt-2 font-display text-3xl text-ink-900">先输入昵称</h2>
              <p className="mb-0 mt-3 text-sm text-ink-700">昵称会保存在本地，下次进入会自动带出。</p>
              <input
                autoFocus
                className="mt-5 w-full border border-ink-700/12 bg-white/80 px-4 py-3 text-sm text-ink-900"
                onChange={(event) => setNicknameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    handleConfirmNickname();
                  }
                }}
                placeholder="输入你的昵称"
                value={nicknameDraft}
              />
              <Button className="mt-4 w-full px-4 py-3 text-sm" onClick={handleConfirmNickname} type="button" variant="primary">
                确认进入
              </Button>
            </section>
          </div>
        )}
      </section>
    </main>
  );

  const renderRoom = () => {
    if (!room) {
      return null;
    }

    return (
      <main className={styles.shell}>
        <section className="mx-auto flex h-full max-w-7xl flex-col gap-6 overflow-auto px-4 py-6 md:px-6">
          <header className="rounded-[28px] border border-ink-700/10 bg-[rgba(255,251,243,0.85)] p-6 shadow-paper">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="m-0 text-xs uppercase tracking-[0.2em] text-ink-500">房间管理</p>
                <h1 className="m-0 font-display text-4xl text-ink-900">{room.roomCode}</h1>
              </div>
              <div className="flex flex-wrap gap-3">
                <span className="rounded-full bg-ink-100 px-4 py-2 text-sm text-ink-700">
                  连接状态：{formatStatus(connectionState)}
                </span>
                <Button
                  className="px-4 py-2 text-sm"
                  onClick={() => leaveRoom()}
                  type="button"
                  variant="secondary"
                >
                  退出房间
                </Button>
              </div>
            </div>
          </header>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_360px]">
            <section className="rounded-[28px] border border-ink-700/10 bg-[rgba(255,250,241,0.5)] p-5 shadow-paper">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="m-0 text-xs uppercase tracking-[0.18em] text-ink-500">座位</p>
                  <h2 className="m-0 font-display text-2xl text-ink-900">选位与门派</h2>
                </div>
                <div className="text-sm text-ink-700">你当前的座位：{mySeatId === null ? '观战' : `${Number(mySeatId) + 1}P`}</div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {room.seats.map((seat) => {
                  const occupant = seat.memberId ? room.members.find((member) => member.id === seat.memberId) ?? null : null;
                  const isMine = seat.id === mySeatId;

                  return (
                    <article
                      key={seat.id}
                      className="rounded-[22px] border border-ink-700/10 bg-[rgba(255,248,235,0.84)] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="m-0 text-xs uppercase tracking-[0.18em] text-ink-500">{getTeamLabel(seat.id % 2 === 0 ? 0 : 1)}</p>
                          <h3 className="m-0 font-display text-2xl text-ink-900">{seat.id + 1}P</h3>
                        </div>
                        <span className="rounded-full bg-ink-100 px-3 py-1 text-xs text-ink-700">
                          {occupant ? occupant.name : 'AI 预留'}
                        </span>
                      </div>

                      <p className="mb-0 mt-3 text-sm text-ink-700">当前门派：{getSectLabel(seat.sect ?? Sect.QINGXI)}</p>

                      <select
                        className="mt-4 w-full rounded-[14px] border border-ink-700/12 bg-white/80 px-3 py-3 text-sm text-ink-900"
                        disabled={!isMine}
                        onChange={(event) => {
                          void setSect({
                            sect: Number(event.target.value) as Sect
                          });
                        }}
                        value={seat.sect ?? Sect.QINGXI}
                      >
                        {ALL_SECTS.map((sect) => (
                          <option key={sect} value={sect}>
                            {getSectLabel(sect)}
                          </option>
                        ))}
                      </select>

                      <div className="mt-4 flex gap-3">
                        <Button
                          className="flex-1 px-4 py-3 text-sm"
                          disabled={Boolean(occupant && occupant.id !== selfMember?.id)}
                          onClick={() => {
                            void claimSeat({
                              seatId: seat.id
                            });
                          }}
                          type="button"
                          variant="primary"
                        >
                          {isMine ? '已占座' : '占据此位'}
                        </Button>

                        {isMine && (
                          <Button
                            className="px-4 py-3 text-sm"
                            onClick={() => {
                              void leaveSeat();
                            }}
                            type="button"
                            variant="secondary"
                          >
                            离座
                          </Button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <aside className="grid gap-6">
              <section className="rounded-[28px] border border-ink-700/10 bg-[rgba(255,250,241,0.5)] p-5 shadow-paper">
                <p className="m-0 text-xs uppercase tracking-[0.18em] text-ink-500">成员</p>
                <h2 className="m-0 font-display text-2xl text-ink-900">房内玩家</h2>
                <div className="mt-4 grid gap-3">
                  {room.members.map((member) => (
                    <article key={member.id} className="rounded-[18px] bg-[rgba(111,78,57,0.08)] px-4 py-3 text-sm text-ink-700">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-ink-900">
                            {member.name}
                            {member.isHost ? ' · 房主' : ''}
                          </div>
                          <div>{member.seatId === null ? '观战中' : `已占据 ${member.seatId + 1}P`}</div>
                        </div>
                        {isHost && member.id !== room.selfMemberId && (
                          <Button
                            className="px-3 py-1 text-xs"
                            onClick={() => {
                              void kickMember(member.id);
                            }}
                            type="button"
                            variant="secondary"
                          >
                            踢出
                          </Button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="rounded-[28px] border border-ink-700/10 bg-[rgba(255,250,241,0.5)] p-5 shadow-paper">
                <p className="m-0 text-xs uppercase tracking-[0.18em] text-ink-500">房主控制</p>
                <h2 className="m-0 font-display text-2xl text-ink-900">开局设置</h2>
                <input
                  className="mt-4 w-full rounded-[16px] border border-ink-700/12 bg-white/80 px-4 py-3 text-sm text-ink-900"
                  disabled={!isHost}
                  onChange={(event) => setRoomPasswordDraft(event.target.value)}
                  placeholder={room.hasPassword ? '已设密码，输入新密码覆盖' : '输入房间密码，可留空'}
                  value={roomPasswordDraft}
                />
                <Button
                  className="mt-3 w-full px-4 py-3 text-sm"
                  disabled={!isHost}
                  onClick={() => {
                    void updateRoomSettings({
                      password: roomPasswordDraft || null
                    });
                  }}
                  type="button"
                  variant="secondary"
                >
                  保存房间密码
                </Button>
                <Button
                  className="mt-3 w-full px-4 py-3 text-sm"
                  disabled={!isHost}
                  onClick={() => {
                    void startGame();
                  }}
                  type="button"
                  variant="primary"
                >
                  开始游戏
                </Button>
              </section>
            </aside>
          </section>

          {error && (
            <div className="rounded-[22px] border border-[rgba(139,75,60,0.2)] bg-[rgba(255,243,239,0.9)] px-5 py-4 text-sm text-[#704836]">
              <div>{error}</div>
              <Button className="mt-3 px-3 py-1 text-xs" onClick={() => setError(null)} type="button" variant="secondary">
                关闭
              </Button>
            </div>
          )}
        </section>
      </main>
    );
  };

  const renderGame = () => {
    if (!room?.match) {
      return null;
    }

    return (
      <main className={styles.shell}>
        <section className={styles.hero}>
          <div className={styles.seatBox}>
            <span className={styles.seatLabel}>观战座位</span>
            <div className={styles.seatList}>
              {SEATS.map((seat) => (
                <Button
                  key={seat}
                  className={String(seat) === viewSeatId ? styles.seatButtonActive : styles.seatButton}
                  onClick={() => setViewSeatId(String(seat))}
                  type="button"
                  variant={String(seat) === viewSeatId ? 'active' : 'secondary'}
                >
                  {seat + 1}P
                </Button>
              ))}
            </div>
            <p className={styles.seatHint}>你控制的座位以服务端房间快照为准，切换只改变观察视角。</p>
          </div>
        </section>

        <section className={styles.clientFrame}>
          <div className="absolute left-4 top-4 z-40 flex flex-wrap gap-3">
            <span className="rounded-full bg-[rgba(255,251,241,0.88)] px-4 py-2 text-sm text-ink-700 shadow-paper">
              房间 {room.roomCode} · {room.status === 'finished' ? '已结算' : '对局中'}
            </span>
            <span className="rounded-full bg-[rgba(255,251,241,0.88)] px-4 py-2 text-sm text-ink-700 shadow-paper">
              连接 {formatStatus(connectionState)}
            </span>
            <Button
              className="px-4 py-2 text-sm shadow-paper"
              onClick={() => leaveRoom()}
              type="button"
              variant="secondary"
            >
              退出房间
            </Button>
          </div>

          <DamaqiBoard
            controllablePlayerID={mySeatId === null ? null : String(mySeatId)}
            match={room.match}
            onAction={(action) => {
              void sendGameAction(action);
            }}
            viewPlayerID={viewSeatId}
          />

          {room.status === 'finished' && (
            <div className="pointer-events-none absolute inset-x-0 top-20 z-30 flex justify-center px-4">
              <div className="rounded-[24px] bg-[rgba(34,25,17,0.76)] px-6 py-4 text-center text-sm text-ink-50 shadow-paper">
                对局已结束，可继续观战或退出房间重开。
              </div>
            </div>
          )}

          {error && (
            <div className="absolute bottom-4 left-4 z-40 max-w-md rounded-[22px] border border-[rgba(139,75,60,0.2)] bg-[rgba(255,243,239,0.95)] px-5 py-4 text-sm text-[#704836] shadow-paper">
              <div>{error}</div>
              <Button className="mt-3 px-3 py-1 text-xs" onClick={() => setError(null)} type="button" variant="secondary">
                关闭
              </Button>
            </div>
          )}
        </section>
      </main>
    );
  };

  if (!room) {
    return renderLobby();
  }

  if (room.status === 'lobby') {
    return renderRoom();
  }

  return renderGame();
}
