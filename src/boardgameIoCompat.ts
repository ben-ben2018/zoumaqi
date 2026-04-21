import * as clientModule from 'boardgame.io/dist/esm/client.js';
import * as coreModule from 'boardgame.io/dist/esm/core.js';

// boardgame.io publishes typed subpackages like `boardgame.io/core`, but Node 22 ESM
// rejects those directory imports at runtime. Re-export the concrete ESM files here
// while preserving the package's published TypeScript shapes.
const runtimeClientModule = clientModule as typeof import('boardgame.io/dist/esm/client.js') & {
  default?: {
    Client?: typeof import('boardgame.io/client').Client;
  };
};
const runtimeCoreModule = coreModule as typeof import('boardgame.io/dist/esm/core.js') & {
  default?: {
    TurnOrder?: typeof import('boardgame.io/core').TurnOrder;
  };
};
const runtimeClient = runtimeClientModule.Client ?? runtimeClientModule.default?.Client;
const runtimeTurnOrder = runtimeCoreModule.TurnOrder ?? runtimeCoreModule.default?.TurnOrder;

export const Client = runtimeClient as typeof import('boardgame.io/client').Client;
export const TurnOrder = runtimeTurnOrder as typeof import('boardgame.io/core').TurnOrder;
