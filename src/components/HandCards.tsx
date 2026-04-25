import { Button } from './Button';
import type { CardData } from '../types';

type HandCardsProps = {
  cards: CardData[];
  disabled: boolean;
  onUseCard: (cardId: string) => void;
};

export function HandCards({ cards, disabled, onUseCard }: HandCardsProps) {
  if (cards.length === 0) {
    return (
      <div className="rounded-[16px] border border-dashed border-ink-700/18 px-4 py-6 text-center text-[13px] text-ink-700">
        当前没有手牌，可通过商店、奇遇或门派技能获得。
      </div>
    );
  }

  return (
    <div className="grid auto-cols-fr grid-flow-col gap-2.5 overflow-hidden">
      {cards.map((card, index) => {
        return (
          <article
            key={`${card.id}-${index}`}
            className="flex min-h-[136px] min-w-0 flex-col rounded-[18px] border border-ink-700/12 bg-[linear-gradient(180deg,rgba(255,251,243,0.94),rgba(235,226,206,0.88))] p-3 shadow-paper"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="m-0 text-[11px] uppercase tracking-[0.16em] text-ink-500">
                  {card.isPassive ? '被动卡' : '主动卡'}
                </p>
                <h3 className="m-0 truncate font-display text-[clamp(1rem,1.3vw,1.35rem)] text-ink-900">{card.name}</h3>
              </div>
              <span className="shrink-0 rounded-full bg-ink-100 px-2 py-1 text-[10px] text-ink-700">{card.price} 棋珍</span>
            </div>

            <p
              className="m-0 flex-1 overflow-hidden text-[12px] leading-5 text-ink-700"
              style={{
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 4
              }}
            >
              {card.description}
            </p>

            <Button
              className="mt-3 px-3 py-2 text-[12px]"
              disabled={disabled || card.isPassive}
              onClick={() => onUseCard(card.id)}
              type="button"
              variant="primary"
            >
              {card.isPassive ? '持续生效' : '打出卡牌'}
            </Button>
          </article>
        );
      })}
    </div>
  );
}
