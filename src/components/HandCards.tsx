import type { CardData } from '../types';

type HandCardsProps = {
  cards: CardData[];
  disabled: boolean;
  onUseCard: (cardId: string) => void;
};

export function HandCards({ cards, disabled, onUseCard }: HandCardsProps) {
  if (cards.length === 0) {
    return (
      <div className="rounded-[18px] border border-dashed border-ink-700/18 px-5 py-8 text-center text-sm text-ink-700">
        当前没有手牌，可通过商店、奇遇或门派技能获得。
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((card, index) => {
        return (
          <article
            key={`${card.id}-${index}`}
            className="flex min-h-[180px] flex-col rounded-[22px] border border-ink-700/12 bg-[linear-gradient(180deg,rgba(255,251,243,0.94),rgba(235,226,206,0.88))] p-4 shadow-paper"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="m-0 text-xs uppercase tracking-[0.18em] text-ink-500">
                  {card.isPassive ? '被动卡' : '主动卡'}
                </p>
                <h3 className="m-0 font-display text-2xl text-ink-900">{card.name}</h3>
              </div>
              <span className="rounded-full bg-ink-100 px-3 py-1 text-xs text-ink-700">{card.price} 棋珍</span>
            </div>

            <p className="m-0 flex-1 text-sm leading-7 text-ink-700">{card.description}</p>

            <button
              className="mt-4 rounded-[14px] bg-[linear-gradient(180deg,#6f4e39,#513828)] px-4 py-3 text-sm text-ink-50 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={disabled || card.isPassive}
              onClick={() => onUseCard(card.id)}
              type="button"
            >
              {card.isPassive ? '持续生效' : '打出卡牌'}
            </button>
          </article>
        );
      })}
    </div>
  );
}
