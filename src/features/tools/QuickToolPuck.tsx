import { useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { EditorStore } from "../../state/editorStore";

export type QuickToolPuckProps = Readonly<{
  store: EditorStore;
  onOpenBrushes: () => void;
}>;

type Offset = Readonly<{ x: number; y: number }>;

type Drag = Readonly<{
  pointerId: number;
  originX: number;
  originY: number;
  startX: number;
  startY: number;
}>;

/** Keeps the dial within reach of the drawing hand on either side. */
const MAX_OFFSET = 320;
/** Distance from the hub centre to each slot centre. */
const SLOT_RADIUS = 64;
/** Degrees clockwise from the top of the dial. */
const BRUSH_ANGLE = 0;
const ERASER_ANGLE = 60;
const COLOR_ANGLE = 120;
const GRIP_ANGLE = 180;
const UNDO_ANGLE = 240;
const REDO_ANGLE = 300;

export function QuickToolPuck({ store, onOpenBrushes }: QuickToolPuckProps) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const dragRef = useRef<Drag | null>(null);

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    dragRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      startX: offset.x,
      startY: offset.y,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const continueDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    setOffset({
      x: clamp(drag.startX + event.clientX - drag.originX),
      y: clamp(drag.startY + event.clientY - drag.originY),
    });
  };

  const endDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  const activeAngle = snapshot.tool === "eraser" ? ERASER_ANGLE : BRUSH_ANGLE;

  return (
    <div
      aria-label="Quick tools"
      className="quick-tool-puck"
      role="toolbar"
      style={
        {
          "--puck-offset-x": `${offset.x}px`,
          "--puck-offset-y": `${offset.y}px`,
        } as CSSProperties
      }
    >
      <svg
        aria-hidden="true"
        className="quick-tool-puck__arc"
        viewBox="0 0 208 208"
      >
        <circle
          cx="104"
          cy="104"
          r="101"
          strokeDasharray="106 529"
          transform={`rotate(${activeAngle - 120} 104 104)`}
        />
      </svg>
      <span aria-hidden="true" className="quick-tool-puck__hub">
        {snapshot.tool === "eraser" ? <EraserIcon /> : <BrushIcon />}
      </span>
      <button
        aria-label="Brush"
        aria-pressed={snapshot.tool === "brush"}
        className="quick-tool-puck__slot"
        onClick={() => store.setTool("brush")}
        style={slotPosition(BRUSH_ANGLE)}
        type="button"
      >
        <BrushIcon />
      </button>
      <button
        aria-label="Eraser"
        aria-pressed={snapshot.tool === "eraser"}
        className="quick-tool-puck__slot"
        onClick={() => store.setTool("eraser")}
        style={slotPosition(ERASER_ANGLE)}
        type="button"
      >
        <EraserIcon />
      </button>
      <button
        aria-label="Current color"
        className="quick-tool-puck__slot quick-tool-puck__slot--color"
        onClick={onOpenBrushes}
        style={
          {
            ...slotPosition(COLOR_ANGLE),
            "--puck-swatch": snapshot.brush.color,
          } as CSSProperties
        }
        type="button"
      >
        <span aria-hidden="true" className="quick-tool-puck__swatch" />
      </button>
      <button
        aria-label="Undo"
        className="quick-tool-puck__slot"
        disabled={!snapshot.canUndo}
        onClick={() => void store.undoLastMark()}
        style={slotPosition(UNDO_ANGLE)}
        type="button"
      >
        <UndoIcon />
      </button>
      <button
        aria-label="Redo"
        className="quick-tool-puck__slot"
        disabled={!snapshot.canRedo}
        onClick={() => void store.redoLastMark()}
        style={slotPosition(REDO_ANGLE)}
        type="button"
      >
        <RedoIcon />
      </button>
      <button
        aria-label="Move tools"
        className="quick-tool-puck__slot quick-tool-puck__grip"
        onPointerCancel={endDrag}
        onPointerDown={startDrag}
        onPointerMove={continueDrag}
        onPointerUp={endDrag}
        style={slotPosition(GRIP_ANGLE)}
        type="button"
      >
        <GripIcon />
      </button>
    </div>
  );
}

function slotPosition(angleDegrees: number): CSSProperties {
  const radians = (angleDegrees * Math.PI) / 180;
  return {
    "--slot-x": `${round(Math.sin(radians) * SLOT_RADIUS)}px`,
    "--slot-y": `${round(-Math.cos(radians) * SLOT_RADIUS)}px`,
  } as CSSProperties;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number): number {
  return Math.min(MAX_OFFSET, Math.max(-MAX_OFFSET, value));
}

function BrushIcon() {
  return (
    <svg className="quick-tool-puck__icon" viewBox="0 0 24 24">
      <path d="M17.5 3.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z" />
      <path d="M7.5 16.5c-1.4 1.4-1 3.5-3.5 4 .5-2.5 2.6-2.1 4-3.5Z" />
    </svg>
  );
}

function EraserIcon() {
  return (
    <svg className="quick-tool-puck__icon" viewBox="0 0 24 24">
      <path d="M9 20H5.5L4 18l9-9 5 5-6 6Z" />
      <path d="M9 20h9" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg className="quick-tool-puck__icon" viewBox="0 0 24 24">
      <path d="M8 8H15a4.5 4.5 0 0 1 0 9H9" />
      <path d="m11 5-3 3 3 3" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg className="quick-tool-puck__icon" viewBox="0 0 24 24">
      <path d="M16 8H9a4.5 4.5 0 0 0 0 9h6" />
      <path d="m13 5 3 3-3 3" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg className="quick-tool-puck__icon" viewBox="0 0 24 24">
      <circle cx="10" cy="8" r="1" />
      <circle cx="14" cy="8" r="1" />
      <circle cx="10" cy="12" r="1" />
      <circle cx="14" cy="12" r="1" />
      <circle cx="10" cy="16" r="1" />
      <circle cx="14" cy="16" r="1" />
    </svg>
  );
}
