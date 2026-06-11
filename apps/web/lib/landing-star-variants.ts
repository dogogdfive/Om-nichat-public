export type LandingStarVariant = {
  id: string;
  label: string;
  src: string;
};

/** Six comic-style starburst shapes — similar energy, different spike counts & wobble. */
export const LANDING_STAR_VARIANTS: LandingStarVariant[] = [
  { id: "0", label: "Classic", src: "/star.png" },
  { id: "1", label: "Wide", src: "/landing-star-v2.png" },
  { id: "2", label: "Jagged", src: "/landing-star-v3.png" },
  { id: "3", label: "Bold", src: "/landing-star-v4.png" },
  { id: "4", label: "Fine", src: "/landing-star-v5.png" },
  { id: "5", label: "Chunky", src: "/landing-star-v6.png" },
];

export function landingStarVariantSrc(variant: string): string {
  return LANDING_STAR_VARIANTS.find((v) => v.id === variant)?.src ?? LANDING_STAR_VARIANTS[0].src;
}
