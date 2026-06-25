import { ImageResponse } from "next/og";

export const alt = "AOE4Scanner — standout Age of Empires IV ranked games";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "linear-gradient(135deg, #030712 0%, #0c1c32 58%, #14233a 100%)",
          color: "white",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          padding: "72px",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "26px", maxWidth: "1000px" }}>
          <div style={{ color: "#d6a84f", display: "flex", fontSize: 30, fontWeight: 800, letterSpacing: "0.18em" }}>AOE4SCANNER</div>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 900, lineHeight: 1.05 }}>Standout ranked games worth studying</div>
          <div style={{ color: "#cbd5e1", display: "flex", fontSize: 30 }}>
            Upsets · rare civilization wins · unusual strategies · civilization specialists
          </div>
        </div>
      </div>
    ),
    size,
  );
}
