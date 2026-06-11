import Link from "next/link";
import { StreamAlertsPreview } from "@/components/demo/StreamAlertsPreview";

export default function StreamAlertsDemoPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <Link href="/chat" className="text-sm text-zinc-500 hover:text-zinc-300">
            ← Back to chat
          </Link>
          <h1 className="text-2xl font-bold mt-4 mb-2">Subs &amp; donations in chat</h1>
          <p className="text-zinc-400 max-w-2xl">
            Same streamer (<span className="text-zinc-200 font-mono">demostreamer</span>) on Twitch
            and Kick. Each alert only shows in that platform&apos;s channel tab — Twitch subs/bits
            never appear in the Kick box and vice versa.
          </p>
        </div>

        <StreamAlertsPreview />

        <div className="mt-10 grid sm:grid-cols-2 gap-6 text-sm text-zinc-400">
          <div className="rounded-lg border border-zinc-800 p-4 bg-zinc-950/50">
            <h2 className="text-violet-300 font-semibold mb-2">Twitch</h2>
            <ul className="space-y-1 list-disc list-inside">
              <li>New sub / resub — purple system banner</li>
              <li>Gift subs — purple banner with gift count</li>
              <li>Bits (cheers) — message with cheer prefix</li>
            </ul>
          </div>
          <div className="rounded-lg border border-zinc-800 p-4 bg-zinc-950/50">
            <h2 className="text-[#53FC18] font-semibold mb-2">Kick</h2>
            <ul className="space-y-1 list-disc list-inside">
              <li>New sub — green system banner</li>
              <li>Gifted subs — green banner</li>
              <li>Kicks (tips) — green donation line with amount</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
