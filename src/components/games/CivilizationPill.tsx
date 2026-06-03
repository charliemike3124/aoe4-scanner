import { Badge } from "@/components/ui/badge";
import { CIVILIZATION_FLAGS, type Civilization } from "@/lib/aoe4/civilizations";
import { formatCivilization } from "@/lib/format";

export function CivilizationPill({ civilization }: { civilization?: string | null }) {
  if (!civilization) return <Badge className="text-slate-400">Unknown civ</Badge>;
  const flag = CIVILIZATION_FLAGS[civilization as Civilization];
  return (
    <Badge className="gap-1.5 border-gold/25 bg-gold/10 text-gold">
      {flag ? <img src={flag} alt="" width={16} height={16} className="h-4 w-4 rounded-full object-cover" /> : null}
      {formatCivilization(civilization)}
    </Badge>
  );
}
