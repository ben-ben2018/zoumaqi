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
