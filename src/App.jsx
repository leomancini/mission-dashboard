import React, { useRef, useEffect, useState } from "react";
import styled from "styled-components";
import { Conrec } from "./conrec";

const Page = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 64px;
  min-height: 100vh;
  padding: 64px;
  background: #000;
  overflow: auto;

  @media (max-width: 600px) {
    gap: 10px;
    padding: 10px;
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

const FONT = "IBM Plex Mono";
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

function drawVignette(ctx, refH = REF_H, scale = 1) {
  ctx.save();

  ctx.beginPath();
  ctx.roundRect(4, 4, REF_W - 8, refH - 8, 20);
  ctx.clip();

  ctx.shadowColor = "rgba(0, 0, 0, 1)";
  ctx.shadowBlur = 50 * scale;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = "rgba(0, 0, 0, 1)";

  ctx.beginPath();
  ctx.rect(-500, -500, REF_W + 1000, refH + 1000);
  ctx.roundRect(4, 4, REF_W - 8, refH - 8, 20);
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
  const scale = Math.min(sx, sy);

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
  const smallFont = 15;
  const headerFont = 17;

  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(255, 255, 255, 1)";
  ctx.shadowBlur = 10 * scale;

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
  ctx.font = `bold ${smallFont}px ${FONT}, monospace`;
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
  ctx.font = `bold ${fontSize}px ${FONT}, monospace`;

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
  ctx.font = `bold ${fontSize}px ${FONT}, monospace`;
  const xLabels = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
  for (const yv of xLabels) {
    const x = margin.left + chartW * ((yv + 180) / 360);
    ctx.fillText(String(yv), x, margin.top + chartH + 18);
  }

  ctx.font = `bold ${fontSize}px ${FONT}, monospace`;
  ctx.fillText("YAW", REF_W / 2, margin.top + chartH + 36);

  ctx.textAlign = "left";
  ctx.font = `bold ${smallFont}px ${FONT}, monospace`;
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
  ctx.font = `bold ${smallFont}px ${FONT}, monospace`;
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
  drawVignette(ctx, REF_H, scale);

  ctx.restore();
}

// --- Topographical map display ---
let topoCanvas = null;
const TOPO_SIZE = 2000;

function initTopoCanvas() {
  const gridStep = 2;
  const terrainScale = 0.01;
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

    tctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
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
  const scale = Math.min(sx, sy);

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
  const smallFont = 15;
  const headerFont = 17;

  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(255, 255, 255, 1)";
  ctx.shadowBlur = 10 * scale;

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

  // Diagonal pan with subtle wavering
  const drift = TOPO_SIZE - mapW;
  const driftY = TOPO_SIZE - mapH;
  const panX = (time * 8 + Math.sin(time * 0.13) * 15 + Math.sin(time * 0.37) * 8) % drift;
  const panY = (time * 4 + Math.cos(time * 0.09) * 12 + Math.cos(time * 0.29) * 6) % driftY;

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
  ctx.font = `bold ${smallFont}px ${FONT}, monospace`;
  ctx.fillStyle = FG;
  ctx.textAlign = "left";

  const lat = (28.524 + Math.sin(time * 0.08) * 0.12 + Math.sin(time * 0.21) * 0.04 + Math.sin(time * 0.47) * 0.015).toFixed(4);
  const lon = (-80.651 + Math.cos(time * 0.06) * 0.15 + Math.cos(time * 0.17) * 0.05 + Math.cos(time * 0.39) * 0.018).toFixed(4);
  const alt = Math.floor(218 + Math.sin(time * 0.2) * 12 + Math.sin(time * 0.53) * 4);

  ctx.fillText(`LAT  ${lat}   LON  ${lon}`, pad, pad + 22);
  ctx.textAlign = "right";
  ctx.fillText(`ALT  ${alt} KM`, REF_W - pad, pad + 22);

  ctx.shadowBlur = 0;
  drawVignette(ctx, REF_H, scale);

  ctx.restore();
}

// --- Systems status display ---
function drawRadialGauge(ctx, cx, cy, radius, value, label, unit, min, max) {
  const pct = (value - min) / (max - min);
  const startAngle = Math.PI * 0.75;
  const endAngle = Math.PI * 2.25;
  const range = endAngle - startAngle;
  const valueAngle = startAngle + pct * range;

  // Outer ring
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.stroke();

  // Value arc — thick glowing band
  ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, valueAngle);
  ctx.stroke();

  // Value text — large centered
  ctx.fillStyle = FG;
  ctx.font = `bold 20px ${FONT}, monospace`;
  ctx.textAlign = "center";
  ctx.fillText(`${value.toFixed(1)}`, cx, cy - 10);

  // Unit below value
  ctx.font = `bold 15px ${FONT}, monospace`;
  ctx.fillStyle = FG;
  ctx.fillText(unit, cx, cy + 12);

  // Label below gauge
  ctx.font = `bold 15px ${FONT}, monospace`;
  ctx.fillStyle = FG;
  ctx.fillText(label, cx, cy + radius + 16);
  ctx.fillStyle = FG;
}

function drawBarSet(ctx, x, y, setW, setH, bar, label) {
  // Label above
  ctx.font = `bold 15px ${FONT}, monospace`;
  ctx.textAlign = "center";
  ctx.fillStyle = FG;
  ctx.fillText(label, x + setW / 2, y - 14);

  const pct = (bar.val - bar.min) / (bar.max - bar.min);

  // Border
  ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, setW, setH);

  // Fill from bottom with inner padding
  const inPad = 6;
  const innerW = setW - inPad * 2;
  const innerH = setH - inPad * 2;
  const fillH = innerH * Math.min(1, pct);
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.fillRect(x + inPad, y + inPad + innerH - fillH, innerW, fillH);

  // Value below
  ctx.font = `bold 15px ${FONT}, monospace`;
  ctx.textAlign = "center";
  ctx.fillStyle = FG;
  ctx.fillText(`${bar.val.toFixed(bar.val >= 100 ? 0 : 1)}%`, x + setW / 2, y + setH + 18);
}

function drawSystemsStatus(ctx, w, h, time) {
  ctx.save();

  const sx = w / REF_W;
  const sy = h / REF_H;
  const scale = Math.min(sx, sy);

  ctx.scale(sx, sy);

  // Background
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, REF_W, REF_H);
  ctx.fillStyle = BG;
  ctx.beginPath();
  ctx.roundRect(4, 4, REF_W - 8, REF_H - 8, 20);
  ctx.fill();

  const pad = 40;
  const headerFont = 17;
  const smallFont = 15;

  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(255, 255, 255, 1)";
  ctx.shadowBlur = 10 * scale;

  // Header
  ctx.fillStyle = FG;
  ctx.font = `bold ${headerFont}px ${FONT}, monospace`;
  ctx.textAlign = "left";
  ctx.fillText("S8421C", pad, pad);
  ctx.textAlign = "center";
  ctx.fillText("SYSTEMS STATUS", REF_W / 2, pad);
  ctx.textAlign = "right";
  ctx.fillText("3706", REF_W - pad, pad);

  // Subheader
  ctx.font = `bold ${smallFont}px ${FONT}, monospace`;
  ctx.textAlign = "left";
  const missionTime = `${Math.floor(time / 3600).toString().padStart(3, "0")}:${Math.floor((time % 3600) / 60).toString().padStart(2, "0")}:${Math.floor(time % 60).toString().padStart(2, "0")}`;
  ctx.fillText(`MET  ${missionTime}   STATUS  NOMINAL`, pad, pad + 22);

  // Animated values
  const s = (base, range, speed) => base + Math.sin(time * speed) * range;
  const c = (base, range, speed) => base + Math.cos(time * speed) * range;

  // --- Layout ---
  const contentT = pad + 60;
  const contentB = REF_H - pad;
  const contentH = contentB - contentT;
  const contentL = pad;
  const contentR = REF_W - pad;
  const contentW = contentR - contentL;

  // Gauges take top ~40%
  const gaugeZoneH = contentH * 0.35;
  const gaugeY = contentT + gaugeZoneH / 2 - 15;
  const gaugeR = Math.min(gaugeZoneH / 2 - 25, 55);
  const gauges = [
    { label: "MAIN BATT", unit: "V", val: s(28.4, 0.3, 0.4), min: 20, max: 32 },
    { label: "AUX BATT", unit: "V", val: s(26.1, 0.5, 0.3), min: 20, max: 32 },
    { label: "FUEL CELL", unit: "A", val: s(18.7, 1.2, 0.5), min: 0, max: 30 },
    { label: "CABIN PSI", unit: "PSI", val: s(14.7, 0.2, 0.6), min: 10, max: 20 },
    { label: "BUS VOLTS", unit: "V", val: s(31.2, 0.4, 0.35), min: 24, max: 36 },
  ];

  const gaugeSpacing = contentW / gauges.length;
  for (let i = 0; i < gauges.length; i++) {
    const gx = contentL + gaugeSpacing * (i + 0.5);
    const g = gauges[i];
    drawRadialGauge(ctx, gx, gaugeY, gaugeR, g.val, g.label, g.unit, g.min, g.max);
  }

  // Bar sets take bottom ~60% in two rows
  const barZoneT = contentT + gaugeZoneH + 30;
  const barZoneH = contentB - barZoneT - 30;
  const barRowH = (barZoneH - 60) / 2;
  const barSetGap = 16;
  const numSetsPerRow = 3;
  const barSetW = (contentW - barSetGap * (numSetsPerRow - 1)) / numSetsPerRow;

  const barSets = [
    { label: "LOX", bar: { val: s(82.3, 2, 0.2), min: 0, max: 100 } },
    { label: "LH2", bar: { val: s(68.4, 3, 0.15), min: 0, max: 100 } },
    { label: "RCS A", bar: { val: s(64.8, 2, 0.22), min: 0, max: 100 } },
    { label: "RCS B", bar: { val: s(62.3, 1.8, 0.19), min: 0, max: 100 } },
    { label: "O2", bar: { val: s(95.1, 1, 0.1), min: 0, max: 100 } },
    { label: "CO2", bar: { val: c(12.2, 3, 0.07), min: 0, max: 100 } },
    { label: "COOL", bar: { val: s(88.9, 1.5, 0.13), min: 0, max: 100 } },
    { label: "RAD", bar: { val: s(72.1, 3, 0.09), min: 0, max: 100 } },
    { label: "H2O", bar: { val: s(71.0, 2.5, 0.12), min: 0, max: 100 } },
    { label: "WASTE", bar: { val: s(34.2, 4, 0.08), min: 0, max: 100 } },
    { label: "BUS A", bar: { val: s(92.4, 1, 0.15), min: 0, max: 100 } },
    { label: "BUS B", bar: { val: s(90.8, 1.2, 0.12), min: 0, max: 100 } },
  ];

  const numPerRow = 6;
  const rowGap = 65;
  const barSetGapH = 20;
  const barSetW2 = (contentW - barSetGapH * (numPerRow - 1)) / numPerRow;
  const barZoneH2 = contentB - barZoneT;
  const numRows = Math.ceil(barSets.length / numPerRow);
  const barH2 = (barZoneH2 - (numRows - 1) * rowGap - 20) / numRows;

  for (let i = 0; i < barSets.length; i++) {
    const row = Math.floor(i / numPerRow);
    const col = i % numPerRow;
    const bx = contentL + col * (barSetW2 + barSetGapH);
    const by = barZoneT + row * (barH2 + rowGap);
    drawBarSet(ctx, bx, by, barSetW2, barH2, barSets[i].bar, barSets[i].label);
  }

  ctx.shadowBlur = 0;
  drawVignette(ctx, REF_H, scale);

  ctx.restore();
}

function App() {
  const canvasRef1 = useRef(null);
  const canvasRef2 = useRef(null);
  const canvasRef3 = useRef(null);
  const animRef = useRef(null);
  const startTime = useRef(Date.now());

  const params = new URLSearchParams(window.location.search);
  const screenParam = params.get("screen");
  const visibleScreens = screenParam ? [parseInt(screenParam)] : [1, 2, 3];

  useEffect(() => {
    const canvases = [];
    const contexts = [];
    if (visibleScreens.includes(1)) { canvases.push(canvasRef1.current); contexts.push({ ctx: canvasRef1.current.getContext("2d"), draw: drawDisplay }); }
    if (visibleScreens.includes(2)) { canvases.push(canvasRef2.current); contexts.push({ ctx: canvasRef2.current.getContext("2d"), draw: drawTopoMap }); }
    if (visibleScreens.includes(3)) { canvases.push(canvasRef3.current); contexts.push({ ctx: canvasRef3.current.getContext("2d"), draw: drawSystemsStatus }); }

    const dpr = window.devicePixelRatio || 1;
    const screenCount = canvases.length;

    const resize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let dispW, dispH;

      const isKiosk = params.get("kiosk") === "true";
      const isMobile = vw <= 600;
      const gap = isMobile ? 10 : 64;

      if (isKiosk) {
        dispH = (vh - gap * 2 - gap * (screenCount - 1)) / screenCount;
        dispW = dispH / (REF_H / REF_W);
      } else {
        dispW = Math.min(vw - gap * 2, 768);
        dispH = dispW * (REF_H / REF_W);
      }

      for (const canvas of canvases) {
        canvas.style.width = `${dispW}px`;
        canvas.style.height = `${dispH}px`;
        canvas.width = dispW * dpr;
        canvas.height = dispH * dpr;
      }
    };

    resize();
    window.addEventListener("resize", resize);

    let lastSystemsDraw = 0;
    const draw = () => {
      const elapsed = (Date.now() - startTime.current) / 1000;
      for (const { ctx, draw: drawFn } of contexts) {
        if (drawFn === drawSystemsStatus) {
          if (elapsed - lastSystemsDraw > 0.25) {
            drawFn(ctx, ctx.canvas.width, ctx.canvas.height, elapsed);
            lastSystemsDraw = elapsed;
          }
        } else {
          drawFn(ctx, ctx.canvas.width, ctx.canvas.height, elapsed);
        }
      }
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
      {visibleScreens.includes(1) && <Monitor><Canvas ref={canvasRef1} /><Noise /></Monitor>}
      {visibleScreens.includes(2) && <Monitor><Canvas ref={canvasRef2} /><Noise /></Monitor>}
      {visibleScreens.includes(3) && <Monitor><Canvas ref={canvasRef3} /><Noise /></Monitor>}
    </Page>
  );
}

export default App;
