import Link from "next/link";

export function DemoFooter() {
  return (
    <footer className="border-t border-zinc-800 py-8 text-center text-xs text-zinc-500">
      <p className="mb-3">© {new Date().getFullYear()} OMnichat. Static UI template for local testing.</p>
      <div className="flex justify-center gap-4">
        <Link href="/demo" className="hover:text-zinc-300">
          Terms of Service
        </Link>
        <Link href="/demo" className="hover:text-zinc-300">
          Privacy Policy
        </Link>
      </div>
    </footer>
  );
}
