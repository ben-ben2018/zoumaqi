import { useEffect, useState } from 'react';
import clsx from 'clsx';

import { Button } from './Button';
import styles from './DamaqiBoard.module.css';
import { BoardCanvas } from './BoardCanvas';
import { DicePanel } from './DicePanel';
import { HandCards } from './HandCards';
import { ShopModal } from './ShopModal';
import { getHandLimit, getSectLabel, getTeamLabel } from '../game/helpers';
import type { GameActionRequest, MatchSnapshot } from '../multiplayer/protocol';
import { PlayerStatus, PlayerTeam, Sect, SkillTarget, TurnStage, type CardData, type PlayerData } from '../types';

type DamaqiBoardProps = {
  match: MatchSnapshot;
  controllablePlayerID?: string | null;
  viewPlayerID?: string | null;
  onAction: (action: GameActionRequest) => void;
  onViewPlayerChange?: (playerID: string) => void;
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

function formatPlayerStatus(player: PlayerData): string {
  if (player.status === PlayerStatus.SKIP_TURN) {
    return '跳过';
  }
  if (player.status === PlayerStatus.FROZEN) {
    return '冻结';
  }
  return '正常';
}

export function DamaqiBoard({ match, controllablePlayerID, viewPlayerID, onAction, onViewPlayerChange }: DamaqiBoardProps) {
  const { G, ctx } = match;
  const currentPlayer = G.players[ctx.currentPlayer];
  const actualHumanPlayerId = controllablePlayerID ?? null;
  const effectivePlayerId = viewPlayerID ?? actualHumanPlayerId ?? ctx.currentPlayer;
  const myPlayer = G.players[effectivePlayerId] ?? currentPlayer;
  const [pendingCardAction, setPendingCardAction] = useState<PendingCardAction>(null);
  const [pendingTargetAction, setPendingTargetAction] = useState<PendingTargetAction>(null);
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);

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
        <div className={styles.broadcastDock}>
          <Button
            className={styles.broadcastButton}
            onClick={() => setIsBroadcastOpen((current) => !current)}
            type="button"
            variant={isBroadcastOpen ? 'active' : 'secondary'}
          >
            棋局播报
          </Button>

          {isBroadcastOpen && (
            <div className={styles.logPanel}>
              <div className={styles.logPanelInner}>
                <div className={styles.logPanelHeader}>
                  <p className={styles.sectionKicker}>棋局播报</p>
                  <Button
                    className={styles.logCloseButton}
                    onClick={() => setIsBroadcastOpen(false)}
                    type="button"
                    variant="secondary"
                  >
                    收起
                  </Button>
                </div>
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
          )}
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
            <Button
              className={clsx(styles.quickButton, G.turnStage === TurnStage.CARD && styles.quickButtonActive)}
              disabled={areActionButtonsDisabled || G.turnStage !== TurnStage.CARD}
              onClick={() => onAction({ type: 'finishCardStage' })}
              type="button"
              variant={G.turnStage === TurnStage.CARD ? 'active' : 'secondary'}
            >
              结束出牌
            </Button>
            <Button
              className={clsx(styles.quickButton, G.turnStage === TurnStage.SKILL && styles.quickButtonActive)}
              disabled={areActionButtonsDisabled || G.turnStage !== TurnStage.SKILL}
              onClick={() => onAction({ type: 'finishSkillStage' })}
              type="button"
              variant={G.turnStage === TurnStage.SKILL ? 'active' : 'secondary'}
            >
              跳过技能
            </Button>
            <Button
              className={styles.skillButton}
              disabled={
                areActionButtonsDisabled ||
                ![TurnStage.ROLL, TurnStage.CARD, TurnStage.SKILL].includes(G.turnStage) ||
                myPlayer.activeSkillCooldown > 0
              }
              onClick={handleUseActiveSkill}
              type="button"
              variant="primary"
            >
              {myPlayer.activeSkillCooldown > 0
                ? `技能冷却 ${myPlayer.activeSkillCooldown}`
                : `发动${getSectLabel(myPlayer.sect)}主动`}
            </Button>
          </div>
        </aside>

        <div className={styles.playerDock}>
          <div className={styles.playerTableWrap}>
            <table className={styles.playerTable}>
              <thead>
                <tr>
                  <th>玩家</th>
                  <th>门派</th>
                  <th>位置</th>
                  <th>棋珍</th>
                  <th>手牌</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(G.players).map((player) => {
                  const buffCount = Object.keys(player.buffs).length;
                  const rowState = [
                    buffCount > 0 ? `Buff ${buffCount}` : null
                  ]
                    .filter(Boolean)
                    .join(' · ');

                  return (
                    <tr
                      key={player.id}
                      className={clsx(
                        styles.playerRow,
                        onViewPlayerChange && styles.playerRowClickable,
                        player.id === ctx.currentPlayer && styles.playerRowCurrent,
                        player.id === effectivePlayerId && styles.playerRowSelf
                      )}
                      onClick={() => onViewPlayerChange?.(player.id)}
                    >
                      <td>
                        <div className={styles.playerCellMain}>
                          <span className={styles.playerName}>
                            <span
                              className={clsx(
                                styles.playerSeatBadge,
                                player.team === PlayerTeam.RED ? styles.playerSeatBadgeRed : styles.playerSeatBadgeBlue
                              )}
                            >
                              {Number(player.id) + 1}
                            </span>
                            <span className={styles.playerNameText}>
                              {player.name} {player.isBot ? '(AI)' : ''}
                            </span>
                          </span>
                          <span className={styles.playerMeta}>
                            {rowState || ' '}
                          </span>
                        </div>
                      </td>
                      <td>{getSectLabel(player.sect)}</td>
                      <td>
                        {player.position + 1}/{G.board.totalTiles}
                      </td>
                      <td>{player.gold}</td>
                      <td>{player.handCards.length}</td>
                      <td>{formatPlayerStatus(player)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
                    <Button
                      className={styles.discardButton}
                      onClick={() =>
                        onAction({
                          type: 'discardOverflowCard',
                          cardId: card.id
                        })
                      }
                      type="button"
                      variant="primary"
                    >
                      弃置这张牌
                    </Button>
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
                <Button
                  key={step}
                  className={styles.stepButton}
                  onClick={() => handleLingyunChoice(step)}
                  type="button"
                  variant="active"
                >
                  {step} 步
                </Button>
              ))}
            </div>

            <Button className={styles.cancelButton} onClick={() => setPendingCardAction(null)} type="button" variant="secondary">
              取消
            </Button>
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
                    <Button
                      className={styles.discardButton}
                      onClick={() => handleTargetChoice(candidateId)}
                      type="button"
                      variant="primary"
                    >
                      选择该目标
                    </Button>
                  </article>
                );
              })}
            </div>

            <Button className={styles.cancelButton} onClick={() => setPendingTargetAction(null)} type="button" variant="secondary">
              取消
            </Button>
          </section>
        </div>
      )}
    </div>
  );
}
