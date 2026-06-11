import Link from "next/link";
import { DemoNav } from "@/components/demo/DemoNav";
import { DemoFooter } from "@/components/demo/DemoFooter";
import { ChatDemoPanel } from "@/components/demo/ChatDemoPanel";
import { PlatformLogos } from "@/components/PlatformLogos";
import { FeatureGrid } from "@/components/demo/FeatureGrid";

export default function DemoHomePage() {
  return (
    <main>
      <DemoNav />

      <section className="max-w-7xl mx-auto px-6 py-14 lg:py-20 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div>
          <h1 className="text-4xl lg:text-[2.75rem] font-extrabold tracking-tight leading-[1.1] mb-4">
            Ultimate Chat Tool for{" "}
            <span className="demo-gradient-text">Streamers</span>
          </h1>
          <p className="text-lg text-zinc-400 mb-8">
            Powerful multi-chat tool for streamers &amp; creators
          </p>
          <div className="flex flex-wrap gap-3 mb-10">
            <Link
              href="/demo/login"
              className="rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold px-6 py-3 transition-colors"
            >
              Get Started for Free
            </Link>
            <Link
              href="/demo/dashboard"
              className="rounded-lg border border-zinc-600 hover:border-zinc-400 text-zinc-200 px-6 py-3 transition-colors"
            >
              Go to Chat
            </Link>
            <a href="#features" className="rounded-lg text-zinc-400 hover:text-white px-4 py-3">
              Learn More ↓
            </a>
          </div>
          <div className="demo-platforms-card p-6">
            <p className="text-[11px] font-semibold tracking-[0.2em] text-zinc-500 mb-5 text-center uppercase">
              Works with all your platforms
            </p>
            <PlatformLogos />
          </div>
        </div>
        <div className="flex justify-center lg:justify-end">
          <ChatDemoPanel />
        </div>
      </section>

      <section id="features" className="max-w-7xl mx-auto px-6 py-20 border-t border-zinc-800/80">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl font-bold mb-3">The perfect tool for streamers &amp; power users</h2>
          <p className="text-zinc-400">
            OMnichat is packed with features to help you manage your community and engage with your
            audience.
          </p>
        </div>
        <FeatureGrid />
      </section>

      <section className="max-w-7xl mx-auto px-6 py-20 text-center border-t border-zinc-800/80">
        <h2 className="text-3xl font-bold mb-3">Take control of your live chat.</h2>
        <p className="text-zinc-400 mb-8">Stop juggling tabs and start building your community.</p>
        <Link
          href="/demo/login"
          className="inline-flex rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold px-8 py-3 transition-colors"
        >
          Get Started with OMnichat
        </Link>
      </section>

      <DemoFooter />
    </main>
  );
}
