import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import "./App.css";
import { solveExpression } from "./mathSteps";

const SHARD_COLS = 8;
const SHARD_ROWS = 6;
const SHARD_COUNT = SHARD_COLS * SHARD_ROWS;

function ShardBurst({
  box,
  session,
}: {
  box: DOMRect;
  session: number;
}) {
  const shards = useMemo(
    () =>
      Array.from({ length: SHARD_COUNT }, (_, i) => ({
        key: `${session}-${i}`,
        tx: (Math.random() - 0.5) * Math.max(560, box.width * 3),
        ty: 260 + Math.random() * 520,
        rzDeg: (Math.random() - 0.5) * 920,
        warm: Math.random(),
        delay: Math.random() * 0.08,
        col: i % SHARD_COLS,
        row: Math.floor(i / SHARD_COLS),
      })),
    [box, session],
  );

  return (
    <div
      className="shard-burst"
      aria-hidden
      style={{
        top: box.top,
        left: box.left,
        width: box.width,
        height: box.height,
      }}
    >
      {shards.map((s) => (
        <span
          key={s.key}
          className="shard-burst__piece"
          style={
            {
              left: `${(s.col / SHARD_COLS) * 100}%`,
              top: `${(s.row / SHARD_ROWS) * 100}%`,
              width: `${100 / SHARD_COLS}%`,
              height: `${100 / SHARD_ROWS}%`,
              "--shard-tx": `${s.tx}px`,
              "--shard-ty": `${s.ty}px`,
              "--shard-rz-deg": String(s.rzDeg),
              "--shard-warm": String(s.warm),
              "--shard-delay": `${s.delay}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

export type SolverMode = "steps" | "immediate";

const PAD_ROWS: string[][] = [
  ["(", ")", "C", "⌫"],
  ["7", "8", "9", "/"],
  ["4", "5", "6", "*"],
  ["1", "2", "3", "-"],
  ["0", ".", "^", "+"],
];

const SCI_ROW = ["sqrt(", "sin(", "cos(", "pi", "e"];

function ModeChooser({
  onSelect,
}: {
  onSelect: (mode: SolverMode) => void;
}) {
  return (
    <div className="mode-overlay" role="dialog" aria-labelledby="mode-title">
      <div className="mode-card">
        <h1 id="mode-title" className="mode-title">
          Math calculator
        </h1>
        <p className="mode-lead">
          Please choose how answers are shown.
        </p>
        <div className="mode-options">
          <button
            type="button"
            className="mode-btn mode-steps"
            onClick={() => onSelect("steps")}
          >
            <span className="mode-btn-title">Step-by-step guide</span>
            <span className="mode-btn-desc">
              See each simplification until the final value (arithmetic,
              powers, trig, sqrt, constants).
            </span>
          </button>
          <button
            type="button"
            className="mode-btn mode-fast"
            onClick={() => onSelect("immediate")}
          >
            <span className="mode-btn-title">Result immediately</span>
            <span className="mode-btn-desc">
              Jump straight to the computed answer — no breakdown.
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

type KaboomPhase = null | "heat" | "explode" | "dialog";

const HEAT_MS = 1850;
const EXPLODE_MS = 2350;

export default function App() {
  const [mode, setMode] = useState<SolverMode | null>(null);
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [kaboomPhase, setKaboomPhase] = useState<KaboomPhase>(null);
  const [burstBox, setBurstBox] = useState<DOMRect | null>(null);
  const [kaboomSession, setKaboomSession] = useState(0);
  const appRef = useRef<HTMLDivElement>(null);
  const divideZeroOkRef = useRef<HTMLButtonElement>(null);

  const closeDivideZeroFlow = useCallback(() => {
    setKaboomPhase(null);
    setBurstBox(null);
    setResult("");
    setSteps([]);
    setError(null);
  }, []);

  useEffect(() => {
    if (kaboomPhase !== "heat") return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) {
      setKaboomPhase("dialog");
      return;
    }
    const id = window.setTimeout(() => {
      const box = appRef.current?.getBoundingClientRect() ?? null;
      setBurstBox(box);
      setKaboomSession((s) => s + 1);
      setKaboomPhase("explode");
    }, HEAT_MS);
    return () => window.clearTimeout(id);
  }, [kaboomPhase]);

  useEffect(() => {
    if (kaboomPhase !== "explode") return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const ms = reduced ? 0 : EXPLODE_MS;
    const id = window.setTimeout(() => setKaboomPhase("dialog"), ms);
    return () => window.clearTimeout(id);
  }, [kaboomPhase]);

  useEffect(() => {
    if (kaboomPhase !== "dialog") return;
    divideZeroOkRef.current?.focus();
  }, [kaboomPhase]);

  const runSolve = useCallback(() => {
    if (mode === null) return;
    const out = solveExpression(expr, mode);
    if (out.divideByZero) {
      setResult("");
      setSteps([]);
      setError(null);
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (reduced) {
        setBurstBox(null);
        setKaboomPhase("dialog");
      } else {
        setBurstBox(null);
        requestAnimationFrame(() => setKaboomPhase("heat"));
      }
      return;
    }
    setResult(out.result);
    setSteps(out.steps);
    setError(out.error);
  }, [expr, mode]);

  const insert = (key: string) => {
    if (key === "C") setExpr("");
    else if (key === "⌫") setExpr((s) => s.slice(0, -1));
    else setExpr((s) => s + key);
  };

  if (mode === null) {
    return <ModeChooser onSelect={setMode} />;
  }

  return (
    <div
      ref={appRef}
      className={`app${[
        kaboomPhase === "heat" ? " app--heat" : "",
        kaboomPhase === "explode" || kaboomPhase === "dialog"
          ? " app--kaboom"
          : "",
      ].join("")}`}
    >
      {kaboomPhase === "explode" && burstBox ? (
        <ShardBurst box={burstBox} session={kaboomSession} />
      ) : null}

      {kaboomPhase === "dialog" ? (
        <div
          className="divide-zero-layer"
          role="presentation"
        >
          <div
            className="divide-zero-dialog"
            role="alertdialog"
            aria-labelledby="divide-zero-title"
            aria-describedby="divide-zero-desc"
          >
            <div className="divide-zero-flash" aria-hidden />
            <h2 id="divide-zero-title" className="divide-zero-heading">
              That&apos;s division by zero
            </h2>
            <p id="divide-zero-desc" className="divide-zero-text">
              It is not allowed to divide anything by zero. Dividing by zero
              is undefined, so this calculator refuses to pretend otherwise.
            </p>
            <button
              ref={divideZeroOkRef}
              id="divide-zero-ok-btn"
              type="button"
              className="divide-zero-ok"
              onClick={closeDivideZeroFlow}
            >
              Ok, I get it.
            </button>
          </div>
        </div>
      ) : null}

      <header className="top-bar">
        <div className="brand">Math calculator</div>
        <div className="mode-pill" aria-live="polite">
          {mode === "steps" ? "Step-by-step" : "Immediate result"}
        </div>
        <button
          type="button"
          className="linkish"
          onClick={() => {
            setMode(null);
            setResult("");
            setSteps([]);
            setError(null);
            closeDivideZeroFlow();
          }}
        >
          Change mode
        </button>
      </header>

      <main className="main">
        <section className="panel input-panel" aria-label="Expression">
          <label className="field-label" htmlFor="expr-input">
            Expression
          </label>
          <input
            id="expr-input"
            className="expr-input"
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSolve();
            }}
            placeholder="e.g. (2+3)*4, sqrt(16), sin(pi/2)"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
          />
          <div className="actions">
            <button type="button" className="primary" onClick={runSolve}>
              Compute
            </button>
          </div>
          {error !== null ? (
            <p className="feedback error">{error}</p>
          ) : result !== "" ? (
            <p className="feedback ok">
              <span className="result-label">
                {mode === "steps" ? "Final" : "Result"}:{" "}
              </span>
              <strong className="result-value">{result}</strong>
            </p>
          ) : null}
        </section>

        <section className="panel keypad-panel" aria-label="Keypad">
          <div className="sci-row">
            {SCI_ROW.map((k) => (
              <button
                key={k}
                type="button"
                className="key sci"
                onClick={() => insert(k)}
              >
                {k}
              </button>
            ))}
          </div>
          {PAD_ROWS.map((row, i) => (
            <div key={String(i)} className="key-row">
              {row.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`key ${k === "C" ? "accent-warn" : ""}`}
                  onClick={() => insert(k)}
                >
                  {k}
                </button>
              ))}
            </div>
          ))}
          <button
            type="button"
            className="key key-wide equals"
            onClick={runSolve}
          >
            =
          </button>
        </section>

        {mode === "steps" && steps.length > 0 && (
          <section className="panel steps-panel" aria-label="Solution steps">
            <h2 className="steps-heading">Steps</h2>
            <ol className="steps-list">
              {steps.map((s, idx) => (
                <li key={`${idx}-${s}`}>{s}</li>
              ))}
            </ol>
          </section>
        )}
      </main>
    </div>
  );
}
