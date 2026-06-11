import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chat — OMnichat",
};

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-screen overflow-hidden">{children}</div>;
}
