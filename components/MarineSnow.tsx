"use client";

import { useEffect, useRef } from "react";

// Slow, sparse drifting particulate above the map — "marine snow". Very low
// opacity; if it draws the eye, it's too strong (§5). Honors reduced-motion.
type Fleck = {
  x: number;
  y: number;
  r: number;
  vy: number; // downward drift
  sway: number; // horizontal amplitude
  phase: number;
  alpha: number;
};

export default function MarineSnow() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return; // keep it perfectly still for those who ask

    let w = 0;
    let h = 0;
    let dpr = 1;
    let flecks: Fleck[] = [];
    let raf = 0;
    let t = 0;

    // deterministic-ish scatter (no Math.random dependency on first paint order)
    const rand = (() => {
      let s = 20260808;
      return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
      };
    })();

    const seed = () => {
      // density scales with area but stays sparse
      const count = Math.min(90, Math.round((w * h) / 26000));
      flecks = Array.from({ length: count }, () => ({
        x: rand() * w,
        y: rand() * h,
        r: 0.4 + rand() * 1.3,
        vy: 3 + rand() * 7, // px per second
        sway: 4 + rand() * 10,
        phase: rand() * Math.PI * 2,
        alpha: 0.04 + rand() * 0.11,
      }));
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    let last = 0;
    const frame = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
      last = now;
      t += dt;
      ctx.clearRect(0, 0, w, h);
      for (const f of flecks) {
        f.y += f.vy * dt;
        const x = f.x + Math.sin(t * 0.4 + f.phase) * f.sway;
        if (f.y - f.r > h) {
          f.y = -f.r;
          f.x = rand() * w;
        }
        ctx.beginPath();
        ctx.arc(x, f.y, f.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(95, 208, 196, ${f.alpha})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };

    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[50]"
    />
  );
}
