"use client";



import Image from "next/image";

import Link from "next/link";

import { OmnibunnyBonkScene } from "@/components/OmnibunnyBonkScene";



const STEPS = [

  {

    title: "Connect channel",

    body: "Link Twitch or Kick in OMnichat — your OAuth, no bot account needed.",

  },

  {

    title: "Enable scanner",

    body: "Dashboard → Omnibunny on. BTC, ETH & SOL detected instantly.",

  },

  {

    title: "Bonk & timeout",

    body: "Wallet posted → hidden in OMnichat → chatter timed out on stream.",

  },

];



const MARQUEE_CHUNK = "bonk the wallets • ";



export function OmnibunnyLandingPage() {

  const marqueeLine = MARQUEE_CHUNK.repeat(24);



  return (

    <div className="ob-landing">

      <div className="ob-landing-backing" aria-hidden />



      <header className="ob-landing-nav">

        <Link href="/" className="ob-landing-nav-brand">

          <Image src="/omnibunny-logo.png" alt="" width={36} height={36} className="ob-nav-logo" />

          <span>

            <span className="text-white">OM</span>

            <span className="text-red-500">nichat</span>

          </span>

        </Link>

        <nav className="ob-landing-nav-links">

          <Link href="/">Home</Link>

          <Link href="/login">Login</Link>

          <Link href="/login" className="btn-primary px-4 py-2 text-sm">

            Sign Up

          </Link>

        </nav>

      </header>



      <div className="ob-landing-body">

        <section className="ob-landing-panel ob-landing-panel--hero">

          <div className="ob-landing-hero-grid">

            <div className="ob-landing-copy">

              <p className="ob-landing-eyebrow">Meet Omnibunny</p>

              <h1 className="ob-landing-title">

                Your chat&apos;s

                <span className="ob-landing-title-accent"> wallet bonker</span>

              </h1>

              <p className="ob-landing-lede">

                Watches Twitch &amp; Kick and <strong>times out</strong> wallet spammers. No mercy for

                &ldquo;plz give me eth&rdquo; energy.

              </p>

              <ul className="ob-landing-bullets">

                <li>BTC, ETH &amp; SOL auto-detect</li>

                <li>10-min timeout (configurable)</li>

                <li>

                  <code>@omnibunnybot pause</code> / <code>start</code>

                </li>

              </ul>

              <div className="ob-landing-cta-row">

                <Link href="/dashboard" className="btn-primary px-5 py-2.5 text-sm">

                  Enable Omnibunny

                </Link>

                <Link href="/chat" className="ob-landing-cta-secondary">

                  Open chat →

                </Link>

              </div>

            </div>

            <OmnibunnyBonkScene />

          </div>

        </section>



        <div className="ob-landing-lower">

          <section className="ob-landing-panel ob-landing-panel--sub">

            <h2 className="ob-panel-title">How it works</h2>

            <div className="ob-steps-grid">

              {STEPS.map((step, i) => (

                <article key={step.title} className="ob-step-card">

                  <span className="ob-step-num">{i + 1}</span>

                  <div>

                    <h3>{step.title}</h3>

                    <p>{step.body}</p>

                  </div>

                </article>

              ))}

            </div>

          </section>



          <section className="ob-landing-panel ob-landing-panel--sub ob-landing-panel--commands">

            <h2 className="ob-panel-title">Mod commands</h2>

            <p className="ob-commands-lede">Broadcaster or mods — type in live chat:</p>

            <div className="ob-command-cards">

              <div className="ob-command-card">

                <span className="ob-command-label">Pause</span>

                <code>@omnibunnybot pause</code>

              </div>

              <div className="ob-command-card ob-command-card--start">

                <span className="ob-command-label">Resume</span>

                <code>@omnibunnybot start</code>

              </div>

            </div>

          </section>



          <section className="ob-landing-panel ob-landing-panel--sub ob-landing-panel--platforms">

            <h2 className="ob-panel-title">Works on</h2>

            <div className="ob-platform-pills">

              <span className="ob-platform-pill ob-platform-pill--twitch">Twitch</span>

              <span className="ob-platform-pill ob-platform-pill--kick">Kick</span>

            </div>

            <p className="ob-platform-note">

              Uses your channel OAuth + mod scopes. Reconnect if you linked before Omnibunny.

            </p>

          </section>

        </div>

      </div>



      <footer className="ob-landing-footer">

        <div className="ob-footer-marquee" aria-hidden>

          <div className="ob-footer-marquee-viewport">

            <div className="ob-footer-marquee-track">

              <span className="ob-footer-marquee-copy">{marqueeLine}</span>

              <span className="ob-footer-marquee-copy">{marqueeLine}</span>

            </div>

          </div>

        </div>

        <p className="ob-footer-tagline">

          Omnibunny — part of{" "}

          <Link href="/" className="underline underline-offset-2 hover:text-white">

            OMnichat

          </Link>

        </p>

      </footer>

    </div>

  );

}

