"use client";

import { useEffect, useState } from "react";
import MeritMark from "./MeritMark";

export default function BootSplash() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const seen = window.sessionStorage.getItem("merit-boot-seen");
    if (seen) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setVisible(false);
      window.sessionStorage.setItem("merit-boot-seen", "1");
    }, 1150);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="merit-boot" aria-label="Loading MERIT" role="status">
      <div className="merit-boot-mark"><MeritMark size={88} /></div>
      <div className="merit-boot-word">MERIT</div>
      <div className="merit-boot-line" />
    </div>
  );
}