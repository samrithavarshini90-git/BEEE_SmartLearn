import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callLovableAI, safeParseJson } from "@/lib/ai-gateway.server";
import { query, ensureDb } from "@/lib/db.server";
// tesseract.js is dynamically imported inside solveProblem handler to avoid __dirname ESM crash on Render
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
  length: number;
}
export interface DiagramData {
  description: string;
  schemdraw_instructions?: SchemdrawInstruction[];
  svg?: string; // We'll inject the python-generated SVG here
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
    let sql = "SELECT id, unit_number, topic, name, formula, latex, explanation, variables FROM formulas WHERE 1=1";
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
3. The 'steps' array must be highly detailed and comprehensive so a student avoids any confusion. DO NOT provide short or skipping steps. Provide all needed steps.
4. If a diagram is needed, provide a "diagram" object containing Python schemdraw instructions.

{
  "unit_number": 1|2|3|4|5|6,
  "topic": string,
  "question": string,
  "steps": { "step": number, "description": string, "expression"?: string }[],
  "formulas_used": string[],
  "final_answer": string,
  "diagram": null | {
    "description": string,
    "schemdraw_instructions": {
       "type": "Resistor"|"Capacitor"|"Inductor"|"BatteryCell"|"SourceV"|"SourceI"|"Diode"|"BjtNpn"|"Line"|"Ground",
       "direction": "right"|"left"|"up"|"down",
       "label": string,
       "length": number
    }[]
  },
  "extracted_text"?: string
}

Rules:
- If the problem is contained in an image, first perform OCR into "extracted_text", then solve.
- Only emit a diagram when it materially aids understanding.
- Every "expression" must be plain ASCII math like V = I*R, Z = sqrt(R^2 + (Xl-Xc)^2), pf = cos(phi).`;

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
    if (data.imageDataUrl) {
      try {
        console.log("[OCR] Running local Tesseract.js OCR on uploaded image...");
        // Dynamic import prevents Nitro from bundling tesseract.js as ESM at build time,
        // which would crash the server with "__dirname is not defined" in ES module scope.
        const Tesseract = (await import("tesseract.js")).default;
        const result = await Tesseract.recognize(data.imageDataUrl, "eng");
        extractedText = result.data.text.trim();
        console.log("[OCR] Text extracted successfully:", extractedText.slice(0, 120));
      } catch (ocrErr: any) {
        console.error("[OCR] Local OCR processing failed:", ocrErr);
      }
    }

    const questionText = data.question
      ? data.question
      : extractedText
        ? extractedText
        : "Analyze and explain the circuit details provided in the image.";

    const promptText = `${data.unit_number ? `Target Unit: ${data.unit_number}\n` : ""}${data.topic ? `Topic hint: ${data.topic}\n` : ""
      }Problem statement:\n${questionText}`;

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
    if (extractedText && !parsed.extracted_text) {
      parsed.extracted_text = extractedText;
    }

    if (parsed.diagram?.schemdraw_instructions && parsed.diagram.schemdraw_instructions.length > 0) {
      try {
        console.log("[Schemdraw] Generating SVG via Python backend...");
        const pyScript = path.join(process.cwd(), "src/lib/python/schematic_generator.py");
        const jsonInput = JSON.stringify(parsed.diagram.schemdraw_instructions);

        const svg = await new Promise<string>((resolve, reject) => {
          const pyCommand = process.platform === "win32" ? "python" : "python3";
          const child = execFile(pyCommand, [pyScript], (error, stdout, stderr) => {
            if (error) {
              console.error("[Schemdraw] Error:", stderr);
              resolve(""); // fallback silently
            } else {
              resolve(stdout);
            }
          });
          if (child.stdin) {
            child.stdin.write(jsonInput);
            child.stdin.end();
          }
        });

        if (svg) {
          parsed.diagram.svg = svg;
        }
      } catch (err) {
        console.error("[Schemdraw] Failed to execute python:", err);
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
    };
  });
