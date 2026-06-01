import { Badge } from "@/components/ui/badge";

export function OutlierBadge({ tag }: { tag: string }) {
  return <Badge className="border-sky-300/20 bg-sky-300/10 text-sky-100">{tag}</Badge>;
}

