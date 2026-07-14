import { useEffect, useState } from "react";

type Phase = "enter" | "hold" | "exit" | "done";

/**
 * One-shot boot splash: large product name + codename, then fade out.
 * Pure CSS motion; respects prefers-reduced-motion.
 */
export function SplashScreen() {
  const [phase, setPhase] = useState<Phase>("enter");
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      // Brief hold only — no long staging
      const t1 = window.setTimeout(() => setPhase("exit"), 400);
      const t2 = window.setTimeout(() => {
        setPhase("done");
        setVisible(false);
      }, 700);
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
      };
    }

    // enter 0–900ms → hold → exit from ~2100ms → unmount ~2800ms
    const hold = window.setTimeout(() => setPhase("hold"), 900);
    const exit = window.setTimeout(() => setPhase("exit"), 2100);
    const done = window.setTimeout(() => {
      setPhase("done");
      setVisible(false);
    }, 2850);

    return () => {
      window.clearTimeout(hold);
      window.clearTimeout(exit);
      window.clearTimeout(done);
    };
  }, []);

  if (!visible || phase === "done") return null;

  return (
    <div
      className={`splash-screen splash-${phase}`}
      role="presentation"
      aria-hidden="true"
    >
      <div className="splash-vignette" />
      <div className="splash-center">
        <div className="splash-mark" aria-hidden>
          A
        </div>
        <h1 className="splash-title">AgentX</h1>
        <div className="splash-rule" aria-hidden />
        <p className="splash-codename">
          <span className="splash-codename-label">codename</span>
          <span className="splash-codename-name">AbeX</span>
        </p>
      </div>
    </div>
  );
}
