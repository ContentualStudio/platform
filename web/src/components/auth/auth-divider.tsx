import { Separator } from "@/components/ui/separator";

export function AuthDivider() {
  return (
    <div className="my-2 flex w-full items-center gap-3">
      <Separator className="flex-1" />
      <span className="text-sm font-medium uppercase text-muted">or</span>
      <Separator className="flex-1" />
    </div>
  );
}
