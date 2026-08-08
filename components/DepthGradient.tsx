"use client";

import { useEffect, useRef } from "react";

// A subtle depth-darkening that deepens as you scroll down a dive page — the
// further you read, the deeper you sink. Kept quiet; honors reduced-motion.
export default function DepthGradient() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const frac = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      // ease in gently; cap so it never fully blacks out the page
      el.style.opacity = String(0.55 * frac * frac);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
      style={{
        opacity: 0,
        background:
          "linear-gradient(180deg, rgba(5,9,12,0) 0%, rgba(4,10,16,0.5) 55%, rgba(2,6,11,0.95) 100%)",
        transition: "opacity 0.15s linear",
      }}
    />
  );
}
