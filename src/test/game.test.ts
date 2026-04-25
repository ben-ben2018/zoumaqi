import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from 'boardgame.io';
import { Client as BgioClient } from '../boardgameIoCompat';

import {
  chooseAiCardPlay,
  chooseAiDiscardCardId,
  chooseAiMoveSteps,
  chooseAiShopCardId,
  chooseAiSkillPlay
} from '../game/ai';
import {
  applyBossEvent,
  applyMysteryEvent,
  createBoardData,
  generateShopCards,
  SHOP_TILE_INDICES,
  MYSTERY_TILE_INDICES,
  BOSS_TILE_INDICES
} from '../game/board/boardData';
import {
  drawRandomCards,
  JIXIANG_HAOZAO_CARD,
  JIXIANG_HAOYUN_CARD,
  MIAOSHOU_HUICHI_CARD,
  SANCAI_XIAOZAI_CARD,
  WUXIANG_JINSHEN_CARD,
  findCardDefinitionById
} from '../game/cards/cardData';
import { CardEffects } from '../game/cards/cardEffects';
import { attemptOddAttack } from '../game/combat';
import { addCardsToHand, createPlayers, applyOpeningEconomy } from '../game/helpers';
import { DamaqiGame } from '../game/gameConfig';
import {
  ACTIVE_SKILL_COOLDOWNS,
  applyPassiveRollModifiers,
  consumeControlledBaseRoll,
  getActiveSkillCooldownTurns,
  useActiveSectSkill
} from '../game/skills/sectSkills';
import { PlayerStatus, Sect, TurnStage, type GameState } from '../types';

function createTestState(): GameState {
  const players = createPlayers({
    sects: [Sect.QINGXI, Sect.LIYUAN, Sect.TIANQUAN, Sect.GUYUN]
  });
  applyOpeningEconomy(players);

  return {
    players,
    board: createBoardData(),
    currentShop: [],
    pendingShop: false,
    pendingShopResumeStage: null,
    pendingDiscards: [],
    pendingTurnResolution: null,
    pendingRoll: null,
    pendingMovement: null,
    pendingMovementSource: null,
    turnStage: TurnStage.ROLL,
    actionLog: [],
    winnerTeam: null,
    turnMessage: ''
  };
}

function createCtx(currentPlayer = '0'): Ctx {
  return {
    currentPlayer
  } as unknown as Ctx;
}

function createEvents() {
  return {
    setActivePlayers: vi.fn(),
    endTurn: vi.fn(),
    endGame: vi.fn()
  };
}

function createMoveContext(state: GameState, currentPlayer = '0', playerID = currentPlayer) {
  const events = createEvents();

  return {
    events,
    context: {
      G: state,
      ctx: createCtx(currentPlayer),
      playerID,
      events
    } as never
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('boardData', () => {
  it('creates 100 tiles with correct special indices', () => {
    const board = createBoardData();

    expect(board.totalTiles).toBe(100);
    expect(SHOP_TILE_INDICES.every((index) => board.tiles[index]?.label === '商')).toBe(true);
    expect(MYSTERY_TILE_INDICES.every((index) => board.tiles[index]?.label === '奇')).toBe(true);
    expect(BOSS_TILE_INDICES.every((index) => board.tiles[index]?.label === '首')).toBe(true);
    expect(board.tiles[99]?.label).toBe('终');
  });

  it('uses the fixed first shop inventory from 商品卡牌.md', () => {
    const cards = generateShopCards(SHOP_TILE_INDICES[0]!);

    expect(cards.map((card) => card.id)).toEqual([
      'qingfeng_jiyue',
      'wuxiang_jinshen',
      'lingyun_ta',
      'yinyang_mizongbu',
      'lingxu_yizhi',
      'shengcai_youdao'
    ]);
  });

  it('uses the fixed second shop inventory from 商品卡牌.md', () => {
    const cards = generateShopCards(SHOP_TILE_INDICES[1]!);

    expect(cards.map((card) => card.id)).toEqual([
      'qingfeng_jiyue',
      'wuxiang_jinshen',
      'lingyun_ta',
      'yinyang_mizongbu',
      'lingxu_yizhi',
      'shengcai_youdao',
      'ji_zhuiyue'
    ]);
  });

  it('uses 10 distinct random cards for the third to fifth shops', () => {
    const cards = generateShopCards(SHOP_TILE_INDICES[2]!);

    expect(cards).toHaveLength(10);
    expect(new Set(cards.map((card) => card.id)).size).toBe(10);
  });

  it('uses 15 distinct random cards for the sixth to ninth shops', () => {
    const cards = generateShopCards(SHOP_TILE_INDICES[5]!);

    expect(cards).toHaveLength(15);
    expect(new Set(cards.map((card) => card.id)).size).toBe(15);
  });

  it('mystery tile can grant next-turn roll bonus', () => {
    const state = createTestState();
    vi.spyOn(Math, 'random').mockReturnValue(0);

    applyMysteryEvent(state, '0');

    expect(state.players['0'].buffs.mystery_roll_bonus?.value).toEqual({
      modifiers: [3]
    });
    expect(applyPassiveRollModifiers(state, '0', 2)).toBe(5);
    expect(state.players['0'].buffs.mystery_roll_bonus).toBeUndefined();
  });

  it('boss tile can apply next-turn roll penalty', () => {
    const state = createTestState();
    vi.spyOn(Math, 'random').mockReturnValue(0.3);

    applyBossEvent(state, '0');

    expect(state.players['0'].debuffs.boss_roll_penalty?.value).toEqual({
      modifiers: [-4]
    });
    expect(applyPassiveRollModifiers(state, '0', 6)).toBe(2);
    expect(state.players['0'].debuffs.boss_roll_penalty).toBeUndefined();
  });

  it('boss tile can remove a random hand card', () => {
    const state = createTestState();
    state.players['0'].handCards = drawRandomCards(2, 'reward');
    vi.spyOn(Math, 'random').mockReturnValue(0.6);

    applyBossEvent(state, '0');

    expect(state.players['0'].handCards).toHaveLength(1);
  });

  it('mystery tile can still grant a random card and trigger overflow discard', () => {
    const state = createTestState();
    addCardsToHand(state.players['0'], drawRandomCards(6, 'reward'));
    vi.spyOn(Math, 'random').mockReturnValue(0.6);

    applyMysteryEvent(state, '0');

    expect(state.players['0'].handCards).toHaveLength(7);
    expect(state.pendingDiscards[0]?.playerId).toBe('0');
    expect(state.pendingDiscards[0]?.reason).toBe('地图奇遇');
  });
});

describe('movement tile logic', () => {
  it('rolling dice immediately moves the player without needing a second action', () => {
    const state = createTestState();
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const roll = createMoveContext(state, '0', '0');
    const rollDice = DamaqiGame.moves?.rollDice as ((context: never) => void) | undefined;

    rollDice?.(roll.context);

    expect(state.players['0'].lastRoll).toBe(1);
    expect(state.players['0'].position).toBe(1);
    expect(state.players['0'].hasMovedThisTurn).toBe(true);
    expect(state.pendingRoll).toBeNull();
    expect(state.turnStage).toBe(TurnStage.CARD);
  });

  it('passing through a shop tile pauses movement and finishing shop continues the remaining steps', () => {
    const state = createTestState();
    state.turnStage = TurnStage.MOVE;
    state.players['0'].position = 3;
    state.pendingRoll = 4;
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const move = createMoveContext(state, '0', '0');
    const movePlayer = DamaqiGame.moves?.movePlayer as ((context: never, requestedSteps?: number) => void) | undefined;

    movePlayer?.(move.context);

    expect(state.players['0'].position).toBe(5);
    expect(state.pendingShop).toBe(true);
    expect(state.pendingMovement).toBe(2);
    expect(state.pendingMovementSource).toBe('掷骰');
    expect(state.pendingShopResumeStage).toBe(TurnStage.CARD);

    const finish = createMoveContext(state, '0', '0');
    const finishShop = DamaqiGame.moves?.finishShop as ((context: never) => void) | undefined;

    finishShop?.(finish.context);

    expect(state.players['0'].position).toBe(7);
    expect(state.pendingShop).toBe(false);
    expect(state.pendingMovement).toBeNull();
    expect(state.pendingMovementSource).toBeNull();
    expect(state.pendingShopResumeStage).toBeNull();
    expect(state.turnStage).toBe(TurnStage.CARD);
    expect(state.players['0'].buffs.mystery_roll_bonus?.value).toEqual({
      modifiers: [3]
    });
  });

  it('mystery tile does not trigger when only passed through without exact landing', () => {
    const state = createTestState();
    state.turnStage = TurnStage.MOVE;
    state.players['0'].position = 14;
    state.pendingRoll = 3;

    const move = createMoveContext(state, '0', '0');
    const movePlayer = DamaqiGame.moves?.movePlayer as ((context: never, requestedSteps?: number) => void) | undefined;

    movePlayer?.(move.context);

    expect(state.players['0'].position).toBe(17);
    expect(state.players['0'].gold).toBe(40);
    expect(state.players['0'].handCards).toHaveLength(0);
    expect(state.players['0'].buffs.mystery_roll_bonus).toBeUndefined();
  });

  it('boss tile does not trigger when only passed through without exact landing', () => {
    const state = createTestState();
    state.turnStage = TurnStage.MOVE;
    state.players['0'].position = 18;
    state.pendingRoll = 3;

    const move = createMoveContext(state, '0', '0');
    const movePlayer = DamaqiGame.moves?.movePlayer as ((context: never, requestedSteps?: number) => void) | undefined;

    movePlayer?.(move.context);

    expect(state.players['0'].position).toBe(21);
    expect(state.players['0'].gold).toBe(40);
    expect(state.players['0'].handCards).toHaveLength(0);
    expect(state.players['0'].debuffs.boss_roll_penalty).toBeUndefined();
  });
});

describe('opening economy', () => {
  it('applies Tianquan passive bonuses at setup', () => {
    const state = createTestState();

    expect(state.players['2'].gold).toBe(100);
    expect(state.players['0'].gold).toBe(40);
    expect(state.players['1'].gold).toBe(40);
    expect(state.players['3'].gold).toBe(40);
  });

  it('grants 20 gold to every player when a new round starts', () => {
    const client = BgioClient({
      game: DamaqiGame,
      numPlayers: 4
    });

    const state = client.getState();

    expect(state?.ctx).toMatchObject({
      currentPlayer: '0',
      turn: 1
    });
    expect(state?.G.players['0'].gold).toBe(55);
    expect(state?.G.players['1'].gold).toBe(55);
    expect(state?.G.players['2'].gold).toBe(115);
    expect(state?.G.players['3'].gold).toBe(55);
    expect(state?.G.players['0'].handCards).toHaveLength(1);
    expect(state?.G.players['1'].handCards).toHaveLength(1);
    expect(state?.G.players['2'].handCards).toHaveLength(1);
    expect(state?.G.players['3'].handCards).toHaveLength(1);
  });
});

describe('ai logic', () => {
  it('defaults 2P-4P to bot-controlled seats', () => {
    const players = createPlayers();

    expect(players['0'].isBot).toBe(false);
    expect(players['1'].isBot).toBe(true);
    expect(players['2'].isBot).toBe(true);
    expect(players['3'].isBot).toBe(true);
  });

  it('prioritizes wuxiang_jinshen in shop when an enemy odd-attack threat is nearby', () => {
    const state = createTestState();
    state.turnStage = TurnStage.SHOP;
    state.pendingShop = true;
    state.players['0'].gold = 60;
    state.players['1'].position = 2;
    state.currentShop = [findCardDefinitionById('wuxiang_jinshen')!, findCardDefinitionById('liangshang_junzi')!];
    addCardsToHand(state.players['1'], [findCardDefinitionById('lingxu_yizhi')!]);

    expect(chooseAiShopCardId(state, '0')).toBe('wuxiang_jinshen');
  });

  it('continues spending shop gold on fallback utility cards when no top-priority purchase exists', () => {
    const state = createTestState();
    state.turnStage = TurnStage.SHOP;
    state.pendingShop = true;
    state.players['0'].gold = 60;
    state.currentShop = [findCardDefinitionById('shengcai_youdao')!];

    expect(chooseAiShopCardId(state, '0')).toBe('shengcai_youdao');
  });

  it('uses positive movement buffs on the teammate for control archetypes', () => {
    const players = createPlayers({
      sects: [Sect.QINGXI, Sect.LIYUAN, Sect.TIANQUAN, Sect.GUYUN]
    });
    applyOpeningEconomy(players);
    const state: GameState = {
      players,
      board: createBoardData(),
      currentShop: [],
      pendingShop: false,
      pendingShopResumeStage: null,
      pendingDiscards: [],
      pendingTurnResolution: null,
      pendingRoll: null,
      pendingMovement: null,
      pendingMovementSource: null,
      turnStage: TurnStage.CARD,
      actionLog: [],
      winnerTeam: null,
      turnMessage: ''
    };
    addCardsToHand(state.players['0'], [findCardDefinitionById('yinyang_mizongbu')!]);

    expect(chooseAiCardPlay(state, '0')).toEqual({
      cardId: 'yinyang_mizongbu',
      targetPlayerId: '2'
    });
  });

  it('chooses a shorter rolled move when it enables lingxu odd-attack range', () => {
    const state = createTestState();
    state.players['1'].position = 2;
    addCardsToHand(state.players['0'], [findCardDefinitionById('lingxu_yizhi')!]);

    expect(chooseAiMoveSteps(state, '0', 6)).toBe(4);
  });

  it('uses Sangengtian active skill only when a target is inside the skill range', () => {
    const players = createPlayers({
      sects: [Sect.SANGENGTIAN, Sect.LIYUAN, Sect.TIANQUAN, Sect.GUYUN]
    });
    applyOpeningEconomy(players);
    const state: GameState = {
      players,
      board: createBoardData(),
      currentShop: [],
      pendingShop: false,
      pendingShopResumeStage: null,
      pendingDiscards: [],
      pendingTurnResolution: null,
      pendingRoll: null,
      pendingMovement: null,
      pendingMovementSource: null,
      turnStage: TurnStage.SKILL,
      actionLog: [],
      winnerTeam: null,
      turnMessage: ''
    };
    state.players['1'].position = 5;

    expect(chooseAiSkillPlay(state, '0')).toEqual({
      targetPlayerId: '1'
    });
  });

  it('uses Guyun active skill when skill plus Lingyun can set up an odd attack', () => {
    const players = createPlayers({
      sects: [Sect.GUYUN, Sect.LIYUAN, Sect.TIANQUAN, Sect.QINGXI]
    });
    applyOpeningEconomy(players);
    const state: GameState = {
      players,
      board: createBoardData(),
      currentShop: [],
      pendingShop: false,
      pendingShopResumeStage: null,
      pendingDiscards: [],
      pendingTurnResolution: null,
      pendingRoll: null,
      pendingMovement: null,
      pendingMovementSource: null,
      turnStage: TurnStage.ROLL,
      actionLog: [],
      winnerTeam: null,
      turnMessage: ''
    };
    state.players['0'].position = 0;
    state.players['1'].position = 11;
    addCardsToHand(state.players['0'], [findCardDefinitionById('lingyun_ta')!]);

    expect(chooseAiSkillPlay(state, '0')).toEqual({});
  });

  it('spends accumulated gold with yizhi_qianjin when it creates meaningful tempo', () => {
    const state = createTestState();
    state.turnStage = TurnStage.CARD;
    state.players['0'].gold = 60;
    state.players['0'].position = 4;
    state.players['1'].position = 18;
    addCardsToHand(state.players['0'], [findCardDefinitionById('yizhi_qianjin')!]);

    expect(chooseAiCardPlay(state, '0')).toEqual({
      cardId: 'yizhi_qianjin'
    });
  });

  it('drops lingxu_yizhi first when no enemy is close enough to threaten or attack', () => {
    const state = createTestState();
    state.players['0'].position = 20;
    state.players['1'].position = 0;
    state.players['3'].position = 0;
    addCardsToHand(state.players['0'], [findCardDefinitionById('lingxu_yizhi')!, findCardDefinitionById('jixiang_haozao')!]);

    expect(chooseAiDiscardCardId(state, '0')).toBe('lingxu_yizhi');
  });

  it('automatically resolves bot turns until control returns to the human seat', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const client = BgioClient({
      game: DamaqiGame,
      numPlayers: 4
    });

    client.events.endTurn?.();

    const state = client.getState();
    expect(state?.ctx.currentPlayer).toBe('0');
    expect(state?.ctx.turn).toBe(5);
    expect(state?.G.players['1'].position).toBeGreaterThan(0);
    expect(state?.G.players['2'].position).toBeGreaterThan(0);
    expect(state?.G.players['3'].position).toBeGreaterThan(0);
  });
});

describe('card effects', () => {
  it('drawRandomCards returns requested number of cards', () => {
    const cards = drawRandomCards(3, 'reward');
    expect(cards).toHaveLength(3);
    expect(cards.every((card) => !('effect' in card))).toBe(true);
  });

  it('yizhi_qianjin converts gold into pending movement', () => {
    const state = createTestState();
    state.players['0'].gold = 55;

    CardEffects.yizhi_qianjin(state, createCtx('0'), '0');

    expect(state.players['0'].gold).toBe(0);
    expect(state.pendingMovement).toBe(11);
  });

  it('lingyun_ta uses the selected step count', () => {
    const state = createTestState();

    CardEffects.lingyun_ta(state, createCtx('0'), '0', undefined, { selectedSteps: 6 });

    expect(state.pendingMovement).toBe(6);
  });

  it('lingyun_ta passing through a shop does not open the shop', () => {
    const state = createTestState();
    state.turnStage = TurnStage.CARD;
    state.players['0'].position = 8;
    addCardsToHand(state.players['0'], [findCardDefinitionById('lingyun_ta')!]);

    const { context } = createMoveContext(state, '0', '0');
    const useCard = DamaqiGame.moves?.useCard as
      | ((context: never, cardId: string, targetPlayerId?: string, usageArgs?: { selectedSteps?: number }) => void)
      | undefined;

    useCard?.(context, 'lingyun_ta', undefined, { selectedSteps: 6 });

    expect(state.players['0'].position).toBe(14);
    expect(state.pendingShop).toBe(false);
    expect(state.currentShop).toEqual([]);
  });

  it('lingyun_ta landing exactly on a shop still opens the shop', () => {
    const state = createTestState();
    state.turnStage = TurnStage.CARD;
    state.players['0'].position = 8;
    addCardsToHand(state.players['0'], [findCardDefinitionById('lingyun_ta')!]);

    const { context } = createMoveContext(state, '0', '0');
    const useCard = DamaqiGame.moves?.useCard as
      | ((context: never, cardId: string, targetPlayerId?: string, usageArgs?: { selectedSteps?: number }) => void)
      | undefined;

    useCard?.(context, 'lingyun_ta', undefined, { selectedSteps: 5 });

    expect(state.players['0'].position).toBe(13);
    expect(state.pendingShop).toBe(true);
  });

  it('shexing_nayue steals a random card from the target', () => {
    const state = createTestState();
    state.players['1'].handCards = drawRandomCards(2, 'reward');
    vi.spyOn(Math, 'random').mockReturnValue(0);

    CardEffects.shexing_nayue(state, createCtx('0'), '0', '1');

    expect(state.players['0'].handCards).toHaveLength(1);
    expect(state.players['1'].handCards).toHaveLength(1);
  });
});

describe('sect skills', () => {
  it('active skill can be used before rolling and still keeps the turn in roll stage', () => {
    const state = createTestState();
    const useSkill = createMoveContext(state, '0', '0');
    const useActiveSkill = DamaqiGame.moves?.useActiveSkill as ((context: never, targetPlayerId?: string) => void) | undefined;

    useActiveSkill?.(useSkill.context);

    expect(state.players['0'].hasUsedSkillThisTurn).toBe(true);
    expect(state.players['0'].activeSkillCooldown).toBeGreaterThan(0);
    expect(state.turnStage).toBe(TurnStage.ROLL);
    expect(useSkill.events.endTurn).not.toHaveBeenCalled();

    vi.spyOn(Math, 'random').mockReturnValue(0);
    const roll = createMoveContext(state, '0', '0');
    const rollDice = DamaqiGame.moves?.rollDice as ((context: never) => void) | undefined;

    rollDice?.(roll.context);

    expect(state.players['0'].position).toBe(1);
    expect(state.turnStage).toBe(TurnStage.CARD);
  });

  it('cards gained from an active skill can be used immediately before rolling', () => {
    const state = createTestState();
    const useSkill = createMoveContext(state, '0', '0');
    const useActiveSkill = DamaqiGame.moves?.useActiveSkill as ((context: never, targetPlayerId?: string) => void) | undefined;
    const useCard = DamaqiGame.moves?.useCard as
      | ((context: never, cardId: string, targetPlayerId?: string, usageArgs?: never) => void)
      | undefined;

    useActiveSkill?.(useSkill.context);
    useCard?.(useSkill.context, 'miaoshou_huichun');

    expect(state.players['0'].handCards.some((card) => card.id === 'miaoshou_huichun')).toBe(false);
    expect(state.players['0'].buffs.miaoshou_recovery?.value).toEqual({
      bonuses: [6, 6]
    });
    expect(state.turnStage).toBe(TurnStage.ROLL);
  });

  it('finishing card stage ends the turn directly when the skill was already used earlier this turn', () => {
    const state = createTestState();
    state.turnStage = TurnStage.CARD;
    state.players['0'].hasUsedSkillThisTurn = true;
    state.players['0'].activeSkillCooldown = 2;

    const finish = createMoveContext(state, '0', '0');
    const finishCardStage = DamaqiGame.moves?.finishCardStage as ((context: never) => void) | undefined;

    finishCardStage?.(finish.context);

    expect(finish.events.endTurn).toHaveBeenCalledTimes(1);
    expect(state.turnStage).toBe(TurnStage.CARD);
  });

  it('maps active skill cooldowns from menpai.md', () => {
    expect(getActiveSkillCooldownTurns(Sect.QINGXI)).toBe(2);
    expect(getActiveSkillCooldownTurns(Sect.GUYUN)).toBe(3);
    expect(getActiveSkillCooldownTurns(Sect.LIYUAN)).toBe(1);
    expect(getActiveSkillCooldownTurns(Sect.MOSHANDAO)).toBe(2);
    expect(getActiveSkillCooldownTurns(Sect.SANGENGTIAN)).toBe(1);
    expect(getActiveSkillCooldownTurns(Sect.KUANGLAN)).toBe(1);
    expect(getActiveSkillCooldownTurns(Sect.ZUIHUAYIN)).toBe(2);
    expect(getActiveSkillCooldownTurns(Sect.TIANQUAN)).toBe(1);
    expect(getActiveSkillCooldownTurns(Sect.JIULIUMEN)).toBe(1);
    expect(Object.keys(ACTIVE_SKILL_COOLDOWNS)).toHaveLength(9);
  });

  it('Qingxi active skill grants Miaoshou Huichun', () => {
    const state = createTestState();

    const success = useActiveSectSkill(state, '0');

    expect(success).toBe(true);
    expect(state.players['0'].handCards.some((card) => card.id === 'miaoshou_huichun')).toBe(true);
  });

  it('Liyuan passive adds +5 when not in first place', () => {
    const state = createTestState();
    state.players['1'].position = 3;
    state.players['0'].position = 10;

    const finalRoll = applyPassiveRollModifiers(state, '1', 2);

    expect(finalRoll).toBe(7);
  });

  it('single lucky die triggers with 30% chance', () => {
    const state = createTestState();
    addCardsToHand(state.players['0'], [JIXIANG_HAOZAO_CARD]);
    vi.spyOn(Math, 'random').mockReturnValue(0.2);

    const finalRoll = applyPassiveRollModifiers(state, '0', 3);

    expect(finalRoll).toBe(5);
  });

  it('single good luck die can grant a random card', () => {
    const state = createTestState();
    addCardsToHand(state.players['0'], [JIXIANG_HAOYUN_CARD]);
    vi.spyOn(Math, 'random').mockReturnValue(0.2);

    const finalRoll = applyPassiveRollModifiers(state, '0', 5);

    expect(finalRoll).toBe(5);
    expect(state.players['0'].handCards.length).toBe(2);
  });

  it('single lucky die can fail to trigger', () => {
    const state = createTestState();
    addCardsToHand(state.players['0'], [JIXIANG_HAOZAO_CARD]);
    vi.spyOn(Math, 'random').mockReturnValue(0.7);

    const finalRoll = applyPassiveRollModifiers(state, '0', 4);

    expect(finalRoll).toBe(4);
  });

  it('Jiuliumen can rig its own next base roll to 4/4/5/5/6/6', () => {
    const players = createPlayers({
      sects: [Sect.JIULIUMEN, Sect.LIYUAN, Sect.TIANQUAN, Sect.GUYUN]
    });
    applyOpeningEconomy(players);
    const state: GameState = {
      players,
      board: createBoardData(),
      currentShop: [],
      pendingShop: false,
      pendingShopResumeStage: null,
      pendingDiscards: [],
      pendingTurnResolution: null,
      pendingRoll: null,
      pendingMovement: null,
      pendingMovementSource: null,
      turnStage: TurnStage.ROLL,
      actionLog: [],
      winnerTeam: null,
      turnMessage: ''
    };

    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.8)
      .mockReturnValueOnce(0.4);

    const success = useActiveSectSkill(state, '0', '1');
    const controlled = consumeControlledBaseRoll(state, '0', 2);

    expect(success).toBe(true);
    expect(controlled.roll).toBe(5);
    expect(state.players['0'].buffs.rat_fate_self).toBeUndefined();
  });

  it('Jiuliumen can rig an enemy next base roll to 0/1/1/2/2/3', () => {
    const players = createPlayers({
      sects: [Sect.JIULIUMEN, Sect.LIYUAN, Sect.TIANQUAN, Sect.GUYUN]
    });
    applyOpeningEconomy(players);
    const state: GameState = {
      players,
      board: createBoardData(),
      currentShop: [],
      pendingShop: false,
      pendingShopResumeStage: null,
      pendingDiscards: [],
      pendingTurnResolution: null,
      pendingRoll: null,
      pendingMovement: null,
      pendingMovementSource: null,
      turnStage: TurnStage.ROLL,
      actionLog: [],
      winnerTeam: null,
      turnMessage: ''
    };

    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.99);

    const success = useActiveSectSkill(state, '0', '1');
    const controlled = consumeControlledBaseRoll(state, '1', 6);

    expect(success).toBe(true);
    expect(controlled.roll).toBe(3);
    expect(state.players['1'].debuffs.rat_fate).toBeUndefined();
  });
});

describe('serialization safety', () => {
  it('game state remains JSON serializable after gaining cards and effects', () => {
    const state = createTestState();
    addCardsToHand(state.players['0'], drawRandomCards(2, 'reward'));
    state.players['0'].buffs.yinyang = {
      remainingTurns: 2,
      value: 5
    };
    state.players['1'].debuffs.zuihua_poison = {
      remainingTurns: 2,
      value: { value: -3, casterId: '0' }
    };

    expect(() => JSON.stringify(state)).not.toThrow();
    expect(JSON.parse(JSON.stringify(state)).players['0'].handCards).toHaveLength(2);
  });
});

describe('hand overflow discard flow', () => {
  it('allows buying above the hand limit and forces immediate discard', () => {
    const state = createTestState();
    const card = findCardDefinitionById('liangshang_junzi')!;
    state.turnStage = TurnStage.SHOP;
    state.pendingShop = true;
    state.currentShop = [card];
    state.players['0'].gold = 100;
    addCardsToHand(state.players['0'], drawRandomCards(6, 'reward'));

    const { context } = createMoveContext(state, '0', '0');
    const buyCard = DamaqiGame.moves?.buyCard as ((context: never, cardId: string) => void) | undefined;

    buyCard?.(context, card.id);

    expect(state.players['0'].gold).toBe(85);
    expect(state.players['0'].handCards).toHaveLength(7);
    expect(state.pendingDiscards[0]?.playerId).toBe('0');
    expect(state.pendingDiscards[0]?.reason).toBe('商店购买');
  });

  it('buying from a shop with duplicate cards only removes the purchased copy', () => {
    const state = createTestState();
    const card = findCardDefinitionById('liangshang_junzi')!;
    state.turnStage = TurnStage.SHOP;
    state.pendingShop = true;
    state.currentShop = [card, card];
    state.players['0'].gold = 100;

    const { context } = createMoveContext(state, '0', '0');
    const buyCard = DamaqiGame.moves?.buyCard as ((context: never, cardId: string) => void) | undefined;

    buyCard?.(context, card.id);

    expect(state.currentShop).toHaveLength(1);
    expect(state.currentShop[0]?.id).toBe(card.id);
  });

  it('map mystery card rewards can also trigger forced discard', () => {
    const state = createTestState();
    addCardsToHand(state.players['0'], drawRandomCards(6, 'reward'));
    vi.spyOn(Math, 'random').mockReturnValue(0.6);

    applyMysteryEvent(state, '0');

    expect(state.players['0'].handCards).toHaveLength(7);
    expect(state.pendingDiscards[0]?.playerId).toBe('0');
    expect(state.pendingDiscards[0]?.reason).toBe('地图奇遇');
  });

  it('teammate gift overflow blocks the teammate until they discard', () => {
    const state = createTestState();
    state.players['0'].handCards = drawRandomCards(1, 'reward');
    addCardsToHand(state.players['2'], drawRandomCards(6, 'reward'));

    CardEffects.paiyou_jienan(state, createCtx('0'), '0', '2');

    expect(state.players['0'].handCards).toHaveLength(0);
    expect(state.players['2'].handCards).toHaveLength(7);
    expect(state.pendingDiscards[0]?.playerId).toBe('2');
    expect(state.pendingDiscards[0]?.reason).toBe('排忧解难');
  });

  it('discard move clears overflow and restores the flow', () => {
    const state = createTestState();
    state.turnStage = TurnStage.SHOP;
    state.pendingShop = true;
    addCardsToHand(state.players['0'], drawRandomCards(7, 'reward'));
    state.pendingDiscards = [{ playerId: '0', reason: '商店购买' }];

    const { context, events } = createMoveContext(state, '0', '0');
    const discardOverflowCard = DamaqiGame.moves?.discardOverflowCard as
      | ((context: never, cardId: string) => void)
      | undefined;

    discardOverflowCard?.(context, state.players['0'].handCards[0]!.id);

    expect(state.players['0'].handCards).toHaveLength(6);
    expect(state.pendingDiscards).toHaveLength(0);
    expect(events.setActivePlayers).toHaveBeenCalled();
    expect(events.endTurn).not.toHaveBeenCalled();
  });

  it('active skill waits for discard before ending the turn', () => {
    const state = createTestState();
    state.turnStage = TurnStage.SKILL;
    addCardsToHand(state.players['0'], drawRandomCards(6, 'reward'));

    const useSkill = createMoveContext(state, '0', '0');
    const useActiveSkill = DamaqiGame.moves?.useActiveSkill as ((context: never, targetPlayerId?: string) => void) | undefined;

    useActiveSkill?.(useSkill.context);

    expect(state.players['0'].handCards).toHaveLength(7);
    expect(state.pendingDiscards[0]?.playerId).toBe('0');
    expect(state.pendingTurnResolution).toBe('endTurn');
    expect(useSkill.events.endTurn).not.toHaveBeenCalled();

    const discard = createMoveContext(state, '0', '0');
    const discardOverflowCard = DamaqiGame.moves?.discardOverflowCard as
      | ((context: never, cardId: string) => void)
      | undefined;

    discardOverflowCard?.(discard.context, state.players['0'].handCards[0]!.id);

    expect(state.pendingDiscards).toHaveLength(0);
    expect(state.pendingTurnResolution).toBeNull();
    expect(discard.events.endTurn).toHaveBeenCalledTimes(1);
  });
});

describe('attack protection cards', () => {
  it('wuxiang_jinshen blocks an incoming attack and is discarded', () => {
    const state = createTestState();
    addCardsToHand(state.players['1'], [WUXIANG_JINSHEN_CARD]);

    const result = attemptOddAttack(state, '0', '1');

    expect(result.attempted).toBe(true);
    expect(result.blocked).toBe(true);
    expect(result.succeeded).toBe(false);
    expect(state.players['1'].handCards.some((card) => card.id === 'wuxiang_jinshen')).toBe(false);
    expect(state.players['1'].status).toBe(PlayerStatus.NORMAL);
  });

  it('sancai_xiaozai blocks the attack only when the holder has enough gold', () => {
    const state = createTestState();
    addCardsToHand(state.players['1'], [SANCAI_XIAOZAI_CARD]);
    state.players['1'].gold = 25;

    const result = attemptOddAttack(state, '0', '1');

    expect(result.blocked).toBe(true);
    expect(state.players['1'].gold).toBe(5);
    expect(state.players['1'].handCards.some((card) => card.id === 'sancai_xiaozai')).toBe(false);
  });
});

describe('miaoshou huichun', () => {
  it('cleanses debuffs and grants +4 to the next two rolls when debuffs existed', () => {
    const state = createTestState();
    state.players['0'].debuffs.zuihua_poison = {
      remainingTurns: 2,
      value: { value: -3, casterId: '1' }
    };

    CardEffects.miaoshou_huichun(state, createCtx('0'), '0');
    const finalRoll = applyPassiveRollModifiers(state, '0', 2);

    expect(Object.keys(state.players['0'].debuffs)).toHaveLength(0);
    expect(finalRoll).toBe(6);
  });

  it('grants +6 to the next two rolls when the target had no debuff', () => {
    const state = createTestState();
    addCardsToHand(state.players['0'], [MIAOSHOU_HUICHI_CARD]);

    CardEffects.miaoshou_huichun(state, createCtx('0'), '0');
    const finalRoll = applyPassiveRollModifiers(state, '0', 2);

    expect(finalRoll).toBe(8);
  });
});
