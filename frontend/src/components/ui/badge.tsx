import { cn } from "@/lib/utils";
const styles: Record<string, string> = {
  PAID: "bg-[#e7f7ef] text-[#147a4b]", SENT: "bg-[#e7f7ef] text-[#147a4b]", DELIVERED: "bg-[#e7f7ef] text-[#147a4b]", ACKNOWLEDGED: "bg-[#eef0f3] text-[#5b6370]",
  PENDING: "bg-[#fff4dc] text-[#9b6200]", ACTIVE: "bg-[#fff0ee] text-[#b7332e]", FAILED: "bg-[#ffebe9] text-[#c03530]",
  EXPIRED: "bg-[#eef0f3] text-[#5b6370]", REFUNDED: "bg-[#eeeafd] text-[#6544b2]",
};
export function StatusBadge({ value, className }: { value: string; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide", styles[value] ?? "bg-[#edf1ff] text-[#3157d5]", className)}>
    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />{value.replaceAll("_", " ")}
  </span>;
}
