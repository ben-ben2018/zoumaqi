import { useEffect, useRef, useState } from 'react';

import {
  BOARD_CANVAS_HEIGHT,
  BOARD_CANVAS_WIDTH,
  CURRENT_TILE_SIZE,
  TILE_SIZE
} from '../game/board/boardData';
import { PlayerTeam, type PlayerData, type TileData } from '../types';

type BoardCanvasProps = {
  tiles: TileData[];
  players: PlayerData[];
  currentPlayerId: string;
};

const WIDTH = BOARD_CANVAS_WIDTH;
const HEIGHT = BOARD_CANVAS_HEIGHT;

type CanvasRenderMetrics = {
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  scaleX: number;
  scaleY: number;
  devicePixelRatio: number;
};

export function getCanvasRenderMetrics(
  logicalWidth: number,
  logicalHeight: number,
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number
): CanvasRenderMetrics {
  const safeCssWidth = Math.max(1, Math.round(cssWidth));
  const safeCssHeight = Math.max(1, Math.round(cssHeight));
  const safeDevicePixelRatio = Math.max(1, devicePixelRatio || 1);

  return {
    cssWidth: safeCssWidth,
    cssHeight: safeCssHeight,
    pixelWidth: Math.max(1, Math.round(safeCssWidth * safeDevicePixelRatio)),
    pixelHeight: Math.max(1, Math.round(safeCssHeight * safeDevicePixelRatio)),
    scaleX: safeCssWidth / logicalWidth,
    scaleY: safeCssHeight / logicalHeight,
    devicePixelRatio: safeDevicePixelRatio
  };
}

export function BoardCanvas({ tiles, players, currentPlayerId }: BoardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({
    width: WIDTH,
    height: HEIGHT
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const updateCanvasSize = () => {
      const bounds = canvas.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(bounds.width || WIDTH));
      const nextHeight = Math.max(1, Math.round(bounds.height || (nextWidth / WIDTH) * HEIGHT));

      setCanvasSize((currentSize) =>
        currentSize.width === nextWidth && currentSize.height === nextHeight
          ? currentSize
          : {
              width: nextWidth,
              height: nextHeight
            }
      );
    };

    updateCanvasSize();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      updateCanvasSize();
    });

    observer.observe(canvas);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const metrics = getCanvasRenderMetrics(
      WIDTH,
      HEIGHT,
      canvasSize.width,
      canvasSize.height,
      window.devicePixelRatio
    );

    if (canvas.width !== metrics.pixelWidth) {
      canvas.width = metrics.pixelWidth;
    }

    if (canvas.height !== metrics.pixelHeight) {
      canvas.height = metrics.pixelHeight;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    context.setTransform(
      metrics.scaleX * metrics.devicePixelRatio,
      0,
      0,
      metrics.scaleY * metrics.devicePixelRatio,
      0,
      0
    );
    context.clearRect(0, 0, WIDTH, HEIGHT);

    const background = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
    background.addColorStop(0, '#f8f2e6');
    background.addColorStop(1, '#e1d5bd');
    context.fillStyle = background;
    context.fillRect(0, 0, WIDTH, HEIGHT);

    context.strokeStyle = 'rgba(105, 78, 46, 0.2)';
    context.lineWidth = 8;
    context.lineCap = 'round';
    context.beginPath();
    tiles.forEach((tile, index) => {
      if (index === 0) {
        context.moveTo(tile.x, tile.y);
        return;
      }
      context.lineTo(tile.x, tile.y);
    });
    context.stroke();

    context.lineWidth = 2;
    context.font = '10px "KaiTi", serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    for (const tile of tiles) {
      const isCurrentTile = players.some((player) => player.id === currentPlayerId && player.position === tile.index);
      const tileSize = isCurrentTile ? CURRENT_TILE_SIZE : TILE_SIZE;
      const tileHalfSize = tileSize / 2;

      context.fillStyle =
        tile.label === '终'
          ? '#6b4c34'
          : tile.label === '商'
            ? '#b88c4f'
            : tile.label === '奇'
              ? '#6f8770'
              : tile.label === '首'
                ? '#8a5844'
                : '#f5ecdc';

      context.strokeStyle = 'rgba(68, 51, 30, 0.26)';
      context.fillRect(tile.x - tileHalfSize, tile.y - tileHalfSize, tileSize, tileSize);
      context.strokeRect(tile.x - tileHalfSize, tile.y - tileHalfSize, tileSize, tileSize);

      context.fillStyle = tile.label === '终' ? '#f5ebdc' : '#433323';
      context.fillText(tile.label, tile.x, tile.y);
    }

    players.forEach((player, index) => {
      const tile = tiles[player.position];
      const offsetX = ((index % 2) - 0.5) * 10;
      const offsetY = Math.floor(index / 2) * 10 - 5;

      context.fillStyle = player.team === PlayerTeam.RED ? '#8d4b3c' : '#506f7b';
      context.beginPath();
      context.arc(tile.x + offsetX, tile.y + offsetY, 5, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = '#f7f0e4';
      context.font = '8px sans-serif';
      context.fillText(player.name.replace('P', ''), tile.x + offsetX, tile.y + offsetY + 1);
    });
  }, [canvasSize.height, canvasSize.width, tiles, players, currentPlayerId]);

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(248,242,230,0.96),_rgba(223,208,178,0.92))]">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,248,236,0.08),rgba(108,79,63,0.1))]" />
      <div className="relative w-full px-4 sm:px-6 md:px-8">
        <canvas className="block h-auto w-full" height={HEIGHT} ref={canvasRef} width={WIDTH} />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
        <div className="flex flex-wrap justify-center gap-2 rounded-full border border-ink-700/10 bg-[rgba(255,250,241,0.72)] px-3 py-2 text-xs text-ink-700 backdrop-blur-md">
          <span className="rounded-full bg-ink-100/80 px-3 py-1">商店格：采购卡牌</span>
          <span className="rounded-full bg-moss-100/80 px-3 py-1">奇遇格：随机收益</span>
          <span className="rounded-full bg-[rgba(154,94,73,0.18)] px-3 py-1">首领格：占位奖励</span>
        </div>
      </div>
    </div>
  );
}
