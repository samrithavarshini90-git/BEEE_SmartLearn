import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callLovableAI, callCerebrasVision, safeParseJson } from "@/lib/ai-gateway.server";
import { query, ensureDb } from "@/lib/db.server";
import { hashPassword, signToken } from "@/lib/auth-utils.server";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";

// ---------- Shared types ----------

export interface LogicalComponent {
  type: "SourceV" | "SourceI" | "BatteryCell" | "Resistor" | "Capacitor" | "Inductor" | "Diode" | "BjtNpn" | "Line";
  label: string;
  annotation?: string;
  role: "source" | "component" | "short" | "open";
}
export interface LogicalDiagramStep {
  description: string;
  components: LogicalComponent[];
}
export interface SolutionStep {
  step: number;
  description: string;
  expression?: string;
  diagram?: LogicalDiagramStep | DiagramData | null;
}
export interface DiagramNode {
  id: string;
  kind:
  | "resistor"
  | "inductor"
  | "capacitor"
  | "battery"
  | "ac_source"
  | "switch"
  | "diode"
  | "transistor_npn"
  | "transistor_pnp"
  | "ground"
  | "node"
  | "label";
  label?: string;
  value?: string;
  x: number;
  y: number;
}
export interface DiagramEdge {
  from: string;
  to: string;
}
export interface SchemdrawInstruction {
  type: string;
  direction: string;
  label: string;
  label2?: string;
  length: number;
}
export interface DiagramData {
  description: string;
  schemdraw_instructions?: SchemdrawInstruction[];
  svg?: string;
  error?: string;
  ascii?: string;
  image_url?: string;
}
export interface SolverResponse {
  unit_number?: number;
  topic: string;
  question: string;
  steps: SolutionStep[];
  formulas_used: string[];
  final_answer: string;
  diagram?: DiagramData | null;
  extracted_text?: string;
}

export interface DashboardData {
  profile: { full_name: string; email: string; username: string; role: "student" | "admin" };
  stats: {
    total_solved: number;
    total_marks: number;
    topics_covered: number;
    last_7_days_solved: number;
    quiz_attempts: number;
    avg_quiz_score: number;
    achievements: number;
  };
  progress_by_unit: { unit_number: number; unit_title: string; items_completed: number; points: number }[];
  progress_by_topic: { topic: string; solved: number; marks: number }[];
  recent_activity: {
    id: string;
    type: string;
    topic: string | null;
    description: string | null;
    created_at: string;
  }[];
  recent_solved: {
    id: string;
    topic: string | null;
    question: string;
    marks: number;
    created_at: string;
  }[];
  achievements: { code: string; title: string; description: string; icon: string; earned_at: string }[];
}

// Utility helper to safely parse JSON returned from TiDB (could be object or string)
function parseJsonField<T>(fieldVal: any): T {
  if (fieldVal === null || fieldVal === undefined) return [] as unknown as T;
  if (typeof fieldVal === "string") {
    try {
      return JSON.parse(fieldVal) as T;
    } catch {
      return fieldVal as unknown as T;
    }
  }
  return fieldVal as T;
}

// ---------- Custom Authentication Server Functions ----------

export const signUpUser = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        username: z.string().trim().min(3).max(80),
        email: z.string().trim().email().max(160),
        password: z.string().min(4).max(72),
        fullName: z.string().trim().max(80).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    await ensureDb();
    // Check if username or email already exists
    const existing = await query(
      "SELECT id, username, email FROM users WHERE username = ? OR email = ?",
      [data.username, data.email]
    );
    if (existing.length > 0) {
      const match = existing[0];
      if (match.username.toLowerCase() === data.username.toLowerCase()) {
        throw new Error("Username is already taken.");
      }
      if (match.email.toLowerCase() === data.email.toLowerCase()) {
        throw new Error("Email is already registered.");
      }
    }

    const userId = crypto.randomUUID();
    const passHash = hashPassword(data.password);
    const role = "student";

    await query(
      "INSERT INTO users (id, username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?, ?)",
      [userId, data.username, data.email, passHash, data.fullName || "", role]
    );

    // Create session token (JWT)
    const tokenPayload = {
      sub: userId,
      username: data.username,
      email: data.email,
      fullName: data.fullName || "",
      role,
    };
    const token = signToken(tokenPayload);

    return {
      token,
      user: {
        id: userId,
        email: data.email,
        username: data.username,
        role,
        user_metadata: { full_name: data.fullName || "" },
      },
    };
  });

export const signInUser = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        loginIdentifier: z.string().trim().min(3),
        password: z.string().min(4),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    await ensureDb();
    const users = await query(
      "SELECT id, username, email, password_hash, full_name, role FROM users WHERE username = ? OR email = ?",
      [data.loginIdentifier, data.loginIdentifier]
    );
    if (users.length === 0) {
      throw new Error("Invalid username or password.");
    }

    const user = users[0];
    const passHash = hashPassword(data.password);
    if (user.password_hash !== passHash) {
      throw new Error("Invalid username or password.");
    }

    // Create session token (JWT)
    const tokenPayload = {
      sub: user.id,
      username: user.username,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
    };
    const token = signToken(tokenPayload);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        user_metadata: { full_name: user.full_name },
      },
    };
  });

// ---------- Units ----------

export const listUnits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const rows = await query("SELECT unit_number, title, description, topics FROM syllabus_units ORDER BY unit_number");
    return rows.map((r: any) => ({
      unit_number: r.unit_number,
      title: r.title,
      description: r.description,
      topics: parseJsonField<string[]>(r.topics),
    }));
  });

// ---------- Formulas ----------

export const listFormulas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        unit_number: z.number().int().min(1).max(6).optional(),
        topic: z.string().optional(),
      })
      .parse(raw ?? {}),
  )
  .handler(async ({ data }) => {
    let sql = "SELECT id, unit_number, topic, name, formula, latex, explanation, variables, image_url FROM formulas WHERE 1=1";
    const params = [];
    if (data.unit_number) {
      sql += " AND unit_number = ?";
      params.push(data.unit_number);
    }
    if (data.topic) {
      sql += " AND topic = ?";
      params.push(data.topic);
    }
    sql += " ORDER BY unit_number, topic, name";

    const rows = await query(sql, params);
    return rows.map((r: any) => ({
      id: r.id,
      unit_number: r.unit_number,
      topic: r.topic,
      name: r.name,
      formula: r.formula,
      latex: r.latex,
      explanation: r.explanation,
      variables: parseJsonField<any[]>(r.variables),
      image_url: r.image_url,
    }));
  });

// ---------- Important questions ----------

export const listImportantQuestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        unit_number: z.number().int().min(1).max(6).optional(),
        topic: z.string().optional(),
        marks: z.union([z.literal(2), z.literal(5), z.literal(10)]).optional(),
      })
      .parse(raw ?? {}),
  )
  .handler(async ({ data }) => {
    let sql = "SELECT id, unit_number, topic, marks, question, answer_outline, formulas_used, diagram_hint FROM important_questions WHERE 1=1";
    const params = [];
    if (data.unit_number) {
      sql += " AND unit_number = ?";
      params.push(data.unit_number);
    }
    if (data.topic) {
      sql += " AND topic = ?";
      params.push(data.topic);
    }
    if (data.marks) {
      sql += " AND marks = ?";
      params.push(data.marks);
    }
    sql += " ORDER BY unit_number, marks, topic";

    const rows = await query(sql, params);
    return rows.map((r: any) => ({
      id: r.id,
      unit_number: r.unit_number,
      topic: r.topic,
      marks: r.marks,
      question: r.question,
      answer_outline: r.answer_outline,
      formulas_used: parseJsonField<string[]>(r.formulas_used),
      diagram_hint: r.diagram_hint,
    }));
  });

// ---------- Numerical problems ----------

export const listNumericals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ unit_number: z.number().int().min(1).max(6).optional() }).parse(raw ?? {}),
  )
  .handler(async ({ data }) => {
    let sql = "SELECT id, unit_number, topic, problem, solution_steps, final_answer, formulas_used FROM numerical_problems WHERE 1=1";
    const params = [];
    if (data.unit_number) {
      sql += " AND unit_number = ?";
      params.push(data.unit_number);
    }
    sql += " ORDER BY unit_number, topic";

    const rows = await query(sql, params);
    return rows.map((r: any) => ({
      id: r.id,
      unit_number: r.unit_number,
      topic: r.topic,
      problem: r.problem,
      solution_steps: parseJsonField<string[]>(r.solution_steps),
      final_answer: r.final_answer,
      formulas_used: parseJsonField<string[]>(r.formulas_used),
    }));
  });

// ---------- Quiz ----------

export const getQuiz = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        unit_number: z.number().int().min(1).max(6),
        count: z.number().int().min(3).max(20).default(10),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const rows = await query(
      "SELECT id, unit_number, topic, question, options, correct_index, explanation, difficulty FROM quiz_questions WHERE unit_number = ?",
      [data.unit_number]
    );
    const all = rows.map((q: any) => ({
      id: q.id,
      unit_number: q.unit_number,
      topic: q.topic,
      question: q.question,
      options: parseJsonField<string[]>(q.options),
      correct_index: q.correct_index,
      explanation: q.explanation,
      difficulty: q.difficulty,
    }));
    // Shuffle and slice
    const shuffled = all.slice().sort(() => Math.random() - 0.5).slice(0, data.count);
    return shuffled.map((q) => ({
      id: q.id,
      unit_number: q.unit_number,
      topic: q.topic,
      question: q.question,
      options: q.options,
      difficulty: q.difficulty,
    }));
  });

export const submitQuizAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        unit_number: z.number().int().min(1).max(6),
        duration_seconds: z.number().int().min(0).max(24 * 3600),
        answers: z.array(
          z.object({ question_id: z.string().max(80), selected_index: z.number().int().min(0).max(10) }),
        ),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const ids = data.answers.map((a) => a.question_id);
    if (ids.length === 0) {
      throw new Error("No answers provided.");
    }
    const placeholders = ids.map(() => "?").join(",");

    const rows = await query(
      `SELECT id, correct_index, explanation, question, options, topic FROM quiz_questions WHERE id IN (${placeholders})`,
      ids
    );
    const qs = rows.map((q: any) => ({
      id: q.id,
      correct_index: q.correct_index,
      explanation: q.explanation,
      question: q.question,
      options: parseJsonField<string[]>(q.options),
      topic: q.topic,
    }));

    const map = new Map(qs.map((q) => [q.id, q]));

    let correct = 0;
    const details = data.answers.map((a) => {
      const q = map.get(a.question_id);
      const isRight = q ? q.correct_index === a.selected_index : false;
      if (isRight) correct += 1;
      return {
        question_id: a.question_id,
        question: q?.question ?? "",
        topic: q?.topic ?? "",
        options: q?.options ?? [],
        selected_index: a.selected_index,
        correct_index: q?.correct_index ?? -1,
        is_correct: isRight,
        explanation: q?.explanation ?? null,
      };
    });
    const total = data.answers.length;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;

    const attemptId = crypto.randomUUID();
    await query(
      "INSERT INTO quiz_attempts (id, user_id, unit_number, score, total, correct, duration_seconds, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [attemptId, context.userId, data.unit_number, score, total, correct, data.duration_seconds, JSON.stringify(details)]
    );

    await query(
      "INSERT INTO activities (id, user_id, activity_type, topic, description, metadata) VALUES (?, ?, ?, ?, ?, ?)",
      [
        crypto.randomUUID(),
        context.userId,
        "quiz_completed",
        `Unit ${data.unit_number}`,
        `Quiz: ${correct}/${total} (${score}%)`,
        JSON.stringify({ attempt_id: attemptId, unit_number: data.unit_number }),
      ]
    );

    // Upsert user_progress
    const points = correct * 5;
    const existingRows = await query(
      "SELECT id, items_completed, points_earned FROM user_progress WHERE user_id = ? AND unit_number = ?",
      [context.userId, data.unit_number]
    );

    if (existingRows.length > 0) {
      const existing = existingRows[0];
      await query(
        "UPDATE user_progress SET items_completed = items_completed + 1, points_earned = points_earned + ?, last_activity_at = CURRENT_TIMESTAMP WHERE id = ?",
        [points, existing.id]
      );
    } else {
      await query(
        "INSERT INTO user_progress (id, user_id, unit_number, items_completed, points_earned) VALUES (?, ?, ?, 1, ?)",
        [crypto.randomUUID(), context.userId, data.unit_number, points]
      );
    }

    // Simple achievements check
    await maybeAwardAchievements(context, score, correct, total);

    return { attempt_id: attemptId, correct, total, score, details };
  });

async function maybeAwardAchievements(
  context: { userId: string },
  score: number,
  correct: number,
  total: number,
) {
  const grants: string[] = [];
  if (total > 0) grants.push("quiz_first");
  if (score === 100) grants.push("quiz_perfect");

  for (const code of grants) {
    const existing = await query("SELECT 1 FROM user_achievements WHERE user_id = ? AND achievement_code = ?", [context.userId, code]);
    if (existing.length === 0) {
      await query(
        "INSERT INTO user_achievements (id, user_id, achievement_code) VALUES (?, ?, ?)",
        [crypto.randomUUID(), context.userId, code]
      );
    }
  }
}

// ---------- Leaderboard ----------

export const getLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // 1. Get all student profiles — admins never appear on the leaderboard
    const users = await query("SELECT id, username, email, full_name FROM users WHERE role != 'admin'");

    // 2. Get user progress totals
    const progress = await query("SELECT user_id, points_earned, items_completed FROM user_progress");

    // 3. Get quiz attempt stats
    const attempts = await query("SELECT user_id, score FROM quiz_attempts");

    const pointsMap = new Map<string, { points: number; items: number }>();

    // Pre-populate all users with 0 points
    for (const u of users) {
      pointsMap.set(u.id, { points: 0, items: 0 });
    }

    for (const row of progress as any[]) {
      const cur = pointsMap.get(row.user_id) ?? { points: 0, items: 0 };
      cur.points += row.points_earned;
      cur.items += row.items_completed;
      pointsMap.set(row.user_id, cur);
    }

    const scoreMap = new Map<string, { total: number; n: number }>();
    for (const a of attempts as any[]) {
      const cur = scoreMap.get(a.user_id) ?? { total: 0, n: 0 };
      cur.total += a.score;
      cur.n += 1;
      scoreMap.set(a.user_id, cur);
    }

    const rows = users
      .map((u: any) => {
        const v = pointsMap.get(u.id) ?? { points: 0, items: 0 };
        const s = scoreMap.get(u.id);
        return {
          user_id: u.id,
          name: u.full_name || u.username || u.email.split("@")[0],
          points: v.points,
          items: v.items,
          avg_score: s && s.n ? Math.round(s.total / s.n) : 0,
          is_me: u.id === context.userId,
        };
      })
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
      .slice(0, 50);

    return rows;
  });

// ---------- Dashboard ----------

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardData> => {
    const userId = context.userId;

    const [
      profiles,
      solved,
      activity,
      attempts,
      progress,
      units,
      userAch,
      allAch,
    ] = await Promise.all([
      query("SELECT full_name, email, username, role FROM users WHERE id = ?", [userId]),
      query("SELECT id, topic, question, marks, created_at FROM solved_problems WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", [userId]),
      query("SELECT id, activity_type, topic, description, created_at FROM activities WHERE user_id = ? ORDER BY created_at DESC LIMIT 10", [userId]),
      query("SELECT score FROM quiz_attempts WHERE user_id = ?", [userId]),
      query("SELECT unit_number, items_completed, points_earned FROM user_progress WHERE user_id = ?", [userId]),
      query("SELECT unit_number, title FROM syllabus_units ORDER BY unit_number"),
      query("SELECT achievement_code, earned_at FROM user_achievements WHERE user_id = ?", [userId]),
      query("SELECT code, title, description, icon FROM achievements"),
    ]);

    const profile = profiles[0] as any;
    const solvedRows = solved as any[];
    const activityRows = activity as any[];
    const attemptRows = attempts as any[];
    const progressRows = progress as any[];
    const unitRows = units as any[];
    const userAchRows = userAch as any[];
    const allAchRows = allAch as any[];

    const isAdmin = profile?.role === "admin";
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const topicMap = new Map<string, { solved: number; marks: number }>();

    for (const s of solvedRows) {
      const t = s.topic ?? "General";
      const cur = topicMap.get(t) ?? { solved: 0, marks: 0 };
      cur.solved += 1;
      cur.marks += s.marks ?? 0;
      topicMap.set(t, cur);
    }

    const progressByUnit = unitRows.map((u) => {
      const p = progressRows.find((x) => x.unit_number === u.unit_number);
      return {
        unit_number: u.unit_number,
        unit_title: u.title,
        items_completed: p?.items_completed ?? 0,
        points: p?.points_earned ?? 0,
      };
    });

    const achMap = new Map(allAchRows.map((a) => [a.code, a]));
    const achievements = userAchRows.map((ua) => {
      const meta = achMap.get(ua.achievement_code);
      return {
        code: ua.achievement_code,
        title: meta?.title ?? ua.achievement_code,
        description: meta?.description ?? "",
        icon: meta?.icon ?? "trophy",
        earned_at: ua.earned_at,
      };
    });

    const totalScore = attemptRows.reduce((n, a) => n + (a.score ?? 0), 0);
    const nAttempts = attemptRows.length;

    return {
      profile: {
        full_name: profile?.full_name ?? "",
        email: profile?.email ?? "",
        username: profile?.username ?? "",
        role: isAdmin ? "admin" : "student",
      },
      stats: {
        total_solved: solvedRows.length,
        total_marks: solvedRows.reduce((n, r) => n + (r.marks ?? 0), 0),
        topics_covered: topicMap.size,
        last_7_days_solved: solvedRows.filter(
          (r) => new Date(r.created_at).getTime() >= sevenDaysAgo,
        ).length,
        quiz_attempts: nAttempts,
        avg_quiz_score: nAttempts ? Math.round(totalScore / nAttempts) : 0,
        achievements: achievements.length,
      },
      progress_by_unit: progressByUnit,
      progress_by_topic: Array.from(topicMap.entries())
        .map(([topic, v]) => ({ topic, ...v }))
        .sort((a, b) => b.solved - a.solved),
      recent_activity: activityRows.map((a) => ({
        id: a.id,
        type: a.activity_type,
        topic: a.topic,
        description: a.description,
        created_at: a.created_at,
      })),
      recent_solved: solvedRows.slice(0, 8).map((s) => ({
        id: s.id,
        topic: s.topic,
        question: s.question,
        marks: s.marks ?? 0,
        created_at: s.created_at,
      })),
      achievements,
    };
  });

// ---------- AI Problem Solver ----------

const solverInput = z.object({
  question: z.string().max(4000).optional(),
  topic: z.string().min(1).max(120).optional(),
  unit_number: z.number().int().min(1).max(6).optional(),
  imageDataUrl: z
    .string()
    .max(6_000_000)
    .refine((v) => v.startsWith("data:image/"), "Must be a data URL image")
    .optional(),
});

const SYSTEM_PROMPT = `You are an expert Basic Electrical & Electronics Engineering (BEEE) tutor for the AI&DS branch.
STRICT scope: only use content aligned with these six syllabus units:
 Unit 1: DC Circuits (Ohm/Kirchhoff, series/parallel, star-delta, mesh/node, superposition, Thevenin, Norton, MPT).
 Unit 2: AC Circuits (RMS/avg, phasors, R/L/C, series/parallel RLC, resonance, power factor, 3-phase).
 Unit 3: Electrical Safety & Machines (earthing, fuses, MCB, DC generator/motor, transformer, induction motor).
 Unit 4: Semiconductor Diodes (PN diode, half/full-wave rectifiers, filters, zener regulator, LED, photodiode).
 Unit 5: BJT/FET Transistors (CE/CB/CC configurations, biasing, small-signal, JFET, MOSFET).
 Unit 6: Communication Systems (modulation AM/FM/PM, radio TX/RX, antenna basics, sampling, digital modulation).
Refuse politely if a question is outside these units.

══════════════════════════════════════════════════════════
OUTPUT: ONE strict JSON object. NO prose before or after.
══════════════════════════════════════════════════════════

SOLVE the problem completely, then output this JSON:

{
  "unit_number": <1-6>,
  "topic": "<string>",
  "question": "<string>",
  "steps": [
    {
      "step": <number>,
      "description": "<string — plain text only, NO LaTeX backslashes, use unicode directly>",
      "expression": "<string formula or null — plain text, e.g. 'I = V/R' or 'Req = R1 + R2'>",
      "diagram": <null or LogicalDiagram>
    }
  ],
  "formulas_used": ["<string formula>"],
  "final_answer": "<string — each result on its own line separated by literal \\n, e.g. 'V1 = 17.64 V\\nV2 = 5.64 V'>",
  "diagram": <null or LogicalDiagram for the final solved circuit>
}

LogicalDiagram schema:
{
  "description": "<string>",
  "components": [
    {
      "type": "<SourceV|SourceI|BatteryCell|Resistor|Capacitor|Inductor|Diode|BjtNpn|Line>",
      "label": "<PLAIN TEXT — no LaTeX, use unicode Omega etc., e.g. R1 = 1kΩ>",
      "annotation": "<PLAIN TEXT or null>",
      "role": "<source|component|short|open>"
    }
  ]
}

══════════════════════════════════════════════════════════
DIAGRAM ARCHITECTURE
══════════════════════════════════════════════════════════

You provide a LOGICAL COMPONENT LIST for each diagram.
The backend engine converts your list into a clean Schemdraw SVG — you do NOT control directions/lengths/positions.

Role meanings:
- "source"    → the active independent source (placed on left branch)
- "component" → a regular branch element (placed on top branch, in order listed)
- "short"     → a deactivated voltage source (rendered as a wire labeled "Short")
- "open"      → a deactivated current source (omitted from the drawing entirely)

The backend always produces a clean rectangular loop from your component list.

══════════════════════════════════════════════════════════
STEP DIAGRAM RULES
══════════════════════════════════════════════════════════

Include a diagram in a step ONLY when the circuit configuration or active component set CHANGES.
Purely algebraic steps (rearranging/substituting equations) → set diagram to null.
Every step diagram MUST be UNIQUE — different component set or different annotations than all others.

WHAT to include per step:
- List ONLY the components directly involved in THAT step's equation.
- Do NOT copy the full original circuit into every step.

EXAMPLES (node voltage problem with Is=20mA, R1=1kO, R12=2.2kO, R2=1kO, RL=470O):
- Step "Identify original circuit"            → ALL 5 components with their given values
- Step "Apply KCL at Node V1"                 → Is (source) + R1 (component) + R12 (component) — the 3 branches at V1
- Step "Apply KCL at Node V2"                 → R12 (source-like input) + R2 (component) + RL (component) — only V2 branches
- Step "Deactivate voltage source"            → voltage source with role=short, remaining components unchanged
- Step "Deactivate current source"            → current source with role=open, remaining components unchanged
- Step "Combine R2||RL into Req=0.32kO"       → 1 Resistor labeled "Req = 0.32kO" — the simplified equivalent
- Step "Thevenin equivalent circuit"          → Vth source + Rth component + RL component
- Step "Final solved circuit with answers"    → ALL components, annotations show solved I/V values

══════════════════════════════════════════════════════════
LABEL RULES (CRITICAL — violated labels break SVG rendering)
══════════════════════════════════════════════════════════

- ALL labels and annotations MUST be PLAIN TEXT — NEVER use LaTeX backslash syntax.
- Use Unicode directly: write "Ω" not "\\Omega", write "·" not "\\cdot"
- Use plain readable subscripts: "Rth" "RL" "Vth" "V1" "V2" "Req" — NOT "R_{th}" "R_L"
- Format: "Designation = Value" e.g. "R1 = 1kΩ", "Is = 20mA", "Vth = 17.14V"
- Annotation: computed result for this step e.g. "I = V1/1kΩ", "V1 = 17.64V", "I = 17.64mA"

══════════════════════════════════════════════════════════
MAIN DIAGRAM (top-level "diagram" field)
══════════════════════════════════════════════════════════

Show the COMPLETE FINAL SOLVED CIRCUIT with ALL components.
Use "annotation" on each component to show the FINAL computed current or voltage.
The backend simplifies this into a clean rectangular loop automatically.
If the question is pure theory with no circuit, set "diagram" to null.

══════════════════════════════════════════════════════════
TEXT FORMATTING (PLAIN TEXT ONLY — NO LATEX)
══════════════════════════════════════════════════════════
- DO NOT write any LaTeX commands (like \frac, \Omega, \text, \mathrm, \,) anywhere in the JSON.
- DO NOT wrap equations or variables in dollar signs ($ or $$).
- Use standard readable plain text:
  * Write formula operators inline: *, /, +, -, =, ^.
  * Use plain subscripts: write V1, V2, Rth, RL, Req, or V_1, V_2, R_th, R_L.
  * Use standard unicode symbols directly: Ω, ohms, V, A, mA, kΩ.
- "description": Simple plain text describing the step.
- "expression": Simple plain text mathematical expression.
- "formulas_used": Array of simple plain text formulas.
- "final_answer": Plain text results separated by \\n in the JSON string.
  Example: "V1 = 17.64 V\\nV2 = 5.64 V"`;

function shouldRequestDiagram(data: z.infer<typeof solverInput>, questionText: string): boolean {
  if (data.imageDataUrl) return true;

  const text = `${data.topic ?? ""} ${questionText}`.toLowerCase();
  return [
    "circuit",
    "resistor",
    "resistance",
    "ohm",
    "voltage",
    "current",
    "kcl",
    "kvl",
    "thevenin",
    "norton",
    "rlc",
    "capacitor",
    "inductor",
    "diode",
    "transistor",
    "rectifier",
    "superposition",
    "mesh",
    "node",
    "power",
    "impedance",
    "filter",
  ].some((term) => text.includes(term));
}

/** Returns true when the question is asking to compute/find/solve (not just explain) */
function isSolveQuestion(questionText: string): boolean {
  const lower = questionText.toLowerCase();
  return [
    "find", "solve", "calculate", "determine", "compute",
    "what is", "what are", "obtain", "derive the value", "evaluate",
    "how much", "how many", "current through", "voltage across",
    "equivalent", "thevenin", "norton", "maximum power",
  ].some((kw) => lower.includes(kw));
}

function firstMatch(text: string, pattern: RegExp): string | undefined {
  return text.match(pattern)?.[1]?.trim();
}

function uniqueMatches(text: string, pattern: RegExp): string[] {
  return Array.from(text.matchAll(pattern))
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value))
    .filter((value, index, values) => values.findIndex((v) => v.toLowerCase() === value.toLowerCase()) === index);
}

function formatFinalAnswer(answer: string): string {
  return answer
    .replace(/\s+/g, " ")
    .replace(/\.\s+For\s+/g, ".\nFor ")
    .replace(/,\s+(?=(?:V|I|R|P|Z|X|pf|PF|V_[A-Za-z0-9]+|I_[A-Za-z0-9]+)\s*(?:=|\u2248|~))/g, "\n")
    .replace(/,\s+(?=and\s+)/gi, "\n")
    .trim();
}

function instructionLength(instruction: SchemdrawInstruction): number {
  const length = Number(instruction.length);
  return Number.isFinite(length) && length > 0 ? length : 1;
}

function circuitPositionAfter(
  position: { x: number; y: number },
  instruction: SchemdrawInstruction,
): { x: number; y: number } {
  const length = instructionLength(instruction);
  switch (instruction.direction) {
    case "left":
      return { x: position.x - length, y: position.y };
    case "up":
      return { x: position.x, y: position.y + length };
    case "down":
      return { x: position.x, y: position.y - length };
    default:
      return { x: position.x + length, y: position.y };
  }
}

function closeCircuitInstructions(instructions: SchemdrawInstruction[]): SchemdrawInstruction[] {
  let position = { x: 0, y: 0 };
  const points = [position];

  for (const instruction of instructions) {
    if (instruction.type === "Ground") continue;

    position = circuitPositionAfter(position, instruction);
    points.push(position);
  }

  const closed = [...instructions];
  const roundedX = Math.round(position.x * 100) / 100;
  const roundedY = Math.round(position.y * 100) / 100;
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const horizontalSpan = maxX - minX;
  const verticalSpan = maxY - minY;
  const loopOffset = 2;

  if (Math.abs(roundedX) <= 0.01 && Math.abs(roundedY) <= 0.01) {
    return closed;
  }

  if (Math.abs(roundedX) > 0.01 && Math.abs(roundedY) <= 0.01 && verticalSpan <= 0.01) {
    closed.push({ type: "Line", direction: "down", label: "", length: loopOffset });
    closed.push({
      type: "Line",
      direction: roundedX > 0 ? "left" : "right",
      label: "",
      length: Math.abs(roundedX),
    });
    closed.push({ type: "Line", direction: "up", label: "", length: loopOffset });
    return closed;
  }

  if (Math.abs(roundedY) > 0.01 && Math.abs(roundedX) <= 0.01 && horizontalSpan <= 0.01) {
    closed.push({ type: "Line", direction: "right", label: "", length: loopOffset });
    closed.push({
      type: "Line",
      direction: roundedY > 0 ? "down" : "up",
      label: "",
      length: Math.abs(roundedY),
    });
    closed.push({ type: "Line", direction: "left", label: "", length: loopOffset });
    return closed;
  }

  if (Math.abs(roundedY) > 0.01) {
    closed.push({
      type: "Line",
      direction: roundedY > 0 ? "down" : "up",
      label: "",
      length: Math.abs(roundedY),
    });
  }

  if (Math.abs(roundedX) > 0.01) {
    closed.push({
      type: "Line",
      direction: roundedX > 0 ? "left" : "right",
      label: "",
      length: Math.abs(roundedX),
    });
  }

  return closed;
}

function createBasicCircuitDiagram(questionText: string): DiagramData {
  const text = questionText.replace(/\s+/g, " ");
  const lower = text.toLowerCase();
  const voltage = firstMatch(text, /(?:v(?:oltage)?|supply|source)\s*[=:]?\s*(\d+(?:\.\d+)?\s*(?:v|volts?)?)/i);
  const current = firstMatch(text, /(?:i|current)\s*[=:]?\s*(\d+(?:\.\d+)?\s*(?:a|amps?)?)/i);
  const resistorValues = uniqueMatches(
    text,
    /(\d+(?:\.\d+)?\s*(?:k\s*(?:ohms?|\u03a9|\u2126)?|kohms?|ohms?|\u03a9|\u2126))/gi,
  ).slice(0, 5);
  const resistance =
    firstMatch(text, /(?:r|resistance)\s*[=:]?\s*(\d+(?:\.\d+)?\s*(?:ohms?|\u03a9|\u2126)?)/i) ??
    resistorValues[0];

  const sourceLabel = voltage ? `V = ${voltage}` : current ? `I = ${current}` : "Source";
  const resistorLabels = resistorValues.length > 0 ? resistorValues : [resistance ? resistance : "R"];
  const instructions: SchemdrawInstruction[] = [
    { type: current && !voltage ? "SourceI" : "SourceV", direction: "up", label: sourceLabel, length: 2 },
  ];

  resistorLabels.forEach((label, index) => {
    instructions.push({
      type: "Resistor",
      direction: "right",
      label: resistorLabels.length > 1 ? `R${index + 1} = ${label}` : `R = ${label}`,
      length: 2.5,
    });
  });

  if (lower.includes("capacitor") || lower.includes(" capacitance") || /\bc\s*=/.test(lower)) {
    const capacitance = firstMatch(text, /(?:c|capacitance)\s*[=:]?\s*(\d+(?:\.\d+)?\s*(?:uf|µf|f)?)/i);
    instructions.push({
      type: "Capacitor",
      direction: "right",
      label: capacitance ? `C = ${capacitance}` : "C",
      length: 2,
    });
  }

  if (lower.includes("inductor") || lower.includes(" inductance") || /\bl\s*=/.test(lower)) {
    const inductance = firstMatch(text, /(?:l|inductance)\s*[=:]?\s*(\d+(?:\.\d+)?\s*(?:mh|h)?)/i);
    instructions.push({
      type: "Inductor",
      direction: "right",
      label: inductance ? `L = ${inductance}` : "L",
      length: 2,
    });
  }

  if (lower.includes("diode") || lower.includes("rectifier")) {
    instructions.push({ type: "Diode", direction: "right", label: "D", length: 2 });
  }

  if (lower.includes("transistor") || lower.includes("bjt")) {
    instructions.push({ type: "BjtNpn", direction: "right", label: "Q", length: 2 });
  }

  instructions.push({ type: "Line", direction: "down", label: "", length: 2 });

  return {
    description:
      "Simplified closed Schemdraw circuit generated from the readable problem text because the AI did not return diagram instructions.",
    schemdraw_instructions: closeCircuitInstructions(instructions),
  };
}

/**
 * forceRectangularLayout – takes ANY schemdraw instruction list and rebuilds it
 * into a clean rectangular loop:
 *
 *    ┌──[comp1]──[comp2]──[comp3]──┐
 *    │                             │
 * [source]                        wire
 *    │                             │
 *    └─────────────────────────────┘
 *
 * Source goes UP on the left side.
 * Non-source, non-wire components go RIGHT along the top.
 * Return wires close the right side and bottom.
 *
 * This guarantees a clean rectangle regardless of what the AI generates.
 */
function forceRectangularLayout(instructions: SchemdrawInstruction[]): SchemdrawInstruction[] {
  const SOURCE_TYPES = new Set(["SourceV", "SourceI", "BatteryCell"]);
  const WIRE_TYPES = new Set(["Line", "Ground"]);

  // Separate sources from functional components; skip bare wire/ground elements
  const sources: SchemdrawInstruction[] = [];
  const components: SchemdrawInstruction[] = [];

  for (const inst of instructions) {
    if (WIRE_TYPES.has(inst.type)) continue;
    if (SOURCE_TYPES.has(inst.type)) {
      sources.push(inst);
    } else {
      components.push(inst);
    }
  }

  // Nothing useful — return untouched so we at least render something
  if (sources.length === 0 && components.length === 0) return instructions;

  const COMP_LEN = 3;   // length of each component element
  const WIRE_LEN = 1.5; // corner wire length

  const result: SchemdrawInstruction[] = [];

  // ① Left side: primary source going UP
  const primarySource = sources[0] ?? { type: "SourceV", direction: "up", label: "Source", length: COMP_LEN };
  result.push({ ...primarySource, direction: "up", length: COMP_LEN });

  // ② Top-left corner: short wire to the right
  if (components.length === 0) {
    result.push({ type: "Line", direction: "right", label: "", length: WIRE_LEN * 2 });
  } else {
    result.push({ type: "Line", direction: "right", label: "", length: WIRE_LEN });
  }

  // ③ Top: all non-source components going RIGHT
  for (const comp of components) {
    result.push({ ...comp, direction: "right", length: COMP_LEN });
  }

  // ④ Top-right corner: short wire down to start the right side
  result.push({ type: "Line", direction: "right", label: "", length: WIRE_LEN });

  // ⑤ Right side: wire going DOWN (height = same as source)
  result.push({ type: "Line", direction: "down", label: "", length: COMP_LEN });

  // ⑥ Bottom: return wire going LEFT to close the rectangle
  // Width = corner + components + corner
  const topWidth = WIRE_LEN + components.length * COMP_LEN + WIRE_LEN;
  result.push({ type: "Line", direction: "left", label: "", length: topWidth });

  // If there's a second source (less common — e.g. two-source circuits),
  // annotate the source label to mention it rather than trying to draw it.
  if (sources.length > 1) {
    const extra = sources.slice(1).map(s => s.label).filter(Boolean).join(", ");
    if (extra) {
      result[0] = { ...result[0], label: `${result[0].label} (+${extra})` };
    }
  }

  return result;
}

function cleanAndNormalizeDiagram(instructions: SchemdrawInstruction[]): SchemdrawInstruction[] {
  if (!Array.isArray(instructions)) return [];

  return instructions.map(inst => {
    let label = inst.label || "";
    let label2 = inst.label2 || "";

    // Clean up LaTeX formatting and replace with standard unicode math symbols
    const clean = (text: string): string => {
      if (typeof text !== "string") return String(text);
      return text
        .replace(/\\(?:k\s*)?\\Omega/gi, "kΩ")
        .replace(/\\Omega/gi, "Ω")
        .replace(/\\k/gi, "k")
        .replace(/\\parallel/gi, " || ")
        .replace(/\\cdot/gi, "·")
        .replace(/\\times/gi, "×")
        .replace(/\\,/gi, " ")
        .replace(/\\text\s*\{([^}]+)\}/gi, "$1")
        .replace(/_\{?([A-Za-z0-9]+)\}?/gi, "$1") // subscript R_{th} -> Rth
        .replace(/[\{\}\$]/g, "") // strip braces and dollars
        .replace(/\s+/g, " ")
        .trim();
    };

    let cleanedLabel = clean(label);
    let cleanedLabel2 = clean(label2);
    let type = inst.type;

    // Programmatic conversion of deactivated/shorted sources
    const isSource = type === "SourceV" || type === "SourceI" || type === "BatteryCell";
    if (isSource) {
      const lowerL = cleanedLabel.toLowerCase();
      const lowerL2 = cleanedLabel2.toLowerCase();
      
      if (lowerL.includes("short") || lowerL2.includes("short") || lowerL === "0v" || lowerL === "0a") {
        type = "Line";
        cleanedLabel = "Short";
        cleanedLabel2 = "";
      } else if (lowerL.includes("open") || lowerL2.includes("open")) {
        type = "Line";
        cleanedLabel = "Open";
        cleanedLabel2 = "";
      }
    }

    return {
      ...inst,
      type,
      label: cleanedLabel,
      label2: cleanedLabel2,
    };
  });
}


/**
 * buildSchemdrawFromLogical — converts a LogicalComponent[] list from the AI
 * into a SchemdrawInstruction[] list that the backend can render.
 * Role-based mapping:
 *   "source"    → place as source element (SourceV/SourceI/BatteryCell)
 *   "component" → regular branch element (Resistor/Capacitor/etc.)
 *   "short"     → replace with a Line element labeled "Short"
 *   "open"      → omit entirely (open circuit)
 * The resulting instruction list is then passed to forceRectangularLayout
 * and closeCircuitInstructions to produce a clean rectangular SVG.
 */
function buildSchemdrawFromLogical(components: LogicalComponent[]): SchemdrawInstruction[] {
  const VALID_TYPES = new Set([
    "SourceV", "SourceI", "BatteryCell",
    "Resistor", "Capacitor", "Inductor", "Diode", "BjtNpn", "Line"
  ]);
  const result: SchemdrawInstruction[] = [];

  for (const comp of components) {
    if (!comp || !comp.type) continue;

    // Skip "open" role (current source deactivated = open circuit — no element drawn)
    if (comp.role === "open") continue;

    let type = VALID_TYPES.has(comp.type) ? comp.type : "Resistor";

    // "short" role = deactivated voltage source — draw as wire with "Short" label
    if (comp.role === "short") {
      type = "Line";
    }

    const label = cleanLabelText(comp.label || "");
    const label2 = cleanLabelText(comp.annotation || "");

    result.push({
      type,
      direction: "right", // forceRectangularLayout will override this
      label,
      ...(label2 ? { label2 } : {}),
      length: 3,
    });
  }

  return result;
}

/**
 * cleanLabelText — strips LaTeX syntax from plain-text labels.
 * Called on every LogicalComponent label/annotation before rendering.
 */
function cleanLabelText(text: string): string {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/\\(?:k\s*)?Omega/gi, "kΩ")
    .replace(/\\Omega/gi, "Ω")
    .replace(/\\mathrm\{([^}]+)\}/gi, "$1")
    .replace(/\\text\{([^}]+)\}/gi, "$1")
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/gi, "($1)/($2)")
    .replace(/\\parallel/gi, " || ")
    .replace(/\\cdot/gi, "·")
    .replace(/\\times/gi, "×")
    .replace(/\\,/g, " ")
    .replace(/_\{([^}]+)\}/g, "$1")   // R_{th} → Rth
    .replace(/_([A-Za-z0-9])/g, "$1") // R_1 → R1
    .replace(/[\{\}\$\]/g, "")        // strip remaining braces/dollars/backslashes
    .replace(/\\/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function renderSchemdrawSvg(
  instructions: SchemdrawInstruction[],
): Promise<{ svg: string; error?: string }> {
  const pyScript = path.join(process.cwd(), "src/lib/python/schematic_generator.py");
  const jsonInput = JSON.stringify(instructions);

  return new Promise((resolve) => {
    const pyCommand = process.platform === "win32" ? "python" : "python3";
    const child = execFile(pyCommand, [pyScript], (error, stdout, stderr) => {
      if (error) {
        const message = stderr?.trim() || error.message;
        console.error("[Schemdraw] Error:", message);
        resolve({ svg: "", error: message });
      } else {
        resolve({ svg: stdout });
      }
    });
    if (child.stdin) {
      child.stdin.write(jsonInput);
      child.stdin.end();
    }
  });
}

export const solveProblem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const parsed = solverInput.parse(raw);
    if (!parsed.question && !parsed.imageDataUrl) {
      throw new Error("Provide a question or upload an image.");
    }
    return parsed;
  })
  .handler(async ({ context, data }): Promise<SolverResponse> => {
    let extractedText = "";
    let visionDiagram: any = null;

    if (data.imageDataUrl) {
      // PHASE 1: Vision AI — OCR ONLY
      // The vision model extracts question text and component values/labels.
      // It does NOT generate circuit topology or schemdraw instructions.
      try {
        console.log("[Vision API] OCR scan (OCR-only mode)...");
        const visionPrompt = `You are an expert at reading BEEE (Basic Electrical & Electronics Engineering) textbook images.

YOUR ONLY JOB IS OCR — DO NOT generate circuit topology or diagram instructions.

1. Read and extract ALL visible text: the full problem statement, all component labels and values (e.g. "1 kΩ", "20 mA", "V1", "V2"), node labels, and numerical data.
2. If there is a circuit diagram, read all the text/labels ON it (values, node names, current arrows, etc.) and include them in extracted_text.
3. Do NOT attempt to trace wires or generate schemdraw instructions.

Return ONLY this strict JSON (no prose, no explanations):
{
  "extracted_text": "<complete verbatim question plus all component values and labels read from the image>"
}`;

        let visionRaw = await callCerebrasVision(data.imageDataUrl, visionPrompt);
        console.log("[Vision API] raw:", visionRaw?.slice(0, 200));
        let parsedVision = safeParseJson<any>(visionRaw, {});

        let rawExtracted = parsedVision.extracted_text ||
                           parsedVision.question_text ||
                           parsedVision.question ||
                           parsedVision.text ||
                           parsedVision.extractedText ||
                           parsedVision.ocr_text || "";

        if (!rawExtracted) {
          console.warn("[Vision API] Empty OCR result — retrying with simpler prompt...");
          const retryRaw = await callCerebrasVision(data.imageDataUrl,
            `Read all text from this image. Return: {"extracted_text": "all text here"}`);
          parsedVision = safeParseJson<any>(retryRaw, {});
          rawExtracted = parsedVision.extracted_text || parsedVision.text || "";
        }

        extractedText = typeof rawExtracted === "string" ? rawExtracted : JSON.stringify(rawExtracted);

        if (!extractedText) {
          throw new Error("No readable text was detected in the uploaded image. Please ensure the image is clear and contains a valid BEEE question.");
        }

        console.log("[Vision API] OCR complete:", extractedText.slice(0, 200));
      } catch (err: any) {
        console.error("[Vision API] OCR failed:", err);
        throw new Error(
          `Image scan failed: ${err.message || err}. The AI vision server is busy or rate-limited. Please try again in a few moments.`
        );
      }
    }

    const questionText = data.question
      ? data.question
      : extractedText
        ? extractedText
        : "Analyze and explain the circuit details provided in the image.";

    const diagramRequired = shouldRequestDiagram(data, questionText);
    const solveMode = isSolveQuestion(questionText);

    // PHASE 2: Text Solver AI
    // The vision model provided OCR text only. All circuit diagram generation
    // is handled exclusively by this text solver via logical component descriptions.
    let promptText = "";
    if (data.unit_number) promptText += `Target Unit: ${data.unit_number}\n`;
    if (data.topic) promptText += `Topic hint: ${data.topic}\n`;
    if (extractedText) {
      promptText += `=== TEXT EXTRACTED FROM IMAGE ===\n${extractedText}\n=== END ===\n\n`;
    }
    if (diagramRequired) {
      if (solveMode) {
        promptText += `DIAGRAM REQUIREMENT: Generate logical component lists for step diagrams AND the final solved circuit per the system prompt schema.\n`;
      } else {
        promptText += `DIAGRAM REQUIREMENT: Generate a logical component list illustrating the concept.\n`;
      }
    }
    promptText += `Problem statement:\n${questionText}`;

    const raw = await callLovableAI({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: promptText },
      ],
      responseJson: true,
      temperature: 0.15,
    });

    const fallback: SolverResponse = {
      topic: data.topic ?? "General",
      question: data.question ?? questionText,
      steps: [],
      formulas_used: [],
      final_answer: "Could not parse the AI response. Please try again.",
    };

    const parsed = safeParseJson<SolverResponse>(raw, fallback);
    parsed.topic = parsed.topic || data.topic || "General";
    parsed.question = parsed.question || data.question || questionText;
    parsed.steps = Array.isArray(parsed.steps) ? parsed.steps : [];
    parsed.formulas_used = Array.isArray(parsed.formulas_used) ? parsed.formulas_used : [];
    parsed.final_answer = formatFinalAnswer(parsed.final_answer || fallback.final_answer);
    if (parsed.diagram && typeof parsed.diagram !== "object") {
      parsed.diagram = null;
    }
    if (parsed.diagram && !Array.isArray(parsed.diagram.schemdraw_instructions)) {
      parsed.diagram.schemdraw_instructions = [];
    }
    if (extractedText && !parsed.extracted_text) {
      parsed.extracted_text = extractedText;
    }

    // PHASE 3: Backend Rendering
    // Convert logical component descriptions from AI into Schemdraw SVG.
    // Main diagram: use forceRectangularLayout (simplified final circuit).
    // Step diagrams: also use forceRectangularLayout but with step-specific component subsets.

    let usedBasicDiagramFallback = false;

    // Helper: build + clean + layout + close an instruction list from logical components
    const buildAndLayout = (components: LogicalComponent[]): SchemdrawInstruction[] => {
      const raw = buildSchemdrawFromLogical(components);
      const cleaned = cleanAndNormalizeDiagram(raw);
      return closeCircuitInstructions(forceRectangularLayout(cleaned));
    };

    // Determine main diagram instructions
    const mainDiagAny = parsed.diagram as any;
    let mainInstructions: SchemdrawInstruction[] = [];

    if (mainDiagAny?.components && Array.isArray(mainDiagAny.components) && mainDiagAny.components.length > 0) {
      // New logical format from AI
      mainInstructions = buildAndLayout(mainDiagAny.components as LogicalComponent[]);
      parsed.diagram = { description: mainDiagAny.description || "Final solved circuit", schemdraw_instructions: mainInstructions };
    } else if (parsed.diagram?.schemdraw_instructions && parsed.diagram.schemdraw_instructions.length > 0) {
      // Backward-compat: AI returned raw schemdraw instructions
      mainInstructions = closeCircuitInstructions(forceRectangularLayout(cleanAndNormalizeDiagram(parsed.diagram.schemdraw_instructions)));
      parsed.diagram.schemdraw_instructions = mainInstructions;
    } else if (diagramRequired) {
      // Keyword-based fallback
      const fallback = createBasicCircuitDiagram(questionText);
      mainInstructions = closeCircuitInstructions(forceRectangularLayout(cleanAndNormalizeDiagram(fallback.schemdraw_instructions ?? [])));
      parsed.diagram = { ...fallback, schemdraw_instructions: mainInstructions };
      usedBasicDiagramFallback = true;
    } else {
      parsed.diagram = null;
    }

    if (mainInstructions.length > 0 && parsed.diagram) {
      try {
        console.log("[Schemdraw] Rendering final diagram SVG...");
        const result = await renderSchemdrawSvg(mainInstructions);
        if (result.svg) {
          parsed.diagram.svg = result.svg;
          delete parsed.diagram.error;
        } else if (result.error) {
          parsed.diagram.error = result.error;
          // Retry with keyword fallback
          if (!usedBasicDiagramFallback) {
            const fallback = createBasicCircuitDiagram(questionText);
            const fbInstr = closeCircuitInstructions(forceRectangularLayout(cleanAndNormalizeDiagram(fallback.schemdraw_instructions ?? [])));
            const fbResult = await renderSchemdrawSvg(fbInstr);
            if (fbResult.svg) {
              parsed.diagram = { ...fallback, schemdraw_instructions: fbInstr, svg: fbResult.svg };
            }
          }
        }
      } catch (err) {
        console.error("[Schemdraw] Failed to render main diagram:", err);
        if (parsed.diagram) parsed.diagram.error = err instanceof Error ? err.message : "Failed to render circuit diagram.";
      }
    }

    // STEP DIAGRAMS: convert logical component lists → unique SVGs per step
    if (Array.isArray(parsed.steps)) {
      const seenSignatures = new Set<string>();
      // Seed with main diagram signature so steps don't duplicate it
      if (parsed.diagram?.schemdraw_instructions) {
        seenSignatures.add(JSON.stringify(parsed.diagram.schemdraw_instructions));
      }

      for (const step of parsed.steps) {
        const rawDiag = step.diagram as any;
        let stepInstructions: SchemdrawInstruction[] | null = null;
        let stepDescription = `Step ${step.step} circuit`;

        if (rawDiag?.components && Array.isArray(rawDiag.components) && rawDiag.components.length > 0) {
          // New logical component format
          stepDescription = rawDiag.description || stepDescription;
          const raw = buildSchemdrawFromLogical(rawDiag.components as LogicalComponent[]);
          const cleaned = cleanAndNormalizeDiagram(raw);
          stepInstructions = closeCircuitInstructions(forceRectangularLayout(cleaned));
        } else if (rawDiag?.schemdraw_instructions && Array.isArray(rawDiag.schemdraw_instructions) && rawDiag.schemdraw_instructions.length > 0) {
          // Backward-compat: raw schemdraw instructions
          stepDescription = rawDiag.description || stepDescription;
          const cleaned = cleanAndNormalizeDiagram(rawDiag.schemdraw_instructions);
          stepInstructions = closeCircuitInstructions(forceRectangularLayout(cleaned));
        }

        if (!stepInstructions || stepInstructions.length === 0) {
          step.diagram = null;
          continue;
        }

        const signature = JSON.stringify(stepInstructions);
        if (seenSignatures.has(signature)) {
          console.log(`[Schemdraw] Step ${step.step}: duplicate diagram discarded.`);
          step.diagram = null;
          continue;
        }
        seenSignatures.add(signature);

        const stepDiagData: DiagramData = {
          description: stepDescription,
          schemdraw_instructions: stepInstructions,
        };

        try {
          console.log(`[Schemdraw] Rendering SVG for step ${step.step}...`);
          const result = await renderSchemdrawSvg(stepInstructions);
          if (result.svg) {
            stepDiagData.svg = result.svg;
          } else if (result.error) {
            stepDiagData.error = result.error;
          }
        } catch (err) {
          stepDiagData.error = err instanceof Error ? err.message : "Failed to render step diagram.";
        }

        (step as any).diagram = stepDiagData;
      }
    }

    const marks = Math.min(10, Math.max(2, parsed.steps.length));

    const solvedId = crypto.randomUUID();
    await query(
      "INSERT INTO solved_problems (id, user_id, topic, question, solution, marks) VALUES (?, ?, ?, ?, ?, ?)",
      [
        solvedId,
        context.userId,
        parsed.topic || data.topic || "General",
        parsed.question || data.question || parsed.extracted_text || "(image)",
        JSON.stringify(parsed),
        marks,
      ]
    );

    await query(
      "INSERT INTO activities (id, user_id, activity_type, topic, description, metadata) VALUES (?, ?, ?, ?, ?, ?)",
      [
        crypto.randomUUID(),
        context.userId,
        data.imageDataUrl ? "solver_image" : "solver_text",
        parsed.topic || data.topic || "General",
        (parsed.question || data.question || "Image problem").slice(0, 240),
        JSON.stringify({ solved_id: solvedId, marks, unit_number: parsed.unit_number ?? null }),
      ]
    );

    // Bump unit progress
    if (parsed.unit_number) {
      const existingRows = await query(
        "SELECT id, items_completed, points_earned FROM user_progress WHERE user_id = ? AND unit_number = ?",
        [context.userId, parsed.unit_number]
      );
      if (existingRows.length > 0) {
        const existing = existingRows[0] as any;
        await query(
          "UPDATE user_progress SET items_completed = items_completed + 1, points_earned = points_earned + ?, last_activity_at = CURRENT_TIMESTAMP WHERE id = ?",
          [marks, existing.id]
        );
      } else {
        await query(
          "INSERT INTO user_progress (id, user_id, unit_number, items_completed, points_earned) VALUES (?, ?, ?, 1, ?)",
          [crypto.randomUUID(), context.userId, parsed.unit_number, marks]
        );
      }
    }

    // Award first_solve / solver_10 achievements if applicable
    const solvedCountRows = await query("SELECT COUNT(*) as count FROM solved_problems WHERE user_id = ?", [context.userId]);
    const solvedCount = (solvedCountRows[0] as any).count;
    const achievementsToAward = [];
    if (solvedCount >= 1) achievementsToAward.push("first_solve");
    if (solvedCount >= 10) achievementsToAward.push("solver_10");

    for (const code of achievementsToAward) {
      const exists = await query("SELECT 1 FROM user_achievements WHERE user_id = ? AND achievement_code = ?", [context.userId, code]);
      if (exists.length === 0) {
        await query("INSERT INTO user_achievements (id, user_id, achievement_code) VALUES (?, ?, ?)", [crypto.randomUUID(), context.userId, code]);
      }
    }

    return parsed;
  });

// ---------- Topic explainer (syllabus-driven - NO AI) ----------

export const explainTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        unit_number: z.number().int().min(1).max(6),
        topic: z.string().min(2).max(160),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    try {
      const filePath = path.join(process.cwd(), "src/data/syllabus", `unit${data.unit_number}.json`);
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const unit = JSON.parse(fileContent);

        // 1. Find formulas matching the topic
        const topicLower = data.topic.toLowerCase().trim();
        const matchedFormulas = (unit.formulas || [])
          .filter((f: any) => f.topic.toLowerCase().trim() === topicLower)
          .map((f: any) => ({
            name: f.name,
            expression: f.expression,
          }));

        // 2. Build summary & key points from the mark questions for this topic
        const mark2 = (unit.questions_2_mark || []).filter((q: any) => q.topic.toLowerCase().trim() === topicLower);
        const mark5 = (unit.questions_5_mark || []).filter((q: any) => q.topic.toLowerCase().trim() === topicLower);

        const summary = mark2[0]?.answer || `Detailed tutorial and analytical equations for ${data.topic} within Unit ${data.unit_number}.`;

        const key_points = [
          ...mark2.map((q: any) => `Q: ${q.question} A: ${q.answer}`),
          ...mark5.map((q: any) => `Q: ${q.question} A: ${q.answer.slice(0, 180)}...`),
        ].slice(0, 5);

        if (key_points.length === 0) {
          key_points.push(`Covers the core electrical engineering parameters of ${data.topic}.`);
          key_points.push(`Mathematical definitions and circuit design criteria.`);
        }

        // 3. Find example from numerical problems
        const numeric = (unit.numerical_problems || []).find((p: any) => p.topic.toLowerCase().trim() === topicLower);
        const example = numeric
          ? `Problem: ${numeric.problem}\n\nSteps:\n${(numeric.solution_steps || []).join("\n")}\n\nFinal Answer: ${numeric.final_answer}`
          : `No solved numerical problem available for ${data.topic} in this unit. Check important questions for theory calculations.`;

        return {
          summary,
          key_points,
          formulas: matchedFormulas,
          example,
        };
      }
    } catch (err) {
      console.error("[explainTopic] Error loading local explanation:", err);
    }

    return {
      summary: `Detailed learning explanation for ${data.topic}.`,
      key_points: [`Please consult your textbook for formulas and steps relating to ${data.topic}.`],
      formulas: [],
      example: "",
    };
  });

// ---------- Admin & Password Reset ----------

export const listAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await query("SELECT role FROM users WHERE id = ?", [context.userId]);
    const role = roles[0]?.role;
    if (role !== "admin") throw new Error("Forbidden");

    const [profiles, userProgress, activities, attempts] = await Promise.all([
      query("SELECT id, full_name, email, username, role, created_at FROM users ORDER BY created_at DESC"),
      query("SELECT user_id, points_earned FROM user_progress"),
      query("SELECT user_id, created_at FROM activities"),
      query("SELECT user_id, score FROM quiz_attempts"),
    ]);

    const activityMap = new Map<string, { count: number; last: string | null }>();
    for (const a of activities as any[]) {
      const cur = activityMap.get(a.user_id) ?? { count: 0, last: null };
      cur.count += 1;
      if (!cur.last || a.created_at > cur.last) cur.last = a.created_at;
      activityMap.set(a.user_id, cur);
    }

    const scoreMap = new Map<string, { total: number; n: number }>();
    for (const a of attempts as any[]) {
      const cur = scoreMap.get(a.user_id) ?? { total: 0, n: 0 };
      cur.total += a.score;
      cur.n += 1;
      scoreMap.set(a.user_id, cur);
    }

    const pointMap = new Map<string, number>();
    for (const p of userProgress as any[]) {
      pointMap.set(p.user_id, (pointMap.get(p.user_id) ?? 0) + p.points_earned);
    }

    return (profiles as any[]).map((p) => {
      const s = scoreMap.get(p.id);
      const a = activityMap.get(p.id);
      return {
        id: p.id,
        email: p.email ?? "",
        username: p.username ?? "",
        full_name: p.full_name ?? "",
        created_at: p.created_at,
        roles: [p.role],
        activity_count: a?.count ?? 0,
        last_active: a?.last,
        avg_score: s && s.n ? Math.round(s.total / s.n) : 0,
        points: pointMap.get(p.id) ?? 0,
      };
    });
  });

export const listRecentActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await query("SELECT role FROM users WHERE id = ?", [context.userId]);
    const role = roles[0]?.role;
    if (role !== "admin") throw new Error("Forbidden");

    const data = await query(
      "SELECT id, user_id, activity_type, topic, description, created_at FROM activities ORDER BY created_at DESC LIMIT 50"
    );
    return data;
  });

export const getAdminAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await query("SELECT role FROM users WHERE id = ?", [context.userId]);
    const role = roles[0]?.role;
    if (role !== "admin") throw new Error("Forbidden");

    const [
      usersCountRows,
      solvedCountRows,
      attemptsCountRows,
      unitProgress,
      recentActivities,
    ] = await Promise.all([
      query("SELECT COUNT(*) as count FROM users"),
      query("SELECT COUNT(*) as count FROM solved_problems"),
      query("SELECT COUNT(*) as count FROM quiz_attempts"),
      query("SELECT unit_number, items_completed FROM user_progress"),
      query("SELECT created_at FROM activities ORDER BY created_at DESC LIMIT 500"),
    ]);

    const users = (usersCountRows[0] as any).count;
    const solved = (solvedCountRows[0] as any).count;
    const attempts = (attemptsCountRows[0] as any).count;

    const unitAgg = new Map<number, number>();
    for (const r of unitProgress as any[]) {
      unitAgg.set(r.unit_number, (unitAgg.get(r.unit_number) ?? 0) + r.items_completed);
    }

    // Last 7 days activity
    const day = 24 * 3600 * 1000;
    const now = Date.now();
    const daily: { day: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const start = now - i * day;
      const end = start + day;
      const label = new Date(start).toISOString().slice(5, 10);
      const count = (recentActivities as any[]).filter((r) => {
        const t = new Date(r.created_at).getTime();
        return t >= start && t < end;
      }).length;
      daily.push({ day: label, count });
    }

    return {
      totals: {
        users,
        problems_solved: solved,
        quiz_attempts: attempts,
      },
      per_unit: Array.from({ length: 6 }, (_, i) => ({
        unit_number: i + 1,
        items_completed: unitAgg.get(i + 1) ?? 0,
      })),
      daily_activity: daily,
    };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        userId: z.string().max(80),
        newPassword: z.string().min(4),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const roles = await query("SELECT role FROM users WHERE id = ?", [context.userId]);
    const role = roles[0]?.role;
    if (role !== "admin") throw new Error("Forbidden");

    const passHash = hashPassword(data.newPassword);
    await query("UPDATE users SET password_hash = ? WHERE id = ?", [passHash, data.userId]);

    return { success: true };
  });

// ---------- Delete User (admin only) ----------

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ userId: z.string().max(80) }).parse(raw)
  )
  .handler(async ({ context, data }) => {
    const roles = await query("SELECT role FROM users WHERE id = ?", [context.userId]);
    const role = (roles[0] as any)?.role;
    if (role !== "admin") throw new Error("Forbidden");

    // Prevent deleting other admins
    const target = await query("SELECT role FROM users WHERE id = ?", [data.userId]);
    if ((target[0] as any)?.role === "admin") throw new Error("Cannot delete admin accounts.");

    // Cascade delete all user data
    await query("DELETE FROM user_achievements WHERE user_id = ?", [data.userId]);
    await query("DELETE FROM user_progress WHERE user_id = ?", [data.userId]);
    await query("DELETE FROM activities WHERE user_id = ?", [data.userId]);
    await query("DELETE FROM quiz_attempts WHERE user_id = ?", [data.userId]);
    await query("DELETE FROM solved_problems WHERE user_id = ?", [data.userId]);
    await query("DELETE FROM users WHERE id = ?", [data.userId]);

    return { success: true };
  });

// ---------- Update Profile ----------

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ fullName: z.string().trim().max(80) }).parse(raw)
  )
  .handler(async ({ context, data }) => {
    await query("UPDATE users SET full_name = ? WHERE id = ?", [data.fullName, context.userId]);
    return { success: true };
  });

// ---------- Get My Profile ----------

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const [users, solved, attempts, progress, userAch, allAch] = await Promise.all([
      query("SELECT id, username, email, full_name, role, created_at FROM users WHERE id = ?", [userId]),
      query("SELECT COUNT(*) as count FROM solved_problems WHERE user_id = ?", [userId]),
      query("SELECT score FROM quiz_attempts WHERE user_id = ?", [userId]),
      query("SELECT points_earned FROM user_progress WHERE user_id = ?", [userId]),
      query("SELECT achievement_code, earned_at FROM user_achievements WHERE user_id = ?", [userId]),
      query("SELECT code, title, icon FROM achievements"),
    ]);
    const u = (users as any)[0];
    if (!u) throw new Error("Profile not found.");
    const totalPoints = (progress as any[]).reduce((n: number, r: any) => n + (r.points_earned ?? 0), 0);
    const nAttempts = (attempts as any[]).length;
    const avgScore = nAttempts ? Math.round((attempts as any[]).reduce((n: number, a: any) => n + a.score, 0) / nAttempts) : 0;
    const achMap = new Map((allAch as any[]).map((a: any) => [a.code, a]));
    return {
      id: u.id,
      username: u.username,
      email: u.email,
      full_name: u.full_name ?? "",
      role: u.role,
      created_at: u.created_at,
      stats: {
        problems_solved: Number((solved as any)[0]?.count ?? 0),
        quiz_attempts: nAttempts,
        avg_score: avgScore,
        total_points: totalPoints,
        achievements: (userAch as any[]).length,
      },
      achievements: (userAch as any[]).map((ua: any) => {
        const m = achMap.get(ua.achievement_code);
        return { code: ua.achievement_code, title: m?.title ?? ua.achievement_code, icon: m?.icon ?? "trophy", earned_at: ua.earned_at };
      }),
    };
  });
