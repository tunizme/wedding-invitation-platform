import { describe, it, expect } from 'vitest';
import { GestureSession } from '../../src/features/invitation-builder/editor/editor-commands';
describe('geometry gesture lifetime', () => {
  it('keeps previews transient, commits once and rolls back cancellation', () => {
    const box = { x: 20, y: 20, width: 100, height: 100, rotation: 0 };
    const gesture = new GestureSession(box);
    for (let x = 1; x <= 20; x++) gesture.preview({ ...box, x: box.x + x });
    expect(box.x).toBe(20);
    expect(gesture.commit()).toMatchObject({ x: 40 });
    expect(gesture.commit()).toBeNull();
    const cancelled = new GestureSession(box);
    cancelled.preview({ ...box, x: 200 });
    expect(cancelled.cancel()).toEqual(box);
    expect(cancelled.commit()).toBeNull();
    expect(new GestureSession(box).commit()).toBeNull();
  });
});
