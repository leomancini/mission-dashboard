import React, { useRef, useEffect, useState } from "react";
import styled from "styled-components";
import { Conrec } from "./conrec";

const Page = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  height: 100vh;
  padding: 12px;
  background: #000;
  overflow: hidden;

  @media (max-width: 900px) {
    flex-direction: column;
    justify-content: flex-start;
    height: auto;
    min-height: 100vh;
    overflow: auto;
    padding: 16px 0;
  }

  @media (max-width: 480px) {
    padding: 8px 0;
  }
`;

const Monitor = styled.div`
  position: relative;
  overflow: hidden;
  box-shadow: none;

  &::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: repeating-linear-gradient(
      0deg,
      rgba(0, 0, 0, 0.06) 0px,
      rgba(0, 0, 0, 0.06) 1px,
      transparent 1px,
      transparent 3px
    );
    pointer-events: none;
    z-index: 2;
  }

`;

const flicker = `
  @keyframes flicker {
    0% { opacity: 1; }
    37% { opacity: 1; }
    38% { opacity: 0.98; }
    39% { opacity: 1; }
    82% { opacity: 1; }
    83% { opacity: 0.97; }
    84% { opacity: 1; }
    100% { opacity: 1; }
  }
`;

const Canvas = styled.canvas`
  display: block;
  animation: flicker 12s infinite;
  ${flicker}
`;

const Noise = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 1;
  opacity: 0.06;
  filter: url(#noise);
  background: rgba(255, 255, 255, 0.5);
  mix-blend-mode: overlay;
`;

const FONT = "IBMPlexMono";
const BG = "#1A7EB8";
const FG = "#FFFFFF";
const GRID = "rgba(255, 255, 255, 0.45)";
const LINE_COLOR = "#FFFFFF";

// --- Simple noise function for terrain ---
function hash(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + 1013904223;
  h = h ^ (h >> 13);
  h = Math.imul(h, 1274126177);
  h = h ^ (h >> 16);
  return (h >>> 0) / 4294967295;
}

function drawVignette(ctx) {
  ctx.save();

  // Clip to the rounded screen area
  ctx.beginPath();
  ctx.roundRect(4, 4, REF_W - 8, REF_H - 8, 20);
  ctx.clip();

  // Draw a huge black rect around the outside — its shadow bleeds inward
  ctx.shadowColor = "rgba(0, 0, 0, 1)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = "rgba(0, 0, 0, 1)";

  ctx.beginPath();
  ctx.rect(-500, -500, REF_W + 1000, REF_H + 1000);
  // Cut out the inside so only the shadow remains
  ctx.roundRect(4, 4, REF_W - 8, REF_H - 8, 20);
  ctx.fill("evenodd");

  ctx.restore();
}

function smoothNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const v00 = hash(ix, iy);
  const v10 = hash(ix + 1, iy);
  const v01 = hash(ix, iy + 1);
  const v11 = hash(ix + 1, iy + 1);

  const i0 = v00 + sx * (v10 - v00);
  const i1 = v01 + sx * (v11 - v01);
  return i0 + sy * (i1 - i0);
}

function terrain(x, y) {
  // Warp coordinates for organic, non-circular shapes
  const wx = x + smoothNoise(x * 0.5 + 50, y * 0.5) * 3;
  const wy = y + smoothNoise(x * 0.5, y * 0.5 + 50) * 3;

  // Multiple octaves
  const v1 = smoothNoise(wx * 0.3, wy * 0.3);
  const v2 = smoothNoise(wx * 0.6 + 7, wy * 0.6 + 3);
  const v3 = smoothNoise(wx * 1.2 + 13, wy * 1.2 + 17);
  const v4 = smoothNoise(wx * 2.4 + 31, wy * 2.4 + 29);
  const v5 = smoothNoise(wx * 4.8 + 53, wy * 4.8 + 47);

  let val = v1 * 0.35 + v2 * 0.25 + v3 * 0.2 + v4 * 0.12 + v5 * 0.08;

  // Stretch to fill 0-1 range (raw values cluster ~0.3-0.7)
  val = val * 2.2;
  return Math.max(0, Math.min(1, val));
}

// --- CBM Look Angle display ---
function generateCurves(time) {
  const curves = [];
  const params = [
    { amp: 70, freq: 0.8, phase: 0, yOff: 0 },
    { amp: 55, freq: 0.9, phase: 0.5, yOff: 10 },
    { amp: 60, freq: 1.1, phase: 1.0, yOff: -5 },
    { amp: 45, freq: 0.7, phase: 1.8, yOff: 15 },
    { amp: 65, freq: 1.0, phase: 2.5, yOff: -10 },
    { amp: 50, freq: 0.6, phase: 3.2, yOff: 5 },
  ];

  for (const p of params) {
    const points = [];
    for (let yaw = -180; yaw <= 180; yaw += 2) {
      const t = (yaw + 180) / 360;
      const pitch =
        p.amp * Math.sin(p.freq * t * Math.PI * 2 + p.phase + time * 0.3) *
        Math.cos(t * Math.PI * 0.8 + time * 0.1) + p.yOff;
      points.push({ yaw, pitch: Math.max(-90, Math.min(90, pitch)) });
    }
    curves.push(points);
  }
  return curves;
}

// Reference resolution for layout
const REF_W = 900;
const REF_H = REF_W * 0.78;

function drawDisplay(ctx, w, h, time) {
  const dpr = window.devicePixelRatio || 1;
  ctx.save();

  // Scale to fit reference resolution
  const sx = w / REF_W;
  const sy = h / REF_H;

  // Scale all drawing to reference coords
  ctx.scale(sx, sy);

  // Background
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, REF_W, REF_H);
  ctx.fillStyle = BG;
  ctx.beginPath();
  ctx.roundRect(4, 4, REF_W - 8, REF_H - 8, 20);
  ctx.fill();

  const pad = 40;
  const margin = { top: pad + 60, bottom: pad + 180, left: pad + 80, right: pad + 30 };
  const chartW = REF_W - margin.left - margin.right;
  const chartH = REF_H - margin.top - margin.bottom;

  const fontSize = 15;
  const smallFont = 13;
  const headerFont = 17;

  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(255, 255, 255, 1)";
  ctx.shadowBlur = 10;

  // --- Header ---
  ctx.fillStyle = FG;
  ctx.font = `bold ${headerFont}px ${FONT}, monospace`;
  ctx.textAlign = "left";
  ctx.fillText("L2736A", pad, pad);
  ctx.textAlign = "center";
  ctx.fillText("CBM LOOK ANGLE", REF_W / 2, pad);
  ctx.textAlign = "right";
  ctx.fillText("1474", REF_W - pad, pad);

  // Subheader
  ctx.font = `${smallFont}px ${FONT}, monospace`;
  ctx.textAlign = "left";
  const getSeconds = Math.floor(time * 10) % 60;
  const getMinutes = Math.floor(time * 10 / 60) % 60;
  ctx.fillText(
    `TRGT  AZ 119.3  EL +96.8  GMT 116:18:${String(getSeconds).padStart(2, "0")}   GET 102:43:${String(getMinutes).padStart(2, "0")}`,
    pad,
    pad + 22
  );

  // --- Chart area ---
  ctx.strokeStyle = FG;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(margin.left, margin.top, chartW, chartH);

  // Grid lines
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 0.7;

  const pitchValues = [-60, -30, 0, 30, 60];
  for (const pv of pitchValues) {
    const y = margin.top + chartH * (1 - (pv + 90) / 180);
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + chartW, y);
    ctx.stroke();
  }

  const yawValues = [-135, -90, -45, 0, 45, 90, 135];
  for (const yv of yawValues) {
    const x = margin.left + chartW * ((yv + 180) / 360);
    ctx.beginPath();
    ctx.moveTo(x, margin.top);
    ctx.lineTo(x, margin.top + chartH);
    ctx.stroke();
  }

  ctx.fillStyle = FG;
  ctx.font = `${fontSize}px ${FONT}, monospace`;

  ctx.textAlign = "right";
  const pitchLabels = [90, 60, 30, 0, -30, -60, -90];
  for (const pv of pitchLabels) {
    const y = margin.top + chartH * (1 - (pv + 90) / 180);
    ctx.fillText(String(pv), margin.left - 8, y);
  }

  ctx.save();
  ctx.translate(pad + 8, margin.top + chartH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.font = `bold ${fontSize}px ${FONT}, monospace`;
  ctx.fillText("PITCH", 0, 0);
  ctx.restore();

  ctx.textAlign = "center";
  ctx.font = `${fontSize}px ${FONT}, monospace`;
  const xLabels = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
  for (const yv of xLabels) {
    const x = margin.left + chartW * ((yv + 180) / 360);
    ctx.fillText(String(yv), x, margin.top + chartH + 18);
  }

  ctx.font = `bold ${fontSize}px ${FONT}, monospace`;
  ctx.fillText("YAW", REF_W / 2, margin.top + chartH + 36);

  ctx.textAlign = "left";
  ctx.font = `${smallFont}px ${FONT}, monospace`;
  const rightLabels = ["GM", "S2", "S1", "BM"];
  for (let i = 0; i < rightLabels.length; i++) {
    ctx.fillText(
      rightLabels[i],
      margin.left + chartW + 10,
      margin.top + 40 + i * 22
    );
  }

  // --- Draw curves ---
  const curves = generateCurves(time);
  ctx.strokeStyle = LINE_COLOR;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const labels = ["A", "B", "C", "D", "E", "F"];

  for (let ci = 0; ci < curves.length; ci++) {
    const pts = curves[ci];
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const x = margin.left + chartW * ((pts[i].yaw + 180) / 360);
      const y = margin.top + chartH * (1 - (pts[i].pitch + 90) / 180);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const li = Math.floor(pts.length * (0.25 + ci * 0.08));
    if (li < pts.length) {
      const lx = margin.left + chartW * ((pts[li].yaw + 180) / 360);
      const ly = margin.top + chartH * (1 - (pts[li].pitch + 90) / 180);
      ctx.font = `bold ${fontSize}px ${FONT}, monospace`;
      ctx.textAlign = "center";
      ctx.fillText(labels[ci], lx, ly - 10);
    }
  }

  // --- Bottom telemetry ---
  ctx.font = `${smallFont}px ${FONT}, monospace`;
  ctx.fillStyle = FG;
  ctx.textAlign = "left";

  const bottomY = margin.top + chartH + 58;
  const col1 = pad;
  const lineH = 16;

  const animVal = (base, range) => (base + Math.sin(time * 0.5) * range).toFixed(1);
  const animVal2 = (base, range) => (base + Math.cos(time * 0.7) * range).toFixed(2);

  const lc1 = col1;
  const lc2 = col1 + 80;
  const lc3 = col1 + 170;

  ctx.textAlign = "left";
  ctx.fillText("RUN", lc1, bottomY);
  ctx.fillText("TARGET", lc2, bottomY);
  ctx.fillText("MASS", lc3, bottomY);

  ctx.fillText("12.9", lc1, bottomY + lineH);
  ctx.fillText("0 DEG", lc2, bottomY + lineH);
  ctx.fillText(animVal(72, 3), lc3, bottomY + lineH);

  ctx.fillText("86.2", lc1, bottomY + lineH * 2);
  ctx.fillText("0 DEG", lc2, bottomY + lineH * 2);
  ctx.fillText(animVal(38, 2), lc3, bottomY + lineH * 2);

  ctx.fillText("Y DEG", lc2, bottomY + lineH * 3);
  ctx.fillText(animVal(29, 4), lc3, bottomY + lineH * 3);

  ctx.fillText("P DEG", lc2, bottomY + lineH * 4);
  ctx.fillText(animVal(1, 0.5), lc3, bottomY + lineH * 4);

  const lv1 = col1;
  const lv2 = col1 + 80;
  const lv3 = col1 + 150;
  const lv4 = col1 + 220;

  ctx.fillText("YAW", lv2, bottomY + lineH * 5);
  ctx.fillText("PITCH", lv3, bottomY + lineH * 5);
  ctx.fillText("ROLL", lv4, bottomY + lineH * 5);

  ctx.fillText("IMU GMB", lv1, bottomY + lineH * 6);
  ctx.fillText(`+${animVal(189, 5)}`, lv2, bottomY + lineH * 6);
  ctx.fillText(animVal(67, 3), lv3, bottomY + lineH * 6);
  ctx.fillText(`+${animVal(129, 8)}`, lv4, bottomY + lineH * 6);

  ctx.fillText("LOCAL ATT", lv1, bottomY + lineH * 7);
  ctx.fillText(`+${animVal(156, 4)}`, lv2, bottomY + lineH * 7);
  ctx.fillText(animVal(2, 1), lv3, bottomY + lineH * 7);
  ctx.fillText(`+${animVal(358, 5)}`, lv4, bottomY + lineH * 7);

  const rc1 = REF_W - pad - 200;
  const rc2 = REF_W - pad;

  ctx.textAlign = "left";
  ctx.fillText("DATA  SCE  TLM", rc1, bottomY);

  ctx.fillText("REFSMMAT", rc1, bottomY + lineH);
  ctx.textAlign = "right";
  ctx.fillText("CURSOR", rc2, bottomY + lineH);

  ctx.textAlign = "left";
  ctx.fillText("G RATE D/S", rc1, bottomY + lineH * 2);
  ctx.textAlign = "right";
  ctx.fillText(`+${animVal2(0.07, 0.03)}`, rc2, bottomY + lineH * 2);

  ctx.textAlign = "left";
  ctx.fillText("B RATE D/S", rc1, bottomY + lineH * 3);
  ctx.textAlign = "right";
  ctx.fillText(`+${animVal2(0.05, 0.02)}`, rc2, bottomY + lineH * 3);

  ctx.textAlign = "left";
  ctx.fillText("Y RATE D/S", rc1, bottomY + lineH * 4);
  ctx.textAlign = "right";
  ctx.fillText(`+${animVal2(0.03, 0.01)}`, rc2, bottomY + lineH * 4);

  ctx.textAlign = "left";
  ctx.fillText("R RATE D/S", rc1, bottomY + lineH * 5);
  ctx.textAlign = "right";
  ctx.fillText(`+${animVal2(0.01, 0.01)}`, rc2, bottomY + lineH * 5);

  ctx.textAlign = "left";
  ctx.fillText("SLANT RGE NM", rc1, bottomY + lineH * 6);
  ctx.textAlign = "right";
  ctx.fillText(`${Math.floor(128195 + Math.sin(time * 0.2) * 500)}`, rc2, bottomY + lineH * 6);

  ctx.textAlign = "left";
  ctx.fillText("LONG  LAT  VERT", rc1, bottomY + lineH * 7);
  ctx.textAlign = "right";
  ctx.fillText(animVal(262, 10), rc2, bottomY + lineH * 7);

  ctx.shadowBlur = 0;
  drawVignette(ctx);

  ctx.restore();
}

// --- Topographical map display ---
let topoCanvas = null;
const TOPO_SIZE = 2000;

function initTopoCanvas() {
  const gridStep = 4;
  const terrainScale = 0.015;
  const cols = Math.ceil(TOPO_SIZE / gridStep) + 1;
  const rows = Math.ceil(TOPO_SIZE / gridStep) + 1;

  const d = [];
  const xCoords = [];
  const yCoords = [];

  for (let c = 0; c < cols; c++) {
    xCoords.push(c * gridStep);
    d[c] = [];
    for (let r = 0; r < rows; r++) {
      d[c][r] = terrain(c * gridStep * terrainScale, r * gridStep * terrainScale);
    }
  }
  for (let r = 0; r < rows; r++) {
    yCoords.push(r * gridStep);
  }

  const numLevels = 16;
  const zLevels = [];
  for (let i = 1; i <= numLevels; i++) {
    zLevels.push(i / (numLevels + 1));
  }

  const conrec = new Conrec();
  conrec.contour(d, 0, cols - 1, 0, rows - 1, xCoords, yCoords, numLevels, zLevels);
  const contours = conrec.contourList();

  // Render to offscreen canvas
  topoCanvas = document.createElement("canvas");
  topoCanvas.width = TOPO_SIZE;
  topoCanvas.height = TOPO_SIZE;
  const tctx = topoCanvas.getContext("2d");

  tctx.lineCap = "round";
  tctx.lineJoin = "round";

  for (const path of contours) {
    if (path.length < 2) continue;
    const levelIdx = parseInt(path.k);
    const isMajor = (levelIdx + 1) % 4 === 0;

    tctx.strokeStyle = isMajor ? "rgba(255, 255, 255, 0.85)" : "rgba(255, 255, 255, 0.35)";
    tctx.lineWidth = isMajor ? 1.4 : 0.5;

    tctx.beginPath();
    tctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
      tctx.lineTo(path[i].x, path[i].y);
    }
    tctx.stroke();
  }
}

function drawTopoMap(ctx, w, h, time) {
  ctx.save();

  const sx = w / REF_W;
  const sy = h / REF_H;

  // Scale all drawing to reference coords
  ctx.scale(sx, sy);

  // Background
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, REF_W, REF_H);
  ctx.fillStyle = BG;
  ctx.beginPath();
  ctx.roundRect(4, 4, REF_W - 8, REF_H - 8, 20);
  ctx.fill();

  const pad = 40;
  const fontSize = 15;
  const smallFont = 13;
  const headerFont = 17;

  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(255, 255, 255, 1)";
  ctx.shadowBlur = 10;

  // Map area
  const mapL = pad;
  const mapT = pad + 60;
  const mapR = REF_W - pad;
  const mapB = REF_H - pad;
  const mapW = mapR - mapL;
  const mapH = mapB - mapT;

  // Header
  ctx.fillStyle = FG;
  ctx.font = `bold ${headerFont}px ${FONT}, monospace`;
  ctx.textAlign = "left";
  ctx.fillText("T4782B", pad, pad);
  ctx.textAlign = "center";
  ctx.fillText("TERRAIN SURVEY", REF_W / 2, pad);
  ctx.textAlign = "right";
  ctx.fillText("2891", REF_W - pad, pad);

  // Clip to map area
  ctx.save();
  ctx.beginPath();
  ctx.rect(mapL, mapT, mapW, mapH);
  ctx.clip();

  // Grid overlay
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 0.5;
  const gridSpacing = 50;
  for (let gx = mapL; gx <= mapR; gx += gridSpacing) {
    ctx.beginPath();
    ctx.moveTo(gx, mapT);
    ctx.lineTo(gx, mapB);
    ctx.stroke();
  }
  for (let gy = mapT; gy <= mapB; gy += gridSpacing) {
    ctx.beginPath();
    ctx.moveTo(mapL, gy);
    ctx.lineTo(mapR, gy);
    ctx.stroke();
  }

  // Init offscreen canvas once
  if (!topoCanvas) initTopoCanvas();

  // Slowly pan over the precomputed map
  const panX = (time * 8) % (TOPO_SIZE - mapW);
  const panY = (time * 4) % (TOPO_SIZE - mapH);

  // Blit the prerendered contour map
  ctx.drawImage(topoCanvas, panX, panY, mapW, mapH, mapL, mapT, mapW, mapH);

  // Crosshair
  const cx = mapL + mapW / 2;
  const cy = mapT + mapH / 2;
  const chSize = 15;

  ctx.strokeStyle = FG;
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.moveTo(cx - chSize, cy);
  ctx.lineTo(cx - 5, cy);
  ctx.moveTo(cx + 5, cy);
  ctx.lineTo(cx + chSize, cy);
  ctx.moveTo(cx, cy - chSize);
  ctx.lineTo(cx, cy - 5);
  ctx.moveTo(cx, cy + 5);
  ctx.lineTo(cx, cy + chSize);
  ctx.stroke();

  ctx.restore(); // unclip

  // Map border
  ctx.strokeStyle = FG;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(mapL, mapT, mapW, mapH);

  // Bottom telemetry
  ctx.font = `${smallFont}px ${FONT}, monospace`;
  ctx.fillStyle = FG;
  ctx.textAlign = "left";

  const lat = (28.524 + Math.sin(time * 0.08) * 0.12).toFixed(4);
  const lon = (-80.651 + Math.cos(time * 0.06) * 0.15).toFixed(4);
  const alt = Math.floor(218 + Math.sin(time * 0.2) * 12);

  ctx.fillText(`LAT  ${lat}`, pad, pad + 22);
  ctx.textAlign = "right";
  ctx.fillText(`LON  ${lon}   ALT  ${alt} KM`, REF_W - pad, pad + 22);

  ctx.shadowBlur = 0;
  drawVignette(ctx);

  ctx.restore();
}

function App() {
  const canvasRef1 = useRef(null);
  const canvasRef2 = useRef(null);
  const animRef = useRef(null);
  const startTime = useRef(Date.now());

  useEffect(() => {
    const c1 = canvasRef1.current;
    const c2 = canvasRef2.current;
    const ctx1 = c1.getContext("2d");
    const ctx2 = c2.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const isVertical = window.innerWidth <= 900;
      let dispW, dispH;

      if (isVertical) {
        dispW = window.innerWidth * 0.96;
        dispH = dispW * (REF_H / REF_W);
      } else {
        const gap = 10;
        const totalW = window.innerWidth - gap * 2;
        dispW = (totalW - gap) / 2;
        dispH = dispW * 0.78;
        const maxH = window.innerHeight - 24;
        if (dispH > maxH) {
          dispH = maxH;
          dispW = dispH / 0.78;
        }
      }

      for (const canvas of [c1, c2]) {
        canvas.style.width = `${dispW}px`;
        canvas.style.height = `${dispH}px`;
        canvas.width = dispW * dpr;
        canvas.height = dispH * dpr;
      }
    };

    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const elapsed = (Date.now() - startTime.current) / 1000;
      drawDisplay(ctx1, c1.width, c1.height, elapsed);
      drawTopoMap(ctx2, c2.width, c2.height, elapsed);
      animRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <Page>
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <filter id="noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="4" stitchTiles="stitch" />
        </filter>
      </svg>
      <Monitor>
        <Canvas ref={canvasRef1} />
        <Noise />
      </Monitor>
      <Monitor>
        <Canvas ref={canvasRef2} />
        <Noise />
      </Monitor>
    </Page>
  );
}

export default App;
