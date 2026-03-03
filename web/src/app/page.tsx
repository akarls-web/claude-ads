import Link from "next/link";
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";
import {
  BarChart3,
  Zap,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { SterlingXMark } from "@/components/ui/sterlingx-logo";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-surface">
      {/* Nav */}
      <header className="border-b border-border-light bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <SterlingXMark size={28} />
            <span className="text-h3 font-heading font-bold tracking-tight text-text-primary">
              SterlingX
            </span>
          </div>
          <div className="flex items-center gap-3">
            <SignedOut>
              <SignInButton>
                <button className="rounded-md px-4 py-2 text-small font-medium text-text-secondary hover:text-brand transition-colors">
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton>
                <button className="rounded-md bg-brand px-4 py-2 text-small font-semibold text-white shadow-sm hover:bg-brand-light focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 transition-colors">
                  Get Started
                </button>
              </SignUpButton>
            </SignedOut>
            <SignedIn>
              <Link
                href="/dashboard"
                className="rounded-md px-4 py-2 text-small font-medium text-text-secondary hover:text-brand transition-colors"
              >
                Dashboard
              </Link>
              <UserButton />
            </SignedIn>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-subtle bg-brand-wash px-4 py-1.5 text-caption font-medium text-brand">
          <SterlingXMark size={16} />
          Powered by SterlingX
        </div>
        <h1 className="text-display font-heading font-bold tracking-tight text-text-primary">
          Paid Ads Audit
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-body text-text-secondary">
          Connect your Google Ads account and get a comprehensive{" "}
          <strong>74-check audit</strong> in minutes. Identify wasted spend,
          fix tracking issues, and unlock quick wins — powered by the
          SterlingX audit methodology.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 rounded-md bg-brand px-6 py-3 text-body font-semibold text-white shadow-md hover:bg-brand-light hover:shadow-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 transition-all"
          >
            Start Free Audit
            <ArrowRight className="h-5 w-5" strokeWidth={1.75} />
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="grid gap-8 md:grid-cols-3">
          <FeatureCard
            icon={<ShieldCheck className="h-6 w-6" strokeWidth={1.75} />}
            title="74+ Audit Checks"
            description="Conversion tracking, wasted spend, quality scores, ad strength, PMax assets, bidding strategies, and 15 SterlingX agency checks."
          />
          <FeatureCard
            icon={<BarChart3 className="h-6 w-6" strokeWidth={1.75} />}
            title="Ads Health Score"
            description="Weighted scoring algorithm with severity multipliers. Get a clear 0-100 score with A-F grading and category breakdowns."
          />
          <FeatureCard
            icon={<Zap className="h-6 w-6" strokeWidth={1.75} />}
            title="Quick Wins"
            description="Instantly identify high-impact fixes you can implement in under 15 minutes. Prioritized by severity and estimated impact."
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border-light bg-white/50 py-8">
        <div className="mx-auto max-w-6xl px-6 text-center text-caption text-text-placeholder">
          &copy; {new Date().getFullYear()} SterlingX Digital Agency. All
          rights reserved.
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-border-light bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-4 inline-flex rounded-md bg-brand-wash p-2.5 text-brand">
        {icon}
      </div>
      <h3 className="mb-2 text-h3 font-semibold text-text-primary">{title}</h3>
      <p className="text-small text-text-secondary">{description}</p>
    </div>
  );
}
