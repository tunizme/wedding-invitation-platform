'use client';
import { useEffect, useRef } from 'react';
import Moveable from 'react-moveable';
import type { Able, MoveableManagerInterface } from 'react-moveable';
import { Move, RotateCw } from 'lucide-react';
import type { Box } from '../document/types';
import type { CanvasNode } from '../document/editor-document';
import { GestureSession } from './editor-commands';
import { boxTransform } from '../renderer/primitives';
import styles from './geometry-controls.module.css';
import { createTextMeasurement } from './text-measurement';

const textHandles: Able = {
  name: 'textHandles',
  always: true,
  render(moveable: MoveableManagerInterface) {
    const { pos3, pos4 } = moveable.state;
    const scale = moveable.props.zoom ?? 1;
    const centerX = (pos3[0] + pos4[0]) / 2;
    const bottom = (pos3[1] + pos4[1]) / 2;
    return (
      <div key="text-handles">
        <button
          type="button"
          className={`moveable-edgeDraggable ${styles.textHandle}`}
          aria-label="Di chuyển văn bản"
          title="Kéo để di chuyển; dùng phím mũi tên để điều chỉnh"
          style={{
            left: centerX - 16 * scale,
            top: bottom + 38 * scale,
            transform: `translate(-50%, -50%) scale(${scale})`,
          }}
          onKeyDown={(event) => {
            const distance = event.shiftKey ? 50 : 10;
            const directions: Record<string, [number, number]> = {
              ArrowLeft: [-distance, 0],
              ArrowRight: [distance, 0],
              ArrowUp: [0, -distance],
              ArrowDown: [0, distance],
            };
            const delta = directions[event.key];
            if (!delta) return;
            event.preventDefault();
            event.stopPropagation();
            moveable.request(
              'draggable',
              { deltaX: delta[0], deltaY: delta[1] },
              true,
            );
          }}
        >
          <Move size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`moveable-rotation-control ${styles.textHandle} ${styles.rotateHandle}`}
          aria-label="Xoay văn bản"
          title="Kéo để xoay; dùng phím trái/phải để điều chỉnh"
          style={{
            left: centerX + 16 * scale,
            top: bottom + 38 * scale,
            transform: `translate(-50%, -50%) scale(${scale})`,
          }}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            event.stopPropagation();
            const angle = event.shiftKey ? 15 : 1;
            moveable.request(
              'rotatable',
              {
                deltaRotate: event.key === 'ArrowLeft' ? -angle : angle,
              },
              true,
            );
          }}
        >
          <RotateCw size={16} aria-hidden="true" />
        </button>
        <span
          className={styles.rotationAngle}
          aria-hidden="true"
          style={{
            left: centerX + 46 * scale,
            top: bottom + 38 * scale,
            transform: `translateY(-50%) scale(${scale})`,
            transformOrigin: 'left center',
          }}
        >
          0°
        </span>
      </div>
    );
  },
};

export function GeometryControls({
  target,
  box,
  zoom,
  rootContainer,
  text = false,
  textNode,
  onCommit,
  onBusy,
  onError,
}: {
  target: HTMLElement | null;
  box: Box;
  zoom: number;
  rootContainer: HTMLElement | null;
  text?: boolean;
  textNode?: CanvasNode;
  onCommit: (box: Box) => void;
  onBusy: (busy: boolean) => void;
  onError: (message: string) => void;
}) {
  const session = useRef<GestureSession | null>(null),
    pending = useRef<Box | null>(null),
    moveable = useRef<Moveable>(null);
  const textMeasurement =
    useRef<ReturnType<typeof createTextMeasurement>>(null);
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
  function rotationFeedback(rotation: number | null) {
    const controls = moveable.current?.getControlBoxElement();
    if (controls)
      controls.dataset.rotationAligned = String(
        rotation !== null && Math.abs(rotation) < 0.001,
      );
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
    rotationFeedback(null);
    const value = session.current?.commit();
    session.current = null;
    pending.current = null;
    textMeasurement.current?.dispose();
    textMeasurement.current = null;
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
      rotationFeedback(null);
      const original = session.current?.cancel();
      session.current = null;
      pending.current = null;
      textMeasurement.current?.dispose();
      textMeasurement.current = null;
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
      textMeasurement.current?.dispose();
      textMeasurement.current = null;
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
      className={[styles.rotationFeedback, text && styles.textSelection]
        .filter(Boolean)
        .join(' ')}
      ables={text ? [textHandles] : []}
      origin={!text}
      renderDirections={text ? ['nw', 'w', 'sw', 'ne', 'e', 'se'] : undefined}
      rotationPosition={text ? 'none' : 'top'}
      draggable
      resizable
      rotatable
      snappable={['rotatable']}
      snapRotationDegrees={[0]}
      snapRotationThreshold={4}
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
        textMeasurement.current?.dispose();
        textMeasurement.current = textNode
          ? createTextMeasurement(textNode)
          : null;
        if (textMeasurement.current)
          event.setMin([
            textMeasurement.current.minWidth,
            textMeasurement.current.lineHeight,
          ]);
        event.set([box.width, box.height]);
        if (event.dragStart) event.dragStart.set([box.x, box.y]);
      }}
      onBeforeResize={(event) => {
        const measurement = textMeasurement.current;
        if (!measurement) return;
        const width = Math.max(event.boundingWidth, measurement.minWidth);
        event.setSize([
          width,
          Math.max(event.boundingHeight, measurement.heightAt(width)),
        ]);
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
        rotationFeedback(box.rotation);
        event.set(box.rotation);
        if (event.dragStart) event.dragStart.set([box.x, box.y]);
      }}
      onRotate={(event) => {
        if (pending.current) {
          const rotation =
            ((((event.beforeRotate + 180) % 360) + 360) % 360) - 180;
          preview({
            ...pending.current,
            rotation,
          });
          rotationFeedback(rotation);
        }
      }}
      onRotateEnd={end}
    />
  );
}
