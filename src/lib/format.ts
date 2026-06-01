export function formatDuration(seconds?: number | null) {
  if (!seconds) return "Unknown";
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining.toString().padStart(2, "0")}s`;
}

export function formatCivilization(civ?: string | null) {
  if (!civ) return "Unknown";
  const labels: Record<string, string> = {
    abbasid_dynasty: "Abbasid Dynasty",
    ayyubids: "Ayyubids",
    byzantines: "Byzantines",
    chinese: "Chinese",
    delhi_sultanate: "Delhi Sultanate",
    english: "English",
    french: "French",
    golden_horde: "Golden Horde",
    house_of_lancaster: "House of Lancaster",
    holy_roman_empire: "Holy Roman Empire",
    japanese: "Japanese",
    jeanne_darc: "Jeanne d'Arc",
    jin_dynasty: "Jin Dynasty",
    knights_templar: "Knights Templar",
    macedonian_dynasty: "Macedonian Dynasty",
    malians: "Malians",
    mongols: "Mongols",
    order_of_the_dragon: "Order of the Dragon",
    ottomans: "Ottomans",
    rus: "Rus",
    sengoku_daimyo: "Sengoku Daimyo",
    tughlaq_dynasty: "Tughlaq Dynasty",
    zhu_xis_legacy: "Zhu Xi's Legacy",
  };
  return labels[civ] ?? civ.replaceAll("_", " ");
}
