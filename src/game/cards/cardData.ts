import { CardType, SkillTarget, type CardData, type CardDefinition } from '../../types';
import { cloneCard } from '../helpers';
import { CardEffects, NoopCardEffect } from './cardEffects';

export const LINGYUN_TA_CARD: CardDefinition = {
  id: 'lingyun_ta',
  name: '凌云踏',
  description: '打出时选择向前跳 3 至 6 格。',
  type: CardType.MOVEMENT,
  price: 18, // TODO: 使用正式价格表替换。
  targetType: SkillTarget.SELF,
  isPassive: false,
  effect: CardEffects.lingyun_ta
};

export const YINYANG_MIZONGBU_CARD: CardDefinition = {
  id: 'yinyang_mizongbu',
  name: '阴阳迷踪步',
  description: '使友方移动点数 +5，持续 2 回合，可叠加延长。',
  type: CardType.BUFF,
  price: 22, // TODO: 使用正式价格表替换。
  targetType: SkillTarget.ALLY,
  isPassive: false,
  effect: CardEffects.yinyang_mizongbu
};

export const JINYU_SHOU_CARD: CardDefinition = {
  id: 'jinyu_shou',
  name: '金玉手',
  description: '使敌方移动点数 -3，持续 2 回合。',
  type: CardType.DEBUFF,
  price: 18, // TODO: 使用正式价格表替换。
  targetType: SkillTarget.ENEMY,
  isPassive: false,
  effect: CardEffects.jinyu_shou
};

export const WUXIANG_JINSHEN_CARD: CardDefinition = {
  id: 'wuxiang_jinshen',
  name: '无相金身',
  description: '免疫一次奇袭。',
  type: CardType.BUFF,
  price: 20, // TODO: 使用正式价格表替换。
  targetType: SkillTarget.SELF,
  isPassive: true,
  effect: NoopCardEffect
};

export const SANCAI_XIAOZAI_CARD: CardDefinition = {
  id: 'sancai_xiaozai',
  name: '散财消灾',
  description: '消耗 20 棋珍免疫一次奇袭，不足 20 无法生效。',
  type: CardType.BUFF,
  price: 16, // TODO: 使用正式价格表替换。
  targetType: SkillTarget.SELF,
  isPassive: true,
  effect: NoopCardEffect
};

export const SHEXING_NAYUE_CARD: CardDefinition = {
  id: 'shexing_nayue',
  name: '摄星拿月',
  description: '偷取敌方一张随机手牌。',
  type: CardType.ATTACK,
  price: 24, // TODO: 使用正式价格表替换。
  targetType: SkillTarget.ENEMY,
  isPassive: false,
  effect: CardEffects.shexing_nayue
};

export const DAODAO_BUDAODAO_CARD: CardDefinition = {
  id: 'daodao_budaodao',
  name: '叨叨不叨叨',
  description: '使目标失去一张随机卡牌。',
  type: CardType.DEBUFF,
  price: 18, // TODO: 使用正式价格表替换。
  targetType: SkillTarget.ENEMY,
  isPassive: false,
  effect: CardEffects.daodao_budaodao
};

export const LINGXU_YIZHI_CARD: CardDefinition = {
  id: 'lingxu_yizhi',
  name: '凌虚一指',
  description: '两格以内发动奇袭，使敌方停止一回合行动。',
  type: CardType.ATTACK,
  price: 18, // TODO: 使用正式价格表替换。
  targetType: SkillTarget.ENEMY,
  isPassive: false,
  effect: CardEffects.lingxu_yizhi
};

export const YIZHI_QIANJIN_CARD: CardDefinition = {
  id: 'yizhi_qianjin',
  name: '一掷千金',
  description: '消耗全部棋珍，按棋珍数换取位移。',
  type: CardType.ECONOMY,
  price: 28, // TODO: 使用正式价格表替换。
  targetType: SkillTarget.SELF,
  isPassive: false,
  effect: CardEffects.yizhi_qianjin
};

export const SHENGCAI_YOUDAO_CARD: CardDefinition = {
  id: 'shengcai_youdao',
  name: '生财有道',
  description: '投掷后获得最终移动格数 x1 的棋珍，持续 2 回合。',
  type: CardType.ECONOMY,
  price: 20, // TODO: 使用正式价格表替换。
  targetType: SkillTarget.SELF,
  isPassive: false,
  effect: CardEffects.shengcai_youdao
};

export const JI_ZHUIYUE_CARD: CardDefinition = {
  id: 'ji_zhuiyue',
  name: '疾·追月',
  description: '凌云踏有 50% 概率距离 +1；与逐影、飞檐集齐后，每回合 50% 获得凌云踏且距离 +1 概率提升至 100%。',
  type: CardType.BUFF,
  price: 16, // TODO: 使用正式价格表替换。
  targetType: SkillTarget.SELF,
  isPassive: true,
  effect: NoopCardEffect
};

export const JI_ZHUYING_CARD: CardDefinition = {
  id: 'ji_zhuying',
  name: '疾·逐影',
  description: '凌云踏有 50% 概率距离 +1。',
  type: CardType.BUFF,
  price: 16, // TODO: 使用正式价格表替换。
  targetType: SkillTarget.SELF,
  isPassive: true,
  effect: NoopCardEffect
};

export const JI_FEIYAN_CARD: CardDefinition = {
  id: 'ji_feiyan',
  name: '疾·飞檐',
  description: '凌云踏有 50% 概率距离 +1。',
  type: CardType.BUFF,
  price: 16, // TODO: 使用正式价格表替换。
  targetType: SkillTarget.SELF,
  isPassive: true,
  effect: NoopCardEffect
};

export const QINGFENG_JIYUE_CARD: CardDefinition = {
  id: 'qingfeng_jiyue',
  name: '清风霁月',
  description: '移除友方所有 Debuff。',
  type: CardType.BUFF,
  price: 18, // TODO: 使用正式价格表替换。
  targetType: SkillTarget.ALLY,
  isPassive: false,
  effect: CardEffects.qingfeng_jiyue
};

export const JUBAOPEN_CARD: CardDefinition = {
  id: 'jubaopen',
  name: '聚宝盆',
  description: '回合开始时：棋珍 >=50 获得 20 棋珍；棋珍 >=100 时本回合投掷点数 +5。',
  type: CardType.ECONOMY,
  price: 18, // TODO: 使用正式价格表替换。
  targetType: SkillTarget.SELF,
  isPassive: true,
  effect: NoopCardEffect
};

export const QIANLIMU_CARD: CardDefinition = {
  id: 'qianlimu',
  name: '千里目',
  description: '所有攻击技能和卡牌距离 +3。',
  type: CardType.BUFF,
  price: 14, // TODO: 使用正式价格表替换。
  targetType: SkillTarget.SELF,
  isPassive: true,
  effect: NoopCardEffect
};

export const SATA_LIUXING_CARD: CardDefinition = {
  id: 'sata_liuxing',
  name: '飒沓流星',
  description: '奇袭成功后向前移动 8 格。',
  type: CardType.BUFF,
  price: 20, // TODO: 使用正式价格表替换。
  targetType: SkillTarget.SELF,
  isPassive: true,
  effect: NoopCardEffect
};

export const JIXIANG_HAOZAO_CARD: CardDefinition = {
  id: 'jixiang_haozao',
  name: '吉·好兆骰',
  description: '单张 30% 概率生效，投掷点数 >=3 则 +2；与好运骰凑齐后 100% 触发完整套装效果。',
  type: CardType.BUFF,
  price: 15, // TODO: 使用正式价格表替换。
  targetType: SkillTarget.SELF,
  isPassive: true,
  effect: NoopCardEffect
};

export const JIXIANG_HAOYUN_CARD: CardDefinition = {
  id: 'jixiang_haoyun',
  name: '吉·好运骰',
  description: '单张 30% 概率生效，投掷点数 >=5 则获得 1 张随机牌；与好兆骰凑齐后 100% 触发完整套装效果。',
  type: CardType.BUFF,
  price: 15, // TODO: 使用正式价格表替换。
  targetType: SkillTarget.SELF,
  isPassive: true,
  effect: NoopCardEffect
};

export const MIAOSHOU_HUICHI_CARD: CardDefinition = {
  id: 'miaoshou_huichun',
  name: '妙手回春',
  description: '清除目标 Debuff 并使其下两次投掷点数 +4；若无 Debuff，则改为 +6。',
  type: CardType.BUFF,
  price: 0,
  targetType: SkillTarget.ALLY,
  isPassive: false,
  effect: CardEffects.miaoshou_huichun
};

export const LIANGSHANG_JUNZI_CARD: CardDefinition = {
  id: 'liangshang_junzi',
  name: '梁上君子',
  description: '偷取敌方 20 棋珍。',
  type: CardType.ATTACK,
  price: 15,
  targetType: SkillTarget.ENEMY,
  isPassive: false,
  effect: CardEffects.liangshang_junzi
};

export const HAIBU_WENSHU_CARD: CardDefinition = {
  id: 'haibu_wenshu',
  name: '海捕文书',
  description: '成功奇袭后获得 60 棋珍。',
  type: CardType.BUFF,
  price: 20, // TODO: 使用正式价格表替换。
  targetType: SkillTarget.SELF,
  isPassive: true,
  effect: NoopCardEffect
};

export const POFU_CHENZHOU_CARD: CardDefinition = {
  id: 'pofu_chenzhou',
  name: '破釜沉舟',
  description: '立即失去 20 棋珍，获得 2 张凌虚一指；不足 20 无法使用。',
  type: CardType.ECONOMY,
  price: 20, // TODO: 使用正式价格表替换。
  targetType: SkillTarget.SELF,
  isPassive: false,
  effect: CardEffects.pofu_chenzhou
};

export const YOUQIAN_RENXING_CARD: CardDefinition = {
  id: 'youqian_renxing',
  name: '有钱任性',
  description: '将自身全部棋珍转移给队友。',
  type: CardType.ECONOMY,
  price: 18, // TODO: 使用正式价格表替换。
  targetType: SkillTarget.ALLY,
  isPassive: false,
  effect: CardEffects.youqian_renxing
};

export const PAIYOU_JIENAN_CARD: CardDefinition = {
  id: 'paiyou_jienan',
  name: '排忧解难',
  description: '将自身随机一张牌送给队友。',
  type: CardType.BUFF,
  price: 18, // TODO: 使用正式价格表替换。
  targetType: SkillTarget.ALLY,
  isPassive: false,
  effect: CardEffects.paiyou_jienan
};

export const CARD_LIBRARY: CardDefinition[] = [
  LINGYUN_TA_CARD,
  YINYANG_MIZONGBU_CARD,
  JINYU_SHOU_CARD,
  WUXIANG_JINSHEN_CARD,
  SANCAI_XIAOZAI_CARD,
  SHEXING_NAYUE_CARD,
  DAODAO_BUDAODAO_CARD,
  JI_ZHUIYUE_CARD,
  JI_ZHUYING_CARD,
  JI_FEIYAN_CARD,
  QINGFENG_JIYUE_CARD,
  LINGXU_YIZHI_CARD,
  YIZHI_QIANJIN_CARD,
  SHENGCAI_YOUDAO_CARD,
  JUBAOPEN_CARD,
  QIANLIMU_CARD,
  SATA_LIUXING_CARD,
  JIXIANG_HAOZAO_CARD,
  JIXIANG_HAOYUN_CARD,
  MIAOSHOU_HUICHI_CARD,
  LIANGSHANG_JUNZI_CARD,
  HAIBU_WENSHU_CARD,
  POFU_CHENZHOU_CARD,
  YOUQIAN_RENXING_CARD,
  PAIYOU_JIENAN_CARD
];

export const SHOP_CARD_POOL: CardDefinition[] = [
  LINGYUN_TA_CARD,
  YINYANG_MIZONGBU_CARD,
  JINYU_SHOU_CARD,
  WUXIANG_JINSHEN_CARD,
  SANCAI_XIAOZAI_CARD,
  SHEXING_NAYUE_CARD,
  DAODAO_BUDAODAO_CARD,
  JI_ZHUIYUE_CARD,
  JI_ZHUYING_CARD,
  JI_FEIYAN_CARD,
  QINGFENG_JIYUE_CARD,
  LINGXU_YIZHI_CARD,
  YIZHI_QIANJIN_CARD,
  SHENGCAI_YOUDAO_CARD,
  JUBAOPEN_CARD,
  QIANLIMU_CARD,
  SATA_LIUXING_CARD,
  JIXIANG_HAOZAO_CARD,
  JIXIANG_HAOYUN_CARD,
  LIANGSHANG_JUNZI_CARD,
  HAIBU_WENSHU_CARD,
  POFU_CHENZHOU_CARD,
  YOUQIAN_RENXING_CARD,
  PAIYOU_JIENAN_CARD
];

export const REWARD_CARD_POOL: CardDefinition[] = [
  LINGYUN_TA_CARD,
  YINYANG_MIZONGBU_CARD,
  JINYU_SHOU_CARD,
  WUXIANG_JINSHEN_CARD,
  SANCAI_XIAOZAI_CARD,
  SHEXING_NAYUE_CARD,
  DAODAO_BUDAODAO_CARD,
  JI_ZHUIYUE_CARD,
  JI_ZHUYING_CARD,
  JI_FEIYAN_CARD,
  QINGFENG_JIYUE_CARD,
  LINGXU_YIZHI_CARD,
  YIZHI_QIANJIN_CARD,
  SHENGCAI_YOUDAO_CARD,
  JUBAOPEN_CARD,
  QIANLIMU_CARD,
  SATA_LIUXING_CARD,
  JIXIANG_HAOZAO_CARD,
  JIXIANG_HAOYUN_CARD,
  LIANGSHANG_JUNZI_CARD,
  HAIBU_WENSHU_CARD,
  POFU_CHENZHOU_CARD,
  YOUQIAN_RENXING_CARD,
  PAIYOU_JIENAN_CARD
];

export function findCardDefinitionById(cardId: string): CardDefinition | undefined {
  return CARD_LIBRARY.find((card) => card.id === cardId);
}

export function findCardById(cardId: string): CardData | undefined {
  const definition = findCardDefinitionById(cardId);
  return definition ? cloneCard(definition) : undefined;
}

export function drawRandomCards(
  count: number,
  pool: 'shop' | 'reward' | 'full' = 'reward'
): CardData[] {
  const source =
    pool === 'shop' ? SHOP_CARD_POOL : pool === 'full' ? CARD_LIBRARY : REWARD_CARD_POOL;

  return Array.from({ length: count }, () => {
    const card = source[Math.floor(Math.random() * source.length)] ?? source[0];
    return cloneCard(card);
  });
}
