export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className="text-brand"
      >
        <rect x="1" y="1" width="30" height="30" rx="8" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M10 22 L14 22 L14 16 L18 16 L18 10 L22 10"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="10" cy="22" r="1.8" fill="currentColor" />
        <circle cx="22" cy="10" r="1.8" fill="currentColor" />
      </svg>
      <span className="font-display text-lg font-bold tracking-tight text-foreground">
        BEEE <span className="text-brand">SmartLearn</span>
      </span>
    </div>
  );
}
