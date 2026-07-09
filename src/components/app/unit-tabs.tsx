import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listUnits } from "@/lib/beee.functions";

export function UnitTabs({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
}) {
  const fetchUnits = useServerFn(listUnits);
  const { data } = useQuery({
    queryKey: ["units"],
    queryFn: () => fetchUnits(),
  });
  const units = data ?? [];

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={chipClass(value === null)}
      >
        All Units
      </button>
      {units.map((u) => (
        <button
          key={u.unit_number}
          type="button"
          onClick={() => onChange(u.unit_number)}
          className={chipClass(value === u.unit_number)}
          title={u.title}
        >
          Unit {u.unit_number}
          <span className="ml-1.5 hidden text-[10px] opacity-75 sm:inline">· {u.title}</span>
        </button>
      ))}
    </div>
  );
}

function chipClass(active: boolean) {
  return `rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border bg-surface text-muted-foreground hover:text-foreground"
  }`;
}
