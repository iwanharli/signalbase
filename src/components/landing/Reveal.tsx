"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import c from "./landing.module.css";

/** Marks each `.reveal` section as shown the first time it scrolls into view (CSS fades it in). Renders nothing.
 *  Re-runs on every page change: the public layout stays mounted while the pages inside it switch. */
export function Reveal() {
  const pathname = usePathname();
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute("data-shown", "");
        observer.unobserve(entry.target);
      }
    }, { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(`.${c.reveal}:not([data-shown])`).forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pathname]);
  return null;
}
