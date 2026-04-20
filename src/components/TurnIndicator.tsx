import type { PlayerID } from 'boardgame.io';

import { getSectLabel, getTeamLabel } from '../game/helpers';
import { TurnStage, type PlayerData } from '../types';

type TurnIndicatorProps = {
  currentPlayerId: PlayerID;
  players: PlayerData[];
  stage: TurnStage;
};

export function TurnIndicator({ currentPlayerId, players, stage }: TurnIndicatorProps) {
  const currentPlayer = players.find((player) => player.id === currentPlayerId) ?? players[0];
  const redScore = Math.max(...players.filter((player) => player.team === 0).map((player) => player.position));
  const blueScore = Math.max(...players.filter((player) => player.team === 1).map((player) => player.position));

  return (
    <section className="relative z-10 grid gap-3 rounded-[24px] border border-ink-700/10 bg-[rgba(255,250,242,0.84)] p-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
      <div>
        <p className="m-0 text-xs uppercase tracking-[0.18em] text-ink-500">回合指示</p>
        <h2 className="m-0 font-display text-3xl text-ink-900">
          {currentPlayer.name} · {getSectLabel(currentPlayer.sect)}
        </h2>
        <p className="m-0 text-sm text-ink-700">当前阶段：{stage}</p>
      </div>

      <div className="rounded-[18px] bg-[rgba(111,78,57,0.08)] px-4 py-3 text-sm text-ink-700">
        <div>{getTeamLabel(currentPlayer.team)}</div>
        <div>赤队前沿：{redScore + 1} 格</div>
        <div>青队前沿：{blueScore + 1} 格</div>
      </div>

      <div className="rounded-[18px] bg-[rgba(98,130,113,0.12)] px-4 py-3 text-sm text-ink-700">
        <div>胜利条件</div>
        <div>任意队伍一名成员先到 50 格即胜</div>
      </div>
    </section>
  );
}
