import * as React from "react";
import { cn } from "@/lib/utils";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none placeholder:text-[#9aa1ad] focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-[#f3f4f6]", className)} {...props} />
));
Input.displayName = "Input";
