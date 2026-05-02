import OpenAI from 'openai';
import type { PlayerID } from 'boardgame.io';

import type { GameActionRequest, MatchSnapshot } from '../../multiplayer/protocol';
import type { LlmModelSelection } from '../../types';
import { TurnStage } from '../../types';
import { getLlmProvider } from './config';
import { buildAllowedLlmActions, buildLlmPrompt } from './prompt';

const LLM_TIMEOUT_MS = 15_000;

interface LlmResponseAction {
  action?: string;
  type?: string;
  cardId?: string;
  targetPlayerId?: string;
  usageArgs?: {
    selectedSteps?: number;
  };
  steps?: number;
}

function normalizeActionName(value: LlmResponseAction): string {
  return String(value.action ?? value.type ?? '');
}

function extractJsonObject(content: string): unknown | null {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) {
      return null;
    }

    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    } catch {
      return null;
    }
  }
}

function isSameAction(left: GameActionRequest, right: GameActionRequest): boolean {
  if (left.type !== right.type) {
    return false;
  }

  switch (left.type) {
    case 'buyCard':
    case 'discardOverflowCard':
      return left.cardId === (right as Extract<GameActionRequest, { cardId: string }>).cardId;
    case 'useCard': {
      const candidate = right as Extract<GameActionRequest, { type: 'useCard' }>;
      return (
        left.cardId === candidate.cardId &&
        (left.targetPlayerId ?? null) === (candidate.targetPlayerId ?? null) &&
        (left.usageArgs?.selectedSteps ?? null) === (candidate.usageArgs?.selectedSteps ?? null)
      );
    }
    case 'useActiveSkill':
      return (left.targetPlayerId ?? null) === ((right as Extract<GameActionRequest, { type: 'useActiveSkill' }>).targetPlayerId ?? null);
    case 'movePlayer':
      return left.steps === (right as Extract<GameActionRequest, { type: 'movePlayer' }>).steps;
    default:
      return true;
  }
}

function normalizeLlmAction(value: unknown, allowedActions: GameActionRequest[]): GameActionRequest | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as LlmResponseAction;
  const actionName = normalizeActionName(raw);
  if (!actionName) {
    return null;
  }

  let candidate: GameActionRequest | null = null;
  switch (actionName) {
    case 'rollDice':
    case 'finishShop':
    case 'finishCardStage':
    case 'finishSkillStage':
      candidate = { type: actionName };
      break;
    case 'buyCard':
    case 'discardOverflowCard':
      candidate = typeof raw.cardId === 'string' ? { type: actionName, cardId: raw.cardId } : null;
      break;
    case 'useCard':
      candidate =
        typeof raw.cardId === 'string'
          ? {
              type: 'useCard',
              cardId: raw.cardId,
              targetPlayerId: raw.targetPlayerId,
              usageArgs: raw.usageArgs
            }
          : null;
      break;
    case 'useActiveSkill':
      candidate = {
        type: 'useActiveSkill',
        targetPlayerId: raw.targetPlayerId
      };
      break;
    case 'movePlayer':
      candidate =
        typeof raw.steps === 'number'
          ? {
              type: 'movePlayer',
              steps: raw.steps
            }
          : null;
      break;
    default:
      candidate = null;
  }

  if (!candidate) {
    return null;
  }

  return allowedActions.find((allowedAction) => isSameAction(allowedAction, candidate)) ?? null;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error('LLM request timed out.')), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export async function decideLlmAction(
  snapshot: MatchSnapshot,
  playerId: PlayerID,
  selection: LlmModelSelection
): Promise<GameActionRequest | null> {
  const provider = getLlmProvider(selection.providerName);
  if (!provider || !provider.model_ids.includes(selection.modelId)) {
    return null;
  }

  const prompt = buildLlmPrompt(snapshot, playerId);
  if (prompt.allowedActions.length === 0) {
    return null;
  }

  const client = new OpenAI({
    apiKey: provider.api_key,
    baseURL: provider.base_url
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const completion = await withTimeout(
      client.chat.completions.create({
        model: selection.modelId,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: prompt.system
          },
          {
            role: 'user',
            content:
              attempt === 0
                ? prompt.user
                : `${prompt.user}\n上一次输出无法解析或不在 allowedActions 中。请重新只输出一个合法 JSON 对象。`
          }
        ]
      }),
      LLM_TIMEOUT_MS
    );

    const content = completion.choices[0]?.message?.content ?? '';
    const action = normalizeLlmAction(extractJsonObject(content), prompt.allowedActions);
    if (action) {
      return action;
    }
  }

  if (snapshot.G.turnStage === TurnStage.CARD) {
    return {
      type: 'finishCardStage'
    };
  }

  return null;
}

export function hasLlmActionAvailable(snapshot: MatchSnapshot, playerId: PlayerID): boolean {
  return buildAllowedLlmActions(snapshot, playerId).length > 0;
}
