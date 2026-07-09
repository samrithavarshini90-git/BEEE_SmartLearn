# BEEE SmartLearn

An AI-powered study platform for **Basic Electrical & Electronics Engineering (BEEE)** — built for engineering students preparing for university exams.

---

## Features

- **AI Problem Solver** — Solve BEEE problems step-by-step using Cerebras Llama-3.3-70b. Supports typed questions and image uploads.
- **Formula Library** — Curated formula database across all 6 syllabus units with variable definitions.
- **Important Questions** — Structured 2M, 5M, and 10M exam questions with step-wise model answers, formulas highlighted, and SI units marked.
- **Numerical Problems** — Worked numerical examples with full solution steps.
- **Unit Quizzes** — Timed MCQ quizzes per unit with auto-scoring and achievement tracking.
- **Leaderboard** — Live ranking of students by points earned across problems and quizzes.
- **Progress Dashboard** — Per-unit progress tracking, recent activity, and achievement badges.
- **Admin Panel** — Manage student accounts (reset password, delete), view analytics and activity logs.
- **User Profile** — Editable profile page for all users.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Full-stack Framework | [TanStack Start](https://tanstack.com/start) (React + SSR) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Database | [TiDB Cloud Serverless](https://tidbcloud.com/) (MySQL-compatible) |
| AI API | [Cerebras](https://cerebras.ai/) — `llama-3.3-70b` |
| Auth | Custom HMAC-SHA256 JWT (server-side) |
| Build Tool | Vite v8 |
| Hosting | Render (single service — full-stack) |

---

## Syllabus Coverage

| Unit | Topic |
|---|---|
| Unit 1 | DC Circuits (Ohm's Law, KVL/KCL, Thevenin, Norton, Superposition) |
| Unit 2 | AC Circuits (Phasors, RLC, Resonance, Power Factor, 3-Phase) |
| Unit 3 | Electrical Machines (Transformers, DC Motors, Induction Motors, Safety) |
| Unit 4 | Semiconductor Diodes (PN Junction, Rectifiers, Zener, LED, Filters) |
| Unit 5 | Transistors (BJT, FET, MOSFET, Biasing, CE/CB/CC Configurations) |
| Unit 6 | Communication Systems (AM/FM/PM, Sampling, Digital Modulation) |

---

## Environment Variables

Create a `.env` file in the project root:

```env
# TiDB Cloud Database (required)
TIDB_URL="mysql://<user>:<password>@<host>:4000/beee"

# Cerebras AI API (required — for problem solver)
CEREBRAS_API_KEY="csk-..."

# JWT Secret (required — change this in production)
JWT_SECRET="your-strong-random-secret-here"
```

> **Note:** The old Supabase keys in `.env` are unused — the project has been fully migrated to TiDB.

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Set up your .env file (see above)

# 3. Start the dev server (frontend + backend together)
npm run dev
```

The app runs at **http://localhost:8080** (or 8081 if that port is busy).

---

## Production Build & Deploy

### Building locally

```bash
npm run build
npm run preview
```

### Deploy to Render

1. Connect your GitHub repo to [Render](https://render.com)
2. Create a new **Web Service**
3. Set:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `node .output/server/index.mjs`
   - **Environment:** Node
4. Add the environment variables (`TIDB_URL`, `CEREBRAS_API_KEY`, `JWT_SECRET`) in the Render dashboard
5. Deploy

Alternatively, use the included `render.yaml` for automatic configuration.

---

## Default Admin Account

On first run the server auto-seeds an admin account:

| Field | Value |
|---|---|
| Username | `admin` |
| Password | `admin` |

> **Change the admin password immediately after deploying to production** via the Admin Panel → Reset Password.

---

## Project Structure

```
src/
├── data/syllabus/         # Unit 1–6 JSON data files (syllabus, formulas, questions)
├── lib/
│   ├── beee.functions.ts  # All server functions (auth, queries, AI)
│   ├── db.server.ts       # TiDB pool, schema init, seeding
│   ├── ai-gateway.server.ts  # Cerebras API client
│   └── auth-utils.server.ts  # JWT sign/verify
├── routes/
│   ├── _authenticated/    # Protected routes (dashboard, solver, quiz…)
│   │   ├── dashboard.tsx
│   │   ├── solver.tsx
│   │   ├── profile.tsx
│   │   ├── questions.tsx
│   │   ├── formulas.tsx
│   │   ├── numericals.tsx
│   │   ├── quiz.tsx
│   │   ├── leaderboard.tsx
│   │   └── admin.tsx
│   └── auth.tsx           # Sign in / Sign up
├── components/
│   ├── app/               # App shell, navigation
│   └── ui/                # shadcn/ui components
unit1.txt – unit6.txt      # Original syllabus notes (source material)
```

---

## License

MIT — built for educational purposes.

