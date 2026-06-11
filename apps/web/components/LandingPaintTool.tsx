"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { LANDING_PAINT_LOCKED } from "@/lib/landing-edit-mode";

const STORAGE_KEY = "omnichat-landing-paint";
const BAKED_PAINT_SRC = "/landing-paint.png";

type Point = { x: number; y: number };

function loadSavedImage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function initialPaintSource(): string {
  return loadSavedImage() ?? BAKED_PAINT_SRC;
}

function saveImage(dataUrl: string) {
  try {
    localStorage.setItem(STORAGE_KEY, dataUrl);
  } catch {
    /* quota */
  }
}

type Props = {
  stageRef: RefObject<HTMLDivElement | null>;
};

function LandingPaintBaked() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/landing-paint.png" className="landing-paint-image" alt="" aria-hidden />
  );
}

function LandingPaintEditor({ stageRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(false);
  const [color, setColor] = useState("#1a1a1a");
  const [size, setSize] = useState("8");
  const [eraser, setEraser] = useState(false);
  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const scheduleSave = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        saveImage(canvas.toDataURL("image/png"));
      } catch {
        /* empty */
      }
    }, 400);
  }, []);

  const syncCanvasSize = useCallback(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;

    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const snapshot =
      canvas.width > 0 ? canvas.toDataURL("image/png") : loadSavedImage() ?? BAKED_PAINT_SRC;

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (snapshot) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, w, h);
      img.src = snapshot;
    }
  }, [stageRef]);

  useEffect(() => {
    syncCanvasSize();
    setReady(true);

    const stage = stageRef.current;
    if (!stage) return;

    const ro = new ResizeObserver(() => syncCanvasSize());
    ro.observe(stage);
    window.addEventListener("resize", syncCanvasSize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncCanvasSize);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [stageRef, syncCanvasSize]);

  useEffect(() => {
    if (!ready) return;
    const source = initialPaintSource();
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!source || !canvas || !stage) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, stage.clientWidth, stage.clientHeight);
    img.src = source;
  }, [ready, stageRef]);

  const canvasPoint = useCallback((clientX: number, clientY: number): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const strokeTo = useCallback(
    (point: Point) => {
      const canvas = canvasRef.current;
      const last = lastPointRef.current;
      if (!canvas || !last) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const brush = Number(size);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = brush;

      if (eraser) {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = color;
      }

      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      lastPointRef.current = point;
    },
    [color, eraser, size],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!active) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const point = canvasPoint(e.clientX, e.clientY);
      if (!point) return;
      drawingRef.current = true;
      lastPointRef.current = point;

      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;

      const brush = Number(size);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = brush;
      if (eraser) {
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = color;
      }
      ctx.beginPath();
      ctx.arc(point.x, point.y, brush / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    },
    [active, canvasPoint, color, eraser, size],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current || !active) return;
      const point = canvasPoint(e.clientX, e.clientY);
      if (!point) return;
      strokeTo(point);
    },
    [active, canvasPoint, strokeTo],
  );

  const endStroke = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      lastPointRef.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
      scheduleSave();
    },
    [scheduleSave],
  );

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, stage.clientWidth, stage.clientHeight);
    localStorage.removeItem(STORAGE_KEY);
  }, [stageRef]);

  const editorUi = (
    <div className={`landing-paint-editor${open ? " landing-paint-editor--open" : ""}`}>
      <button type="button" className="landing-paint-editor-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? "Hide paint tools" : "Paint"}
      </button>

      {open ? (
        <div className="landing-paint-editor-panel" role="dialog" aria-label="Paint on landing page">
          <div className="landing-color-editor-head">
            <h2 className="landing-color-editor-title">Paint</h2>
            <p className="landing-color-editor-sub">
              {active
                ? "Draw on the purple frame & green panel · saved in your browser"
                : "Start painting to draw anywhere on screen"}
            </p>
          </div>

          <button
            type="button"
            className={`landing-color-btn ${active ? "landing-color-btn--lock" : "landing-color-btn--primary"}`}
            onClick={() => setActive((v) => !v)}
          >
            {active ? "Stop painting" : "Start painting"}
          </button>

          <div className="landing-color-field">
            <div className="landing-color-field-head">
              <span className="landing-color-field-label">Brush color</span>
            </div>
            <div className="landing-color-field-row">
              <input
                type="color"
                className="landing-color-picker"
                value={color}
                disabled={eraser}
                onChange={(e) => setColor(e.target.value)}
                aria-label="Brush color"
              />
              <input
                type="text"
                className="landing-color-hex"
                value={color}
                disabled={eraser}
                onChange={(e) => setColor(e.target.value)}
                spellCheck={false}
                aria-label="Brush color hex"
              />
            </div>
          </div>

          <div className="landing-color-field">
            <div className="landing-color-field-head">
              <span className="landing-color-field-label">Brush size</span>
              <span className="landing-color-field-hint">{size}px</span>
            </div>
            <input
              type="range"
              className="landing-color-slider"
              min={2}
              max={48}
              value={size}
              onChange={(e) => setSize(e.target.value)}
              aria-label="Brush size"
            />
          </div>

          <div className="landing-logo-editor-actions">
            <button
              type="button"
              className={`landing-color-btn landing-color-btn--ghost${eraser ? " landing-paint-tool-btn--active" : ""}`}
              onClick={() => setEraser((v) => !v)}
            >
              {eraser ? "Eraser on" : "Eraser"}
            </button>
            <button type="button" className="landing-color-btn landing-color-btn--ghost" onClick={clearCanvas}>
              Clear all
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );

  const portalTarget =
    mounted && typeof document !== "undefined"
      ? (document.querySelector(".landing-stage") ?? document.body)
      : null;

  return (
    <>
      <canvas
        ref={canvasRef}
        className={`landing-paint-canvas${active ? " landing-paint-canvas--active" : ""}`}
        aria-hidden={!active || !ready}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
      />

      {portalTarget ? createPortal(editorUi, portalTarget) : null}
    </>
  );
}

export function LandingPaintTool({ stageRef }: Props) {
  if (LANDING_PAINT_LOCKED) return <LandingPaintBaked />;
  return <LandingPaintEditor stageRef={stageRef} />;
}
