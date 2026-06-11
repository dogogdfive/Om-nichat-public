import type { Metadata } from "next";
import { OmnibunnyLandingPage } from "@/components/OmnibunnyLandingPage";

export const metadata: Metadata = {
  title: "Omnibunny — wallet bonker mod bot | OMnichat",
  description:
    "Omnibunny auto-times out Twitch and Kick chatters who post crypto wallet addresses. Pause or start with @omnibunnybot commands.",
};

export default function OmnibunnyPage() {
  return <OmnibunnyLandingPage />;
}
