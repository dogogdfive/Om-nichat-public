"use client";

import { useRef, type ReactNode } from "react";
import { LandingColorEditor } from "@/components/LandingColorEditor";
import { LandingLogoEmbed } from "@/components/LandingLogoEmbed";
import { LandingBrandTextOverlay } from "@/components/LandingBrandTextOverlay";
import { LandingChatMockupOverlay } from "@/components/LandingChatMockupOverlay";
import { LandingHeroBlock } from "@/components/LandingHeroBlock";
import { LandingStarBurstEmbed } from "@/components/LandingStarBurstEmbed";
import { LandingOmnibunnyEmbed } from "@/components/LandingOmnibunnyEmbed";
import { LandingMarqueeBanner } from "@/components/LandingMarqueeBanner";
import { LandingPaintTool } from "@/components/LandingPaintTool";
import { LandingPlatformLogos } from "@/components/LandingPlatformLogos";

export function LandingPageShell({ children }: { children?: ReactNode }) {
  const pageRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  return (
    <div className="landing-stage" ref={stageRef}>
      <LandingColorEditor />
      <div className="landing-stage-viewport">
        <main className="landing-page" ref={pageRef}>
          <LandingLogoEmbed />
          <LandingBrandTextOverlay pageRef={pageRef} />
          <LandingStarBurstEmbed pageRef={pageRef} />
          <LandingChatMockupOverlay />
          <LandingHeroBlock pageRef={pageRef} />
          <LandingPlatformLogos pageRef={pageRef} />
          <div className="landing-panel">
            {children}
            <LandingMarqueeBanner />
          </div>
        </main>
      </div>
      <div className="landing-stage-paint">
        <div className="landing-stage-paint-frame">
          <LandingPaintTool stageRef={stageRef} />
        </div>
      </div>
      <div className="landing-stage-overlays">
        <div className="landing-stage-overlays-frame">
          <div className="landing-stage-overlays-canvas">
            <LandingOmnibunnyEmbed pageRef={pageRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
