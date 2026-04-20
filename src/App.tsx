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

export default function App() {
  const [playerID, setPlayerID] = useState<PlayerID>('0');

  return (
    <main className={styles.shell}>
      <section className={styles.hero}>
        <div>
          <p className={styles.kicker}>燕云十六声 · 打马棋</p>
          <h1 className={styles.title}>水墨长卷中的 2v2 棋局对弈</h1>
          <p className={styles.summary}>
            当前实现聚焦本地单机演示：你可以切换座位，依次操作 4 名角色完成掷骰、移动、购牌、出牌与门派技能。
          </p>
        </div>

        <div className={styles.seatBox}>
          <span className={styles.seatLabel}>本地操作者座位</span>
          <div className={styles.seatList}>
            {seats.map((seat) => (
              <button
                key={seat}
                className={seat === playerID ? styles.seatButtonActive : styles.seatButton}
                onClick={() => setPlayerID(seat)}
                type="button"
              >
                {Number(seat) + 1}P
              </button>
            ))}
          </div>
          <p className={styles.seatHint}>回合轮转后切换到对应座位，即可继续本地对战测试。</p>
        </div>
      </section>

      <section className={styles.clientFrame}>
        <DamaqiClient playerID={playerID} />
      </section>
    </main>
  );
}
