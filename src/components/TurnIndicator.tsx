import { getSectLabel, getTeamLabel } from '../game/helpers';
import { TurnStage, type PlayerData } from '../types';

type TurnIndicatorProps = {
  currentPlayerId: string;
  players: PlayerData[];
  stage: TurnStage;
  totalTiles: number;
};

export function TurnIndicator({ currentPlayerId, players, stage, totalTiles }: TurnIndicatorProps) {
  const currentPlayer = players.find((player) => player.id === currentPlayerId) ?? players[0];
  const redScore = Math.max(...players.filter((player) => player.team === 0).map((player) => player.position));
  const blueScore = Math.max(...players.filter((player) => player.team === 1).map((player) => player.position));

  return (
    <section className="relative z-10 grid gap-2 rounded-[20px] border border-ink-700/10 bg-[rgba(255,250,242,0.84)] p-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <p className="m-0 text-[11px] uppercase tracking-[0.16em] text-ink-500">回合指示</p>
          <span className="rounded-full bg-[rgba(111,78,57,0.08)] px-2.5 py-1 text-[11px] text-ink-700">{stage}</span>
        </div>
        <h2 className="m-0 truncate font-display text-[1.65rem] text-ink-900">
          {currentPlayer.name} · {getSectLabel(currentPlayer.sect)}
        </h2>
        <p className="mt-1 text-[13px] text-ink-700">当前阵营：{getTeamLabel(currentPlayer.team)} · 胜利线 {totalTiles} 格</p>
      </div>

      <div className="grid gap-0.5 rounded-[16px] bg-[rgba(111,78,57,0.08)] px-3 py-2 text-[13px] leading-5 text-ink-700">
        <div className="text-[11px] uppercase tracking-[0.14em] text-ink-500">阵营推进</div>
        <div>赤队前沿：{redScore + 1} 格</div>
        <div>青队前沿：{blueScore + 1} 格</div>
      </div>

      <div className="grid gap-0.5 rounded-[16px] bg-[rgba(98,130,113,0.12)] px-3 py-2 text-[13px] leading-5 text-ink-700">
        <div className="text-[11px] uppercase tracking-[0.14em] text-ink-500">胜负目标</div>
        <div>任意队伍一名成员先到终点</div>
        <div>率先抵达第 {totalTiles} 格即胜</div>
      </div>
    </section>
  );
}
