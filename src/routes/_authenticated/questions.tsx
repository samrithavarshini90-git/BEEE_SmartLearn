import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ListChecks, AlertCircle } from "lucide-react";
import { listImportantQuestions } from "@/lib/beee.functions";
import { UnitTabs } from "@/components/app/unit-tabs";

export const Route = createFileRoute("/_authenticated/questions")({
  component: QuestionsPage,
});

const MARK_TABS: { label: string; value: 2 | 5 | 10 }[] = [
  { label: "2 marks", value: 2 },
  { label: "5 marks", value: 5 },
  { label: "10 marks", value: 10 },
];

function highlightInlineUnits(text: string) {
  const regex = /(\b\d+(?:\.\d+)?\s*(?:V|A|W|J|Ω|Hz|F|H|S|ohms|volts|amperes|watts|joules)\b|\b\d+(?:\.\d+)?V\b|\b\d+(?:\.\d+)?A\b)/gi;
  const parts = text.split(regex);
  if (parts.length === 1) return text;
  
  return parts.map((part, i) => {
    if (part.match(regex)) {
      return (
        <code key={i} className="mx-0.5 rounded bg-brand/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-brand">
          {part}
        </code>
      );
    }
    return part;
  });
}

function formatInlineStyles(text: string) {
  const parts = text.split(/(\*\*.+?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {highlightInlineUnits(part.slice(2, -2))}
        </strong>
      );
    }
    return highlightInlineUnits(part);
  });
}

function FormattedAnswer({ text }: { text: string }) {
  // Replace literal escape characters (\n, \t) with actual linebreaks/tabs
  const cleanText = text.replace(/\\n/g, "\n").replace(/\\t/g, "\t").trim();
  const lines = cleanText.split("\n");

  const elements: React.ReactNode[] = [];
  let currentTable: { headers: string[]; rows: string[][] } | null = null;
  let listItems: string[] = [];
  let inList = false;

  const flushList = (key: string | number) => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${key}`} className="list-disc pl-5 space-y-1.5 my-3">
          {listItems.map((item, idx) => (
            <li key={idx} className="text-sm text-muted-foreground">
              {formatInlineStyles(item)}
            </li>
          ))}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };

  const flushTable = (key: string | number) => {
    if (currentTable) {
      elements.push(
        <div key={`table-${key}`} className="my-4 overflow-x-auto rounded-xl border border-border bg-surface shadow-soft max-w-full">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-surface-muted border-b border-border">
                {currentTable.headers.map((h, idx) => (
                  <th key={idx} className="px-4 py-3 font-semibold text-foreground uppercase tracking-wider text-xs">
                    {formatInlineStyles(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {currentTable.rows.map((row, rIdx) => (
                <tr key={rIdx} className="border-b border-border/60 last:border-0 hover:bg-surface-muted/10">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-4 py-3 text-muted-foreground align-top">
                      {formatInlineStyles(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      currentTable = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      flushList(i);
      flushTable(i);
      continue;
    }

    // Table Row Parsing
    if (line.startsWith("|")) {
      flushList(i);
      const cells = line
        .split("|")
        .map((c) => c.trim())
        .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);

      if (cells.every((c) => /^:-*-*:?$/.test(c) || c.startsWith("-"))) {
        continue; // skip separator lines
      }

      if (!currentTable) {
        currentTable = { headers: cells, rows: [] };
      } else {
        currentTable.rows.push(cells);
      }
      continue;
    } else {
      flushTable(i);
    }

    // List Bullet Item Parsing (* or - or •)
    const listMatch = line.match(/^[\*\-•]\s+(.+)$/);
    if (listMatch) {
      inList = true;
      listItems.push(listMatch[1]);
      continue;
    } else if (inList) {
      flushList(i);
    }

    // Heading lines (# Heading)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      const sizeClass = level === 1 ? "text-2xl font-bold mt-5 mb-3" : level === 2 ? "text-lg font-bold mt-4 mb-2.5" : "text-base font-semibold mt-3 mb-2";
      elements.push(
        <h4 key={i} className={`${sizeClass} text-foreground`}>
          {formatInlineStyles(content)}
        </h4>
      );
      continue;
    }

    // Bold title block heading e.g., "**Construction:**"
    const boldHeaderMatch = line.match(/^\*\*(.+?):\*\*\s*(.*)$/);
    if (boldHeaderMatch) {
      const title = boldHeaderMatch[1];
      const desc = boldHeaderMatch[2];
      elements.push(
        <div key={i} className="mt-4 mb-2">
          <h4 className="text-xs font-bold text-foreground uppercase tracking-wider border-b border-border/40 pb-1 mb-2">
            {title}
          </h4>
          {desc && (
            <p className="text-sm text-muted-foreground leading-relaxed mt-1">
              {formatInlineStyles(desc)}
            </p>
          )}
        </div>
      );
      continue;
    }

    // Numeric step stepper: "1. KCL Node: Description" or "1. Description"
    const stepMatch = line.match(/^(\d+)\.\s*(.+)$/);
    if (stepMatch) {
      const stepNum = stepMatch[1];
      const rest = stepMatch[2];
      const titleMatch = rest.match(/^([^:]+):\s*(.+)$/);
      if (titleMatch) {
        elements.push(
          <div key={i} className="flex gap-3 rounded-xl border border-border/40 bg-surface/40 p-4 shadow-sm my-3 w-full">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
              {stepNum}
            </span>
            <div>
              <h4 className="font-semibold text-foreground text-sm">{titleMatch[1].trim()}</h4>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{formatInlineStyles(titleMatch[2].trim())}</p>
            </div>
          </div>
        );
      } else {
        elements.push(
          <div key={i} className="flex gap-3 rounded-xl border border-border/40 bg-surface/40 p-4 shadow-sm my-3 w-full">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
              {stepNum}
            </span>
            <div>
              <h4 className="font-semibold text-foreground text-sm">Step {stepNum}</h4>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{formatInlineStyles(rest.trim())}</p>
            </div>
          </div>
        );
      }
      continue;
    }

    // Equation Detection
    const hasEquals = line.includes("=");
    const isShort = line.length < 120;
    const isEquation = hasEquals && isShort && !line.includes("states") && !line.includes("states that") && !line.includes("called") && !line.includes("ground");

    if (isEquation) {
      const labelMatch = line.match(/(.+?)\s*(?:--\s*\(?(\d+)\)?|\((\d+)\))$/);
      if (labelMatch) {
        elements.push(
          <div key={i} className="flex items-center justify-between gap-4 rounded-xl border border-border/80 bg-surface px-5 py-3 font-mono text-sm font-semibold text-foreground shadow-soft max-w-xl mx-auto my-3 w-full">
            <span className="text-brand truncate">{labelMatch[1].trim()}</span>
            <span className="text-[10px] font-semibold text-muted-foreground bg-surface-muted px-2 py-0.5 rounded border border-border shrink-0">
              eq. {labelMatch[2] || labelMatch[3]}
            </span>
          </div>
        );
      } else {
        elements.push(
          <div key={i} className="flex items-center justify-between gap-4 rounded-xl border border-border/80 bg-surface px-5 py-3 font-mono text-sm font-semibold text-foreground shadow-soft max-w-xl mx-auto my-3 w-full">
            <span className="text-brand truncate">{line}</span>
          </div>
        );
      }
      continue;
    }

    // Standard text line
    elements.push(
      <p key={i} className="text-sm text-muted-foreground leading-relaxed py-1">
        {formatInlineStyles(line)}
      </p>
    );
  }

  // Flush remaining lists or tables
  flushList("end");
  flushTable("end");

  return <div className="space-y-1.5">{elements}</div>;
}

function QuestionsPage() {
  const fetchQuestions = useServerFn(listImportantQuestions);
  const [marks, setMarks] = useState<2 | 5 | 10>(2);
  const [unit, setUnit] = useState<number | null>(1);

  const { data, isLoading } = useQuery({
    queryKey: ["important-questions", marks, unit],
    queryFn: () =>
      fetchQuestions({ data: { marks, ...(unit ? { unit_number: unit } : {}) } }),
  });

  const grouped = useMemo(() => {
    const rows = data ?? [];
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const arr = map.get(r.topic) ?? [];
      arr.push(r);
      map.set(r.topic, arr);
    }
    return Array.from(map.entries());
  }, [data]);

  return (
    <div className="space-y-8">
      <header>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground shadow-soft">
          <ListChecks className="h-3.5 w-3.5 text-brand" />
          Important Questions
        </div>
        <h1 className="mt-3 text-3xl font-bold text-foreground">Exam question bank</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Syllabus-driven 2, 5 and 10-mark questions with model answer outlines.
        </p>
      </header>

      <div className="space-y-3">
        <UnitTabs value={unit} onChange={setUnit} />
        <div className="inline-flex rounded-full border border-border bg-surface-muted p-1">
          {MARK_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setMarks(t.value)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                marks === t.value
                  ? "bg-surface text-foreground shadow-soft"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-surface-muted" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <div className="card-soft p-10 text-center text-sm text-muted-foreground">
          No questions available for this filter.
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(([topic, rows]) => (
            <section key={topic}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {topic}
              </h2>
              <ol className="space-y-6">
                {rows.map((q, i) => (
                  <li key={q.id} className="card-soft p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="font-mono text-xs font-semibold text-muted-foreground">
                          Q{i + 1}
                        </span>
                        <h3 className="mt-1 text-base font-semibold text-foreground leading-snug">
                          {q.question}
                        </h3>
                      </div>
                      <span className="shrink-0 rounded-full border border-border bg-secondary px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        U{q.unit_number} · {q.marks}m
                      </span>
                    </div>

                    {q.answer_outline && (
                      <div className="mt-4 rounded-2xl border border-border bg-surface-muted/50 p-5">
                        <div className="flex items-center gap-2 border-b border-border/60 pb-2 mb-2">
                          <AlertCircle className="h-4 w-4 text-brand shrink-0" />
                          <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                            Model Answer Outline
                          </span>
                        </div>
                        <FormattedAnswer text={q.answer_outline} />
                      </div>
                    )}

                    {q.diagram_hint && (
                      <div className="mt-4 rounded-2xl border border-dashed border-border bg-surface-muted/30 p-4 text-center">
                        <div className="flex flex-col items-center justify-center gap-1.5">
                          <span className="text-lg">📐</span>
                          <div className="text-xs font-semibold text-foreground uppercase tracking-wider">
                            Model Schematic Guide
                          </div>
                          <p className="text-xs text-muted-foreground max-w-md">
                            Draw a standard <span className="font-semibold text-brand">{q.diagram_hint}</span> diagram labeling all voltages, currents, and component parameters.
                          </p>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
