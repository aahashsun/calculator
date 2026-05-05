# Calculator

A browser-based math calculator built with **React**, **TypeScript**, and **[mathjs](https://mathjs.org/)**. Before you calculate, you choose how results are presented; afterward you get step-by-step or immediate answers, a persistent history, and expressive “continue from last result” behaviour using **`ANS`**.

---

## Features

### Modes

On first launch you pick one mode (you can switch later):

- **Step-by-step guide** — Walks through intermediate simplifications for supported numeric expressions (order of operations, functions, etc.).
- **Immediate result** — Computes the answer without showing the breakdown.

Both modes parse the same expression language.

### Expressions

- Arithmetic, parentheses, powers (`^`), and common functions (e.g. `sqrt`, `sin`, `cos`, `tan`, `log`, `abs`, …).
- Built-in constants **`pi`** and **`e`** (and related mathjs literals where applicable).

### Last answer and **`ANS`**

After a **successful** calculation (no error, non-empty result):

- The **expression field is cleared**; the numeric result is stored as the **last answer**.
- Typing **`+`**, **`*`**, **`/`**, or **`^`** at the start of a new line (with an existing last answer) automatically inserts **`ANS`** so you see e.g. `ANS+ …`, `ANS* …`.
- Leading negative numbers like **`-7`** become **`ANS-7`** when a last answer exists (binary subtraction from that answer).

**`Ans` button:** inserts the token **`ANS`** at the cursor (enabled when there is a last answer).

Underlying evaluation replaces each **`ANS`** with the stored value before mathjs runs, so chaining is predictable. A hint line shows the expanded expression when **`ANS`** is present.

### History

Completed runs are listed in reverse chronological order (**newest first**), with:

- Expression as entered (including `ANS` when applicable),
- **Evaluated as** when substitution was applied,
- Outcome (**result** or **error message**),
- Timestamp,
- Solve mode (**Steps** / **Quick**).

History is stored in **`localStorage`** (capped at 50 entries) and can be cleared with **Clear**.

### Division by zero

Division (or modulus) where the denominator is zero triggers:

1. **Overheat phase** — The UI shifts from cool tones toward a warm glow (respects **`prefers-reduced-motion`**).
2. **Explosion** — The calculator area transitions into a short animated shard burst.
3. **Dialog** — Explains that division by zero is not allowed; **Ok, I get it.** resets the flow and clears the expression and on-screen feedback (division-by-zero attempts are **not** added to history).

### Accessibility

Reduced motion skips the overheating/explosion sequence and jumps straight to the division-by-zero dialog.

---

## License

This project is open source under the MIT License.
