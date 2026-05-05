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

const HISTORY_KEY = "calculator-history-v1";
const HISTORY_CAP = 50;

export type HistoryEntry = {
  id: string;
  at: number;
  expression: string;
  /** Present when chaining from last result rewrote the input. */
  evaluatedAs?: string;
  mode: SolverMode;
  result: string;
  error: string | null;
};

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e) =>
          e &&
          typeof e.id === "string" &&
          typeof e.expression === "string",
      )
      .slice(0, HISTORY_CAP);
  } catch {
    return [];
  }
}

function newHistoryId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

const ANS_TOKEN = "ANS";

/**
 * Show ANS in the field when chaining from last result: + × ÷ ^ or -7-style minus.
 */
function applyAnsAutoPrefix(raw: string, lastAns: string): string {
  if (!lastAns) return raw;
  const leading = raw.match(/^\s*/)?.[0] ?? "";
  const body = raw.slice(leading.length);
  if (/^ANS\b/i.test(body)) return raw;

  if (/^(?:\+|\*|\/|\^)/.test(body)) {
    return `${leading}${ANS_TOKEN}${body}`;
  }

  /* -7, -0.5, -.25 at line start → ANS-… */
  if (/^-(?:\d+\.?\d*|\.\d+)/.test(body)) {
    return `${leading}${ANS_TOKEN}${body}`;
  }

  return raw;
}

/** Replace word ANS for mathjs; wrap value in parentheses for safe parsing */
function substituteAns(
  raw: string,
  lastAns: string,
): { effective: string; error: string | null } {
  if (!/\bANS\b/i.test(raw)) {
    return { effective: raw, error: null };
  }
  if (!lastAns) {
    return {
      effective: raw,
      error: "ANS is only available after you have computed a result.",
    };
  }
  const effective = raw.replace(/\bANS\b/gi, `(${lastAns})`);
  return { effective: effective.trim(), error: null };
}

export default function App() {
  const [mode, setMode] = useState<SolverMode | null>(null);
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  /** Stored from the last successful computation; drives ANS substitution */
  const [lastAnswer, setLastAnswer] = useState("");
  const [kaboomPhase, setKaboomPhase] = useState<KaboomPhase>(null);
  const [burstBox, setBurstBox] = useState<DOMRect | null>(null);
  const [kaboomSession, setKaboomSession] = useState(0);
  const appRef = useRef<HTMLDivElement>(null);
  const divideZeroOkRef = useRef<HTMLButtonElement>(null);
  const exprInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      /* ignore quota */
    }
  }, [history]);

  const closeDivideZeroFlow = useCallback(() => {
    setKaboomPhase(null);
    setBurstBox(null);
    setExpr("");
    setResult("");
    setSteps([]);
    setError(null);
    queueMicrotask(() => exprInputRef.current?.focus());
  }, []);

  const ansExpandedPreview = useMemo(() => {
    if (!/\bANS\b/i.test(expr) || !lastAnswer) return null;
    const sub = substituteAns(expr, lastAnswer);
    if (sub.error) return null;
    const eff = sub.effective.trim();
    if (!eff || eff === expr.trim()) return null;
    return eff;
  }, [expr, lastAnswer]);

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
    const trimmedDisplay = expr.trim();
    if (trimmedDisplay === "") {
      setError("Enter an expression.");
      setResult("");
      setSteps([]);
      return;
    }

    const sub = substituteAns(expr, lastAnswer);
    if (sub.error) {
      setError(sub.error);
      setResult("");
      setSteps([]);
      return;
    }

    const out = solveExpression(sub.effective, mode);
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

    const succeeded = !out.error && out.result !== "";
    if (succeeded) {
      setLastAnswer(out.result);
      setExpr("");
      queueMicrotask(() => exprInputRef.current?.focus());
    }

    const entryEval =
      /\bANS\b/i.test(trimmedDisplay) ? sub.effective : undefined;
    const entry: HistoryEntry = {
      id: newHistoryId(),
      at: Date.now(),
      expression: trimmedDisplay,
      evaluatedAs: entryEval,
      mode,
      result: out.result,
      error: out.error,
    };
    setHistory((prev) =>
      [entry, ...prev].slice(0, HISTORY_CAP),
    );
  }, [expr, mode, lastAnswer]);

  const appendAnsToken = useCallback(() => {
    setExpr((prev) => prev + ANS_TOKEN);
    queueMicrotask(() => exprInputRef.current?.focus());
  }, []);

  const handleExprChange = useCallback(
    (value: string) => {
      setExpr(applyAnsAutoPrefix(value, lastAnswer));
    },
    [lastAnswer],
  );

  const insert = (key: string) => {
    if (key === "C") setExpr("");
    else if (key === "⌫")
      setExpr((s) => applyAnsAutoPrefix(s.slice(0, -1), lastAnswer));
    else setExpr((s) => applyAnsAutoPrefix(s + key, lastAnswer));
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
            setLastAnswer("");
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
            ref={exprInputRef}
            id="expr-input"
            className="expr-input"
            value={expr}
            onChange={(e) => handleExprChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSolve();
            }}
            placeholder="e.g. 10+5 — after a result, type +3 or −7 or insert ANS"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
          />
          <p className="chain-hint-help">
            After a successful <strong>Compute</strong>, the expression line is
            cleared. While you have a last answer, typing{" "}
            <code className="chain-code">+</code>,{" "}
            <code className="chain-code">*</code>,{" "}
            <code className="chain-code">/</code>,{" "}
            <code className="chain-code">^</code>, or starting a numeric
            negative like <code className="chain-code">-7</code> inserts{" "}
            <strong>{ANS_TOKEN}</strong> automatically (shown as{" "}
            <code className="chain-code">{ANS_TOKEN}-7</code>,{" "}
            <code className="chain-code">
              {ANS_TOKEN}+ …
            </code>
            , etc.).
          </p>
          {ansExpandedPreview ? (
            <p className="chain-hint" aria-live="polite">
              Evaluates as:{" "}
              <code className="chain-hint-code">{ansExpandedPreview}</code>
            </p>
          ) : null}
          {lastAnswer ? (
            <p className="last-answer-line" aria-live="polite">
              Last answer:{" "}
              <code className="last-answer-val">{lastAnswer}</code>
            </p>
          ) : null}
          <div className="actions actions-row">
            <button type="button" className="primary" onClick={runSolve}>
              Compute
            </button>
            <button
              type="button"
              className="ans-btn"
              disabled={lastAnswer === ""}
              title="Insert ANS (uses the last answer when you compute)"
              onClick={appendAnsToken}
            >
              Ans
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

        <section className="panel history-panel" aria-label="Calculation history">
          <div className="history-header">
            <h2 className="history-heading">History</h2>
            {history.length > 0 ? (
              <button
                type="button"
                className="history-clear"
                onClick={() => setHistory([])}
              >
                Clear
              </button>
            ) : null}
          </div>
          {history.length === 0 ? (
            <p className="history-empty">No calculations recorded yet.</p>
          ) : (
            <ul className="history-list">
              {history.map((h) => (
                <li key={h.id} className="history-item">
                  <div className="history-row">
                    <code className="history-expr">{h.expression}</code>
                    <span className="history-mode-badge" title="Solve mode">
                      {h.mode === "steps" ? "Steps" : "Quick"}
                    </span>
                  </div>
                  {h.evaluatedAs !== undefined &&
                  h.evaluatedAs !== h.expression ? (
                    <p className="history-eval">
                      Evaluated as:{" "}
                      <code>{h.evaluatedAs}</code>
                    </p>
                  ) : null}
                  {h.error ? (
                    <p className="history-out history-out--error">{h.error}</p>
                  ) : (
                    <p className="history-out history-out--ok">
                      = <strong>{h.result}</strong>
                    </p>
                  )}
                  <time
                    className="history-time"
                    dateTime={new Date(h.at).toISOString()}
                  >
                    {new Date(h.at).toLocaleString(undefined, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
