import type { PlayerID } from 'boardgame.io';

import { Sect, type GameState } from '../../types';
import { attemptOddAttack } from '../combat';
import {
  appendLog,
  grantCardsToPlayer,
  getAbsoluteDistance,
  getEnemyIds,
  getNearestEnemyDistance,
  getAttackRangeBonus,
  getTeammateId,
  hasAllCardsInHand,
  hasAnyCardInHand,
  isInLead,
  setTimedEffect,
  takeRandomCard
} from '../helpers';
import {
  drawRandomCards,
  LINGYUN_TA_CARD,
  LINGXU_YIZHI_CARD,
  MIAOSHOU_HUICHI_CARD
} from '../cards/cardData';

export const ACTIVE_SKILL_COOLDOWNS: Record<Sect, number> = {
  [Sect.QINGXI]: 2,
  [Sect.LIYUAN]: 1,
  [Sect.TIANQUAN]: 1,
  [Sect.GUYUN]: 3,
  [Sect.SANGENGTIAN]: 1,
  [Sect.KUANGLAN]: 1,
  [Sect.ZUIHUAYIN]: 2,
  [Sect.MOSHANDAO]: 2,
  [Sect.JIULIUMEN]: 1
};

const JIULIUMEN_SELF_POOL = [4, 4, 5, 5, 6, 6];
const JIULIUMEN_ENEMY_POOL = [0, 1, 1, 2, 2, 3];
const SWIFT_SET_IDS = ['ji_zhuiyue', 'ji_zhuying', 'ji_feiyan'] as const;

type ControlledRollState = {
  pool: number[];
};

function drawFromPool(pool: number[]): number {
  const index = Math.floor(Math.random() * pool.length);
  return pool[index] ?? pool[0] ?? 0;
}

export function getActiveSkillCooldownTurns(sect: Sect): number {
  return ACTIVE_SKILL_COOLDOWNS[sect];
}

export function applyStartTurnCardPassives(G: GameState, playerId: PlayerID): void {
  const player = G.players[playerId];
  const openingGold = player.gold;

  if (player.handCards.some((card) => card.id === 'jubaopen')) {
    if (openingGold >= 50) {
      player.gold += 20;
      appendLog(G, `${player.name} 的【聚宝盆】在回合开始时带来 20 棋珍。`);
    }

    if (openingGold >= 100) {
      setTimedEffect(player.buffs, 'jubaopen_roll', 1, 5);
      appendLog(G, `${player.name} 的【聚宝盆】使本回合投掷点数额外 +5。`);
    }
  }

  if (hasAllCardsInHand(player, [...SWIFT_SET_IDS]) && Math.random() < 0.5) {
    const accepted = grantCardsToPlayer(G, playerId, [LINGYUN_TA_CARD], '回合开始被动');
    if (accepted.length > 0) {
      appendLog(G, `${player.name} 集齐疾·套装，本回合额外获得了【凌云踏】。`);
    }
  }
}

export function consumeControlledBaseRoll(
  G: GameState,
  playerId: PlayerID,
  defaultRoll: number
): { roll: number; note?: string } {
  const player = G.players[playerId];
  const selfRigged = player.buffs.rat_fate_self?.value as ControlledRollState | undefined;
  if (selfRigged?.pool?.length) {
    delete player.buffs.rat_fate_self;
    const roll = drawFromPool(selfRigged.pool);
    return {
      roll,
      note: `偷天换日自利生效，基础骰面改为 ${roll}`
    };
  }

  const enemyRigged = player.debuffs.rat_fate?.value as ControlledRollState | undefined;
  if (enemyRigged?.pool?.length) {
    delete player.debuffs.rat_fate;
    const roll = drawFromPool(enemyRigged.pool);
    return {
      roll,
      note: `偷天换日压制生效，基础骰面改为 ${roll}`
    };
  }

  return {
    roll: defaultRoll
  };
}

export function applyPassiveRollModifiers(
  G: GameState,
  playerId: PlayerID,
  originalRoll: number
): number {
  const player = G.players[playerId];
  let roll = originalRoll;
  const notes: string[] = [];

  if (player.sect === Sect.GUYUN) {
    const distance = getNearestEnemyDistance(G, playerId);
    if (distance >= 4 && distance <= 6) {
      roll += 3;
      notes.push('算无遗策 +3');
    } else if (distance >= 7 && distance <= 9) {
      roll += 5;
      notes.push('算无遗策 +5');
    } else if (distance > 10) {
      roll += 7;
      notes.push('算无遗策 +7');
    }
  }

  if (player.sect === Sect.LIYUAN && !isInLead(G, playerId)) {
    roll += 5;
    notes.push('名伶登台 +5');
  }

  if (player.sect === Sect.ZUIHUAYIN) {
    const sameSectCount = Object.values(G.players).filter((candidate) => candidate.sect === Sect.ZUIHUAYIN).length;
    if (sameSectCount > 0) {
      roll += sameSectCount * 2;
      notes.push(`百花齐放 +${sameSectCount * 2}`);
    }
  }

  const teammateId = getTeammateId(G, playerId);
  if (teammateId) {
    const teammate = G.players[teammateId];
    if (teammate.sect === Sect.KUANGLAN && teammate.position - player.position > 4) {
      roll += 3;
      notes.push('与子同袍 +3');
    }
  }

  const yinyang = player.buffs.yinyang;
  if (yinyang) {
    roll += Number(yinyang.value);
    notes.push(`阴阳迷踪步 +${String(yinyang.value)}`);
  }

  const charge = player.buffs.kuanglan_charge;
  if (charge) {
    const bonus = Math.floor(Math.random() * 9) - 2;
    roll += bonus;
    notes.push(`千里奔袭 ${bonus >= 0 ? '+' : ''}${bonus}`);
  }

  const miaoshou = player.buffs.miaoshou_recovery;
  if (miaoshou) {
    const state = miaoshou.value as { bonuses: number[] };
    const bonus = state.bonuses.shift() ?? 0;
    roll += bonus;
    notes.push(`妙手回春 +${bonus}`);
    if (state.bonuses.length === 0) {
      delete player.buffs.miaoshou_recovery;
    }
  }

  const jubaopenRoll = player.buffs.jubaopen_roll;
  if (jubaopenRoll) {
    const bonus = Number(jubaopenRoll.value);
    roll += bonus;
    notes.push(`聚宝盆 +${bonus}`);
    delete player.buffs.jubaopen_roll;
  }

  const mysteryRollBonus = player.buffs.mystery_roll_bonus;
  if (mysteryRollBonus) {
    const modifiers = (mysteryRollBonus.value as { modifiers?: number[] }).modifiers ?? [];
    const bonus = modifiers.reduce((sum, value) => sum + value, 0);
    roll += bonus;
    notes.push(`奇遇增益 +${bonus}`);
    delete player.buffs.mystery_roll_bonus;
  }

  for (const debuffKey of ['zuihua_poison', 'guyun_rebound', 'jinyu_shou', 'boss_roll_penalty']) {
    const debuff = player.debuffs[debuffKey];
    if (!debuff) {
      continue;
    }

    const value = debuff.value as number | { value?: number; modifiers?: number[] };
    const delta =
      typeof value === 'number'
        ? value
        : Array.isArray(value.modifiers)
          ? value.modifiers.reduce((sum, modifier) => sum + modifier, 0)
          : Number(value.value ?? 0);
    roll += delta;
    notes.push(`${debuffKey} ${delta >= 0 ? '+' : ''}${delta}`);
    if (debuffKey === 'boss_roll_penalty') {
      delete player.debuffs[debuffKey];
    }
  }

  const hasGoodOmen = player.handCards.some((card) => card.id === 'jixiang_haozao');
  const hasGoodLuck = player.handCards.some((card) => card.id === 'jixiang_haoyun');
  if (hasGoodOmen && hasGoodLuck) {
    const bonus = roll <= 5 ? 4 : 6;
    const extraCards = roll <= 5 ? 1 : 2;
    roll += bonus;
    const accepted = grantCardsToPlayer(G, playerId, drawRandomCards(extraCards, 'reward'), '吉骰双持');
    notes.push(`吉骰双持 +${bonus}`);
    if (accepted.length > 0) {
      notes.push(`额外得牌 ${accepted.length}`);
    }
  } else if (hasGoodOmen && Math.random() < 0.3 && roll >= 3) {
    roll += 2;
    notes.push('吉·好兆骰 +2');
  } else if (hasGoodLuck && Math.random() < 0.3 && roll >= 5) {
    const accepted = grantCardsToPlayer(G, playerId, drawRandomCards(1, 'reward'), '吉·好运骰');
    if (accepted.length > 0) {
      notes.push('吉·好运骰 得牌 1');
    }
  }

  const finalRoll = Math.max(0, roll);
  if (notes.length > 0) {
    appendLog(G, `${player.name} 的骰运修正：${notes.join('，')}。最终点数 ${finalRoll}。`);
  }

  return finalRoll;
}

export function useActiveSectSkill(
  G: GameState,
  playerId: PlayerID,
  targetPlayerId?: PlayerID
): boolean {
  const player = G.players[playerId];

  switch (player.sect) {
    case Sect.QINGXI: {
      grantCardsToPlayer(G, playerId, [MIAOSHOU_HUICHI_CARD], '清溪主动技能');
      appendLog(G, `${player.name} 发动【坐看云起】，获得【妙手回春】。`);
      return true;
    }
    case Sect.LIYUAN: {
      if (!targetPlayerId) {
        return false;
      }

      const target = G.players[targetPlayerId];
      const stolen = takeRandomCard(target);
      if (stolen) {
        grantCardsToPlayer(G, playerId, [stolen], '梨园主动技能');
        appendLog(G, `${player.name} 发动【请君打榜】，偷到了 ${target.name} 的 ${stolen.name}。`);
      } else {
        const tribute = Math.min(target.gold, 15);
        target.gold -= tribute;
        player.gold += tribute;
        appendLog(G, `${player.name} 发动【请君打榜】，改为夺取 ${tribute} 棋珍。`);
      }
      return true;
    }
    case Sect.TIANQUAN: {
      if (player.gold < 15) {
        appendLog(G, `${player.name} 的棋珍不足 15，无法发动【千金取义】。`);
        return false;
      }

      player.gold -= 15;
      grantCardsToPlayer(G, playerId, drawRandomCards(2, 'reward'), '天泉主动技能');
      appendLog(G, `${player.name} 发动【千金取义】，支付 15 棋珍换得两张卡牌。`);
      return true;
    }
    case Sect.GUYUN: {
      grantCardsToPlayer(G, playerId, [LINGXU_YIZHI_CARD], '孤云主动技能');
      G.pendingMovement = (G.pendingMovement ?? 0) + 6;
      setTimedEffect(player.debuffs, 'guyun_rebound', 1, -3);
      appendLog(G, `${player.name} 发动【长驱直入】，获得【凌虚一指】并准备前进 6 格。`);
      return true;
    }
    case Sect.SANGENGTIAN: {
      if (!targetPlayerId) {
        return false;
      }

      const attackRange = 6 + getAttackRangeBonus(player);
      if (getAbsoluteDistance(G, playerId, targetPlayerId) > attackRange) {
        appendLog(G, `${player.name} 与目标距离超过 6，无法发动【天怒刀法】。`);
        return false;
      }

      const attackResult = attemptOddAttack(G, playerId, targetPlayerId);
      if (attackResult.succeeded) {
        grantCardsToPlayer(G, playerId, drawRandomCards(2, 'reward'), '三更天主动技能');
        G.pendingMovement = (G.pendingMovement ?? 0) + 6; // TODO: 与正式“击杀”判定联动。
        appendLog(G, `${player.name} 触发了【杀生夺业】占位效果，追加得牌并前进 6 格。`);
      }
      return true;
    }
    case Sect.KUANGLAN: {
      setTimedEffect(player.buffs, 'kuanglan_charge', 2, { min: -2, max: 6 });
      appendLog(G, `${player.name} 发动【千里奔袭】，接下来两次投掷会出现额外位移波动。`);
      return true;
    }
    case Sect.ZUIHUAYIN: {
      if (!targetPlayerId) {
        return false;
      }

      G.players[targetPlayerId].debuffs.zuihua_poison = {
        remainingTurns: 2,
        value: { value: -3, casterId: playerId }
      };
      appendLog(G, `${player.name} 对 ${G.players[targetPlayerId].name} 施加了【花醉三千】。`);
      return true;
    }
    case Sect.MOSHANDAO: {
      grantCardsToPlayer(G, playerId, drawRandomCards(1, 'reward'), '墨山道主动技能');
      const teammateId = getTeammateId(G, playerId);
      if (teammateId) {
        grantCardsToPlayer(G, teammateId, drawRandomCards(1, 'reward'), '墨山道主动技能');
      }
      appendLog(G, `${player.name} 发动【兼爱非攻】，与队友各获得一张随机卡牌。`);
      return true;
    }
    case Sect.JIULIUMEN: {
      const enemyCandidates = targetPlayerId ? [targetPlayerId] : getEnemyIds(G, playerId);
      const chosenEnemyId = enemyCandidates[Math.floor(Math.random() * enemyCandidates.length)];

      if (chosenEnemyId && Math.random() < 0.5) {
        G.players[chosenEnemyId].debuffs.rat_fate = {
          remainingTurns: 1,
          value: { pool: JIULIUMEN_ENEMY_POOL }
        };
        appendLog(
          G,
          `${player.name} 发动【偷天换日】，效果落在 ${G.players[chosenEnemyId].name} 身上，其下次基础骰面将从 0/1/1/2/2/3 中产生。`
        );
      } else {
        player.buffs.rat_fate_self = {
          remainingTurns: 2,
          value: { pool: JIULIUMEN_SELF_POOL }
        };
        appendLog(
          G,
          `${player.name} 发动【偷天换日】，效果回到自身，下次基础骰面将从 4/4/5/5/6/6 中产生。`
        );
      }
      return true;
    }
    default:
      return false;
  }
}
