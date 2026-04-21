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
    <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {cards.map((card, index) => {
        return (
          <article
            key={`${card.id}-${index}`}
            className="flex min-h-[152px] flex-col rounded-[18px] border border-ink-700/12 bg-[linear-gradient(180deg,rgba(255,251,243,0.94),rgba(235,226,206,0.88))] p-3 shadow-paper"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="m-0 text-[11px] uppercase tracking-[0.16em] text-ink-500">
                  {card.isPassive ? '被动卡' : '主动卡'}
                </p>
                <h3 className="m-0 font-display text-xl text-ink-900">{card.name}</h3>
              </div>
              <span className="rounded-full bg-ink-100 px-2.5 py-1 text-[11px] text-ink-700">{card.price} 棋珍</span>
            </div>

            <p className="m-0 flex-1 text-[13px] leading-6 text-ink-700">{card.description}</p>

            <Button
              className="mt-3 px-3 py-2.5 text-[13px]"
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
