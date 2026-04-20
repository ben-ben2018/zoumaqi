import { useEffect, useState } from 'react';
import clsx from 'clsx';

import styles from './DamaqiBoard.module.css';
import { BoardCanvas } from './BoardCanvas';
import { DicePanel } from './DicePanel';
import { HandCards } from './HandCards';
import { PlayerPanel } from './PlayerPanel';
import { ShopModal } from './ShopModal';
import { TurnIndicator } from './TurnIndicator';
import { getHandLimit, getSectLabel, getTeamLabel } from '../game/helpers';
import type { GameActionRequest, MatchSnapshot } from '../multiplayer/protocol';
import { Sect, SkillTarget, TurnStage, type CardData, type PlayerData } from '../types';

type DamaqiBoardProps = {
  match: MatchSnapshot;
  controllablePlayerID?: string | null;
  viewPlayerID?: string | null;
  onAction: (action: GameActionRequest) => void;
};

type PendingCardAction = {
  cardId: string;
  targetPlayerId?: string;
} | null;

type PendingTargetAction =
  | {
      source: 'card' | 'skill';
      cardId?: string;
      title: string;
      description: string;
      candidateIds: string[];
    }
  | null;

const TEAMMATE_ONLY_CARD_IDS = new Set(['youqian_renxing', 'paiyou_jienan']);
const ENEMY_TARGET_SKILL_SECTS = new Set([Sect.LIYUAN, Sect.SANGENGTIAN, Sect.ZUIHUAYIN, Sect.JIULIUMEN]);

function getCandidateIds(card: CardData, currentPlayerId: string, players: Record<string, PlayerData>): string[] {
  const currentPlayer = players[currentPlayerId];
  if (!currentPlayer) {
    return [];
  }

  if (card.targetType === SkillTarget.ENEMY) {
    return Object.values(players)
      .filter((candidate) => candidate.team !== currentPlayer.team)
      .map((candidate) => candidate.id);
  }

  if (card.targetType === SkillTarget.ALLY) {
    return Object.values(players)
      .filter((candidate) =>
        TEAMMATE_ONLY_CARD_IDS.has(card.id)
          ? candidate.id !== currentPlayerId && candidate.team === currentPlayer.team
          : candidate.team === currentPlayer.team
      )
      .map((candidate) => candidate.id);
  }

  return [];
}

function getSkillCandidateIds(currentPlayerId: string, players: Record<string, PlayerData>): string[] {
  const currentPlayer = players[currentPlayerId];
  if (!currentPlayer || !ENEMY_TARGET_SKILL_SECTS.has(currentPlayer.sect)) {
    return [];
  }

  return Object.values(players)
    .filter((candidate) => candidate.team !== currentPlayer.team)
    .map((candidate) => candidate.id);
}

export function DamaqiBoard({ match, controllablePlayerID, viewPlayerID, onAction }: DamaqiBoardProps) {
  const { G, ctx } = match;
  const currentPlayer = G.players[ctx.currentPlayer];
  const actualHumanPlayerId = controllablePlayerID ?? null;
  const effectivePlayerId = viewPlayerID ?? actualHumanPlayerId ?? ctx.currentPlayer;
  const myPlayer = G.players[effectivePlayerId] ?? currentPlayer;
  const [pendingCardAction, setPendingCardAction] = useState<PendingCardAction>(null);
  const [pendingTargetAction, setPendingTargetAction] = useState<PendingTargetAction>(null);

  const activePendingDiscard = G.pendingDiscards[0] ?? null;
  const pendingDiscardPlayer = activePendingDiscard ? G.players[activePendingDiscard.playerId] : null;
  const pendingDiscardCount = pendingDiscardPlayer
    ? Math.max(0, pendingDiscardPlayer.handCards.length - getHandLimit(pendingDiscardPlayer))
    : 0;
  const isForcedDiscardActive = Boolean(activePendingDiscard);
  const isMyPendingDiscard = Boolean(actualHumanPlayerId && activePendingDiscard?.playerId === actualHumanPlayerId);
  const isHumanTurn = Boolean(actualHumanPlayerId && actualHumanPlayerId === ctx.currentPlayer);
  const isViewingHumanSeat = Boolean(actualHumanPlayerId && effectivePlayerId === actualHumanPlayerId);
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

    const candidateIds = getCandidateIds(card, effectivePlayerId, G.players);
    if (candidateIds.length > 0) {
      setPendingTargetAction({
        source: 'card',
        cardId,
        title: `选择 ${card.name} 的目标`,
        description: card.targetType === SkillTarget.ENEMY ? '服务端会校验敌方目标是否合法。' : '服务端会校验友方目标是否合法。',
        candidateIds
      });
      return;
    }

    onAction({
      type: 'useCard',
      cardId
    });
  };

  const handleLingyunChoice = (selectedSteps: number) => {
    if (!pendingCardAction) {
      return;
    }

    onAction({
      type: 'useCard',
      cardId: pendingCardAction.cardId,
      targetPlayerId: pendingCardAction.targetPlayerId,
      usageArgs: {
        selectedSteps
      }
    });
    setPendingCardAction(null);
  };

  const handleUseActiveSkill = () => {
    const candidateIds = getSkillCandidateIds(effectivePlayerId, G.players);
    if (candidateIds.length > 0) {
      setPendingTargetAction({
        source: 'skill',
        title: `选择${getSectLabel(myPlayer.sect)}主动目标`,
        description: '选择后由服务端进行合法性与结算校验。',
        candidateIds
      });
      return;
    }

    onAction({
      type: 'useActiveSkill'
    });
  };

  const handleTargetChoice = (targetPlayerId: string) => {
    if (!pendingTargetAction) {
      return;
    }

    if (pendingTargetAction.source === 'card' && pendingTargetAction.cardId) {
      onAction({
        type: 'useCard',
        cardId: pendingTargetAction.cardId,
        targetPlayerId
      });
    } else {
      onAction({
        type: 'useActiveSkill',
        targetPlayerId
      });
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
            <p className={styles.sectionKicker}>联机座位</p>
            <h3 className={styles.noticeTitle}>
              {myPlayer.name} · {getTeamLabel(myPlayer.team)}
            </h3>
            <p className={styles.noticeText}>
              当前视角为 {myPlayer.name}（{myPlayer.isBot ? 'AI' : '人类'}）· {getSectLabel(myPlayer.sect)}。
              {actualHumanPlayerId
                ? isHumanTurn
                  ? isViewingHumanSeat
                    ? '现在轮到你操作。'
                    : '当前是你的回合，但你正在观察其他座位。切回自己的座位后才能操作。'
                  : `${currentPlayer.name} 正在行动。`
                : '你当前是观战状态。'}
            </p>
            <p className={styles.noticeText}>所有动作都只会发给服务端，页面不会本地乐观结算。</p>
          </div>

          <DicePanel
            stage={G.turnStage}
            lastRoll={currentPlayer.lastRoll}
            pendingRoll={G.pendingRoll}
            disabled={areActionButtonsDisabled}
            onRoll={() => onAction({ type: 'rollDice' })}
          />

          <div className={styles.quickActions}>
            <button
              className={clsx(styles.quickButton, G.turnStage === TurnStage.CARD && styles.quickButtonActive)}
              disabled={areActionButtonsDisabled || G.turnStage !== TurnStage.CARD}
              onClick={() => onAction({ type: 'finishCardStage' })}
              type="button"
            >
              结束出牌
            </button>
            <button
              className={clsx(styles.quickButton, G.turnStage === TurnStage.SKILL && styles.quickButtonActive)}
              disabled={areActionButtonsDisabled || G.turnStage !== TurnStage.SKILL}
              onClick={() => onAction({ type: 'finishSkillStage' })}
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
              <h2 className={styles.sectionTitle}>当前视角：{myPlayer.name}</h2>
            </div>
            <p className={styles.handHint}>前端只展示服务端快照。目标选择与结算结果以服务端响应为准。</p>
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
          onBuy={(cardId) =>
            onAction({
              type: 'buyCard',
              cardId
            })
          }
          onClose={() => onAction({ type: 'finishShop' })}
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
                      onClick={() =>
                        onAction({
                          type: 'discardOverflowCard',
                          cardId: card.id
                        })
                      }
                      type="button"
                    >
                      弃置这张牌
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.lockNotice}>
                <p className={styles.choiceText}>当前不是你的强制弃牌流程，请等待对应玩家或 AI 在服务端完成处理。</p>
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
            <p className={styles.choiceText}>请选择 3 到 6 之间的步数，确认后由服务端结算。</p>

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
