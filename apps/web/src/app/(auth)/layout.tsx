import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,theme(colors.indigo.500/0.10),transparent_60%)]"
      />
      <header className="relative flex h-16 items-center px-6">
        <Link href="/" aria-label="TestPilot AI home">
          <Logo />
        </Link>
      </header>
      <main className="relative flex flex-1 items-start justify-center px-4 pb-16 pt-8 sm:pt-16">
        <div className="w-full max-w-sm">{children}</div>
      </main>
      <footer className="relative pb-6 text-center text-xs text-muted-foreground">
        Autonomous QA for modern web applications.
      </footer>
    </div>
  );
}
