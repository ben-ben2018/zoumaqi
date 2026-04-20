import clsx from 'clsx';

import { getSectLabel, getTeamLabel } from '../game/helpers';
import { PlayerStatus, type PlayerData } from '../types';

type PlayerPanelProps = {
  player: PlayerData;
  isCurrent: boolean;
  isSelf: boolean;
  totalTiles: number;
};

function formatStatus(player: PlayerData): string {
  if (player.status === PlayerStatus.SKIP_TURN) {
    return '跳过回合';
  }
  if (player.status === PlayerStatus.FROZEN) {
    return '冻结';
  }
  return '正常';
}

export function PlayerPanel({ player, isCurrent, isSelf, totalTiles }: PlayerPanelProps) {
  const buffCount = Object.keys(player.buffs).length;
  const debuffCount = Object.keys(player.debuffs).length;

  return (
    <article
      className={clsx(
        'rounded-[16px] border px-3 py-2 shadow-paper transition-transform duration-200',
        isCurrent
          ? 'border-[rgba(111,78,57,0.35)] bg-[rgba(255,250,241,0.94)]'
          : 'border-ink-700/10 bg-[rgba(255,249,238,0.74)]',
        isSelf && 'translate-y-[-1px]'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="m-0 text-[10px] uppercase tracking-[0.14em] text-ink-500">{getTeamLabel(player.team)}</p>
          <h3 className="m-0 truncate font-display text-lg leading-none text-ink-900">{player.name}</h3>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] text-ink-700">{getSectLabel(player.sect)}</span>
          <span className="rounded-full bg-[rgba(111,78,57,0.1)] px-2 py-0.5 text-[10px] text-ink-700">
            {player.isBot ? 'AI' : '人'}
          </span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-ink-700">
        <span className="rounded-full bg-[rgba(111,78,57,0.08)] px-2 py-0.5">位 {player.position + 1}/{totalTiles}</span>
        <span className="rounded-full bg-[rgba(111,78,57,0.08)] px-2 py-0.5">珍 {player.gold}</span>
        <span className="rounded-full bg-[rgba(111,78,57,0.08)] px-2 py-0.5">牌 {player.handCards.length}</span>
        <span className="rounded-full bg-[rgba(111,78,57,0.08)] px-2 py-0.5">冷 {player.activeSkillCooldown}</span>
        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-ink-700">{formatStatus(player)}</span>
        {buffCount > 0 && <span className="rounded-full bg-moss-100 px-2 py-0.5 text-moss-700">Buff {buffCount}</span>}
        {debuffCount > 0 && (
          <span className="rounded-full bg-[rgba(139,75,60,0.16)] px-2 py-0.5 text-[#704836]">Debuff {debuffCount}</span>
        )}
      </div>
    </article>
  );
}
