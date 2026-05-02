import { useEffect, useRef } from 'react';
import Phaser from 'phaser';

import { BOARD_CANVAS_HEIGHT, BOARD_CANVAS_WIDTH } from '../game/board/boardData';
import { BoardScene } from '../game/board/BoardScene';
import type { PlayerData, TileData } from '../types';

type PhaserBoardProps = {
  tiles: TileData[];
  players: PlayerData[];
  currentPlayerId: string;
  onPlayerArrive?: (playerId: string, position: number) => void;
};

const MAX_RENDER_RESOLUTION = 2;

function getRenderResolution() {
  if (typeof window === 'undefined') {
    return 1;
  }

  return Math.min(window.devicePixelRatio || 1, MAX_RENDER_RESOLUTION);
}

function getHostViewport(host: HTMLDivElement) {
  const width = Math.max(1, Math.floor(host.clientWidth || BOARD_CANVAS_WIDTH));
  const height = Math.max(1, Math.floor(host.clientHeight || BOARD_CANVAS_HEIGHT));

  return {
    width,
    height
  };
}

export function PhaserBoard({ tiles, players, currentPlayerId, onPlayerArrive }: PhaserBoardProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<BoardScene | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || gameRef.current) {
      return;
    }

    const scene = new BoardScene();
    scene.setPlayerArrivalListener(onPlayerArrive);
    sceneRef.current = scene;
    const initialViewport = getHostViewport(host);

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      width: initialViewport.width,
      height: initialViewport.height,
      backgroundColor: '#f1e8d8',
      render: {
        antialias: true,
        roundPixels: true
      },
      scale: {
        parent: host,
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        autoRound: true,
        width: initialViewport.width,
        height: initialViewport.height
      },
      scene: [scene]
    });

    gameRef.current = game;
    scene.layoutViewport(initialViewport.width, initialViewport.height, getRenderResolution());
    scene.syncState({
      tiles,
      players,
      currentPlayerId
    });

    const observer = new ResizeObserver(() => {
      const viewport = getHostViewport(host);
      const resolution = getRenderResolution();

      game.scale.resize(viewport.width, viewport.height);
      scene.layoutViewport(viewport.width, viewport.height, resolution);
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
    sceneRef.current?.setPlayerArrivalListener(onPlayerArrive);
  }, [onPlayerArrive]);

  useEffect(() => {
    sceneRef.current?.syncState({
      tiles,
      players,
      currentPlayerId
    });
  }, [currentPlayerId, players, tiles]);

  return <div className="h-full w-full" ref={hostRef} />;
}
