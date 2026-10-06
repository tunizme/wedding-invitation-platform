'use client';
import { useEffect, useRef } from 'react';
import Moveable from 'react-moveable';
import type { Box } from '../document/types';
import { GestureSession } from './commands';
import { boxTransform } from '../renderer/primitives';

export function GeometryControls({
  target,
  box,
  zoom,
  rootContainer,
  onCommit,
  onBusy,
  onError,
}: {
  target: HTMLElement | null;
  box: Box;
  zoom: number;
  rootContainer: HTMLElement | null;
  onCommit: (box: Box) => void;
  onBusy: (busy: boolean) => void;
  onError: (message: string) => void;
}) {
  const session = useRef<GestureSession | null>(null),
    pending = useRef<Box | null>(null),
    moveable = useRef<Moveable>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    targetRef.current = target;
  }, [target]);
  function paint(value: Box) {
    const target = targetRef.current;
    if (target) {
      target.style.width = `${value.width}px`;
      target.style.height = `${value.height}px`;
      target.style.transform = boxTransform(value);
    }
  }
  function start() {
    session.current = new GestureSession(box);
    pending.current = { ...box };
    onBusy(true);
  }
  function preview(value: Box) {
    pending.current = value;
    session.current?.preview(value);
    paint(value);
  }
  function end() {
    const value = session.current?.commit();
    session.current = null;
    pending.current = null;
    onBusy(false);
    if (value) {
      try {
        onCommit(value);
      } catch {
        paint(box);
        onError('Kích thước hoặc vị trí vượt giới hạn cho phép.');
      }
    } else paint(box);
  }
  useEffect(() => {
    moveable.current?.updateRect();
  }, [box, zoom, target]);
  useEffect(() => {
    const cancel = (event: KeyboardEvent | Event) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      const original = session.current?.cancel();
      session.current = null;
      pending.current = null;
      if (original && target) {
        target.style.width = `${original.width}px`;
        target.style.height = `${original.height}px`;
        target.style.transform = boxTransform(original);
        onBusy(false);
        moveable.current?.stopDrag();
      }
    };
    window.addEventListener('keydown', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('keydown', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [target, onBusy]);
  return (
    <Moveable
      ref={moveable}
      target={target}
      rootContainer={rootContainer}
      draggable
      resizable
      rotatable
      zoom={1 / zoom}
      throttleDrag={0}
      throttleResize={0}
      throttleRotate={0}
      onDragStart={(event) => {
        start();
        event.set([box.x, box.y]);
      }}
      onDrag={(event) => {
        if (pending.current)
          preview({
            ...pending.current,
            x: event.beforeTranslate[0],
            y: event.beforeTranslate[1],
          });
      }}
      onDragEnd={end}
      onResizeStart={(event) => {
        start();
        event.set([box.width, box.height]);
        if (event.dragStart) event.dragStart.set([box.x, box.y]);
      }}
      onResize={(event) => {
        if (pending.current)
          preview({
            ...pending.current,
            width: event.width,
            height: event.height,
            x: event.drag.beforeTranslate[0],
            y: event.drag.beforeTranslate[1],
          });
      }}
      onResizeEnd={end}
      onRotateStart={(event) => {
        start();
        event.set(box.rotation);
        if (event.dragStart) event.dragStart.set([box.x, box.y]);
      }}
      onRotate={(event) => {
        if (pending.current)
          preview({
            ...pending.current,
            rotation: ((((event.beforeRotate + 180) % 360) + 360) % 360) - 180,
          });
      }}
      onRotateEnd={end}
    />
  );
}
