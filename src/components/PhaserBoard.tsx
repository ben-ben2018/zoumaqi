import { useEffect, useRef } from 'react';
import Phaser from 'phaser';

import { BOARD_CANVAS_HEIGHT, BOARD_CANVAS_WIDTH } from '../game/board/boardData';
import { BoardScene } from '../game/board/BoardScene';
import type { PlayerData, TileData } from '../types';

type PhaserBoardProps = {
  tiles: TileData[];
  players: PlayerData[];
  currentPlayerId: string;
};

export function PhaserBoard({ tiles, players, currentPlayerId }: PhaserBoardProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<BoardScene | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || gameRef.current) {
      return;
    }

    const scene = new BoardScene();
    sceneRef.current = scene;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      width: BOARD_CANVAS_WIDTH,
      height: BOARD_CANVAS_HEIGHT,
      backgroundColor: '#f1e8d8',
      render: {
        antialias: true,
        roundPixels: false
      },
      scale: {
        parent: host,
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: BOARD_CANVAS_WIDTH,
        height: BOARD_CANVAS_HEIGHT
      },
      scene: [scene]
    });

    gameRef.current = game;
    scene.syncState({
      tiles,
      players,
      currentPlayerId
    });

    const observer = new ResizeObserver(() => {
      game.scale.refresh();
    });

    observer.observe(host);

    return () => {
      observer.disconnect();
      sceneRef.current = null;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.syncState({
      tiles,
      players,
      currentPlayerId
    });
  }, [currentPlayerId, players, tiles]);

  return <div className="h-full w-full" ref={hostRef} />;
}
