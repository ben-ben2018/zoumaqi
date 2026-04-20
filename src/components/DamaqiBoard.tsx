import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import type { PlayerID } from 'boardgame.io';
import type { BoardProps } from 'boardgame.io/react';

import styles from './DamaqiBoard.module.css';
import { BoardCanvas } from './BoardCanvas';
import { DicePanel } from './DicePanel';
import { HandCards } from './HandCards';
import { PlayerPanel } from './PlayerPanel';
import { ShopModal } from './ShopModal';
import { TurnIndicator } from './TurnIndicator';
import { getHandLimit, getSectLabel, getTeamLabel } from '../game/helpers';
import { SkillTarget, TurnStage, type CardData, type CardUsageArgs, type GameState, type PlayerData } from '../types';

type BoardMoveAPI = {
  rollDice: () => void;
  movePlayer: (steps?: number) => void;
  buyCard: (cardId: string) => void;
  finishShop: () => void;
  useCard: (cardId: string, targetPlayerId?: PlayerID, usageArgs?: CardUsageArgs) => void;
  finishCardStage: () => void;
  useActiveSkill: (targetPlayerId?: PlayerID) => void;
  finishSkillStage: () => void;
  discardOverflowCard: (cardId: string) => void;
};

type DamaqiBoardProps = BoardProps<GameState> & {
  humanPlayerID?: PlayerID;
  viewPlayerID?: PlayerID;
};
type PendingCardAction = {
  cardId: string;
  targetPlayerId?: PlayerID;
} | null;

function getDefaultTarget(
  cards: CardData[],
  currentPlayerId: PlayerID,
  players: Record<PlayerID, PlayerData>
): PlayerID | '' {
  const enemy = Object.values(players).find((candidate) => candidate.id !== currentPlayerId && candidate.team !== players[currentPlayerId].team);
  if (cards.some((card) => card.targetType === SkillTarget.ENEMY)) {
    return enemy?.id ?? '';
  }

  const ally = Object.values(players).find((candidate) => candidate.id !== currentPlayerId && candidate.team === players[currentPlayerId].team);
  return ally?.id ?? '';
}

export function DamaqiBoard({ G, ctx, moves, humanPlayerID, viewPlayerID }: DamaqiBoardProps) {
  const moveApi = moves as unknown as BoardMoveAPI;
  const actualHumanPlayerId = (humanPlayerID ?? '0') as PlayerID;
  const effectivePlayerId = (viewPlayerID ?? actualHumanPlayerId) as PlayerID;
  const currentPlayer = G.players[ctx.currentPlayer];
  const myPlayer = G.players[effectivePlayerId];
  const [selectedTargetId, setSelectedTargetId] = useState<PlayerID | ''>(() =>
    getDefaultTarget(myPlayer.handCards, effectivePlayerId, G.players)
  );
  const [pendingCardAction, setPendingCardAction] = useState<PendingCardAction>(null);

  const otherPlayers = useMemo(
    () => Object.values(G.players).filter((player) => player.id !== effectivePlayerId),
    [G.players, effectivePlayerId]
  );

  const activePendingDiscard = G.pendingDiscards[0] ?? null;
  const pendingDiscardPlayer = activePendingDiscard ? G.players[activePendingDiscard.playerId] : null;
  const pendingDiscardCount = pendingDiscardPlayer
    ? Math.max(0, pendingDiscardPlayer.handCards.length - getHandLimit(pendingDiscardPlayer))
    : 0;
  const isForcedDiscardActive = Boolean(activePendingDiscard);
  const isMyPendingDiscard = activePendingDiscard?.playerId === effectivePlayerId;
  const selectedTarget = selectedTargetId ? G.players[selectedTargetId] : null;
  const isHumanTurn = actualHumanPlayerId === ctx.currentPlayer;
  const isViewingHumanSeat = effectivePlayerId === actualHumanPlayerId;
  const areActionButtonsDisabled = !isHumanTurn || !isViewingHumanSeat || isForcedDiscardActive;

  useEffect(() => {
    if (G.turnStage !== TurnStage.CARD || !isHumanTurn || !isViewingHumanSeat) {
      setPendingCardAction(null);
    }
  }, [G.turnStage, isHumanTurn, isViewingHumanSeat, ctx.currentPlayer]);

  useEffect(() => {
    if (isForcedDiscardActive) {
      setPendingCardAction(null);
    }
  }, [isForcedDiscardActive]);

  const handleUseCard = (cardId: string, targetPlayerId?: PlayerID) => {
    if (cardId === 'lingyun_ta') {
      setPendingCardAction({
        cardId,
        targetPlayerId
      });
      return;
    }

    moveApi.useCard(cardId, targetPlayerId);
  };

  const handleLingyunChoice = (selectedSteps: number) => {
    if (!pendingCardAction) {
      return;
    }

    moveApi.useCard(pendingCardAction.cardId, pendingCardAction.targetPlayerId, {
      selectedSteps
    });
    setPendingCardAction(null);
  };

  return (
    <div className={styles.shell}>
      <TurnIndicator currentPlayerId={ctx.currentPlayer} players={Object.values(G.players)} stage={G.turnStage} />

      <div className={styles.grid}>
        <section className={styles.boardBlock}>
          <div className={styles.boardHeader}>
            <div>
              <p className={styles.sectionKicker}>长卷棋盘</p>
              <h2 className={styles.sectionTitle}>当前回合：{currentPlayer.name}</h2>
            </div>

            <div className={styles.turnBadge}>
              <span>{getTeamLabel(currentPlayer.team)}</span>
              <span>{getSectLabel(currentPlayer.sect)}</span>
              <span>阶段：{G.turnStage}</span>
            </div>
          </div>

          <BoardCanvas tiles={G.board.tiles} players={Object.values(G.players)} currentPlayerId={ctx.currentPlayer} />

          <div className={styles.logPanel}>
            <p className={styles.sectionKicker}>棋局播报</p>
            <p className={styles.turnMessage}>{G.turnMessage}</p>
            <div className={styles.logList}>
              {G.actionLog.map((entry) => (
                <p key={entry} className={styles.logEntry}>
                  {entry}
                </p>
              ))}
            </div>
          </div>
        </section>

        <aside className={styles.sideColumn}>
          <div className={styles.noticeCard}>
            <p className={styles.sectionKicker}>本地座位</p>
            <h3 className={styles.noticeTitle}>
              {myPlayer.name} · {getTeamLabel(myPlayer.team)}
            </h3>
            <p className={styles.noticeText}>
              当前视角为 {myPlayer.name}（{myPlayer.isBot ? 'AI' : '人类'}）· {getSectLabel(myPlayer.sect)}。
              {isHumanTurn
                ? isViewingHumanSeat
                  ? '现在轮到你操作 1P。'
                  : '当前是你的回合，但你正在观察其他座位。切回 1P 后即可操作。'
                : `${currentPlayer.name} 正由 ${currentPlayer.isBot ? 'AI' : '人类'}处理本回合。`}
            </p>
          </div>

          <div className={styles.targetCard}>
            <label className={styles.targetLabel} htmlFor="target-select">
              目标选择
            </label>
            <select
              id="target-select"
              className={styles.targetSelect}
              value={selectedTargetId}
              onChange={(event) => setSelectedTargetId(event.target.value as PlayerID | '')}
            >
              <option value="">无需目标 / 默认目标</option>
              {otherPlayers.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name} · {getSectLabel(player.sect)} · {getTeamLabel(player.team)}
                </option>
              ))}
            </select>
            <p className={styles.targetHint}>
              当前目标：{selectedTarget ? `${selectedTarget.name}（${getSectLabel(selectedTarget.sect)}）` : '未指定'}
            </p>
          </div>

          <DicePanel
            stage={G.turnStage}
            lastRoll={currentPlayer.lastRoll}
            pendingRoll={G.pendingRoll}
            disabled={areActionButtonsDisabled}
            onRoll={moveApi.rollDice}
            onMove={() => moveApi.movePlayer()}
          />

          <div className={styles.quickActions}>
            <button
              className={clsx(styles.quickButton, G.turnStage === TurnStage.CARD && styles.quickButtonActive)}
              disabled={areActionButtonsDisabled || G.turnStage !== TurnStage.CARD}
              onClick={() => moveApi.finishCardStage()}
              type="button"
            >
              结束出牌
            </button>
            <button
              className={clsx(styles.quickButton, G.turnStage === TurnStage.SKILL && styles.quickButtonActive)}
              disabled={areActionButtonsDisabled || G.turnStage !== TurnStage.SKILL}
              onClick={() => moveApi.finishSkillStage()}
              type="button"
            >
              跳过技能
            </button>
            <button
              className={styles.skillButton}
              disabled={areActionButtonsDisabled || G.turnStage !== TurnStage.SKILL || myPlayer.activeSkillCooldown > 0}
              onClick={() => moveApi.useActiveSkill(selectedTargetId || undefined)}
              type="button"
            >
              {myPlayer.activeSkillCooldown > 0
                ? `技能冷却 ${myPlayer.activeSkillCooldown}`
                : `发动${getSectLabel(myPlayer.sect)}主动`}
            </button>
          </div>
        </aside>
      </div>

      <div className={styles.playerGrid}>
        {Object.values(G.players).map((player) => (
          <PlayerPanel
            key={player.id}
            player={player}
            isCurrent={player.id === ctx.currentPlayer}
            isSelf={player.id === effectivePlayerId}
          />
        ))}
      </div>

      <section className={styles.handBlock}>
        <div className={styles.handHeader}>
          <div>
            <p className={styles.sectionKicker}>手牌区</p>
            <h2 className={styles.sectionTitle}>当前座位：{myPlayer.name}</h2>
          </div>
          <p className={styles.handHint}>
            被动卡会持续留在手牌中生效。攻击/辅助卡请先在右侧选择目标，再从这里打出。AI 座位会自动执行。
          </p>
        </div>

        <HandCards
          cards={myPlayer.handCards}
          disabled={areActionButtonsDisabled || G.turnStage !== TurnStage.CARD}
          selectedTargetId={selectedTargetId || undefined}
          onUseCard={handleUseCard}
        />
      </section>

      {G.pendingShop && (
        <ShopModal
          cards={G.currentShop}
          playerGold={currentPlayer.gold}
          onBuy={(cardId) => moveApi.buyCard(cardId)}
          onClose={() => moveApi.finishShop()}
        />
      )}

      {pendingDiscardPlayer && (
        <div className={styles.overlay}>
          <section className={styles.choiceModal}>
            <p className={styles.sectionKicker}>强制弃牌</p>
            <h3 className={styles.choiceTitle}>{pendingDiscardPlayer.name} 的手牌超出上限</h3>
            <p className={styles.choiceText}>
              原因：{activePendingDiscard?.reason}。当前共有 {pendingDiscardPlayer.handCards.length} 张手牌，上限为{' '}
              {getHandLimit(pendingDiscardPlayer)} 张，还需弃置 {pendingDiscardCount} 张后才能继续流程。
            </p>

            {isMyPendingDiscard ? (
              <div className={styles.discardList}>
                {pendingDiscardPlayer.handCards.map((card, index) => (
                  <article key={`${card.id}-${index}`} className={styles.discardCard}>
                    <div>
                      <p className={styles.discardType}>{card.isPassive ? '被动卡' : '主动卡'}</p>
                      <h4 className={styles.discardName}>{card.name}</h4>
                      <p className={styles.discardDescription}>{card.description}</p>
                    </div>
                    <button
                      className={styles.discardButton}
                      onClick={() => moveApi.discardOverflowCard(card.id)}
                      type="button"
                    >
                      弃置这张牌
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.lockNotice}>
                <p className={styles.choiceText}>当前未处于可操作视角。切回 1P 视角后才能继续处理你的强制弃牌。</p>
              </div>
            )}
          </section>
        </div>
      )}

      {pendingCardAction?.cardId === 'lingyun_ta' && (
        <div className={styles.overlay}>
          <section className={styles.choiceModal}>
            <p className={styles.sectionKicker}>卡牌抉择</p>
            <h3 className={styles.choiceTitle}>凌云踏要跳几步？</h3>
            <p className={styles.choiceText}>请选择 3 到 6 之间的步数，确认后立即结算位移。</p>

            <div className={styles.stepList}>
              {[3, 4, 5, 6].map((step) => (
                <button
                  key={step}
                  className={styles.stepButton}
                  onClick={() => handleLingyunChoice(step)}
                  type="button"
                >
                  {step} 步
                </button>
              ))}
            </div>

            <button className={styles.cancelButton} onClick={() => setPendingCardAction(null)} type="button">
              取消
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
