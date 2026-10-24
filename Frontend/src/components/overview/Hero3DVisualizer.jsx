import React, { useEffect, useRef, useState } from 'react';
import Logo from '../common/Logo';
import { ShieldCheck, Zap, Activity } from 'lucide-react';

export const Hero3DVisualizer = () => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  // Handle smooth 3D tilt tracking
  const handleMouseMove = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({
      x: -y * 14, // tilt on X axis based on vertical mouse
      y: x * 18,  // tilt on Y axis based on horizontal mouse
    });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
  };

  // 3D Mathematical Canvas Hologram (Particle Sphere with constellation links)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId;
    let width = (canvas.width = canvas.offsetWidth * 2);
    let height = (canvas.height = canvas.offsetHeight * 2);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth * 2;
      height = canvas.height = canvas.offsetHeight * 2;
    };
    window.addEventListener('resize', handleResize);

    // Generate 3D spherical nodes
    const nodeCount = 48;
    const sphereRadius = Math.min(width, height) * 0.34;
    const nodes = [];

    for (let i = 0; i < nodeCount; i++) {
      // Golden spiral distribution for perfectly spaced 3D sphere
      const phi = Math.acos(1 - (2 * (i + 0.5)) / nodeCount);
      const theta = Math.PI * (1 + 5 ** 0.5) * (i + 0.5);

      nodes.push({
        x: sphereRadius * Math.sin(phi) * Math.cos(theta),
        y: sphereRadius * Math.sin(phi) * Math.sin(theta),
        z: sphereRadius * Math.cos(phi),
        baseSize: 2 + Math.random() * 2,
        colorType: i % 3 === 0 ? 'cyan' : i % 3 === 1 ? 'indigo' : 'purple',
      });
    }

    let angleX = 0;
    let angleY = 0;
    const focalLength = 320;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Center origin
      const cx = width / 2;
      const cy = height / 2;

      // Rotate continuously with gentle drift + user tilt influence
      angleX += 0.003 + tilt.x * 0.0003;
      angleY += 0.005 + tilt.y * 0.0003;

      const cosX = Math.cos(angleX);
      const sinX = Math.sin(angleX);
      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);

      // Project nodes from 3D (x,y,z) to 2D (px, py)
      const projected = nodes.map((node) => {
        // Rotate around Y axis
        const x1 = node.x * cosY + node.z * sinY;
        const z1 = -node.x * sinY + node.z * cosY;

        // Rotate around X axis
        const y2 = node.y * cosX - z1 * sinX;
        const z2 = node.y * sinX + z1 * cosX;

        // Perspective scale factor
        const distance = focalLength + z2;
        const scale = distance > 0 ? focalLength / distance : 0.001;
        const px = cx + x1 * scale;
        const py = cy + y2 * scale;
        const alpha = Math.max(0.12, Math.min(1, (z2 + sphereRadius) / (2 * sphereRadius)));

        return { px, py, z: z2, scale, alpha, colorType: node.colorType, baseSize: node.baseSize };
      });

      // Sort by depth (back to front) for natural depth occlusion
      projected.sort((a, b) => a.z - b.z);

      // Draw constellation connections between nearby nodes
      ctx.lineWidth = 1;
      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const dx = projected[i].px - projected[j].px;
          const dy = projected[i].py - projected[j].py;
          const distSq = dx * dx + dy * dy;
          const maxDist = (55 * (width / 400)) ** 2;

          if (distSq < maxDist) {
            const distRatio = 1 - Math.sqrt(distSq) / (55 * (width / 400));
            const lineAlpha = distRatio * Math.min(projected[i].alpha, projected[j].alpha) * 0.38;

            ctx.strokeStyle = `rgba(129, 140, 248, ${lineAlpha})`;
            ctx.beginPath();
            ctx.moveTo(projected[i].px, projected[i].py);
            ctx.lineTo(projected[j].px, projected[j].py);
            ctx.stroke();
          }
        }
      }

      // Draw glowing particle nodes
      projected.forEach((p) => {
        const radius = Math.max(1, p.baseSize * p.scale * 1.3);

        // Radial glow gradient for each 3D point
        const grad = ctx.createRadialGradient(p.px, p.py, 0, p.px, p.py, radius * 3.5);
        if (p.colorType === 'cyan') {
          grad.addColorStop(0, `rgba(56, 189, 248, ${p.alpha})`);
          grad.addColorStop(0.5, `rgba(14, 165, 233, ${p.alpha * 0.45})`);
          grad.addColorStop(1, 'rgba(14, 165, 233, 0)');
        } else if (p.colorType === 'purple') {
          grad.addColorStop(0, `rgba(192, 132, 252, ${p.alpha})`);
          grad.addColorStop(0.5, `rgba(168, 85, 247, ${p.alpha * 0.45})`);
          grad.addColorStop(1, 'rgba(168, 85, 247, 0)');
        } else {
          grad.addColorStop(0, `rgba(129, 140, 248, ${p.alpha})`);
          grad.addColorStop(0.5, `rgba(99, 102, 241, ${p.alpha * 0.45})`);
          grad.addColorStop(1, 'rgba(99, 102, 241, 0)');
        }

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.px, p.py, radius * 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Bright white-hot core
        ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha * 0.9})`;
        ctx.beginPath();
        ctx.arc(p.px, p.py, radius * 0.7, 0, Math.PI * 2);
        ctx.fill();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, [tilt]);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative w-full max-w-[340px] sm:max-w-[380px] lg:max-w-[420px] aspect-[4/3] flex items-center justify-center select-none cursor-pointer group"
      style={{
        perspective: '1200px',
      }}
    >
      {/* 3D Interactive Tilting Shell */}
      <div
        className="relative w-full h-full flex items-center justify-center transition-transform duration-200 ease-out"
        style={{
          transformStyle: 'preserve-3d',
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        }}
      >
        {/* Ambient Radial Energy Bloom behind the 3D Sphere */}
        <div className="absolute w-52 h-52 rounded-full bg-gradient-to-tr from-indigo-500/30 via-cyan-500/20 to-purple-500/25 blur-3xl pointer-events-none -z-10 group-hover:scale-110 transition-transform duration-700" />

        {/* Outer 3D Gyroscope Ring 1 */}
        <div
          className="absolute w-64 sm:w-72 h-64 sm:h-72 rounded-full border border-indigo-500/30 shadow-[0_0_25px_rgba(99,102,241,0.25)] pointer-events-none animate-spin-slow"
          style={{
            transform: 'rotateX(68deg) rotateY(18deg)',
            borderTopColor: 'rgba(56, 189, 248, 0.85)',
            borderRightColor: 'rgba(129, 140, 248, 0.4)',
          }}
        >
          {/* Traveling Photon on Ring 1 */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_12px_#38bdf8] animate-pulse" />
        </div>

        {/* Outer 3D Gyroscope Ring 2 (Opposing axis) */}
        <div
          className="absolute w-56 sm:w-64 h-56 sm:h-64 rounded-full border border-purple-500/35 shadow-[0_0_20px_rgba(168,85,247,0.2)] pointer-events-none animate-reverse-spin-slow"
          style={{
            transform: 'rotateX(-48deg) rotateY(32deg)',
            borderBottomColor: 'rgba(192, 132, 252, 0.85)',
            borderLeftColor: 'rgba(99, 102, 241, 0.3)',
          }}
        >
          {/* Traveling Photon on Ring 2 */}
          <div className="absolute bottom-0 right-1/2 translate-x-1/2 translate-y-1/2 w-2.5 h-2.5 rounded-full bg-purple-400 shadow-[0_0_10px_#c084fc] animate-pulse" />
        </div>

        {/* Canvas 3D Holographic Particle Sphere */}
        <canvas
          ref={canvasRef}
          className="relative z-10 w-full h-full object-contain pointer-events-none"
        />

        {/* Center Holographic Brand Core */}
        <div
          className="absolute z-20 flex flex-col items-center justify-center p-3.5 rounded-2xl bg-slate-950/20 backdrop-blur-md border border-cyan-400/40 shadow-[0_0_35px_rgba(56,189,248,0.35)] pointer-events-none"
          style={{
            transform: 'translateZ(30px)',
          }}
        >
          {/* Subtle luminous core glow */}
          <div className="absolute w-12 h-12 rounded-full bg-cyan-400/20 blur-md pointer-events-none" />

          {/* Clean pure emblem icon - bright & luminous */}
          <Logo
            size="md"
            showText={false}
            className="w-10 h-10 drop-shadow-[0_0_16px_rgba(56,189,248,0.95)] filter brightness-125 relative z-10"
          />
          <span className="relative z-10 text-[9.5px] font-mono font-extrabold text-cyan-200 tracking-widest uppercase mt-1.5 drop-shadow-[0_0_8px_rgba(56,189,248,0.8)]">
            RELAY CORE
          </span>
        </div>

        {/* Floating 3D Telemetry Card 1: P95 Ingestion (Top Right) */}
        <div
          className="absolute top-2 sm:top-4 right-1 sm:right-3 z-30 p-2 sm:p-2.5 rounded-xl bg-slate-950/25 backdrop-blur-xl border border-indigo-400/35 shadow-xl shadow-indigo-950/40 flex items-center gap-2 pointer-events-none animate-float-slow"
          style={{
            transform: 'translateZ(55px)',
          }}
        >
          <div className="p-1.5 rounded-lg bg-indigo-500/25 text-indigo-300">
            <Activity className="w-3.5 h-3.5" />
          </div>
          <div className="text-left">
            <p className="text-[9px] font-medium text-gray-300 leading-none">P95 LATENCY</p>
            <p className="text-[12px] font-bold font-mono text-emerald-400 leading-tight mt-0.5 flex items-center gap-1">
              <span>11.4ms</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </p>
          </div>
        </div>

        {/* Floating 3D Telemetry Card 2: Security & Signature Engine (Bottom Left) */}
        <div
          className="absolute bottom-2 sm:bottom-4 left-1 sm:left-3 z-30 p-2 sm:p-2.5 rounded-xl bg-slate-950/25 backdrop-blur-xl border border-cyan-400/35 shadow-xl shadow-cyan-950/40 flex items-center gap-2 pointer-events-none animate-float-slow-reverse"
          style={{
            transform: 'translateZ(65px)',
          }}
        >
          <div className="p-1.5 rounded-lg bg-cyan-500/25 text-cyan-300">
            <ShieldCheck className="w-3.5 h-3.5" />
          </div>
          <div className="text-left">
            <p className="text-[9px] font-medium text-gray-300 leading-none">HMAC ENGINE</p>
            <p className="text-[11px] font-bold font-mono text-cyan-200 leading-tight mt-0.5">
              SHA-256 Validated
            </p>
          </div>
        </div>

        {/* Floating 3D Telemetry Pill 3: Ingestion ACK (Top Left) */}
        <div
          className="absolute top-6 sm:top-8 left-2 sm:left-4 z-30 px-2.5 py-1 rounded-full bg-slate-950/25 backdrop-blur-xl border border-white/20 shadow-lg flex items-center gap-1.5 pointer-events-none"
          style={{
            transform: 'translateZ(40px)',
          }}
        >
          <Zap className="w-3 h-3 text-amber-400" />
          <span className="text-[10px] font-mono font-semibold text-gray-100">
            202 Ingested
          </span>
        </div>
      </div>
    </div>
  );
};

export default Hero3DVisualizer;
