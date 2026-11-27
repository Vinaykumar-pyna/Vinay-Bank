import { act, renderHook } from '@testing-library/react';
import { useDelayedFlag, usePresence } from './useDelayedFlag';

describe('useDelayedFlag', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('turns on only after the delay and stays on for the minimum time', () => {
    const { result, rerender } = renderHook(({ active }) => useDelayedFlag(active, 250, 400), {
      initialProps: { active: true },
    });
    expect(result.current).toBe(false);
    act(() => jest.advanceTimersByTime(250));
    expect(result.current).toBe(true);

    rerender({ active: false });
    act(() => jest.advanceTimersByTime(300));
    expect(result.current).toBe(true); // shown 300 ms ago: kept for the 400 ms minimum
    act(() => jest.advanceTimersByTime(100));
    expect(result.current).toBe(false);
  });

  it('never shows for work that finishes within the delay', () => {
    const { result, rerender } = renderHook(({ active }) => useDelayedFlag(active, 250), {
      initialProps: { active: true },
    });
    act(() => jest.advanceTimersByTime(200));
    rerender({ active: false });
    act(() => jest.advanceTimersByTime(1000));
    expect(result.current).toBe(false);
  });
});

describe('usePresence', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('keeps the element mounted while it plays its exit animation', () => {
    const { result, rerender } = renderHook(({ visible }) => usePresence(visible, 250), {
      initialProps: { visible: false },
    });
    expect(result.current).toEqual({ mounted: false, leaving: false });

    rerender({ visible: true });
    expect(result.current.mounted).toBe(true);
    act(() => jest.advanceTimersByTime(0));

    rerender({ visible: false });
    expect(result.current).toEqual({ mounted: true, leaving: true });
    act(() => jest.advanceTimersByTime(250));
    expect(result.current).toEqual({ mounted: false, leaving: false });
  });
});
