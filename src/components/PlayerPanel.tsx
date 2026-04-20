import clsx from 'clsx';

import { getSectLabel, getTeamLabel } from '../game/helpers';
import { PlayerStatus, type PlayerData } from '../types';

type PlayerPanelProps = {
  player: PlayerData;
  isCurrent: boolean;
  isSelf: boolean;
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

export function PlayerPanel({ player, isCurrent, isSelf }: PlayerPanelProps) {
  return (
    <article
      className={clsx(
        'rounded-[22px] border px-4 py-4 shadow-paper transition-transform duration-200',
        isCurrent
          ? 'border-[rgba(111,78,57,0.35)] bg-[rgba(255,250,241,0.96)]'
          : 'border-ink-700/10 bg-[rgba(255,249,238,0.82)]',
        isSelf && 'translate-y-[-2px]'
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="m-0 text-xs uppercase tracking-[0.18em] text-ink-500">{getTeamLabel(player.team)}</p>
          <h3 className="m-0 font-display text-2xl text-ink-900">{player.name}</h3>
        </div>
        <span className="rounded-full bg-ink-100 px-3 py-1 text-xs text-ink-700">{getSectLabel(player.sect)}</span>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm text-ink-700">
        <div>
          <dt>位置</dt>
          <dd className="m-0 text-lg text-ink-900">{player.position + 1} / 50</dd>
        </div>
        <div>
          <dt>棋珍</dt>
          <dd className="m-0 text-lg text-ink-900">{player.gold}</dd>
        </div>
        <div>
          <dt>手牌</dt>
          <dd className="m-0 text-lg text-ink-900">{player.handCards.length}</dd>
        </div>
        <div>
          <dt>冷却</dt>
          <dd className="m-0 text-lg text-ink-900">{player.activeSkillCooldown}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-ink-100 px-3 py-1 text-ink-700">状态：{formatStatus(player)}</span>
        {Object.keys(player.buffs).map((buff) => (
          <span key={buff} className="rounded-full bg-moss-100 px-3 py-1 text-moss-700">
            Buff：{buff}
          </span>
        ))}
        {Object.keys(player.debuffs).map((debuff) => (
          <span key={debuff} className="rounded-full bg-[rgba(139,75,60,0.16)] px-3 py-1 text-[#704836]">
            Debuff：{debuff}
          </span>
        ))}
      </div>
    </article>
  );
}
