import Link from "next/link";
import { Nav } from "@/components/Nav";

export default function FeaturesPage() {
  return (
    <main>
      <Nav />
      <section className="max-w-3xl mx-auto px-6 py-12 space-y-10">
        <h1 className="text-3xl font-bold">Features</h1>
        <article>
          <h2 className="text-xl font-semibold text-violet-300 mb-2">Unified live chat</h2>
          <p className="text-zinc-400">
            Messages from Twitch, Kick, and X appear in one scrollable feed with platform
            badges. Filter by platform or view everything together.
          </p>
        </article>
        <article>
          <h2 className="text-xl font-semibold text-violet-300 mb-2">X Live chat</h2>
          <p className="text-zinc-400">
            X live streams are ingested automatically — add an X profile under Settings → Channels
            and chat appears when they go live.
          </p>
        </article>
        <article>
          <h2 className="text-xl font-semibold text-red-400 mb-2">Omnibunny</h2>
          <p className="text-zinc-400">
            Your mod bot: automatically times out chatters who post SOL, ETH, or BTC wallet
            addresses on Twitch and Kick. Preview scans and audit log live in the dashboard.
          </p>
          <Link href="/omnibunny" className="inline-block mt-2 text-red-400 hover:underline text-sm">
            Meet Omnibunny →
          </Link>
        </article>
        <Link href="/login" className="text-violet-400 hover:underline">
          Create an account
        </Link>
      </section>
    </main>
  );
}
