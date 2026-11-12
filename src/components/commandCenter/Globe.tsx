"use client";
// Mapbox globe behind the Command Center, focused on Indonesia and swaying slowly. Background only: no data on it.
import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const CENTER: [number, number] = [118, -2];
/** Big sphere (about 1.6x the screen height) pushed into the bottom-right corner: Indonesia sits there and the cards cover the rest. */
const place = (m: mapboxgl.Map, el: HTMLElement) => {
  m.setZoom(Math.log2((5 * el.clientHeight) / 512));
  m.setPadding({ left: Math.round(el.clientWidth * 0.45), top: Math.round(el.clientHeight * 0.4), right: 0, bottom: 0 });
};

export default function Globe({ token }: { token: string }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!box.current) return;
    mapboxgl.accessToken = token;
    let m: mapboxgl.Map;
    try {
      m = new mapboxgl.Map({ container: box.current, style: "mapbox://styles/mapbox/dark-v11", projection: "globe", center: CENTER, zoom: 3, attributionControl: false, scrollZoom: false, dragRotate: false, touchPitch: false });
    } catch { return; } // no WebGL: the dark background stays
    place(m, box.current);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, swaying = !reduced;
    m.on("dragstart", () => { swaying = false; });
    const fit = () => box.current && place(m, box.current);
    window.addEventListener("resize", fit);

    m.on("style.load", () => {
      // Labels would clutter the glass cards.
      for (const l of m.getStyle()?.layers ?? []) if (l.type === "symbol") m.setLayoutProperty(l.id, "visibility", "none");
      m.setFog({ color: "rgb(14,12,40)", "high-color": "rgb(60,40,140)", "horizon-blend": 0.04, "space-color": "rgb(5,4,15)", "star-intensity": 0.7 });
    });
    const tick = (t: number) => {
      if (swaying) m.setCenter([CENTER[0] + 12 * Math.sin(t / 15000), CENTER[1]]);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { window.removeEventListener("resize", fit); cancelAnimationFrame(raf); m.remove(); };
  }, [token]);

  return <div ref={box} style={{ position: "absolute", inset: 0 }} />;
}
