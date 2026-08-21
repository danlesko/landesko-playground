import { ImageResponse } from "next/og";

export const alt = "Landesko's Playground — Dan Lesko's Portfolio and Blog";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          backgroundColor: "#18181b",
        }}
      >
        <div
          style={{
            height: 24,
            backgroundImage: "linear-gradient(to right, #7e22ce, #06b6d4)",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flexGrow: 1,
            padding: "0 80px",
          }}
        >
          <div style={{ fontSize: 84, fontWeight: 700, color: "#d4d4d8" }}>
            Landesko&apos;s Playground
          </div>
          <div style={{ fontSize: 40, color: "#a1a1aa", marginTop: 24 }}>
            Dan Lesko&apos;s Portfolio Playground and Blog
          </div>
        </div>
      </div>
    ),
    size,
  );
}
