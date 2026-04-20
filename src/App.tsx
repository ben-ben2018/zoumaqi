import { useState } from 'react';
import type { PlayerID } from 'boardgame.io';
import { Client } from 'boardgame.io/react';

import styles from './App.module.css';
import { DamaqiBoard } from './components/DamaqiBoard';
import { DamaqiGame } from './game/gameConfig';

const DamaqiClient = Client({
  game: DamaqiGame,
  board: DamaqiBoard,
  numPlayers: 4,
  debug: false
});

const seats: PlayerID[] = ['0', '1', '2', '3'];
const HUMAN_PLAYER_ID: PlayerID = '0';

export default function App() {
  const [viewPlayerID, setViewPlayerID] = useState<PlayerID>(HUMAN_PLAYER_ID);

  return (
    <main className={styles.shell}>
      <section className={styles.hero}>
        <div>
          <p className={styles.kicker}>燕云十六声 · 打马棋</p>
          <h1 className={styles.title}>水墨长卷中的 2v2 棋局对弈</h1>
          <p className={styles.summary}>
            当前实现支持 1P 对战 3 名人机。你固定操控 1P，2P-4P 会依据策略文档自动完成掷骰、移动、购牌、出牌、技能与弃牌。
          </p>
        </div>

        <div className={styles.seatBox}>
          <span className={styles.seatLabel}>观战座位</span>
          <div className={styles.seatList}>
            {seats.map((seat) => (
              <button
                key={seat}
                className={seat === viewPlayerID ? styles.seatButtonActive : styles.seatButton}
                onClick={() => setViewPlayerID(seat)}
                type="button"
              >
                {Number(seat) + 1}P
              </button>
            ))}
          </div>
          <p className={styles.seatHint}>1P 为人类，切换座位只会改变观察视角，不会接管 AI。</p>
        </div>
      </section>

      <section className={styles.clientFrame}>
        <DamaqiClient playerID={HUMAN_PLAYER_ID} humanPlayerID={HUMAN_PLAYER_ID} viewPlayerID={viewPlayerID} />
      </section>
    </main>
  );
}
