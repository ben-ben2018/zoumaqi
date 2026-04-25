import { Button } from './Button';
import type { CardData } from '../types';

type ShopModalProps = {
  cards: CardData[];
  playerGold: number;
  onBuy: (cardId: string) => void;
  onClose: () => void;
};

export function ShopModal({ cards, playerGold, onBuy, onClose }: ShopModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(34,25,17,0.3)] p-4 md:items-center">
      <section className="flex max-h-[calc(100vh-2rem)] w-full max-w-7xl flex-col overflow-hidden rounded-[28px] border border-ink-700/14 bg-[linear-gradient(180deg,rgba(255,252,246,0.97),rgba(236,226,204,0.94))] p-6 shadow-paper">
        <div className="mb-5 flex flex-none flex-wrap items-center justify-between gap-4">
          <div>
            <p className="m-0 text-xs uppercase tracking-[0.18em] text-ink-500">商店格</p>
            <h2 className="m-0 font-display text-3xl text-ink-900">江湖商铺</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-ink-100 px-4 py-2 text-sm text-ink-700">当前棋珍：{playerGold}</span>
            <Button
              className="px-4 py-2 text-sm"
              onClick={onClose}
              type="button"
              variant="secondary"
            >
              结束采购
            </Button>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto pr-1">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {cards.map((card, index) => (
            <article
              key={`${card.id}-${index}`}
              className="flex min-h-[220px] flex-col rounded-[22px] border border-ink-700/10 bg-[rgba(255,248,235,0.8)] p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="m-0 font-display text-2xl text-ink-900">{card.name}</h3>
                <span className="rounded-full bg-[rgba(111,78,57,0.1)] px-3 py-1 text-sm text-ink-700">
                  {card.price}
                </span>
              </div>
              <p className="m-0 flex-1 text-sm leading-7 text-ink-700">{card.description}</p>
              <Button
                className="mt-4 px-4 py-3 text-sm"
                disabled={playerGold < card.price}
                onClick={() => onBuy(card.id)}
                type="button"
                variant="primary"
              >
                购买
              </Button>
            </article>
          ))}
          </div>
        </div>
      </section>
    </div>
  );
}
