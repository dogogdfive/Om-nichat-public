import Image from "next/image";
import Link from "next/link";

export function BrandMark({
  className = "",
  logoClassName = "h-14 w-14",
  logoSize = 56,
  variant = "default",
}: {
  className?: string;
  logoClassName?: string;
  logoSize?: number;
  variant?: "default" | "landing";
}) {
  if (variant === "landing") {
    return null;
  }

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Image
        src="/omnibunny-logo.png"
        alt=""
        width={logoSize}
        height={logoSize}
        className={`shrink-0 object-contain ${logoClassName}`}
        aria-hidden
      />
      <span>
        <span className="text-white">OM</span>
        <span className="text-red-500">nichat</span>
      </span>
    </span>
  );
}

export function Nav({ variant = "marketing" }: { variant?: "marketing" | "minimal" | "landing" }) {
  if (variant === "minimal") {
    return (
      <header className="border-b border-zinc-900 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg tracking-tight">
          <BrandMark />
        </Link>
      </header>
    );
  }
  if (variant === "landing") {
    return null;
  }
  return (
    <header className="border-b border-zinc-900 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto w-full">
      <Link href="/" className="font-bold text-xl tracking-tight">
        <BrandMark />
      </Link>
      <nav className="flex items-center gap-6 text-sm text-zinc-300">
        <Link href="/features" className="hover:text-white">
          Features
        </Link>
        <Link href="/login" className="hover:text-white">
          Login
        </Link>
        <Link href="/login" className="btn-primary px-4 py-2 text-sm">
          Sign Up
        </Link>
      </nav>
    </header>
  );
}
