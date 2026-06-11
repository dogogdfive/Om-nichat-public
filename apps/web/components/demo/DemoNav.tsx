import Link from "next/link";

export function DemoNav() {
  return (
    <header className="border-b border-zinc-800/80 px-6 py-4 flex items-center justify-between max-w-7xl mx-auto w-full">
      <Link href="/demo" className="font-bold text-xl text-white tracking-tight">
        OMnichat
      </Link>
      <nav className="flex items-center gap-6 text-sm text-zinc-300">
        <Link href="/demo#features" className="hover:text-white transition-colors">
          Features
        </Link>
        <Link href="/demo/login" className="hover:text-white transition-colors">
          Login
        </Link>
        <Link
          href="/demo/login"
          className="rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold px-4 py-2 transition-colors"
        >
          Sign Up
        </Link>
      </nav>
    </header>
  );
}
