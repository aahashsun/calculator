import {
  evaluate,
  format,
  parse,
  type ConstantNode,
  type FunctionNode,
  type MathNode,
  type OperatorNode,
  type ParenthesisNode,
  type SymbolNode,
} from "mathjs";

/** Thrown when evaluation requires dividing by zero (or modulo by zero). */
export class DivisionByZeroError extends Error {
  override readonly name = "DivisionByZeroError";
  constructor() {
    super("Division by zero");
  }
}

const BUILT_INS: Record<string, number> = {
  pi: Math.PI,
  PI: Math.PI,
  tau: Math.PI * 2,
  e: Math.E,
  E: Math.E,
  phi: (1 + Math.sqrt(5)) / 2,
  LN2: Math.LN2,
  ln2: Math.LN2,
  LN10: Math.LN10,
  ln10: Math.LN10,
  SQRT2: Math.SQRT2,
  sqrt2: Math.SQRT2,
};

function formatScalar(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const r = Math.round(n * 1e14) / 1e14;
  if (Object.is(r, -0)) return "0";
  return Object.is(parseFloat(String(r)), r)
    ? String(r)
    : r.toPrecision(12).replace(/\.?0+$/, "");
}

function stringifyNode(node: MathNode): string {
  return node.toString({ parenthesis: "auto", implicit: "hide" });
}

function functionSymbol(fn: FunctionNode["fn"]): string | null {
  if (
    typeof fn === "object" &&
    fn !== null &&
    "type" in fn &&
    fn.type === "SymbolNode"
  ) {
    return (fn as SymbolNode).name;
  }
  return null;
}

type EvalOut = { value: number; steps: string[] };

function applyBinary(
  fn: OperatorNode["fn"],
  left: number,
  right: number,
): number {
  switch (fn) {
    case "add":
      return left + right;
    case "subtract":
      return left - right;
    case "multiply":
      return left * right;
    case "divide":
      if (right === 0) {
        throw new DivisionByZeroError();
      }
      return left / right;
    case "pow":
      return left ** right;
    case "mod":
      if (right === 0) {
        throw new DivisionByZeroError();
      }
      return ((left % right) + right) % right;
    default:
      throw new Error(`Unsupported operator: ${fn}`);
  }
}

function applyUnary(fn: OperatorNode["fn"], arg: number): number {
  switch (fn) {
    case "unaryMinus":
      return -arg;
    case "unaryPlus":
      return arg;
    case "factorial": {
      if (arg < 0 || !Number.isInteger(arg)) {
        throw new Error("Factorial is only defined for non-negative integers");
      }
      let p = 1;
      for (let i = 2; i <= arg; i++) p *= i;
      return p;
    }
    default:
      throw new Error(`Unsupported unary operator: ${fn}`);
  }
}

function applyFunction(name: string, args: number[]): number {
  const [a = 0, b = 0] = args;
  switch (name) {
    case "sqrt":
      return Math.sqrt(a);
    case "abs":
      return Math.abs(a);
    case "exp":
      return Math.exp(a);
    case "log":
    case "ln":
      return Math.log(a);
    case "log10":
      return Math.log10(a);
    case "log2":
      return Math.log2(a);
    case "sin":
      return Math.sin(a);
    case "cos":
      return Math.cos(a);
    case "tan":
      return Math.tan(a);
    case "asin":
      return Math.asin(a);
    case "acos":
      return Math.acos(a);
    case "atan":
      return Math.atan(a);
    case "sinh":
      return Math.sinh(a);
    case "cosh":
      return Math.cosh(a);
    case "tanh":
      return Math.tanh(a);
    case "floor":
      return Math.floor(a);
    case "ceil":
      return Math.ceil(a);
    case "round":
      return Math.round(a);
    case "gcd": {
      let x = Math.abs(Math.round(a));
      let y = Math.abs(Math.round(b));
      while (y) {
        const t = y;
        y = x % y;
        x = t;
      }
      return x;
    }
    default:
      throw new Error(`Unsupported function "${name}"`);
  }
}

/** Depth-first numeric evaluation with human-readable intermediate steps */
function evaluateWithSteps(node: MathNode): EvalOut {
  switch (node.type) {
    case "ParenthesisNode":
      return evaluateWithSteps(
        (node as ParenthesisNode).content as MathNode,
      );

    case "ConstantNode": {
      const cNode = node as ConstantNode;
      const raw = cNode.evaluate();
      const value =
        typeof raw === "number" ? raw : Number(raw as string | bigint);
      if (Number.isNaN(value))
        throw new Error("Could not read number from expression");
      return { value, steps: [] };
    }

    case "SymbolNode": {
      const sNode = node as SymbolNode;
      const resolved = BUILT_INS[sNode.name];
      if (resolved === undefined)
        throw new Error(
          `Unknown symbol "${sNode.name}". Supported: π, e, and numeric expressions.`,
        );
      return { value: resolved, steps: [] };
    }

    case "OperatorNode": {
      const op = node as OperatorNode;

      if (op.isUnary()) {
        const [inner] = op.args;
        const innerRes = evaluateWithSteps(inner);
        const allSteps = [...innerRes.steps];
        const next = applyUnary(op.fn, innerRes.value);
        const lv = formatScalar(innerRes.value);
        const label =
          op.fn === "factorial"
            ? `${lv}!`
            : op.fn === "unaryMinus"
              ? `-${lv}`
              : op.fn === "unaryPlus"
                ? `+${lv}`
                : stringifyNode(op);
        allSteps.push(`${label} = ${formatScalar(next)}`);
        return { value: next, steps: allSteps };
      }

      const [aNode, bNode] = op.args;
      const left = evaluateWithSteps(aNode);
      const right = evaluateWithSteps(bNode);
      const steps = [...left.steps, ...right.steps];
      const label = `${formatScalar(left.value)} ${op.op} ${formatScalar(right.value)}`;
      const value = applyBinary(op.fn, left.value, right.value);
      steps.push(`${label} = ${formatScalar(value)}`);
      return { value, steps };
    }

    case "FunctionNode": {
      const fnode = node as FunctionNode;
      const fnameRaw = functionSymbol(fnode.fn);
      if (!fnameRaw) throw new Error("Unsupported function expression");
      const argResults = fnode.args.map((arg: MathNode) =>
        evaluateWithSteps(arg),
      );
      const merged = argResults.flatMap((r) => r.steps);
      const vals = argResults.map((r) => r.value);
      const argStr = vals.map((v) => formatScalar(v)).join(", ");
      const value = applyFunction(fnameRaw.toLowerCase(), vals);
      merged.push(
        `${fnameRaw}(${argStr}) = ${formatScalar(value)}`,
      );
      return { value, steps: merged };
    }

    default:
      throw new Error(
        `Unsupported syntax (${node.type}). Try arithmetic, sqrt, trig, powers, and parentheses.`,
      );
  }
}

export type SolveResult = {
  result: string;
  steps: string[];
  error: string | null;
  /** True when denominator became zero — UI may show explosion + notice. */
  divideByZero: boolean;
};

export function solveExpression(
  expr: string,
  mode: "steps" | "immediate",
): SolveResult {
  const trimmed = expr.trim();
  if (!trimmed) {
    return {
      result: "",
      steps: [],
      error: "Enter an expression.",
      divideByZero: false,
    };
  }

  try {
    if (mode === "immediate") {
      const raw = evaluate(trimmed);
      if (typeof raw === "boolean") {
        return {
          result: raw ? "true" : "false",
          steps: [],
          error: null,
          divideByZero: false,
        };
      }
      if (typeof raw === "number") {
        if (!Number.isFinite(raw)) {
          return {
            result: "",
            steps: [],
            error: null,
            divideByZero: true,
          };
        }
        return {
          result: formatScalar(raw),
          steps: [],
          error: null,
          divideByZero: false,
        };
      }
      try {
        const s = format(raw, { precision: 14 });
        return { result: s, steps: [], error: null, divideByZero: false };
      } catch {
        return {
          result: String(raw),
          steps: [],
          error: null,
          divideByZero: false,
        };
      }
    }

    const node = parse(trimmed);
    const { value, steps } = evaluateWithSteps(node);
    return {
      result: formatScalar(value),
      steps,
      error: null,
      divideByZero: false,
    };
  } catch (e) {
    if (e instanceof DivisionByZeroError) {
      return {
        result: "",
        steps: [],
        error: null,
        divideByZero: true,
      };
    }
    const message = e instanceof Error ? e.message : String(e);
    return {
      result: "",
      steps: [],
      error: message,
      divideByZero: false,
    };
  }
}
