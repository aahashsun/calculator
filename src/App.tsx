import { useCallback, useState } from "react";
import "./App.css";
import { solveExpression } from "./mathSteps";

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

export default function App() {
  const [mode, setMode] = useState<SolverMode | null>(null);
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const runSolve = useCallback(() => {
    if (mode === null) return;
    const out = solveExpression(expr, mode);
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
    <div className="app">
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
