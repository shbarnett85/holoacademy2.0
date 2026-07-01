import React, { useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { playSound } from '../lib/sound';

interface DigitalEntranceProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  /* דילוג: מציג מיד את המצב הסופי בלי אנימציה (skip-on-click במנוע המשחק) */
  instant?: boolean;
}

/* ── DigitalEntrance ──────────────────────────────────────────────────────────
   עטיפה גורפת לכל תיבת-תוכן (panel/box) בהדמיה: כניסה "דיגיטלית" — glitch-opacity
   + scale + blur — במקום fade פשוט. עוטף את המכל החיצוני בלבד (לא קלפים/טיילים),
   כדי לא להעמיס רינדור ולא להתנגש באנימציות פנימיות.
   - prefers-reduced-motion → fade עדין בלבד (ללא glitch/scale/blur).
   - instant → ללא אנימציה (מצב dilug של ה-staged reveal).
   - RTL נשמר (אין transform אופקי-תלוי-כיוון; scanline/glow סימטריים).
   ─────────────────────────────────────────────────────────────────────────── */
const DigitalEntrance: React.FC<DigitalEntranceProps> = ({ children, className = '', delay = 0, instant = false }) => {
  const reduce = useReducedMotion();

  /* צליל "חומריאליזציה" עדין מאוד — מתנגן פעם אחת בכל הופעה אמיתית (mount), מסונכרן
     ל-delay של האנימציה; לא מתנגן במצב instant (דילוג/מצב סופי — אין אנימציה בפועל). */
  useEffect(() => {
    if (instant) return;
    const t = window.setTimeout(() => playSound('reveal'), delay * 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (instant) {
    return <div className={`relative ${className}`}>{children}</div>;
  }

  if (reduce) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay }}
        className={`relative ${className}`}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scaleY: 0.1, scaleX: 0.85, filter: 'blur(15px) brightness(2.5)' }}
      animate={{
        /* עולה בקצב לא-אחיד (תחושת "גליץ' דיגיטלי") אך אף פעם לא יורד אחרי ששיא גבוה יותר
           כבר הוצג — כך שהתוכן (כפתורים/תשובות) לא "נעלם" חלקית תוך כדי הכניסה. */
        opacity: [0, 0.5, 0.75, 1],
        scaleY: 1,
        scaleX: 1,
        filter: 'blur(0px) brightness(1)',
      }}
      transition={{ duration: 0.8, delay, ease: 'easeOut', times: [0, 0.15, 0.4, 1] }}
      className={`relative ${className}`}
    >
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,50,0)_0%,rgba(0,246,255,0.06)_50%,rgba(18,16,50,0)_100%)] bg-[length:100%_4px] pointer-events-none rounded-xl animate-pulse-mild"></div>
      <div className="absolute -inset-[1px] bg-gradient-to-r from-cyan-500/0 via-cyan-500/25 to-[#C039BE]/25 rounded-2xl blur-md -z-10 animate-pulse-mild pointer-events-none"></div>
      {children}
    </motion.div>
  );
};

export default DigitalEntrance;
