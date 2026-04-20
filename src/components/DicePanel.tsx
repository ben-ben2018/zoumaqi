import { TurnStage } from '../types';

type DicePanelProps = {
  stage: TurnStage;
  lastRoll: number | null;
  pendingRoll: number | null;
  disabled: boolean;
  onRoll: () => void;
};

export function DicePanel({ stage, lastRoll, pendingRoll, disabled, onRoll }: DicePanelProps) {
  const canRoll = stage === TurnStage.ROLL && !disabled;

  return (
    <section className="rounded-[22px] border border-ink-700/10 bg-[rgba(255,250,241,0.82)] p-5">
      <p className="mb-2 text-xs uppercase tracking-[0.18em] text-ink-500">骰子台</p>
      <div className="grid gap-3">
        <div className="rounded-[20px] bg-[radial-gradient(circle_at_top,_rgba(113,135,120,0.22),_rgba(255,249,239,0.88))] p-5 text-center shadow-paper">
          <p className="m-0 text-sm text-ink-700">最近点数</p>
          <p className="m-0 font-display text-5xl text-ink-900">{lastRoll ?? '未掷'}</p>
          <p className="m-0 text-sm text-ink-700">本次行动：{pendingRoll ?? lastRoll ?? 0} 格</p>
        </div>

        <button
          className="rounded-[16px] bg-[linear-gradient(180deg,#6f4e39,#513828)] px-4 py-3 text-[15px] text-ink-50 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!canRoll}
          onClick={onRoll}
          type="button"
        >
          掷骰并行动
        </button>
      </div>
    </section>
  );
}
