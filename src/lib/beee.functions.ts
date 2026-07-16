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

export interface SolutionStep {
  step: number;
  description: string;
  expression?: string;
  diagram?: DiagramData | null;
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
  svg?: string; // We'll inject the python-generated SVG here
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

CRITICAL RULES FOR OUTPUT:
1. DO NOT output any conversational text, introductions, or conclusions. NO PROSE.
2. Produce ONE STRICT JSON object matching the type below.
3. The 'steps' array must be highly detailed and comprehensive so a student avoids any confusion. Provide all needed steps.
4. If a diagram is needed, provide a "diagram" object containing Python schemdraw instructions.

{
  "unit_number": 1|2|3|4|5|6,
  "topic": string,
  "question": string,
  "steps": { 
    "step": number, 
    "description": string, 
    "expression"?: string,
    "diagram"?: null | {
      "description": string,
      "schemdraw_instructions": {
         "type": "Resistor"|"Capacitor"|"Inductor"|"BatteryCell"|"SourceV"|"SourceI"|"Diode"|"BjtNpn"|"Line"|"Ground",
         "direction": "right"|"left"|"up"|"down",
         "label": string,
         "label2"?: string,
         "length": number
      }[]
    }
  }[],
  "formulas_used": string[],
  "final_answer": string,
  "diagram": null | {
    "description": string,
    "schemdraw_instructions": {
       "type": "Resistor"|"Capacitor"|"Inductor"|"BatteryCell"|"SourceV"|"SourceI"|"Diode"|"BjtNpn"|"Line"|"Ground",
       "direction": "right"|"left"|"up"|"down",
       "label": string,
       "label2"?: string,
       "length": number
    }[]
  },
  "extracted_text"?: string
}

DIAGRAM RULES — read carefully:

IMPORTANT: The backend will automatically arrange all schemdraw components into a clean RECTANGULAR LOOP. You do NOT need to specify directions or worry about topology. Just provide:
  1. One source element (SourceV/SourceI/BatteryCell) with its voltage/current label
  2. The key components (Resistor, Capacitor, Inductor, Diode, etc.)

### Step-by-Step Diagrams (CRITICAL):
- You MUST provide a step-specific "diagram" object inside any step in the "steps" array where the circuit configuration changes or simplifies.
- Every step diagram MUST be strictly unique and illustrate the PROGRESS of the solution.
- DO NOT duplicate the same diagram across multiple steps. If a step does not modify the circuit configuration, DO NOT include a diagram for that step (set it to null).
- Examples of required step-by-step diagrams:
  * Superposition steps: Show the circuit state with inactive sources deactivated (voltage sources replaced by short/line, current sources replaced by open/empty space).
  * Simplification/Reduction steps: Show the simplified circuit state after combining a group of parallel or series resistors (e.g., replacing $R_1 \parallel R_2$ with $R_{12} = 1.33\,\Omega$).
  * Thevenin/Norton steps: Show the final reduced single-loop equivalent circuit containing $V_{th}$ or $I_n$ connected to the load resistor.
  * Node/Mesh analysis: Show node labels and current directions annotated.
- For each step diagram, ensure all labels, values, and calculations are perfectly synchronized with the prose description and expression of that specific step.
- Keep each step diagram simple, using 1 source and 1-3 key components to reflect the current state of the reduction. Ensure a clean rectangular shape.

### Diagram Labeling Rules (CRITICAL for SVG alignment):
- Component labels (both "label" and "label2") MUST be plain text/clean unicode only.
- NEVER use LaTeX syntax (e.g. backslashes like \\Omega, \\text, or curly braces, subscripts like R_{th}) inside diagram "label" or "label2" properties!
- Use standard unicode characters and clean spacing directly:
  * Use "Ω" or "ohm" instead of "\\Omega" or "\\mathrm{\\Omega}".
  * Use simple subscripts directly: "Rth", "RL", "Vth", "In", "Req", "R12" instead of "R_{th}", "R_L", "V_{th}", "I_n", "R_{eq}", "R_{12}".
  * Examples: label="Rth = 2.48kΩ", label="RL = 4.7kΩ", label="Vth = 17.14V", label2="I = 2.86mA".
- Keep every label short and properly positioned.

### When the question asks to SOLVE a circuit:
- List the source and the KEY components that illustrate the solution.
- For each component, use "label" (which renders at the TOP of the component) for its designation/value (e.g. "R1=4Ω" or "Req=6.42Ω"), and optionally "label2" (which renders at the BOTTOM of the component) for its solved current or voltage (e.g. "I=1.56A" or "V=6.89V" or "➔ I=0.98A").
- Do not combine these into a single "label" field. Keep them separate.
  Good: label="R1=3Ω", label2="I=0.98A"
  Bad: label="R3=3Ω, I=0.98A" (never put two values in one label)
- description must say "Solved circuit: [what was found and the numeric answer]".

### When the question is a general/theory question:
- List the source and components that best illustrate the concept.
- Use simple clean values. Use "label" for component value and "label2" if there is any other value.
- description must say what concept the circuit illustrates.

### Never emit null diagram for circuit/electrical questions. Only use null for pure theory with no circuit.

OTHER RULES:
- Set direction="right" and length=3 for all components. Set direction="up" for sources. The backend will override layout anyway.
- Put derivations/formulas in "steps", not in "final_answer".
- Every step "description" MUST wrap all inline math symbols, variables (e.g. $R_1$, $V_A$, $I_{3\Omega}$), values with units (e.g. $1\,\mathrm{k}\Omega$, $470\,\Omega$, $20\,\mathrm{V}$), or equations inside single dollar signs ($) for proper rendering. Do not write raw LaTeX commands directly in plain text without $ signs.
- "final_answer" MUST use LaTeX for all math. Each result on its own line. Examples: "I_{3\\Omega} = 0.984\\,\\text{A}", "V_{R1} = 1.33\\,\\text{V}", "R_{eq} = 6.42\\,\\Omega".
- Every "expression" MUST use LaTeX syntax. Examples: "R_{eq} = \\frac{R_1 R_2}{R_1+R_2}", "I = \\frac{V}{R} = \\frac{10}{6.42} = 1.557\\,A".
- Every "formulas_used" entry MUST also be LaTeX, e.g. "I = \\frac{V}{R}", "R_{eq} = R_1 + R_2".`;

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
      try {
        console.log("[Vision API] Scanning image with Cerebras gemma-4-31b...");
        const visionPrompt = `You are a circuit-reading expert. Analyze this BEEE (Basic Electrical & Electronics Engineering) image carefully.

YOUR JOB:
1. Extract ALL text/question from the image exactly.
2. If a circuit diagram is visible, trace it component-by-component, following the actual wires in the image, and produce schemdraw drawing instructions that faithfully reproduce the circuit topology.

Return ONLY a strict JSON object (no prose) in this format:
{
  "extracted_text": "The complete question text or problem statement read from the image verbatim.",
  "diagram": {
    "description": "Concise description of the circuit topology",
    "schemdraw_instructions": [
      {
        "type": "Resistor",
        "direction": "right",
        "label": "exact component label and value from image e.g. R1 = 4Ω",
        "length": 2
      }
    ]
  }
}

Rules:
- Valid types: "Resistor", "Capacitor", "Inductor", "BatteryCell", "SourceV", "SourceI", "Diode", "BjtNpn", "Line", "Ground".
- Valid directions: "right", "left", "up", "down".
- If the image has NO circuit diagram (only text/formulas), set "diagram" to null.
- Every circuit MUST form a closed loop.`;


        let visionRaw = await callCerebrasVision(data.imageDataUrl, visionPrompt);
        console.log("[Vision API] raw response:", visionRaw);
        let parsedVision = safeParseJson<any>(visionRaw, {});
        console.log("[Vision API] parsed response:", JSON.stringify(parsedVision));

        // OCR-only retry fallback if first attempt returned empty or failed to parse
        let rawExtracted = parsedVision.extracted_text || 
                             parsedVision.question_text || 
                             parsedVision.question || 
                             parsedVision.text || 
                             parsedVision.extractedText || 
                             parsedVision.ocr_text || "";

        let parsedDiag = parsedVision.diagram || 
                         parsedVision.circuit || 
                         parsedVision.circuit_diagram || 
                         parsedVision.schematic;

        if (!rawExtracted && (!parsedDiag || typeof parsedDiag !== "object")) {
          console.warn("[Vision API] First attempt returned empty or invalid JSON. Retrying with simplified OCR prompt...");
          const retryPrompt = `Analyze the uploaded image. Extract all readable text and describe any circuit diagrams present.
Return ONLY a strict JSON object in this format:
{
  "extracted_text": "The text read from the image",
  "diagram": null
}`;
          const retryRaw = await callCerebrasVision(data.imageDataUrl, retryPrompt);
          console.log("[Vision API] retry raw response:", retryRaw);
          parsedVision = safeParseJson<any>(retryRaw, {});
          console.log("[Vision API] retry parsed response:", JSON.stringify(parsedVision));

          rawExtracted = parsedVision.extracted_text || 
                        parsedVision.question_text || 
                        parsedVision.question || 
                        parsedVision.text || 
                        parsedVision.extractedText || 
                        parsedVision.ocr_text || "";

          parsedDiag = parsedVision.diagram || 
                       parsedVision.circuit || 
                       parsedVision.circuit_diagram || 
                       parsedVision.schematic;
        }

        extractedText = typeof rawExtracted === "string" ? rawExtracted : JSON.stringify(rawExtracted);

        if (parsedDiag && typeof parsedDiag === "object") {
          visionDiagram = parsedDiag;
          if (!visionDiagram.schemdraw_instructions && visionDiagram.instructions) {
            visionDiagram.schemdraw_instructions = visionDiagram.instructions;
          }
          if (!visionDiagram.schemdraw_instructions && visionDiagram.components) {
            visionDiagram.schemdraw_instructions = visionDiagram.components;
          }
        }

        if (!extractedText && (!visionDiagram || !visionDiagram.description)) {
          throw new Error("No readable text or circuit components were detected in the uploaded image. Please ensure the image is clear and contains a valid BEEE question/diagram.");
        }

        console.log("[Vision API] Scanned text successfully:", extractedText.slice(0, 120));
      } catch (err: any) {
        console.error("[Vision API] Processing failed:", err);
        throw new Error(
          `Image scan failed: ${err.message || err}. The AI vision server is currently busy or rate-limited. Please try again in a few moments.`
        );
      }
    }

    const questionText = data.question
      ? data.question
      : extractedText
        ? extractedText
        : "Analyze and explain the circuit details provided in the image.";

    const diagramRequired = shouldRequestDiagram(data, questionText);
    
    // Inject the vision diagram context into the prompt for the text model solver
    let promptText = "";
    if (data.unit_number) promptText += `Target Unit: ${data.unit_number}\n`;
    if (data.topic) promptText += `Topic hint: ${data.topic}\n`;
    // Determine diagram mode:
    // - SOLVE mode: question asks to find/calculate values → generate SOLVED circuit annotated with results
    // - GENERAL mode: conceptual/educational → generate a representative illustrative circuit
    const solveMode = isSolveQuestion(questionText);
    const visionDiagramIsUsable =
      visionDiagram != null &&
      Array.isArray(visionDiagram.schemdraw_instructions) &&
      visionDiagram.schemdraw_instructions.length > 0;

    if (visionDiagram) {
      // Always provide vision topology to the text solver as context
      promptText += `Image Circuit Topology (extracted from uploaded image):\nDescription: ${visionDiagram.description}\nComponents: ${JSON.stringify(visionDiagram.schemdraw_instructions)}\n\n`;
    }

    if (diagramRequired) {
      if (solveMode) {
        promptText += `DIAGRAM REQUIREMENT: Generate a SOLVED circuit diagram. Use the circuit topology above (if provided) as the base, but label every component with its COMPUTED value from your solution (e.g. label="R1=4Ω, I=1.5A"). The diagram must visually show the answer — not just the bare input schematic.\n`;
      } else {
        promptText += `DIAGRAM REQUIREMENT: Generate a clear EDUCATIONAL circuit diagram that best illustrates the concept in this question. Use clean, simple values.\n`;
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

    // Priority order for diagram:
    // 1. TEXT SOLVER's diagram — highest priority because it can annotate solved values.
    //    The text solver was given the vision topology as context, so its output
    //    should reflect either the solved circuit (annotated) or an educational one.
    // 2. VISION diagram raw — fallback when text solver returned no instructions.
    //    E.g. if the text model skipped the diagram for some reason.
    // 3. BASIC FALLBACK — keyword-based minimal circuit when all else fails.
    let usedBasicDiagramFallback = false;
    const textDiagramInstructions = parsed.diagram?.schemdraw_instructions ?? [];

    if (textDiagramInstructions.length > 0) {
      // Text solver produced a diagram — use it (it has solution-annotated labels)
      // Nothing to do, parsed.diagram is already set
    } else if (visionDiagramIsUsable) {
      // Text solver skipped diagram but vision has the raw topology — use that
      parsed.diagram = {
        ...visionDiagram,
        description: parsed.diagram?.description || visionDiagram.description,
      };
    } else if (diagramRequired) {
      // Last resort: generate a simple circuit from the question keywords
      parsed.diagram = createBasicCircuitDiagram(questionText);
      usedBasicDiagramFallback = true;
    }


    if (parsed.diagram?.schemdraw_instructions && parsed.diagram.schemdraw_instructions.length > 0) {
      // Clean diagram labels and convert deactivated/shorted sources
      parsed.diagram.schemdraw_instructions = cleanAndNormalizeDiagram(parsed.diagram.schemdraw_instructions);
      // Normalize every diagram to a clean rectangular layout before rendering
      parsed.diagram.schemdraw_instructions = forceRectangularLayout(parsed.diagram.schemdraw_instructions);
      parsed.diagram.schemdraw_instructions = closeCircuitInstructions(parsed.diagram.schemdraw_instructions);
    }

    if (parsed.diagram?.schemdraw_instructions && parsed.diagram.schemdraw_instructions.length > 0) {
      try {
        console.log("[Schemdraw] Generating SVG via Python backend...");
        let diagramResult = await renderSchemdrawSvg(parsed.diagram.schemdraw_instructions);

        if (!diagramResult.svg && diagramRequired && !usedBasicDiagramFallback) {
          const aiDiagramError = diagramResult.error;
          const fallbackDiagram = createBasicCircuitDiagram(questionText);
          console.warn("[Schemdraw] Retrying with simplified generated instructions.");
          // Clean fallback as well
          const fallbackCleaned = cleanAndNormalizeDiagram(fallbackDiagram.schemdraw_instructions ?? []);
          diagramResult = await renderSchemdrawSvg(fallbackCleaned);
          parsed.diagram = fallbackDiagram;
          if (!diagramResult.svg && aiDiagramError) {
            diagramResult.error = `${aiDiagramError}\n${diagramResult.error ?? ""}`.trim();
          }
        }

        if (diagramResult.svg) {
          parsed.diagram.svg = diagramResult.svg;
          delete parsed.diagram.error;
        } else if (diagramResult.error) {
          parsed.diagram.error = diagramResult.error;
        }
      } catch (err) {
        console.error("[Schemdraw] Failed to execute python:", err);
        parsed.diagram.error = err instanceof Error ? err.message : "Failed to execute Python diagram generator.";
      }
    }

    // Process step-by-step diagrams if returned by the AI
    if (Array.isArray(parsed.steps)) {
      // Keep track of diagram signatures to avoid duplication
      const mainInstructionsJson = parsed.diagram?.schemdraw_instructions
        ? JSON.stringify(parsed.diagram.schemdraw_instructions)
        : "";
      const seenDiagrams = new Set<string>();
      if (mainInstructionsJson) {
        seenDiagrams.add(mainInstructionsJson);
      }

      for (const step of parsed.steps) {
        if (step.diagram && Array.isArray(step.diagram.schemdraw_instructions) && step.diagram.schemdraw_instructions.length > 0) {
          // Clean labels and convert deactivated/shorted sources
          const cleaned = cleanAndNormalizeDiagram(step.diagram.schemdraw_instructions);
          // Normalize instructions layout first so signatures match correctly
          const normalized = closeCircuitInstructions(forceRectangularLayout(cleaned));
          const signature = JSON.stringify(normalized);

          if (seenDiagrams.has(signature)) {
            console.log(`[Schemdraw] Discarding duplicate diagram for step ${step.step}`);
            step.diagram = null;
            continue;
          }

          seenDiagrams.add(signature);
          step.diagram.schemdraw_instructions = normalized;

          try {
            console.log(`[Schemdraw] Generating SVG for step ${step.step}...`);
            const stepDiagResult = await renderSchemdrawSvg(step.diagram.schemdraw_instructions);
            if (stepDiagResult.svg) {
              step.diagram.svg = stepDiagResult.svg;
              delete step.diagram.error;
            } else if (stepDiagResult.error) {
              step.diagram.error = stepDiagResult.error;
            }
          } catch (err) {
            console.error(`[Schemdraw] Failed to render step ${step.step} diagram:`, err);
            step.diagram.error = err instanceof Error ? err.message : "Failed to render step diagram.";
          }
        } else {
          step.diagram = null;
        }
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
