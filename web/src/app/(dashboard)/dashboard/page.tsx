"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import {
  Link2,
  PlayCircle,
  ShieldCheck,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { formatScore, gradeColor } from "@/lib/utils";

export default function DashboardPage() {
  const accounts = trpc.account.list.useQuery();
  const audits = trpc.audit.list.useQuery();

  const hasAccounts = (accounts.data?.length ?? 0) > 0;
  const recentAudits = audits.data?.slice(0, 5) ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-h1 font-heading font-bold tracking-tight text-text-primary">
          Dashboard
        </h1>
        <p className="mt-1 text-body text-text-secondary">
          Welcome to SterlingX Paid Ads Audit
        </p>
      </div>

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Connect card */}
        <div className="rounded-lg border border-border-light bg-white p-6 shadow-sm">
          <div className="mb-4 inline-flex rounded-md bg-brand-wash p-2.5 text-brand">
            <Link2 className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <h2 className="text-body font-semibold text-text-primary">
            {hasAccounts ? "Connected Accounts" : "Connect Google Ads"}
          </h2>
          <p className="mt-1 text-small text-text-secondary">
            {hasAccounts
              ? `${accounts.data!.length} account(s) connected`
              : "Link your Google Ads account to start auditing"}
          </p>
          <Link
            href="/connect"
            className="mt-4 inline-flex items-center gap-1.5 text-small font-medium text-brand hover:text-brand-light transition-colors"
          >
            {hasAccounts ? "Manage accounts" : "Connect now"}
            <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
          </Link>
        </div>

        {/* Run audit card */}
        <div className="rounded-lg border border-border-light bg-white p-6 shadow-sm">
          <div className="mb-4 inline-flex rounded-md bg-brand-wash p-2.5 text-brand">
            <PlayCircle className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <h2 className="text-body font-semibold text-text-primary">
            Run Audit
          </h2>
          <p className="mt-1 text-small text-text-secondary">
            {hasAccounts
              ? "Run a full 74-check audit on a connected account"
              : "Connect an account first to run audits"}
          </p>
          {hasAccounts ? (
            <Link
              href="/connect"
              className="mt-4 inline-flex items-center gap-1.5 text-small font-medium text-brand hover:text-brand-light transition-colors"
            >
              Select account & audit
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
            </Link>
          ) : (
            <span className="mt-4 inline-block text-small text-text-placeholder">
              Requires a connected account
            </span>
          )}
        </div>
      </div>

      {/* Recent audits */}
      <div>
        <h2 className="mb-4 text-h3 font-semibold text-text-primary">
          Recent Audits
        </h2>
        {audits.isLoading ? (
          <div className="flex items-center justify-center rounded-lg border border-border-light bg-white p-12">
            <Loader2 className="h-6 w-6 animate-spin text-brand" />
          </div>
        ) : recentAudits.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border-light bg-white p-12 text-center">
            <ShieldCheck
              className="mb-3 h-10 w-10 text-text-placeholder"
              strokeWidth={1.75}
            />
            <p className="text-body font-medium text-text-secondary">
              No audits yet
            </p>
            <p className="mt-1 text-small text-text-placeholder">
              Connect a Google Ads account and run your first audit
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border-light rounded-lg border border-border-light bg-white shadow-sm">
            {recentAudits.map((audit) => (
              <Link
                key={audit.id}
                href={`/audit/${audit.id}`}
                className="flex items-center justify-between p-4 transition-colors hover:bg-brand-wash/30"
              >
                <div>
                  <p className="text-small font-medium text-text-primary">
                    {audit.reportId}
                  </p>
                  <p className="text-caption text-text-placeholder">
                    {audit.customerName ?? audit.customerId} &middot;{" "}
                    {new Date(audit.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {audit.status === "completed" && audit.score !== null ? (
                    <>
                      <span className="text-small font-semibold text-text-primary">
                        {formatScore(audit.score)}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-caption font-bold ${gradeColor(audit.grade ?? "F")}`}
                      >
                        {audit.grade}
                      </span>
                    </>
                  ) : audit.status === "running" ? (
                    <span className="flex items-center gap-1.5 text-caption text-brand">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Running
                    </span>
                  ) : audit.status === "failed" ? (
                    <span className="text-caption font-medium text-red-600">
                      Failed
                    </span>
                  ) : null}
                  <ArrowRight
                    className="h-4 w-4 text-text-placeholder"
                    strokeWidth={1.75}
                  />
                </div>
              </Link>
            ))}
          </div>
        )}

        {recentAudits.length > 0 && (
          <div className="mt-3 text-center">
            <Link
              href="/audits"
              className="text-small font-medium text-brand hover:text-brand-light transition-colors"
            >
              View all audits &rarr;
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
