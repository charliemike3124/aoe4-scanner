import { Badge } from "@/components/ui/badge";

export function OutlierBadge({ tag }: { tag: string }) {
  return <Badge className="border-[#3b443f] bg-[#171c19] text-[#d0cec4]">{tag}</Badge>;
}
