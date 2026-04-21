import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

import { Button } from './Button';
import styles from './DicePanel.module.css';
import { TurnStage } from '../types';

type DicePanelProps = {
  stage: TurnStage;
  lastRoll: number | null;
  pendingRoll: number | null;
  disabled: boolean;
  onRoll: () => void;
};

const MIN_ROLL_DURATION_MS = 900;
const FACE_INTERVAL_MS = 90;
const RESULT_PULSE_MS = 420;

const PIP_ORDER = [
  'topLeft',
  'topCenter',
  'topRight',
  'midLeft',
  'center',
  'midRight',
  'bottomLeft',
  'bottomCenter',
  'bottomRight'
] as const;

type PipPosition = (typeof PIP_ORDER)[number];
type FaceValue = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const FACE_PIPS: Record<Exclude<FaceValue, 0>, PipPosition[]> = {
  1: ['center'],
  2: ['topLeft', 'bottomRight'],
  3: ['topLeft', 'center', 'bottomRight'],
  4: ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'],
  5: ['topLeft', 'topRight', 'center', 'bottomLeft', 'bottomRight'],
  6: ['topLeft', 'topRight', 'midLeft', 'midRight', 'bottomLeft', 'bottomRight']
};

function normalizeFaceValue(value: number | null): FaceValue {
  if (value === null || value < 1 || value > 6) {
    return 0;
  }

  return value as FaceValue;
}

function getNextFaceValue(value: FaceValue): FaceValue {
  if (value <= 0 || value >= 6) {
    return 1;
  }

  return (value + 1) as FaceValue;
}

function supportsMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

export function DicePanel({ stage, lastRoll, pendingRoll, disabled, onRoll }: DicePanelProps) {
  const [displayValue, setDisplayValue] = useState<FaceValue>(normalizeFaceValue(lastRoll));
  const [isRolling, setIsRolling] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const rollStartedAtRef = useRef<number | null>(null);
  const rollIntervalRef = useRef<number | null>(null);
  const resultTimerRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const pendingResultRef = useRef<number | null>(null);

  const canRoll = stage === TurnStage.ROLL && !disabled && !isRolling;
  const actionSteps = pendingRoll ?? lastRoll ?? 0;
  const diceAriaLabel = isRolling ? '骰子滚动中' : lastRoll === null ? '尚未掷骰' : `最近点数 ${lastRoll}`;

  useEffect(() => {
    if (!supportsMatchMedia()) {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    syncPreference();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncPreference);

      return () => {
        mediaQuery.removeEventListener('change', syncPreference);
      };
    }

    mediaQuery.addListener(syncPreference);

    return () => {
      mediaQuery.removeListener(syncPreference);
    };
  }, []);

  useEffect(() => {
    if (isRolling) {
      return undefined;
    }

    setDisplayValue(normalizeFaceValue(pendingRoll ?? lastRoll));
    return undefined;
  }, [isRolling, lastRoll, pendingRoll]);

  useEffect(() => {
    if (!isRolling || lastRoll === null) {
      return undefined;
    }

    pendingResultRef.current = lastRoll;
    if (resultTimerRef.current !== null) {
      return undefined;
    }

    const elapsed = rollStartedAtRef.current === null ? MIN_ROLL_DURATION_MS : Date.now() - rollStartedAtRef.current;
    const remaining = Math.max(MIN_ROLL_DURATION_MS - elapsed, 0);
    resultTimerRef.current = window.setTimeout(() => {
      const finalFace = normalizeFaceValue(pendingResultRef.current);

      if (rollIntervalRef.current !== null) {
        window.clearInterval(rollIntervalRef.current);
        rollIntervalRef.current = null;
      }

      if (resultTimerRef.current !== null) {
        window.clearTimeout(resultTimerRef.current);
        resultTimerRef.current = null;
      }

      rollStartedAtRef.current = null;
      pendingResultRef.current = null;
      setIsRolling(false);
      setDisplayValue(finalFace);
      setIsSettling(true);
    }, remaining);

    return undefined;
  }, [isRolling, lastRoll]);

  useEffect(() => {
    if (!isSettling) {
      return undefined;
    }

    settleTimerRef.current = window.setTimeout(() => {
      setIsSettling(false);
      settleTimerRef.current = null;
    }, RESULT_PULSE_MS);

    return () => {
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    };
  }, [isSettling]);

  useEffect(() => {
    return () => {
      if (rollIntervalRef.current !== null) {
        window.clearInterval(rollIntervalRef.current);
      }
      if (resultTimerRef.current !== null) {
        window.clearTimeout(resultTimerRef.current);
      }
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }
    };
  }, []);

  const handleRoll = () => {
    if (!canRoll) {
      return;
    }

    setIsSettling(false);
    setIsRolling(true);
    pendingResultRef.current = null;
    rollStartedAtRef.current = prefersReducedMotion ? null : Date.now();

    if (rollIntervalRef.current !== null) {
      window.clearInterval(rollIntervalRef.current);
      rollIntervalRef.current = null;
    }

    if (resultTimerRef.current !== null) {
      window.clearTimeout(resultTimerRef.current);
      resultTimerRef.current = null;
    }

    if (!prefersReducedMotion) {
      setDisplayValue((currentValue) => getNextFaceValue(currentValue));
      rollIntervalRef.current = window.setInterval(() => {
        setDisplayValue((currentValue) => getNextFaceValue(currentValue));
      }, FACE_INTERVAL_MS);
    }

    onRoll();
  };

  return (
    <section className={clsx('rounded-[18px] border border-ink-700/10 bg-[rgba(255,250,241,0.82)] p-4', styles.panel)}>
      <div className={clsx(styles.diceAura, isRolling && styles.diceAuraRolling, isSettling && styles.diceAuraSettling)} />
      <div
        aria-label={diceAriaLabel}
        className={clsx(styles.diceFrame, isRolling && styles.diceFrameRolling, isSettling && styles.diceFrameSettling)}
        data-face={displayValue}
        data-rolling={isRolling ? 'true' : 'false'}
        data-testid="dice-face"
        role="img"
        onClick={canRoll ? handleRoll : () => { }}
      >
        <div className={clsx(styles.face, displayValue === 0 && styles.faceIdle)}>
          {PIP_ORDER.map((position) => {
            const isActive = displayValue !== 0 && FACE_PIPS[displayValue as Exclude<FaceValue, 0>].includes(position);

            return (
              <span
                aria-hidden="true"
                className={clsx(styles.pip, styles[position], isActive && styles.pipActive)}
                key={position}
              />
            );
          })}
          {displayValue === 0 && (
            <span aria-hidden="true" className={styles.idleGlyph}>
              未掷
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
