import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const databaseUrl = process.env.TIDB_URL;
if (!databaseUrl) {
  console.warn("TIDB_URL env variable is missing!");
}

export const pool = mysql.createPool({
  uri: databaseUrl,
  ssl: {
    minVersion: "TLSv1.2",
    rejectUnauthorized: true,
  },
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
});

export async function query<T>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await pool.execute(sql, params);
  return rows as T[];
}

// Create a temporary single-connection pool to create the DB using sys
async function ensureDatabase() {
  const baseUrl = (databaseUrl || "").replace(/\/[^/]+$/, "/sys");
  const sysPool = mysql.createPool({
    uri: baseUrl,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectionLimit: 1,
  });
  try {
    await sysPool.execute("CREATE DATABASE IF NOT EXISTS `beee`");
  } finally {
    await sysPool.end();
  }
}

let isInitialized = false;
let initPromise: Promise<void> | null = null;

export async function ensureDb(): Promise<void> {
  if (isInitialized) return;
  if (!initPromise) {
    initPromise = initDb();
  }
  return initPromise;
}

async function initDb() {
  try {
    console.log("[TiDB] Initializing database schema...");

    // 0. Ensure the database exists (CREATE DATABASE IF NOT EXISTS beee)
    try {
      await ensureDatabase();
      console.log("[TiDB] Database 'beee' ensured.");
    } catch (dbErr) {
      console.warn("[TiDB] Could not auto-create database (may already exist):", (dbErr as Error).message);
    }

    // 1. Create tables
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        username VARCHAR(80) NOT NULL UNIQUE,
        email VARCHAR(160) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(160),
        role VARCHAR(20) DEFAULT 'student',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS syllabus_units (
        id VARCHAR(36) PRIMARY KEY,
        unit_number INT NOT NULL UNIQUE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        topics JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS formulas (
        id VARCHAR(36) PRIMARY KEY,
        unit_number INT NOT NULL,
        topic VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        formula TEXT NOT NULL,
        latex TEXT,
        explanation TEXT,
        variables JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS important_questions (
        id VARCHAR(36) PRIMARY KEY,
        unit_number INT NOT NULL,
        topic VARCHAR(255) NOT NULL,
        marks INT NOT NULL,
        question TEXT NOT NULL,
        answer_outline TEXT,
        formulas_used JSON,
        diagram_hint TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS numerical_problems (
        id VARCHAR(36) PRIMARY KEY,
        unit_number INT NOT NULL,
        topic VARCHAR(255) NOT NULL,
        problem TEXT NOT NULL,
        solution_steps JSON,
        final_answer TEXT,
        formulas_used JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS quiz_questions (
        id VARCHAR(36) PRIMARY KEY,
        unit_number INT NOT NULL,
        topic VARCHAR(255) NOT NULL,
        question TEXT NOT NULL,
        options JSON NOT NULL,
        correct_index INT NOT NULL,
        explanation TEXT,
        difficulty VARCHAR(20) DEFAULT 'easy',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS quiz_attempts (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        unit_number INT NOT NULL,
        score INT NOT NULL DEFAULT 0,
        total INT NOT NULL DEFAULT 0,
        correct INT NOT NULL DEFAULT 0,
        duration_seconds INT NOT NULL DEFAULT 0,
        details JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS user_progress (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        unit_number INT NOT NULL,
        items_completed INT NOT NULL DEFAULT 0,
        points_earned INT NOT NULL DEFAULT 0,
        last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY user_unit_unique (user_id, unit_number)
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS achievements (
        id VARCHAR(36) PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        icon VARCHAR(50) DEFAULT 'trophy',
        points INT NOT NULL DEFAULT 10,
        criteria JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS user_achievements (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        achievement_code VARCHAR(50) NOT NULL,
        earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY user_ach_unique (user_id, achievement_code)
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS activities (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        activity_type VARCHAR(50) NOT NULL,
        topic VARCHAR(255),
        description TEXT,
        metadata JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS solved_problems (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        topic VARCHAR(255),
        question TEXT NOT NULL,
        solution JSON NOT NULL,
        marks INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Seed default admin user
    const admins = await query("SELECT 1 FROM users WHERE role = 'admin'");
    if (admins.length === 0) {
      console.log("[TiDB] Seeding admin user...");
      const adminId = crypto.randomUUID();
      const passHash = crypto.createHash("sha256").update("admin").digest("hex");
      await query(
        "INSERT INTO users (id, username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?, ?)",
        [adminId, "admin", "admin@beeesmartlearn.com", passHash, "Administrator", "admin"]
      );
    }

    // 3. Seed achievements if empty
    const achs = await query("SELECT 1 FROM achievements LIMIT 1");
    if (achs.length === 0) {
      console.log("[TiDB] Seeding achievements catalogue...");
      const defaultAchs = [
        { code: "first_solve", title: "First Solve", description: "Solved your first BEEE problem.", icon: "sparkles", points: 10, criteria: { type: "solve", count: 1 } },
        { code: "solver_10", title: "Problem Hunter", description: "Solved 10 problems in the AI Solver.", icon: "target", points: 25, criteria: { type: "solve", count: 10 } },
        { code: "quiz_first", title: "Quiz Rookie", description: "Completed your first quiz.", icon: "graduation-cap", points: 10, criteria: { type: "quiz", count: 1 } },
        { code: "quiz_perfect", title: "Perfect Score", description: "Scored 100% on any unit quiz.", icon: "crown", points: 50, criteria: { type: "quiz_perfect" } },
        { code: "unit_all", title: "Six-Unit Scholar", description: "Attempted a quiz on all 6 syllabus units.", icon: "medal", points: 100, criteria: { type: "units", count: 6 } },
      ];
      for (const a of defaultAchs) {
        await query(
          "INSERT INTO achievements (id, code, title, description, icon, points, criteria) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [crypto.randomUUID(), a.code, a.title, a.description, a.icon, a.points, JSON.stringify(a.criteria)]
        );
      }
    }

    // 4. Seed syllabus contents if empty
    const units = await query("SELECT 1 FROM syllabus_units LIMIT 1");
    if (units.length === 0) {
      console.log("[TiDB] Seeding syllabus data from local JSONs...");
      for (let i = 1; i <= 6; i++) {
        try {
          const filePath = path.join(process.cwd(), "src/data/syllabus", `unit${i}.json`);
          if (fs.existsSync(filePath)) {
            const dataStr = fs.readFileSync(filePath, "utf-8");
            const unit = JSON.parse(dataStr);

            // Insert unit
            await query(
              "INSERT INTO syllabus_units (id, unit_number, title, description, topics) VALUES (?, ?, ?, ?, ?)",
              [crypto.randomUUID(), unit.unit_number, unit.unit_title, "", JSON.stringify(unit.topics)]
            );

            // Seed formulas
            if (unit.formulas && Array.isArray(unit.formulas)) {
              for (const f of unit.formulas) {
                await query(
                  "INSERT INTO formulas (id, unit_number, topic, name, formula, latex, explanation, variables) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                  [crypto.randomUUID(), unit.unit_number, f.topic, f.name, f.expression, f.latex, f.explanation, JSON.stringify(f.variables || [])]
                );
              }
            }

            // Seed important questions (2-mark, 5-mark, 10-mark)
            if (unit.questions_2_mark && Array.isArray(unit.questions_2_mark)) {
              for (const q of unit.questions_2_mark) {
                await query(
                  "INSERT INTO important_questions (id, unit_number, topic, marks, question, answer_outline, formulas_used, diagram_hint) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                  [crypto.randomUUID(), unit.unit_number, q.topic, 2, q.question, q.answer, JSON.stringify([]), q.diagram_hint || null]
                );
              }
            }
            if (unit.questions_5_mark && Array.isArray(unit.questions_5_mark)) {
              for (const q of unit.questions_5_mark) {
                await query(
                  "INSERT INTO important_questions (id, unit_number, topic, marks, question, answer_outline, formulas_used, diagram_hint) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                  [crypto.randomUUID(), unit.unit_number, q.topic, 5, q.question, q.answer, JSON.stringify(q.formulas_used || []), q.diagram_hint || null]
                );
              }
            }
            if (unit.questions_10_mark && Array.isArray(unit.questions_10_mark)) {
              for (const q of unit.questions_10_mark) {
                await query(
                  "INSERT INTO important_questions (id, unit_number, topic, marks, question, answer_outline, formulas_used, diagram_hint) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                  [crypto.randomUUID(), unit.unit_number, q.topic, 10, q.question, q.answer, JSON.stringify(q.formulas_used || []), q.diagram_hint || null]
                );
              }
            }

            // Seed numerical problems
            if (unit.numerical_problems && Array.isArray(unit.numerical_problems)) {
              for (const p of unit.numerical_problems) {
                await query(
                  "INSERT INTO numerical_problems (id, unit_number, topic, problem, solution_steps, final_answer, formulas_used) VALUES (?, ?, ?, ?, ?, ?, ?)",
                  [crypto.randomUUID(), unit.unit_number, p.topic, p.problem, JSON.stringify(p.solution_steps || []), p.final_answer, JSON.stringify(p.formulas_used || [])]
                );
              }
            }

            // Seed mcqs
            if (unit.mcqs && Array.isArray(unit.mcqs)) {
              for (const q of unit.mcqs) {
                await query(
                  "INSERT INTO quiz_questions (id, unit_number, topic, question, options, correct_index, explanation, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                  [crypto.randomUUID(), unit.unit_number, q.topic, q.question, JSON.stringify(q.options || []), q.correct_index, q.explanation, q.difficulty || "easy"]
                );
              }
            }
          }
        } catch (err) {
          console.error(`[TiDB] Failed to seed unit ${i}:`, err);
        }
      }
    }

    console.log("[TiDB] Database initialization completed successfully!");
    isInitialized = true;
  } catch (error) {
    console.error("[TiDB] Database initialization error:", error);
    throw error;
  }
}
