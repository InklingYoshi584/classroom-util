import { useState, useRef, useEffect, useCallback } from 'react';
import { electronApi } from './lib/electronApi';
import './WhiteboardApp.css';

function withResolvers<T>(): { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void; reject: (reason?: any) => void } {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}


interface Point {
  x: number;
  y: number;
}

interface Stroke {
  id: number;
  points: Point[];
  color: string;
  thickness: number;
}

type ToolMode = 'select' | 'pen' | 'eraser';

const COLORS = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#06B6D4', '#3B82F6', '#8B5CF6', '#1F2937'];
const COLOR_LABELS = ['红', '橙', '黄', '绿', '青', '蓝', '紫', '黑'];
const DEFAULT_COLOR = '#EF4444';
const DEFAULT_THICKNESS = 3;
const ERASER_SIZE = 28;

interface WhiteboardAppProps {
  open: boolean;
  onClose: () => void;
}

function drawStrokesOnCtx(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  for (const s of strokes) {
    if (s.points.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.thickness;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

export function WhiteboardApp({ open, onClose }: WhiteboardAppProps) {
  const [expanded, setExpanded] = useState(false);
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [penColor, setPenColor] = useState(DEFAULT_COLOR);
  const [penThickness, setPenThickness] = useState(DEFAULT_THICKNESS);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [showPenOverlay, setShowPenOverlay] = useState(false);
  const [showEraserOverlay, setShowEraserOverlay] = useState(false);
  const [eraserPos, setEraserPos] = useState<Point | null>(null);
  const [clearProgress, setClearProgress] = useState(0);
  const [capturing, setCapturing] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nextIdRef = useRef(1);
  const clearDraggingRef = useRef(false);
  const clearProgressRef = useRef(0);
  const strokesRef = useRef<Stroke[]>([]);

  // Sync strokes to ref for render loop
  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  // If not open, reset and return nothing
  useEffect(() => {
    if (!open) {
      setStrokes([]);
      strokesRef.current = [];
      setToolMode('select');
      setExpanded(false);
      setBgImage(null);
      setShowPenOverlay(false);
      setShowEraserOverlay(false);
      setClearProgress(0);
      clearProgressRef.current = 0;
    }
  }, [open]);

  // Canvas rendering loop
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    let raf: number;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (bgImage) ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
      const allStrokes = strokesRef.current;
      drawStrokesOnCtx(ctx, allStrokes);

      // Draw in-progress stroke
      if (isDrawing && currentPoints.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
        for (let i = 1; i < currentPoints.length; i++) ctx.lineTo(currentPoints[i].x, currentPoints[i].y);
        ctx.strokeStyle = penColor;
        ctx.lineWidth = penThickness;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }

      // Eraser cursor
      if (toolMode === 'eraser' && eraserPos) {
        const ex = eraserPos.x;
        const ey = eraserPos.y;
        const r = ERASER_SIZE / 2;
        const grad = ctx.createRadialGradient(ex, ey, 0, ex, ey, r);
        grad.addColorStop(0, 'rgba(255,255,255,0.6)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(ex - r, ey - r, ERASER_SIZE, ERASER_SIZE);
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(ex - r, ey - r, ERASER_SIZE, ERASER_SIZE);
      }

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [open, bgImage, isDrawing, currentPoints, penColor, penThickness, toolMode, eraserPos]);

  const isToolbarClick = useCallback((e: React.MouseEvent) => {
    return !!(e.target as HTMLElement).closest('.whiteboard-toolbar');
  }, []);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isToolbarClick(e)) return;
    if (toolMode === 'select') return;
    if (toolMode === 'pen') {
      setIsDrawing(true);
      setCurrentPoints([{ x: e.clientX, y: e.clientY }]);
    }
    if (toolMode === 'eraser') {
      const ex = e.clientX;
      const ey = e.clientY;
      const r = ERASER_SIZE / 2;
      setStrokes(prev => {
        const filtered = prev.filter(s =>
          !s.points.some(p => Math.hypot(p.x - ex, p.y - ey) < r)
        );
        strokesRef.current = filtered;
        return filtered;
      });
    }
  }, [toolMode, isToolbarClick]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (toolMode === 'eraser') setEraserPos({ x: e.clientX, y: e.clientY });
    if (!isDrawing) return;
    setCurrentPoints(prev => [...prev, { x: e.clientX, y: e.clientY }]);
  }, [toolMode, isDrawing]);

  const handleCanvasMouseUp = useCallback(() => {
    if (!isDrawing) return;
    if (toolMode === 'pen' && currentPoints.length >= 2) {
      const newStroke: Stroke = {
        id: nextIdRef.current++,
        points: [...currentPoints],
        color: penColor,
        thickness: penThickness,
      };
      setStrokes(prev => {
        const updated = [...prev, newStroke];
        strokesRef.current = updated;
        return updated;
      });
    }
    setIsDrawing(false);
    setCurrentPoints([]);
  }, [isDrawing, toolMode, currentPoints, penColor, penThickness]);

  const handlePenClick = useCallback(() => {
    if (!expanded) {
      setExpanded(true);
      setToolMode('pen');
      setShowEraserOverlay(false);
      return;
    }
    if (toolMode === 'pen') {
      setShowPenOverlay(v => !v);
      setShowEraserOverlay(false);
      return;
    }
    setToolMode('pen');
    setShowPenOverlay(false);
    setShowEraserOverlay(false);
  }, [expanded, toolMode]);

  const handleEraserClick = useCallback(() => {
    if (toolMode === 'eraser') {
      setShowEraserOverlay(v => !v);
      setShowPenOverlay(false);
      return;
    }
    setToolMode('eraser');
    setShowPenOverlay(false);
    setShowEraserOverlay(false);
  }, [toolMode]);

  const handleSelectClick = useCallback(() => {
    setToolMode('select');
    setShowPenOverlay(false);
    setShowEraserOverlay(false);
  }, []);

  const handleLockClick = useCallback(async () => {
    setCapturing(true);
    setShowPenOverlay(false);
    setShowEraserOverlay(false);
    const overlay = document.querySelector('.whiteboard-overlay') as HTMLElement;
    if (overlay) overlay.style.display = 'none';
    // Wait for DOM to flush
    const { promise, resolve } = withResolvers<void>();
    requestAnimationFrame(() => resolve());
    await promise;
    const result = await electronApi.capturePage();
    if (overlay) overlay.style.display = '';
    setCapturing(false);
    if (result.ok && result.dataUrl) {
      const img = new Image();
      img.onload = () => setBgImage(img);
      img.src = result.dataUrl;
    }
  }, []);

  const handleSaveClick = useCallback(async () => {
    setCapturing(true);
    const overlay = document.querySelector('.whiteboard-overlay') as HTMLElement;
    let bgDataUrl: string | null = null;

    if (bgImage) {
      const c = document.createElement('canvas');
      c.width = bgImage.width;
      c.height = bgImage.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bgImage, 0, 0);
      drawStrokesOnCtx(ctx, strokesRef.current);
      bgDataUrl = c.toDataURL('image/png');
    } else {
      if (overlay) overlay.style.display = 'none';
      {
        const { promise, resolve } = withResolvers<void>();
        requestAnimationFrame(() => resolve());
        await promise;
      }
      const result = await electronApi.capturePage();
      if (overlay) overlay.style.display = '';
      if (result.ok && result.dataUrl) {
        const img = new Image();
        const { promise, resolve } = withResolvers<void>();
        img.onload = () => resolve();
        img.src = result.dataUrl;
        await promise;
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        drawStrokesOnCtx(ctx, strokesRef.current);
        bgDataUrl = c.toDataURL('image/png');
      }
    }
    setCapturing(false);
    if (bgDataUrl) await electronApi.saveScreenshot(bgDataUrl);
  }, [bgImage]);

  const handleCloseClick = useCallback(() => {
    onClose();
  }, [onClose]);

  // Clear slider logic
  const updateClearProgress = useCallback((e: React.MouseEvent) => {
    const track = e.currentTarget as HTMLElement;
    const rect = track.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    clearProgressRef.current = progress;
    setClearProgress(progress);
  }, []);

  const handleClearTrackMouseDown = useCallback((e: React.MouseEvent) => {
    clearDraggingRef.current = true;
    updateClearProgress(e);
  }, [updateClearProgress]);

  const handleClearTrackMouseMove = useCallback((e: React.MouseEvent) => {
    if (!clearDraggingRef.current) return;
    updateClearProgress(e);
  }, [updateClearProgress]);

  const handleClearTrackMouseUp = useCallback(() => {
    if (!clearDraggingRef.current) return;
    clearDraggingRef.current = false;
    if (clearProgressRef.current >= 0.95) {
      setStrokes([]);
      strokesRef.current = [];
    }
    setClearProgress(0);
    clearProgressRef.current = 0;
  }, []);

  if (!open) return null;

  return (
    <div className={`whiteboard-overlay ${toolMode !== 'select' ? 'active' : ''}`}>
      <canvas
        ref={canvasRef}
        className="whiteboard-canvas"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
      />

      {/* Toolbar */}
      <div className="whiteboard-toolbar">
        {/* Pen button */}
        <button
          className={`tool-btn ${toolMode === 'pen' ? 'active' : ''} ${!expanded ? 'tool-btn-collapsed' : ''}`}
          onClick={handlePenClick}
        >
          ✏️
          {!expanded && <span className="tool-label">批注</span>}
        </button>

        {expanded && (
          <>
            {/* Eraser */}
            <button className={`tool-btn ${toolMode === 'eraser' ? 'active' : ''}`} onClick={handleEraserClick}>
              🧹
            </button>
            {/* Select */}
            <button className={`tool-btn ${toolMode === 'select' ? 'active' : ''}`} onClick={handleSelectClick}>
              👆
            </button>
            {/* Lock */}
            <button className="tool-btn" onClick={handleLockClick} disabled={capturing}>
              🔒
            </button>
            {/* Save */}
            <button className="tool-btn" onClick={handleSaveClick} disabled={capturing}>
              💾
            </button>
            {/* Close */}
            <button className="tool-btn" onClick={handleCloseClick}>
              ✕
            </button>

            {/* Pen settings overlay */}
            {showPenOverlay && (
              <div className="pen-overlay">
                <label>粗细: {penThickness}px</label>
                <input type="range" min={1} max={20} value={penThickness}
                  onChange={e => setPenThickness(Number(e.target.value))} />
                <label>颜色</label>
                <div className="color-swatches">
                  {COLORS.map((c, i) => (
                    <div key={c}
                      className={`color-swatch ${penColor === c ? 'selected' : ''}`}
                      style={{ backgroundColor: c, color: c }}
                      onClick={() => setPenColor(c)}
                      title={COLOR_LABELS[i]}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Eraser clear-all overlay */}
            {showEraserOverlay && (
              <div className="eraser-overlay">
                <div className="hint">滑动以清除所有批注 →</div>
                <div className="clear-slider-track"
                  onMouseDown={handleClearTrackMouseDown}
                  onMouseMove={handleClearTrackMouseMove}
                  onMouseUp={handleClearTrackMouseUp}
                  onMouseLeave={handleClearTrackMouseUp}>
                  <div className="clear-slider-fill" style={{ width: `${clearProgress * 100}%` }} />
                  <div className="clear-slider-thumb"
                    style={{ left: `${clearProgress * 100}%` }}
                    onMouseDown={handleClearTrackMouseDown} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
