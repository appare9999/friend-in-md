import katex from "katex";
import "katex/dist/katex.min.css";

interface Entry {
  label: string;
  syntax: string;
  displayMode?: boolean;
}

interface Group {
  title: string;
  entries: Entry[];
}

const GROUPS: Group[] = [
  {
    title: "Sub / superscript",
    entries: [
      { label: "Superscript", syntax: "x^2" },
      { label: "Subscript", syntax: "x_i" },
      { label: "Both", syntax: "x_i^2" },
      { label: "Group with braces", syntax: "x^{10}_{i+1}" },
    ],
  },
  {
    title: "Fractions & roots",
    entries: [
      { label: "Fraction", syntax: "\\frac{a}{b}" },
      { label: "Square root", syntax: "\\sqrt{x}" },
      { label: "Nth root", syntax: "\\sqrt[n]{x}" },
    ],
  },
  {
    title: "Greek letters",
    entries: [
      { label: "Lowercase", syntax: "\\alpha \\beta \\gamma \\delta \\theta \\lambda \\mu \\pi \\sigma \\phi \\omega" },
      { label: "Uppercase", syntax: "\\Gamma \\Delta \\Theta \\Lambda \\Sigma \\Phi \\Omega" },
    ],
  },
  {
    title: "Operators & relations",
    entries: [
      { label: "Basic ops", syntax: "\\times \\div \\cdot \\pm \\mp" },
      { label: "Comparisons", syntax: "\\leq \\geq \\neq \\approx \\equiv" },
      { label: "Sets", syntax: "\\in \\notin \\subset \\subseteq \\cup \\cap \\emptyset" },
      { label: "Infinity / arrows", syntax: "\\infty \\to \\rightarrow \\Rightarrow \\leftrightarrow" },
    ],
  },
  {
    title: "Sums, products, integrals",
    entries: [
      { label: "Sum", syntax: "\\sum_{i=1}^{n} i" },
      { label: "Product", syntax: "\\prod_{i=1}^{n} i" },
      { label: "Integral", syntax: "\\int_a^b f(x)\\,dx" },
      { label: "Limit", syntax: "\\lim_{x \\to \\infty} f(x)" },
    ],
  },
  {
    title: "Matrices & cases",
    entries: [
      {
        label: "Matrix (parentheses)",
        syntax: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}",
        displayMode: true,
      },
      {
        label: "Piecewise / cases",
        syntax: "f(x) = \\begin{cases} 1 & x \\geq 0 \\\\ -1 & x < 0 \\end{cases}",
        displayMode: true,
      },
    ],
  },
  {
    title: "Other useful bits",
    entries: [
      { label: "Vector", syntax: "\\vec{v}" },
      { label: "Plain text inside math", syntax: "\\text{if } x > 0" },
      { label: "Absolute value", syntax: "|x|" },
      { label: "Binomial", syntax: "\\binom{n}{k}" },
    ],
  },
];

function renderKatex(syntax: string, displayMode: boolean): string {
  try {
    return katex.renderToString(syntax, { throwOnError: false, displayMode });
  } catch {
    return syntax;
  }
}

interface Props {
  onClose: () => void;
}

export function LatexCheatsheetModal({ onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal latex-cheatsheet-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>📐 LaTeX cheatsheet</span>
          <button className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="latex-cheatsheet-body">
          <p className="latex-cheatsheet-hint">
            Type these inside <code>$...$</code> (inline) or a ` ```latex ` block (display). Click a row to copy the
            syntax.
          </p>
          {GROUPS.map((group) => (
            <div className="latex-cheatsheet-group" key={group.title}>
              <h3>{group.title}</h3>
              {group.entries.map((entry) => (
                <button
                  type="button"
                  key={entry.syntax}
                  className="latex-cheatsheet-row"
                  onClick={() => navigator.clipboard?.writeText(entry.syntax).catch(() => {})}
                  title="Click to copy"
                >
                  <span className="latex-cheatsheet-label">{entry.label}</span>
                  <span
                    className="latex-cheatsheet-preview"
                    dangerouslySetInnerHTML={{ __html: renderKatex(entry.syntax, entry.displayMode ?? false) }}
                  />
                  <code className="latex-cheatsheet-syntax">{entry.syntax}</code>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
