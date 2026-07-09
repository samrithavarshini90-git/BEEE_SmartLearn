import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Sparkles,
  BookOpen,
  Zap,
  ScanLine,
  BrainCircuit,
  ShieldCheck,
  ImagePlus,
  ListChecks,
  Users2,
  MessageSquareQuote,
  Mail,
  MessagesSquare,
  ChevronDown,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navbar } from "./navbar";
import { Footer } from "./footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const FEATURES = [
  {
    icon: BrainCircuit,
    title: "AI Problem Solver",
    desc: "Type a BEEE problem and get a clean, step-by-step engineering solution with formulas.",
  },
  {
    icon: ImagePlus,
    title: "Snap & Solve",
    desc: "Upload a photo of a handwritten or printed question — OCR extracts and solves it.",
  },
  {
    icon: BookOpen,
    title: "Formula Library",
    desc: "Topic-wise BEEE formulas with variables, units and plain-English explanations.",
  },
  {
    icon: ListChecks,
    title: "Important Questions",
    desc: "Curated 2, 5, and 10-mark questions with model answers for every unit.",
  },
  {
    icon: Zap,
    title: "Progress Dashboard",
    desc: "Track solved problems, recent activity and topic mastery in a single view.",
  },
  {
    icon: ShieldCheck,
    title: "Secure by design",
    desc: "Email/password auth with hashed credentials, JWT sessions and role-based access.",
  },
];

const OVERVIEW = [
  {
    step: "01",
    title: "Learn the theory",
    desc: "Browse concise topic overviews with formulas and worked reasoning.",
    icon: BookOpen,
  },
  {
    step: "02",
    title: "Practice with AI",
    desc: "Solve textbook problems or your own — text or image, step-by-step.",
    icon: BrainCircuit,
  },
  {
    step: "03",
    title: "Revise smart",
    desc: "Hit the important questions and track what you've mastered.",
    icon: ListChecks,
  },
];

const TESTIMONIALS = [
  {
    quote:
      "The step-by-step solver actually explains the formulas — I finally understood series-parallel networks.",
    name: "Ananya R.",
    role: "2nd-year ECE",
  },
  {
    quote:
      "I photographed my tutorial sheet and got clean solutions with the formulas I needed. Insane time-saver.",
    name: "Karthik M.",
    role: "1st-year EEE",
  },
  {
    quote:
      "The 2/5/10-mark question banks are exactly how our exam is structured. Best revision tool this semester.",
    name: "Priya S.",
    role: "1st-year Mechanical",
  },
];

const FAQ = [
  {
    q: "What topics does BEEE SmartLearn cover?",
    a: "DC circuits, AC fundamentals, electromagnetism, single-phase transformers, semiconductor devices and digital electronics — the full first-year BEEE syllabus.",
  },
  {
    q: "Can it solve questions from a photo?",
    a: "Yes. Upload a photo of a printed or handwritten question and the AI extracts the text via OCR before solving it step-by-step.",
  },
  {
    q: "Is my data private?",
    a: "Your account uses hashed passwords and JWT sessions. Only you (and administrators for support) can see your dashboard and solved history.",
  },
  {
    q: "Do I get formulas alongside the answers?",
    a: "Every solution lists the formulas used and, when relevant, a compact diagram description so you can revise the reasoning.",
  },
];

export function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main id="main">
        <Hero />
        <Overview />
        <Features />
        <Testimonials />
        <Faq />
        <Contact />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
      <div className="pointer-events-none absolute inset-0 grid-lines opacity-60" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-soft">
            <Sparkles className="h-3.5 w-3.5 text-brand" aria-hidden />
            AI tutor for Basic Electrical & Electronics
          </div>
          <h1 className="mt-6 text-balance text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
            Master BEEE with an AI that <span className="text-brand">shows the working</span>.
          </h1>
          <p className="mt-6 text-pretty text-lg text-muted-foreground sm:text-xl">
            Solve any circuits, transformers or semiconductor problem — from a prompt or a
            photo — with clean step-by-step solutions, the exact formulas used, and progress
            you can track.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="rounded-full px-6">
              <Link to="/auth" search={{ mode: "signup" }}>
                Start learning free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full px-6">
              <a href="#features">See how it works</a>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            No credit card • Free for students • JWT-secured
          </p>
        </div>

        <div className="mx-auto mt-16 max-w-5xl">
          <HeroPreview />
        </div>
      </div>
    </section>
  );
}

function HeroPreview() {
  return (
    <div className="card-soft overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-border bg-surface-muted px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
        <span className="ml-3 text-xs text-muted-foreground">solver.beee.app</span>
      </div>
      <div className="grid gap-6 p-6 sm:p-8 md:grid-cols-5">
        <div className="md:col-span-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Question
          </div>
          <p className="mt-3 text-sm leading-relaxed text-foreground">
            A series RLC circuit has R = 10 Ω, L = 50 mH, C = 100 µF connected across a
            50 V, 50 Hz supply. Find impedance, current and power factor.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="rounded-full border border-border bg-secondary px-3 py-1 text-xs">
              AC Fundamentals
            </span>
            <span className="rounded-full border border-border bg-secondary px-3 py-1 text-xs">
              5 marks
            </span>
          </div>
        </div>
        <div className="md:col-span-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Solution
          </div>
          <ol className="mt-3 space-y-3 text-sm">
            {[
              "X_L = 2πfL = 2π·50·0.05 = 15.71 Ω",
              "X_C = 1/(2πfC) = 1/(2π·50·100e−6) = 31.83 Ω",
              "Z = √(R² + (X_L − X_C)²) = √(10² + 16.12²) = 19.0 Ω",
              "I = V/Z = 50/19.0 = 2.63 A",
              "pf = R/Z = 10/19.0 = 0.526 (leading)",
            ].map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-border bg-surface text-[10px] font-semibold text-foreground">
                  {i + 1}
                </span>
                <span className="font-mono text-foreground">{s}</span>
              </li>
            ))}
          </ol>
          <div className="mt-5 rounded-xl border border-border bg-surface-muted p-3 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Formulas used:</span>{" "}
            X_L = 2πfL · X_C = 1/(2πfC) · Z = √(R² + (X_L − X_C)²) · pf = cos φ = R/Z
          </div>
        </div>
      </div>
    </div>
  );
}

function Overview() {
  return (
    <section id="overview" className="border-t border-border bg-surface-muted py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHead
          eyebrow="How it works"
          title="Three steps to exam-ready"
          desc="A calm, structured way to learn — from concept to confident answer."
        />
        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {OVERVIEW.map((o) => (
            <li key={o.step} className="card-soft card-soft-hover p-6">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-muted-foreground">
                  STEP {o.step}
                </span>
                <span className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface-muted text-brand">
                  <o.icon className="h-5 w-5" aria-hidden />
                </span>
              </div>
              <h3 className="mt-6 text-lg font-semibold text-foreground">{o.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{o.desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHead
          eyebrow="Features"
          title="Everything a BEEE student needs"
          desc="A focused toolkit — no fluff, just the things that actually help you learn."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article key={f.title} className="card-soft card-soft-hover p-6">
              <span className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-surface-muted text-brand">
                <f.icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-5 text-lg font-semibold text-foreground">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Testimonials() {
  return (
    <section id="testimonials" className="border-t border-border bg-surface-muted py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHead
          eyebrow="Loved by learners"
          title="Students say it clicks"
          desc="Real feedback from students using BEEE SmartLearn to prepare for sessional and semester exams."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <figure key={t.name} className="card-soft card-soft-hover flex h-full flex-col p-6">
              <MessageSquareQuote className="h-6 w-6 text-brand" aria-hidden />
              <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-foreground">
                “{t.quote}”
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface-muted text-sm font-semibold text-foreground">
                  {t.name.charAt(0)}
                </span>
                <div>
                  <div className="text-sm font-semibold text-foreground">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHead
          eyebrow="FAQ"
          title="Frequently asked questions"
          desc="Everything you might wonder about before signing up."
        />
        <div className="mt-10 space-y-3">
          {FAQ.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q} className="card-soft overflow-hidden">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="text-sm font-semibold text-foreground sm:text-base">
                    {item.q}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                    aria-hidden
                  />
                </button>
                <div
                  className={`grid transition-all duration-300 ease-out ${
                    isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">
                      {item.a}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Contact() {
  const [sending, setSending] = useState(false);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSending(true);
    setTimeout(() => {
      setSending(false);
      (e.target as HTMLFormElement).reset();
      toast.success("Thanks! We'll get back to you shortly.");
    }, 700);
  };
  return (
    <section id="contact" className="border-t border-border bg-surface-muted py-20 sm:py-28">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div>
          <SectionHead
            eyebrow="Contact"
            title="We'd love to hear from you"
            desc="Questions, feedback or partnership ideas — drop a note and we'll respond."
            align="left"
          />
          <div className="mt-8 space-y-4 text-sm">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface text-brand">
                <Mail className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <div className="font-semibold text-foreground">Email</div>
                <a
                  href="mailto:hello@beee-smartlearn.app"
                  className="text-muted-foreground hover:text-foreground"
                >
                  hello@beee-smartlearn.app
                </a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface text-brand">
                <MessagesSquare className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <div className="font-semibold text-foreground">Community</div>
                <p className="text-muted-foreground">
                  Join our student community for study groups and tips.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface text-brand">
                <Users2 className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <div className="font-semibold text-foreground">For institutions</div>
                <p className="text-muted-foreground">Bring SmartLearn to your college.</p>
              </div>
            </div>
          </div>
        </div>
        <form onSubmit={onSubmit} className="card-soft space-y-4 p-6 sm:p-8" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required maxLength={80} autoComplete="name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                maxLength={160}
                autoComplete="email"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="message">Message</Label>
            <Textarea id="message" name="message" required rows={5} maxLength={1000} />
          </div>
          <Button type="submit" className="w-full rounded-full" disabled={sending}>
            {sending ? "Sending..." : "Send message"}
          </Button>
        </form>
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="card-soft flex flex-col items-center gap-6 p-10 text-center sm:p-14">
          <span className="grid h-12 w-12 place-items-center rounded-2xl border border-border bg-surface-muted text-brand">
            <ScanLine className="h-6 w-6" aria-hidden />
          </span>
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
            Ready to solve smarter?
          </h2>
          <p className="max-w-xl text-muted-foreground">
            Create a free student account and try the AI Problem Solver, image OCR, formula
            library and important questions today.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="rounded-full px-6">
              <Link to="/auth" search={{ mode: "signup" }}>
                Create free account
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full px-6">
              <Link to="/auth">I already have an account</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionHead({
  eyebrow,
  title,
  desc,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  desc: string;
  align?: "left" | "center";
}) {
  const isCenter = align === "center";
  return (
    <div className={isCenter ? "mx-auto max-w-2xl text-center" : "max-w-xl"}>
      <div
        className={`inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground shadow-soft`}
      >
        {eyebrow}
      </div>
      <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {title}
      </h2>
      <p className="mt-3 text-base text-muted-foreground sm:text-lg">{desc}</p>
    </div>
  );
}
