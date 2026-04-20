import type { PlayerID } from 'boardgame.io';

import { PlayerStatus, Sect, type GameState } from '../types';
import { appendLog, consumeCardById, getTeammateId, hasCardInHand, takeRandomCard } from './helpers';

export interface AttackAttemptResult {
  attempted: boolean;
  blocked: boolean;
  succeeded: boolean;
  reason?: 'wuxiang_jinshen' | 'sancai_xiaozai' | 'qingxi_rescue';
}

function resolveProtectiveCard(G: GameState, targetId: PlayerID): AttackAttemptResult | null {
  const target = G.players[targetId];

  if (hasCardInHand(target, 'wuxiang_jinshen')) {
    consumeCardById(target, 'wuxiang_jinshen');
    appendLog(G, `${target.name} 持有【无相金身】，本次奇袭无效，该牌已失去。`);
    return {
      attempted: true,
      blocked: true,
      succeeded: false,
      reason: 'wuxiang_jinshen'
    };
  }

  if (hasCardInHand(target, 'sancai_xiaozai') && target.gold >= 20) {
    consumeCardById(target, 'sancai_xiaozai');
    target.gold -= 20;
    appendLog(G, `${target.name} 触发【散财消灾】，额外失去 20 棋珍并抵消了本次奇袭。`);
    return {
      attempted: true,
      blocked: true,
      succeeded: false,
      reason: 'sancai_xiaozai'
    };
  }

  return null;
}

export function attemptOddAttack(G: GameState, attackerId: PlayerID, targetId: PlayerID): AttackAttemptResult {
  const attacker = G.players[attackerId];
  const target = G.players[targetId];

  if (!target) {
    return {
      attempted: false,
      blocked: false,
      succeeded: false
    };
  }

  const protectiveResult = resolveProtectiveCard(G, targetId);
  if (protectiveResult) {
    return protectiveResult;
  }

  const teammateId = getTeammateId(G, targetId);
  if (teammateId) {
    const teammate = G.players[teammateId];
    if (teammate.sect === Sect.QINGXI) {
      if (teammate.gold >= 10) {
        teammate.gold -= 10;
        appendLog(G, `${teammate.name} 触发「一命一价」，支付 10 棋珍救下了 ${target.name}。`);
        return {
          attempted: true,
          blocked: true,
          succeeded: false,
          reason: 'qingxi_rescue'
        };
      }

      const discarded = takeRandomCard(teammate);
      if (discarded) {
        appendLog(G, `${teammate.name} 弃掉 ${discarded.name}，替 ${target.name} 挡下奇袭。`);
        return {
          attempted: true,
          blocked: true,
          succeeded: false,
          reason: 'qingxi_rescue'
        };
      }
    }
  }

  target.status = PlayerStatus.SKIP_TURN;
  target.debuffs.skip_turn = {
    remainingTurns: 1,
    value: { attackerId }
  };
  appendLog(G, `${attacker.name} 对 ${target.name} 发起奇袭，目标将跳过下一回合。`);

  if (hasCardInHand(attacker, 'sata_liuxing')) {
    G.pendingMovement = (G.pendingMovement ?? 0) + 8;
    appendLog(G, `${attacker.name} 的【飒沓流星】触发，待额外前进 8 格。`);
  }

  if (hasCardInHand(attacker, 'haibu_wenshu')) {
    attacker.gold += 60;
    appendLog(G, `${attacker.name} 的【海捕文书】触发，获得 60 棋珍。`);
  }

  return {
    attempted: true,
    blocked: false,
    succeeded: true
  };
}
