import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OMnichat — UI template (local testing)",
  description: "Static multi-platform chat UI template for local editing and testing.",
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="demo-theme min-h-screen bg-[#0a0a0b] text-zinc-100">
      <div className="bg-violet-950/40 border-b border-violet-800/30 text-center text-xs text-violet-200 py-1.5 px-4">
        Static UI template — inspired layout for local testing · No backend · Fully editable in{" "}
        <code className="text-violet-300">apps/web/app/demo</code>
      </div>
      {children}
    </div>
  );
}
