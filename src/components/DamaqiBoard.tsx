import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import clsx from 'clsx';

import { Button } from './Button';
import styles from './DamaqiBoard.module.css';
import { DicePanel } from './DicePanel';
import { GlobalToast } from './GlobalToast';
import { HandCards } from './HandCards';
import { PhaserBoard } from './PhaserBoard';
import { ShopModal } from './ShopModal';
import { getHandLimit, getSectLabel, getTeamLabel } from '../game/helpers';
import type { GameActionRequest, MatchSnapshot } from '../multiplayer/protocol';
import { PlayerStatus, PlayerTeam, Sect, SkillTarget, TurnStage, type CardData, type PlayerData, type TimedEffectState } from '../types';

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

type ToastState = {
  id: number;
  message: string;
} | null;

const TEAMMATE_ONLY_CARD_IDS = new Set(['youqian_renxing', 'paiyou_jienan']);
const ENEMY_TARGET_SKILL_SECTS = new Set([Sect.LIYUAN, Sect.SANGENGTIAN, Sect.ZUIHUAYIN, Sect.JIULIUMEN]);
const BUFF_LABELS: Record<string, string> = {
  yinyang: '阴阳迷踪步',
  shengcai: '生财有道',
  miaoshou_recovery: '妙手回春',
  jubaopen_roll: '聚宝盆',
  mystery_roll_bonus: '奇遇增益',
  kuanglan_charge: '千里奔袭',
  rat_fate_self: '偷天换日'
};

const GAMEPLAY_TOAST_PATTERNS = [
  '触发奇遇',
  '踏入首领格',
  '附加了【',
  '施加了【',
  '获得【生财有道】收益强化',
  '使用【妙手回春】',
  '发动【千里奔袭】',
  '发动【偷天换日】',
  '目标将跳过下一回合',
  '聚宝盆】使本回合投掷点数额外 +5'
];

function shouldShowGameplayToast(message: string): boolean {
  return GAMEPLAY_TOAST_PATTERNS.some((pattern) => message.includes(pattern));
}

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

function formatBuffDetail(buffKey: string, effect: TimedEffectState): string | null {
  switch (buffKey) {
    case 'yinyang':
      return `掷骰+${Number(effect.value)}`;
    case 'shengcai':
      return '移动得额外棋珍';
    case 'miaoshou_recovery': {
      const bonuses = ((effect.value as { bonuses?: number[] }).bonuses ?? []).filter((value) => typeof value === 'number');
      if (bonuses.length === 0) {
        return '下次掷骰增强';
      }

      const uniqueBonuses = Array.from(new Set(bonuses));
      return uniqueBonuses.length === 1
        ? `剩${bonuses.length}次 +${uniqueBonuses[0]}`
        : `剩${bonuses.length}次 ${bonuses.map((bonus) => `+${bonus}`).join('/')}`;
    }
    case 'jubaopen_roll':
      return `本回合掷骰+${Number(effect.value)}`;
    case 'mystery_roll_bonus': {
      const modifiers = (effect.value as { modifiers?: number[] }).modifiers ?? [];
      const total = modifiers.reduce((sum, modifier) => sum + modifier, 0);
      return `掷骰${total >= 0 ? '+' : ''}${total}`;
    }
    case 'kuanglan_charge':
      return '掷骰随机-2~+6';
    case 'rat_fate_self':
      return '下次骰面改运';
    default:
      return null;
  }
}

function formatBuffSummary(buffKey: string, effect: TimedEffectState): string {
  const label = BUFF_LABELS[buffKey] ?? buffKey;
  const detail = formatBuffDetail(buffKey, effect);
  const duration = `${effect.remainingTurns}回合`;
  return detail ? `${label} · ${detail} · ${duration}` : `${label} · ${duration}`;
}

export function DamaqiBoard({ match, controllablePlayerID, viewPlayerID, onAction, onViewPlayerChange }: DamaqiBoardProps) {
  const { G, ctx } = match;
  const currentPlayer = G.players[ctx.currentPlayer];
  const actualHumanPlayerId = controllablePlayerID ?? null;
  const effectivePlayerId = viewPlayerID ?? actualHumanPlayerId ?? ctx.currentPlayer;
  const myPlayer = G.players[effectivePlayerId] ?? currentPlayer;
  const buffOwner = (actualHumanPlayerId && G.players[actualHumanPlayerId]) || myPlayer;
  const activeBuffs = Object.entries(buffOwner.buffs);
  const [pendingCardAction, setPendingCardAction] = useState<PendingCardAction>(null);
  const [pendingTargetAction, setPendingTargetAction] = useState<PendingTargetAction>(null);
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);
  const [gameplayToast, setGameplayToast] = useState<ToastState>(null);
  const toastIdRef = useRef(0);
  const lastToastMessageRef = useRef<string | null>(G.actionLog[0] ?? null);
  const previousTurnPlayerRef = useRef<{ playerId: string; position: number } | null>(null);
  const [waitingForShopArrivalKey, setWaitingForShopArrivalKey] = useState<string | null>(null);

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
  const shopArrivalKey = G.pendingShop ? `${ctx.currentPlayer}:${currentPlayer.position}` : null;
  const didCurrentPlayerPositionChange =
    previousTurnPlayerRef.current !== null &&
    previousTurnPlayerRef.current.playerId === ctx.currentPlayer &&
    previousTurnPlayerRef.current.position !== currentPlayer.position;
  const shouldShowShopModal =
    G.pendingShop && !didCurrentPlayerPositionChange && waitingForShopArrivalKey !== shopArrivalKey;

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

  useEffect(() => {
    const latestMessage = G.actionLog[0] ?? null;
    if (!latestMessage || latestMessage === lastToastMessageRef.current) {
      return;
    }

    lastToastMessageRef.current = latestMessage;
    if (!shouldShowGameplayToast(latestMessage)) {
      return;
    }

    toastIdRef.current += 1;
    setGameplayToast({
      id: toastIdRef.current,
      message: latestMessage
    });
  }, [G.actionLog]);

  useLayoutEffect(() => {
    if (!G.pendingShop || !shopArrivalKey) {
      setWaitingForShopArrivalKey(null);
      return;
    }

    if (didCurrentPlayerPositionChange) {
      setWaitingForShopArrivalKey(shopArrivalKey);
    }
  }, [G.pendingShop, didCurrentPlayerPositionChange, shopArrivalKey]);

  useEffect(() => {
    previousTurnPlayerRef.current = {
      playerId: ctx.currentPlayer,
      position: currentPlayer.position
    };
  }, [ctx.currentPlayer, currentPlayer.position]);

  const handleCurrentPlayerArrival = (playerId: string, position: number) => {
    const arrivalKey = `${playerId}:${position}`;
    setWaitingForShopArrivalKey((current) => (current === arrivalKey ? null : current));
  };

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
      <GlobalToast onDone={() => setGameplayToast(null)} toast={gameplayToast} />

      <section className={styles.boardSurface}>
        <PhaserBoard
          currentPlayerId={ctx.currentPlayer}
          onPlayerArrive={handleCurrentPlayerArrival}
          players={Object.values(G.players)}
          tiles={G.board.tiles}
        />
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
            </div>
            <div className={styles.buffSummary}>
              <p className={styles.sectionKicker}>当前 Buff</p>
              <div className={styles.buffList}>
                {activeBuffs.length > 0 ? (
                  activeBuffs.map(([buffKey, effect]) => (
                    <span key={buffKey} className={styles.buffChip}>
                      {formatBuffSummary(buffKey, effect)}
                    </span>
                  ))
                ) : (
                  <span className={styles.buffEmpty}>当前没有增益效果</span>
                )}
              </div>
            </div>
          </div>

          <HandCards
            cards={myPlayer.handCards}
            disabled={areActionButtonsDisabled || ![TurnStage.ROLL, TurnStage.CARD].includes(G.turnStage)}
            onUseCard={handleUseCard}
          />
        </section>

        <aside className={styles.actionBlock}>
          <DicePanel
            stage={G.turnStage}
            lastRoll={currentPlayer.lastRoll}
            pendingRoll={G.pendingRoll}
            disabled={areActionButtonsDisabled}
            onRoll={() => onAction({ type: 'rollDice' })}
          />

          <div className={styles.quickActions}>
            <Button
              className={clsx(
                styles.quickButton,
                [TurnStage.CARD, TurnStage.SKILL].includes(G.turnStage) && styles.quickButtonActive
              )}
              disabled={areActionButtonsDisabled || ![TurnStage.CARD, TurnStage.SKILL].includes(G.turnStage)}
              onClick={() => onAction({ type: G.turnStage === TurnStage.SKILL ? 'finishSkillStage' : 'finishCardStage' })}
              type="button"
              variant={[TurnStage.CARD, TurnStage.SKILL].includes(G.turnStage) ? 'active' : 'secondary'}
            >
              结束回合
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
      </div>

      {shouldShowShopModal && (
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
