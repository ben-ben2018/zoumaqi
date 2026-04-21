import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';

import { DicePanel } from '../components/DicePanel';
import { TurnStage } from '../types';

describe('DicePanel', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders an idle die before any roll happens', () => {
    render(
      <DicePanel disabled={false} lastRoll={null} onRoll={vi.fn()} pendingRoll={null} stage={TurnStage.ROLL} />
    );

    expect(screen.getByText('静候掷定')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '尚未掷骰' })).toHaveAttribute('data-face', '0');
  });

  it('enters rolling state on click and settles on the returned face', () => {
    vi.useFakeTimers();

    const onRoll = vi.fn();
    const { rerender } = render(
      <DicePanel disabled={false} lastRoll={null} onRoll={onRoll} pendingRoll={null} stage={TurnStage.ROLL} />
    );

    fireEvent.click(screen.getByRole('button', { name: '掷骰并行动' }));

    expect(onRoll).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '骰影翻飞中…' })).toBeDisabled();
    expect(screen.getByText('骰盅摇转中')).toBeInTheDocument();
    expect(screen.getByTestId('dice-face')).toHaveAttribute('data-rolling', 'true');

    rerender(<DicePanel disabled={false} lastRoll={5} onRoll={onRoll} pendingRoll={null} stage={TurnStage.CARD} />);

    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(screen.getByText('落定 5 点')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '最近点数 5' })).toHaveAttribute('data-face', '5');
    expect(screen.getByTestId('dice-face')).toHaveAttribute('data-rolling', 'false');
  });
});
