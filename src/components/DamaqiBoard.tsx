import { useEffect, useState } from 'react';
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
import { Sect, SkillTarget, TurnStage, type CardData, type CardUsageArgs, type GameState, type PlayerData } from '../types';

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
type PendingTargetAction =
  | {
      source: 'card' | 'skill';
      cardId?: string;
      title: string;
      description: string;
      candidateIds: PlayerID[];
    }
  | null;

const TEAMMATE_ONLY_CARD_IDS = new Set(['youqian_renxing', 'paiyou_jienan']);
const ENEMY_TARGET_SKILL_SECTS = new Set([Sect.LIYUAN, Sect.SANGENGTIAN, Sect.ZUIHUAYIN, Sect.JIULIUMEN]);

function getCardTargetCandidateIds(card: CardData, currentPlayerId: PlayerID, players: Record<PlayerID, PlayerData>): PlayerID[] {
  const currentPlayer = players[currentPlayerId];

  if (card.targetType === SkillTarget.ENEMY) {
    return Object.values(players)
      .filter((candidate) => candidate.team !== currentPlayer.team)
      .map((candidate) => candidate.id as PlayerID);
  }

  if (card.targetType === SkillTarget.ALLY) {
    return Object.values(players)
      .filter((candidate) =>
        TEAMMATE_ONLY_CARD_IDS.has(card.id)
          ? candidate.id !== currentPlayerId && candidate.team === currentPlayer.team
          : candidate.team === currentPlayer.team
      )
      .map((candidate) => candidate.id as PlayerID);
  }

  return [];
}

function getSkillTargetCandidateIds(currentPlayerId: PlayerID, players: Record<PlayerID, PlayerData>): PlayerID[] {
  const currentPlayer = players[currentPlayerId];
  if (!ENEMY_TARGET_SKILL_SECTS.has(currentPlayer.sect)) {
    return [];
  }

  return Object.values(players)
    .filter((candidate) => candidate.team !== currentPlayer.team)
    .map((candidate) => candidate.id as PlayerID);
}

export function DamaqiBoard({ G, ctx, moves, humanPlayerID, viewPlayerID }: DamaqiBoardProps) {
  const moveApi = moves as unknown as BoardMoveAPI;
  const actualHumanPlayerId = (humanPlayerID ?? '0') as PlayerID;
  const effectivePlayerId = (viewPlayerID ?? actualHumanPlayerId) as PlayerID;
  const currentPlayer = G.players[ctx.currentPlayer];
  const myPlayer = G.players[effectivePlayerId];
  const [pendingCardAction, setPendingCardAction] = useState<PendingCardAction>(null);
  const [pendingTargetAction, setPendingTargetAction] = useState<PendingTargetAction>(null);

  const activePendingDiscard = G.pendingDiscards[0] ?? null;
  const pendingDiscardPlayer = activePendingDiscard ? G.players[activePendingDiscard.playerId] : null;
  const pendingDiscardCount = pendingDiscardPlayer
    ? Math.max(0, pendingDiscardPlayer.handCards.length - getHandLimit(pendingDiscardPlayer))
    : 0;
  const isForcedDiscardActive = Boolean(activePendingDiscard);
  const isMyPendingDiscard = activePendingDiscard?.playerId === effectivePlayerId;
  const isHumanTurn = actualHumanPlayerId === ctx.currentPlayer;
  const isViewingHumanSeat = effectivePlayerId === actualHumanPlayerId;
  const areActionButtonsDisabled = !isHumanTurn || !isViewingHumanSeat || isForcedDiscardActive;

  useEffect(() => {
    if (![TurnStage.ROLL, TurnStage.CARD].includes(G.turnStage) || !isHumanTurn || !isViewingHumanSeat) {
      setPendingCardAction(null);
    }
  }, [G.turnStage, isHumanTurn, isViewingHumanSeat, ctx.currentPlayer]);

  useEffect(() => {
    if (isForcedDiscardActive) {
      setPendingCardAction(null);
      setPendingTargetAction(null);
    }
  }, [isForcedDiscardActive]);

  useEffect(() => {
    if (!isHumanTurn || !isViewingHumanSeat) {
      setPendingTargetAction(null);
    }
  }, [isHumanTurn, isViewingHumanSeat, ctx.currentPlayer]);

  const handleUseCard = (cardId: string) => {
    const card = myPlayer.handCards.find((item) => item.id === cardId);
    if (!card) {
      return;
    }

    if (cardId === 'lingyun_ta') {
      setPendingCardAction({
        cardId
      });
      return;
    }

    const candidateIds = getCardTargetCandidateIds(card, effectivePlayerId, G.players);
    if (candidateIds.length > 0) {
      setPendingTargetAction({
        source: 'card',
        cardId,
        title: `选择 ${card.name} 的目标`,
        description: card.targetType === SkillTarget.ENEMY ? '此效果只能对敌方生效。' : '此效果可对自己或友方生效。',
        candidateIds
      });
      return;
    }

    moveApi.useCard(cardId);
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

  const handleUseActiveSkill = () => {
    const candidateIds = getSkillTargetCandidateIds(effectivePlayerId, G.players);
    if (candidateIds.length > 0) {
      setPendingTargetAction({
        source: 'skill',
        title: `选择${getSectLabel(myPlayer.sect)}主动目标`,
        description: '该主动技能只能对敌方目标生效。',
        candidateIds
      });
      return;
    }

    moveApi.useActiveSkill();
  };

  const handleTargetChoice = (targetPlayerId: PlayerID) => {
    if (!pendingTargetAction) {
      return;
    }

    if (pendingTargetAction.source === 'card' && pendingTargetAction.cardId) {
      moveApi.useCard(pendingTargetAction.cardId, targetPlayerId);
    } else {
      moveApi.useActiveSkill(targetPlayerId);
    }

    setPendingTargetAction(null);
  };

  return (
    <div className={styles.shell}>
      <section className={styles.boardSurface}>
        <BoardCanvas tiles={G.board.tiles} players={Object.values(G.players)} currentPlayerId={ctx.currentPlayer} />
      </section>

      <div className={styles.hudLayer}>
        <div className={styles.turnDock}>
          <TurnIndicator
            currentPlayerId={ctx.currentPlayer}
            players={Object.values(G.players)}
            stage={G.turnStage}
            totalTiles={G.board.totalTiles}
          />
        </div>

        <div className={styles.logPanel}>
          <div className={styles.logPanelInner}>
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
        </div>

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
            <p className={styles.noticeText}>
              需要指定目标的卡牌或主动技能，会在点击时弹出目标选择，不再常驻占用面板区域。
            </p>
          </div>

          <DicePanel
            stage={G.turnStage}
            lastRoll={currentPlayer.lastRoll}
            pendingRoll={G.pendingRoll}
            disabled={areActionButtonsDisabled}
            onRoll={moveApi.rollDice}
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
              disabled={
                areActionButtonsDisabled ||
                ![TurnStage.ROLL, TurnStage.CARD, TurnStage.SKILL].includes(G.turnStage) ||
                myPlayer.activeSkillCooldown > 0
              }
              onClick={handleUseActiveSkill}
              type="button"
            >
              {myPlayer.activeSkillCooldown > 0
                ? `技能冷却 ${myPlayer.activeSkillCooldown}`
                : `发动${getSectLabel(myPlayer.sect)}主动`}
            </button>
          </div>
        </aside>

        <div className={styles.playerDock}>
          <div className={styles.playerGrid}>
            {Object.values(G.players).map((player) => (
              <PlayerPanel
                key={player.id}
                player={player}
                isCurrent={player.id === ctx.currentPlayer}
                isSelf={player.id === effectivePlayerId}
                totalTiles={G.board.totalTiles}
              />
            ))}
          </div>
        </div>

        <section className={styles.handBlock}>
          <div className={styles.handHeader}>
            <div>
              <p className={styles.sectionKicker}>手牌区</p>
              <h2 className={styles.sectionTitle}>当前座位：{myPlayer.name}</h2>
            </div>
            <p className={styles.handHint}>
              被动卡会持续留在手牌中生效。需要指定目标的卡牌会在点击后弹出目标选择。AI 座位会自动执行。
            </p>
          </div>

          <HandCards
            cards={myPlayer.handCards}
            disabled={areActionButtonsDisabled || ![TurnStage.ROLL, TurnStage.CARD].includes(G.turnStage)}
            onUseCard={handleUseCard}
          />
        </section>
      </div>

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

      {pendingTargetAction && (
        <div className={styles.overlay}>
          <section className={styles.choiceModal}>
            <p className={styles.sectionKicker}>目标选择</p>
            <h3 className={styles.choiceTitle}>{pendingTargetAction.title}</h3>
            <p className={styles.choiceText}>{pendingTargetAction.description}</p>

            <div className={styles.discardList}>
              {pendingTargetAction.candidateIds.map((candidateId) => {
                const targetPlayer = G.players[candidateId];
                return (
                  <article key={targetPlayer.id} className={styles.discardCard}>
                    <div>
                      <p className={styles.discardType}>{getTeamLabel(targetPlayer.team)}</p>
                      <h4 className={styles.discardName}>
                        {targetPlayer.name} · {getSectLabel(targetPlayer.sect)}
                      </h4>
                      <p className={styles.discardDescription}>
                        位置 {targetPlayer.position + 1} / {G.board.totalTiles} · 棋珍 {targetPlayer.gold} · 手牌{' '}
                        {targetPlayer.handCards.length}
                      </p>
                    </div>
                    <button className={styles.discardButton} onClick={() => handleTargetChoice(candidateId)} type="button">
                      选择该目标
                    </button>
                  </article>
                );
              })}
            </div>

            <button className={styles.cancelButton} onClick={() => setPendingTargetAction(null)} type="button">
              取消
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
