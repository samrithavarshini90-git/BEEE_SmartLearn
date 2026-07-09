import { Link } from "@tanstack/react-router";
import { Logo } from "./logo";

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface-muted">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-4 lg:px-8">
        <div className="lg:col-span-2">
          <Logo />
          <p className="mt-4 max-w-sm text-sm text-muted-foreground">
            The AI-powered study companion for Basic Electrical & Electronics Engineering.
            Learn faster, solve smarter, and revise with confidence.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground">Product</h3>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li><a href="/#features" className="hover:text-foreground">Features</a></li>
            <li><a href="/#overview" className="hover:text-foreground">Overview</a></li>
            <li><Link to="/auth" className="hover:text-foreground">Sign in</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground">Support</h3>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li><a href="/#faq" className="hover:text-foreground">FAQ</a></li>
            <li><a href="/#contact" className="hover:text-foreground">Contact</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} BEEE SmartLearn. All rights reserved.</p>
          <p>Built for engineering learners.</p>
        </div>
      </div>
    </footer>
  );
}
