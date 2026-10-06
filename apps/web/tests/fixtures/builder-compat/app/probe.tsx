'use client';

import {
  Editor,
  Frame,
  useEditor,
  useNode,
  type SerializedNodes,
} from '@craftjs/core';
import {
  StrictMode,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Moveable from 'react-moveable';

const NODE = 'a550e840-e29b-41d4-a716-446655440001';
interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}
const INITIAL: Geometry = {
  x: 100,
  y: 110,
  width: 140,
  height: 90,
  rotation: 30,
};
const initialNodes: SerializedNodes = {
  ROOT: {
    // Craft runtime uses null for ROOT; its 0.2.12 declaration says string.
    parent: null as unknown as string,
    type: { resolvedName: 'WorkareaRoot' },
    isCanvas: true,
    props: {},
    displayName: 'WorkareaRoot',
    custom: {},
    hidden: false,
    nodes: [NODE],
    linkedNodes: {},
  },
  [NODE]: {
    type: { resolvedName: 'Box' },
    isCanvas: false,
    props: INITIAL,
    displayName: 'Box',
    custom: {},
    parent: 'ROOT',
    hidden: false,
    nodes: [],
    linkedNodes: {},
  },
};
function transform(geometry: Geometry) {
  return `translate(${geometry.x}px, ${geometry.y}px) rotate(${geometry.rotation}deg)`;
}

function WorkareaRoot({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
function Box(props: Geometry) {
  const {
    connectors: { connect },
    id,
  } = useNode();
  const { actions } = useEditor();
  return (
    <div
      ref={(element) => {
        if (element) connect(element);
      }}
      data-testid="target"
      onClick={() => actions.selectNode(id)}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: props.width,
        height: props.height,
        transform: transform(props),
        transformOrigin: '50% 50%',
        background: '#dbbaca',
        boxSizing: 'border-box',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      Thiệp cưới
    </div>
  );
}

function Workarea() {
  const { actions, query, geometry, selected, canUndo, canRedo } = useEditor(
    (state, query) => ({
      geometry: state.nodes[NODE]?.data.props as Geometry | undefined,
      selected: state.events.selected.has(NODE),
      canUndo: query.history.canUndo(),
      canRedo: query.history.canRedo(),
    }),
  );
  const [zoom, setZoom] = useState(1);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [serialized, setSerialized] = useState('');
  const [commits, setCommits] = useState(0);
  const pending = useRef<Geometry | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [rootContainer, setRootContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const attachViewport = useCallback((element: HTMLDivElement | null) => {
    viewport.current = element;
    setRootContainer(element);
  }, []);
  const moveable = useRef<Moveable>(null);
  useEffect(() => {
    setTarget(
      selected
        ? (viewport.current?.querySelector<HTMLElement>(
            '[data-testid=target]',
          ) ?? null)
        : null,
    );
  }, [selected]);
  useEffect(() => {
    moveable.current?.updateRect();
  }, [geometry, zoom]);
  return (
    <>
      <div style={{ padding: 16, display: 'flex', gap: 12 }}>
        <label>
          Zoom{' '}
          <select
            aria-label="Zoom"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          >
            {[0.5, 1, 2].map((value) => (
              <option value={value} key={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => actions.history.undo()} disabled={!canUndo}>
          Undo
        </button>
        <button onClick={() => actions.history.redo()} disabled={!canRedo}>
          Redo
        </button>
        <button onClick={() => setSerialized(query.serialize())}>
          Serialize
        </button>
        <button
          onClick={() => actions.deserialize(serialized)}
          disabled={!serialized}
        >
          Load
        </button>
      </div>
      <output data-testid="geometry">
        {JSON.stringify(geometry ?? INITIAL)}
      </output>
      <output data-testid="commits">{commits}</output>
      <textarea
        aria-label="Serialized document"
        readOnly
        value={serialized}
        style={{ width: 1, height: 1, opacity: 0 }}
      />
      <div
        ref={attachViewport}
        style={{ margin: 32, position: 'relative', width: 780, height: 900 }}
      >
        <div
          data-testid="canvas"
          style={{
            position: 'relative',
            width: 390,
            height: 440,
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            background: '#faf5ed',
          }}
        >
          <Frame data={initialNodes} />
          <Moveable
            ref={moveable}
            target={target}
            resizable
            draggable
            rotatable
            zoom={1 / zoom}
            rootContainer={rootContainer}
            renderDirections={['nw', 'se']}
            throttleResize={0}
            onResizeStart={(event) => {
              if (!geometry) return;
              pending.current = { ...geometry };
              event.set([geometry.width, geometry.height]);
              if (event.dragStart)
                event.dragStart.set([geometry.x, geometry.y]);
            }}
            onResize={(event) => {
              if (!pending.current) return;
              pending.current = {
                ...pending.current,
                width: event.width,
                height: event.height,
                x: event.drag.beforeTranslate[0],
                y: event.drag.beforeTranslate[1],
              };
              event.target.style.width = `${event.width}px`;
              event.target.style.height = `${event.height}px`;
              event.target.style.transform = transform(pending.current);
            }}
            onResizeEnd={(event) => {
              if (event.isDrag && pending.current) {
                const value = { ...pending.current };
                actions.setProp(NODE, (props: Geometry) =>
                  Object.assign(props, value),
                );
                setCommits((count) => count + 1);
              }
              pending.current = null;
            }}
          />
        </div>
      </div>
    </>
  );
}

export default function Compatibility() {
  const [generation, setGeneration] = useState(0);
  return (
    <StrictMode>
      <button onClick={() => setGeneration((count) => count + 1)}>
        Remount editor
      </button>
      <Editor key={generation} resolver={{ WorkareaRoot, Box }}>
        <Workarea />
      </Editor>
    </StrictMode>
  );
}
