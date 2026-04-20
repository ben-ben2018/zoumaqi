import type { Ctx, PlayerID } from 'boardgame.io';

import { type CardData, type CardUsageArgs, type GameState } from '../../types';
import { attemptOddAttack } from '../combat';
import {
  appendLog,
  cleanseDebuffs,
  getAbsoluteDistance,
  getAttackRangeBonus,
  grantCardsToPlayer,
  getTeammateId,
  hasAllCardsInHand,
  hasAnyCardInHand,
  normalizeLingyunSteps,
  setTimedEffect,
  takeRandomCard
} from '../helpers';
import { findCardDefinitionById } from './cardData';

const noopEffect = (G: GameState, _ctx: Ctx, casterId: PlayerID): void => {
  appendLog(G, `${G.players[casterId].name} 持有被动卡，无需主动打出。`);
};

function addOrExtendTimedEffect(
  container: GameState['players'][PlayerID]['buffs'],
  key: string,
  addedTurns: number,
  value: unknown
): void {
  const current = container[key];
  if (current) {
    current.remainingTurns += addedTurns;
    current.value = value;
    return;
  }

  setTimedEffect(container, key, addedTurns, value);
}

function resolveAllyTargetId(G: GameState, casterId: PlayerID, targetPlayerId?: PlayerID): PlayerID {
  if (targetPlayerId && G.players[targetPlayerId]?.team === G.players[casterId].team) {
    return targetPlayerId;
  }

  return casterId;
}

function resolveTeammateTargetId(G: GameState, casterId: PlayerID, targetPlayerId?: PlayerID): PlayerID | null {
  if (targetPlayerId && G.players[targetPlayerId]?.team === G.players[casterId].team && targetPlayerId !== casterId) {
    return targetPlayerId;
  }

  return getTeammateId(G, casterId);
}

export const CardEffects = {
  lingyun_ta: (G: GameState, _ctx: Ctx, casterId: PlayerID, _targetPlayerId?: PlayerID, usageArgs?: CardUsageArgs) => {
    const caster = G.players[casterId];
    let steps = normalizeLingyunSteps(usageArgs);
    const hasSwiftSet = hasAllCardsInHand(caster, ['ji_zhuiyue', 'ji_zhuying', 'ji_feiyan']);
    const hasAnySwiftCard = hasAnyCardInHand(caster, ['ji_zhuiyue', 'ji_zhuying', 'ji_feiyan']);
    const getsExtraStep = hasSwiftSet ? true : hasAnySwiftCard ? Math.random() < 0.5 : false;
    if (getsExtraStep) {
      steps += 1;
    }
    G.pendingMovement = (G.pendingMovement ?? 0) + steps;
    appendLog(
      G,
      `${caster.name} 使用【凌云踏】，待执行位移 ${steps} 格${getsExtraStep ? '（疾·套装触发 +1）' : ''}。`
    );
  },
  yinyang_mizongbu: (G: GameState, _ctx: Ctx, casterId: PlayerID, targetPlayerId?: PlayerID) => {
    const targetId = resolveAllyTargetId(G, casterId, targetPlayerId);
    addOrExtendTimedEffect(G.players[targetId].buffs, 'yinyang', 2, 5);
    appendLog(G, `${G.players[casterId].name} 为 ${G.players[targetId].name} 附加了【阴阳迷踪步】。`);
  },
  jinyu_shou: (G: GameState, _ctx: Ctx, casterId: PlayerID, targetPlayerId?: PlayerID) => {
    if (!targetPlayerId) {
      return;
    }

    addOrExtendTimedEffect(G.players[targetPlayerId].debuffs, 'jinyu_shou', 2, -3);
    appendLog(G, `${G.players[casterId].name} 对 ${G.players[targetPlayerId].name} 施加了【金玉手】。`);
  },
  wuxiang_jinshen: noopEffect,
  sancai_xiaozai: noopEffect,
  shexing_nayue: (G: GameState, _ctx: Ctx, casterId: PlayerID, targetPlayerId?: PlayerID) => {
    if (!targetPlayerId) {
      return;
    }

    const stolen = takeRandomCard(G.players[targetPlayerId]);
    if (stolen) {
      grantCardsToPlayer(G, casterId, [stolen], '摄星拿月');
      appendLog(G, `${G.players[casterId].name} 用【摄星拿月】随机夺走了 ${G.players[targetPlayerId].name} 的 ${stolen.name}。`);
      return;
    }

    appendLog(G, `${G.players[targetPlayerId].name} 没有手牌，【摄星拿月】落空。`);
  },
  daodao_budaodao: (G: GameState, _ctx: Ctx, casterId: PlayerID, targetPlayerId?: PlayerID) => {
    if (!targetPlayerId) {
      return;
    }

    const lost = takeRandomCard(G.players[targetPlayerId]);
    if (lost) {
      appendLog(G, `${G.players[casterId].name} 让 ${G.players[targetPlayerId].name} 丢失了 ${lost.name}。`);
    }
  },
  lingxu_yizhi: (G: GameState, _ctx: Ctx, casterId: PlayerID, targetPlayerId?: PlayerID) => {
    if (!targetPlayerId) {
      return;
    }

    const caster = G.players[casterId];
    const range = 2 + getAttackRangeBonus(caster);
    if (getAbsoluteDistance(G, casterId, targetPlayerId) > range) {
      appendLog(G, `${caster.name} 与目标距离超过 ${range}，无法通过【凌虚一指】发起奇袭。`);
      return;
    }

    attemptOddAttack(G, casterId, targetPlayerId);
  },
  yizhi_qianjin: (G: GameState, _ctx: Ctx, casterId: PlayerID) => {
    const caster = G.players[casterId];
    const steps = Math.min(Math.floor(caster.gold / 5), 20);
    caster.gold = 0;
    G.pendingMovement = (G.pendingMovement ?? 0) + steps;
    appendLog(G, `${caster.name} 使用【一掷千金】，将获得 ${steps} 格位移。`);
  },
  shengcai_youdao: (G: GameState, _ctx: Ctx, casterId: PlayerID) => {
    setTimedEffect(G.players[casterId].buffs, 'shengcai', 2, true);
    appendLog(G, `${G.players[casterId].name} 获得【生财有道】收益强化。`);
  },
  ji_zhuiyue: noopEffect,
  ji_zhuying: noopEffect,
  ji_feiyan: noopEffect,
  qingfeng_jiyue: (G: GameState, _ctx: Ctx, casterId: PlayerID, targetPlayerId?: PlayerID) => {
    const targetId = resolveAllyTargetId(G, casterId, targetPlayerId);
    cleanseDebuffs(G.players[targetId]);
    appendLog(G, `${G.players[casterId].name} 用【清风霁月】清除了 ${G.players[targetId].name} 的全部 Debuff。`);
  },
  jubaopen: noopEffect,
  sata_liuxing: noopEffect,
  qianlimu: noopEffect,
  jixiang_haozao: noopEffect,
  jixiang_haoyun: noopEffect,
  miaoshou_huichun: (G: GameState, _ctx: Ctx, casterId: PlayerID, targetPlayerId?: PlayerID) => {
    const targetId = resolveAllyTargetId(G, casterId, targetPlayerId);
    const target = G.players[targetId];
    const hadDebuff = Object.keys(target.debuffs).length > 0 || target.status !== 0;
    cleanseDebuffs(target);
    const bonus = hadDebuff ? 4 : 6;
    setTimedEffect(target.buffs, 'miaoshou_recovery', 2, { bonuses: [bonus, bonus] });
    appendLog(
      G,
      `${G.players[casterId].name} 对 ${target.name} 使用【妙手回春】，${hadDebuff ? '清除了 Debuff 并使下两次投掷 +4。' : '目标无 Debuff，下两次投掷改为 +6。'}`
    );
  },
  liangshang_junzi: (G: GameState, _ctx: Ctx, casterId: PlayerID, targetPlayerId?: PlayerID) => {
    if (!targetPlayerId) {
      return;
    }

    const target = G.players[targetPlayerId];
    const tribute = Math.min(target.gold, 20);
    target.gold -= tribute;
    G.players[casterId].gold += tribute;
    appendLog(G, `${G.players[casterId].name} 用【梁上君子】从 ${target.name} 处夺得 ${tribute} 棋珍。`);
  },
  haibu_wenshu: noopEffect,
  pofu_chenzhou: (G: GameState, _ctx: Ctx, casterId: PlayerID) => {
    const caster = G.players[casterId];
    if (caster.gold < 20) {
      appendLog(G, `${caster.name} 的棋珍不足 20，无法发动【破釜沉舟】。`);
      return;
    }

    caster.gold -= 20;
    grantCardsToPlayer(
      G,
      casterId,
      [findCardDefinitionById('lingxu_yizhi')!, findCardDefinitionById('lingxu_yizhi')!],
      '破釜沉舟'
    );
    appendLog(G, `${caster.name} 使用【破釜沉舟】，失去 20 棋珍并获得 2 张【凌虚一指】。`);
  },
  youqian_renxing: (G: GameState, _ctx: Ctx, casterId: PlayerID, targetPlayerId?: PlayerID) => {
    const teammateId = resolveTeammateTargetId(G, casterId, targetPlayerId);
    if (!teammateId) {
      appendLog(G, `${G.players[casterId].name} 使用【有钱任性】失败，未找到有效队友目标。`);
      return;
    }

    const caster = G.players[casterId];
    const teammate = G.players[teammateId];
    teammate.gold += caster.gold;
    appendLog(G, `${caster.name} 用【有钱任性】把 ${caster.gold} 棋珍全部交给了 ${teammate.name}。`);
    caster.gold = 0;
  },
  paiyou_jienan: (G: GameState, _ctx: Ctx, casterId: PlayerID, targetPlayerId?: PlayerID) => {
    const teammateId = resolveTeammateTargetId(G, casterId, targetPlayerId);
    if (!teammateId) {
      appendLog(G, `${G.players[casterId].name} 使用【排忧解难】失败，未找到有效队友目标。`);
      return;
    }

    const randomCard = takeRandomCard(G.players[casterId]);
    if (!randomCard) {
      appendLog(G, `${G.players[casterId].name} 没有额外手牌，【排忧解难】落空。`);
      return;
    }

    grantCardsToPlayer(G, teammateId, [randomCard], '排忧解难');
    appendLog(G, `${G.players[casterId].name} 用【排忧解难】把 ${randomCard.name} 送给了 ${G.players[teammateId].name}。`);
  }
} as const;

export function executeCardEffect(
  card: CardData,
  casterId: PlayerID,
  targetPlayerId: PlayerID | undefined,
  G: GameState,
  ctx: Ctx,
  usageArgs?: CardUsageArgs
): void {
  const definition = findCardDefinitionById(card.id);
  definition?.effect(G, ctx, casterId, targetPlayerId, usageArgs);
}

export const NoopCardEffect = noopEffect;
