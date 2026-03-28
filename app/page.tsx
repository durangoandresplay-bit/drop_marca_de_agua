'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Download, Undo, Image as ImageIcon, MousePointer2, Trash2, Eraser } from 'lucide-react';

export default function CloneStampApp() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [brushSize, setBrushSize] = useState(50);
  const [opacity, setOpacity] = useState(100);
  const [hardness, setHardness] = useState(50);
  const [sourcePoint, setSourcePoint] = useState<{ x: number; y: number } | null>(null);
  const [currentSourcePos, setCurrentSourcePos] = useState<{ x: number; y: number } | null>(null);
  const [isAltPressed, setIsAltPressed] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [canvasScale, setCanvasScale] = useState(1);
  const [isHovering, setIsHovering] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const offsetRef = useRef<{ x: number; y: number } | null>(null);

  const updateCanvasScale = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0) {
      setCanvasScale(canvas.width / rect.width);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('resize', updateCanvasScale);
    return () => window.removeEventListener('resize', updateCanvasScale);
  }, [updateCanvasScale]);

  useEffect(() => {
    if (image) {
      // Usamos un pequeño retraso para asegurar que el canvas ya esté renderizado en el DOM
      setTimeout(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = image.width;
        canvas.height = image.height;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        ctx.drawImage(image, 0, 0);

        historyRef.current = [ctx.getImageData(0, 0, canvas.width, canvas.height)];
        setSourcePoint(null);
        
        const sCanvas = document.createElement('canvas');
        sCanvas.width = image.width;
        sCanvas.height = image.height;
        sourceCanvasRef.current = sCanvas;
        
        updateCanvasScale();
      }, 50);
    }
  }, [image, updateCanvasScale]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        e.preventDefault();
        setIsAltPressed(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        handleUndo();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        setIsAltPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        setImage(img);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const getCanvasPoint = (e: React.MouseEvent | MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const point = getCanvasPoint(e);
    if (!point) return;

    if (isAltPressed) {
      setSourcePoint(point);
      return;
    }

    if (!sourcePoint) {
      return;
    }

    isDrawingRef.current = true;
    lastPointRef.current = point;
    offsetRef.current = {
      x: sourcePoint.x - point.x,
      y: sourcePoint.y - point.y
    };

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (canvas && ctx) {
      historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (historyRef.current.length > 20) {
        historyRef.current.shift();
      }
      
      const sCtx = sourceCanvasRef.current?.getContext('2d');
      if (sCtx) {
        sCtx.drawImage(canvas, 0, 0);
      }
    }

    draw(point.x, point.y, point.x, point.y);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
    
    const point = getCanvasPoint(e);
    if (!point) return;

    if (!isDrawingRef.current || !lastPointRef.current || !offsetRef.current) return;

    draw(lastPointRef.current.x, lastPointRef.current.y, point.x, point.y);
    lastPointRef.current = point;
  };

  const handleMouseUp = () => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
    setCurrentSourcePos(null);
  };

  const draw = (startX: number, startY: number, endX: number, endY: number) => {
    const canvas = canvasRef.current;
    const sourceCanvas = sourceCanvasRef.current;
    if (!canvas || !sourceCanvas || !offsetRef.current) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const distance = Math.hypot(endX - startX, endY - startY);
    const spacing = Math.max(1, brushSize * 0.15);
    const steps = Math.ceil(distance / spacing);

    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      const x = startX + (endX - startX) * t;
      const y = startY + (endY - startY) * t;
      const sX = x + offsetRef.current.x;
      const sY = y + offsetRef.current.y;

      drawDab(ctx, sourceCanvas, x, y, sX, sY);
      
      if (i === steps) {
        setCurrentSourcePos({ x: sX, y: sY });
      }
    }
  };

  const drawDab = (
    ctx: CanvasRenderingContext2D,
    sourceCanvas: HTMLCanvasElement,
    destX: number,
    destY: number,
    sourceX: number,
    sourceY: number
  ) => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = brushSize;
    tempCanvas.height = brushSize;
    const tCtx = tempCanvas.getContext('2d');
    if (!tCtx) return;

    tCtx.drawImage(
      sourceCanvas,
      sourceX - brushSize / 2,
      sourceY - brushSize / 2,
      brushSize,
      brushSize,
      0,
      0,
      brushSize,
      brushSize
    );

    const hard = Math.min(0.99, hardness / 100);
    const innerRadius = (brushSize / 2) * hard;
    const outerRadius = brushSize / 2;

    const gradient = tCtx.createRadialGradient(
      brushSize / 2,
      brushSize / 2,
      innerRadius,
      brushSize / 2,
      brushSize / 2,
      outerRadius
    );
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    tCtx.globalCompositeOperation = 'destination-in';
    tCtx.fillStyle = gradient;
    tCtx.fillRect(0, 0, brushSize, brushSize);

    ctx.globalAlpha = opacity / 100;
    ctx.drawImage(tempCanvas, destX - brushSize / 2, destY - brushSize / 2);
    ctx.globalAlpha = 1;
  };

  const handleUndo = () => {
    if (historyRef.current.length <= 1) return;
    
    historyRef.current.pop();
    
    const previousState = historyRef.current[historyRef.current.length - 1];
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    
    if (canvas && ctx && previousState) {
      ctx.putImageData(previousState, 0, 0);
    }
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const link = document.createElement('a');
    link.download = 'watermark-removed.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleClearImage = () => {
    setImage(null);
    setSourcePoint(null);
    setCurrentSourcePos(null);
    historyRef.current = [];
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const visualBrushSize = brushSize / canvasScale;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 flex font-sans selection:bg-blue-500/30">
      <aside className="w-80 bg-zinc-900 border-r border-zinc-800 flex flex-col h-screen shrink-0 z-10 shadow-2xl">
        <div className="p-6 border-b border-zinc-800">
          <h1 className="text-xl font-semibold text-zinc-100 flex items-center gap-3">
            <div className="bg-[#6338f0] p-1.5 rounded-lg flex items-center justify-center">
              <Eraser className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            KARAQUITA LA MEJOR IPS
          </h1>
          <p className="text-sm text-zinc-500 mt-2">By ING ANDRES DURANGO</p>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-8 custom-scrollbar">
          <div className="space-y-3">
            <label className="flex flex-col items-center justify-center w-full h-32 px-4 transition bg-zinc-950/50 border-2 border-zinc-800 border-dashed rounded-xl cursor-pointer hover:border-zinc-600 hover:bg-zinc-900 focus:outline-none group">
              <Upload className="w-8 h-8 text-zinc-500 group-hover:text-blue-400 transition-colors mb-2" />
              <span className="font-medium text-zinc-400 group-hover:text-zinc-300 transition-colors">
                {image ? 'Cambiar Imagen' : 'Subir Imagen'}
              </span>
              <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
            </label>
            {image && (
              <button
                onClick={handleClearImage}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors text-sm font-medium border border-red-500/20"
              >
                <Trash2 className="w-4 h-4" />
                Limpiar Imagen
              </button>
            )}
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-zinc-300">Tamaño del Pincel</label>
                <span className="text-xs font-mono text-zinc-500 bg-zinc-950 px-2 py-1 rounded-md">{brushSize}px</span>
              </div>
              <input type="range" min="1" max="200" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500" />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-zinc-300">Opacidad</label>
                <span className="text-xs font-mono text-zinc-500 bg-zinc-950 px-2 py-1 rounded-md">{opacity}%</span>
              </div>
              <input type="range" min="1" max="100" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500" />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-zinc-300">Dureza</label>
                <span className="text-xs font-mono text-zinc-500 bg-zinc-950 px-2 py-1 rounded-md">{hardness}%</span>
              </div>
              <input type="range" min="0" max="100" value={hardness} onChange={(e) => setHardness(Number(e.target.value))} className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500" />
            </div>
          </div>

          <div className="bg-zinc-950/50 p-4 rounded-xl border border-zinc-800/50">
            <h3 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
              <MousePointer2 className="w-4 h-4 text-blue-400" />
              Instrucciones
            </h3>
            <ul className="text-xs text-zinc-400 space-y-2.5">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5">•</span>
                <span>Mantén presionado <kbd className="bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 rounded text-zinc-300 font-sans shadow-sm">Alt</kbd> y haz clic para establecer el punto de origen.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5">•</span>
                <span>Haz clic y arrastra sobre la marca de agua para clonar píxeles del origen.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5">•</span>
                <span>Ajusta la configuración del pincel para una mezcla perfecta.</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="p-6 border-t border-zinc-800 grid grid-cols-2 gap-3 bg-zinc-900">
          <button onClick={handleUndo} disabled={historyRef.current.length <= 1} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-100 rounded-lg transition-colors text-sm font-medium shadow-sm">
            <Undo className="w-4 h-4" />
            Deshacer
          </button>
          <button onClick={handleDownload} disabled={!image} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm font-medium shadow-sm">
            <Download className="w-4 h-4" />
            Guardar
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative overflow-hidden bg-zinc-950 bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:24px_24px]">
        <div className="flex-1 flex items-center justify-center p-8 relative">
          {!image ? (
            <div className="text-center max-w-md mx-auto bg-zinc-900/80 backdrop-blur-sm p-8 rounded-2xl border border-zinc-800 shadow-xl">
              <div className="w-20 h-20 bg-zinc-950 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-zinc-800 shadow-inner">
                <ImageIcon className="w-8 h-8 text-zinc-600" />
              </div>
              <h2 className="text-xl font-medium text-zinc-200 mb-2">Ninguna imagen seleccionada</h2>
              <p className="text-zinc-500 text-sm">Sube una imagen desde la barra lateral para empezar a eliminar marcas de agua con la herramienta de tampón de clonar.</p>
            </div>
          ) : (
            <div 
              className="relative inline-block shadow-2xl ring-1 ring-zinc-800 rounded-sm bg-zinc-900"
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => { setIsHovering(false); handleMouseUp(); }}
            >
              <canvas
                ref={canvasRef}
                className="max-w-full max-h-[calc(100vh-4rem)] object-contain cursor-none block"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
              />
              
              {sourcePoint && !isDrawingRef.current && (
                <div
                  className="absolute pointer-events-none z-10"
                  style={{
                    left: `${(sourcePoint.x / (canvasRef.current?.width || 1)) * 100}%`,
                    top: `${(sourcePoint.y / (canvasRef.current?.height || 1)) * 100}%`,
                    transform: 'translate(-50%, -50%)'
                  }}
                >
                  <div className="w-5 h-5 relative">
                    <div className="absolute top-1/2 left-0 w-full h-[1.5px] bg-white shadow-[0_0_2px_rgba(0,0,0,0.8)]" />
                    <div className="absolute left-1/2 top-0 h-full w-[1.5px] bg-white shadow-[0_0_2px_rgba(0,0,0,0.8)]" />
                  </div>
                </div>
              )}

              {currentSourcePos && isDrawingRef.current && (
                <div
                  className="absolute pointer-events-none z-10"
                  style={{
                    left: `${(currentSourcePos.x / (canvasRef.current?.width || 1)) * 100}%`,
                    top: `${(currentSourcePos.y / (canvasRef.current?.height || 1)) * 100}%`,
                    transform: 'translate(-50%, -50%)'
                  }}
                >
                  <div className="w-5 h-5 relative">
                    <div className="absolute top-1/2 left-0 w-full h-[1.5px] bg-white shadow-[0_0_2px_rgba(0,0,0,0.8)]" />
                    <div className="absolute left-1/2 top-0 h-full w-[1.5px] bg-white shadow-[0_0_2px_rgba(0,0,0,0.8)]" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {isHovering && mousePos && image && (
        <div
          className="fixed pointer-events-none z-50 rounded-full border-[1.5px] border-white shadow-[0_0_3px_rgba(0,0,0,0.8)] transition-transform duration-75 ease-out"
          style={{
            width: Math.max(4, visualBrushSize),
            height: Math.max(4, visualBrushSize),
            left: mousePos.x - Math.max(4, visualBrushSize) / 2,
            top: mousePos.y - Math.max(4, visualBrushSize) / 2,
          }}
        >
          {isAltPressed && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-full h-[1.5px] bg-white shadow-[0_0_2px_rgba(0,0,0,0.8)]" />
              <div className="h-full w-[1.5px] bg-white shadow-[0_0_2px_rgba(0,0,0,0.8)] absolute" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
