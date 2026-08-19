import { AlertCircle, LoaderCircle } from "lucide-react";
import { Card } from "./card";
export function LoadingState({ label = "Loading" }: { label?: string }) { return <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted"><LoaderCircle className="h-4 w-4 animate-spin" />{label}</div>; }
export function EmptyState({ title, detail }: { title: string; detail: string }) { return <div className="flex min-h-44 flex-col items-center justify-center p-6 text-center"><div className="mb-3 rounded-full bg-[#f1f3f6] p-3"><AlertCircle className="h-5 w-5 text-muted" /></div><p className="font-semibold">{title}</p><p className="mt-1 max-w-sm text-sm text-muted">{detail}</p></div>; }
export function ErrorState({ message }: { message: string }) { return <Card className="border-[#f2c2be] bg-[#fff8f7] p-5 text-sm text-[#a93630]">{message}</Card>; }
