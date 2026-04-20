import { useEffect, useRef } from 'react';
import type { PlayerID } from 'boardgame.io';

import { PlayerTeam, type PlayerData, type TileData } from '../types';

type BoardCanvasProps = {
  tiles: TileData[];
  players: PlayerData[];
  currentPlayerId: PlayerID;
};

const WIDTH = 980;
const HEIGHT = 520;

export function BoardCanvas({ tiles, players, currentPlayerId }: BoardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, WIDTH, HEIGHT);

    const background = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
    background.addColorStop(0, '#f8f2e6');
    background.addColorStop(1, '#e1d5bd');
    context.fillStyle = background;
    context.fillRect(0, 0, WIDTH, HEIGHT);

    context.strokeStyle = 'rgba(105, 78, 46, 0.2)';
    context.lineWidth = 20;
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
    context.font = '18px "KaiTi", serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    for (const tile of tiles) {
      const isCurrentTile = players.some((player) => player.id === currentPlayerId && player.position === tile.index);

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

      context.beginPath();
      context.arc(tile.x, tile.y, isCurrentTile ? 28 : 24, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = 'rgba(68, 51, 30, 0.26)';
      context.stroke();

      context.fillStyle = tile.label === '终' ? '#f5ebdc' : '#433323';
      context.fillText(tile.label, tile.x, tile.y);
    }

    players.forEach((player, index) => {
      const tile = tiles[player.position];
      const offsetX = ((index % 2) - 0.5) * 22;
      const offsetY = Math.floor(index / 2) * 22 - 12;

      context.fillStyle = player.team === PlayerTeam.RED ? '#8d4b3c' : '#506f7b';
      context.beginPath();
      context.arc(tile.x + offsetX, tile.y + offsetY, 10, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = '#f7f0e4';
      context.font = '11px sans-serif';
      context.fillText(player.name.replace('P', ''), tile.x + offsetX, tile.y + offsetY + 1);
    });
  }, [tiles, players, currentPlayerId]);

  return (
    <div className="overflow-hidden rounded-[28px] border border-ink-700/10 bg-[rgba(255,248,236,0.66)] p-3 shadow-paper">
      <canvas className="h-auto w-full" height={HEIGHT} ref={canvasRef} width={WIDTH} />
      <div className="mt-3 flex flex-wrap gap-2 text-sm text-ink-700">
        <span className="rounded-full bg-ink-100/80 px-3 py-1">商店格：采购卡牌</span>
        <span className="rounded-full bg-moss-100/80 px-3 py-1">奇遇格：随机收益</span>
        <span className="rounded-full bg-[rgba(154,94,73,0.18)] px-3 py-1">首领格：占位奖励</span>
      </div>
    </div>
  );
}
