"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { ClipboardList, ArrowRight, Loader2 } from "lucide-react";
import { formatScore, gradeColor } from "@/lib/utils";

export default function AuditsPage() {
  const audits = trpc.audit.list.useQuery();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-h1 font-heading font-bold tracking-tight text-text-primary">
          Audit History
        </h1>
        <p className="mt-1 text-body text-text-secondary">
          View all your completed and in-progress audits
        </p>
      </div>

      {audits.isLoading ? (
        <div className="flex items-center justify-center rounded-lg border border-border-light bg-white p-16">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
        </div>
      ) : !audits.data?.length ? (
        <div className="flex flex-col items-center rounded-lg border border-dashed border-border-light bg-white p-16 text-center">
          <ClipboardList
            className="mb-3 h-10 w-10 text-text-placeholder"
            strokeWidth={1.75}
          />
          <p className="text-body font-medium text-text-secondary">
            No audits yet
          </p>
          <p className="mt-1 text-small text-text-placeholder">
            Connect a Google Ads account and run your first audit
          </p>
          <Link
            href="/connect"
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-small font-semibold text-white hover:bg-brand-light transition-colors"
          >
            Go to Connect
            <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border-light bg-white shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-light bg-brand-wash/30">
                <th className="px-4 py-3 text-left text-caption font-semibold uppercase tracking-wider text-text-secondary">
                  Report ID
                </th>
                <th className="px-4 py-3 text-left text-caption font-semibold uppercase tracking-wider text-text-secondary">
                  Account
                </th>
                <th className="px-4 py-3 text-center text-caption font-semibold uppercase tracking-wider text-text-secondary">
                  Score
                </th>
                <th className="px-4 py-3 text-center text-caption font-semibold uppercase tracking-wider text-text-secondary">
                  Grade
                </th>
                <th className="px-4 py-3 text-left text-caption font-semibold uppercase tracking-wider text-text-secondary">
                  Date
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {audits.data.map((audit) => (
                <tr
                  key={audit.id}
                  className="transition-colors hover:bg-brand-wash/20"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/audit/${audit.id}`}
                      className="text-small font-medium text-brand hover:text-brand-light"
                    >
                      {audit.reportId}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-small text-text-secondary">
                    {audit.customerName ?? audit.customerId}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {audit.status === "completed" && audit.score !== null ? (
                      <span className="text-small font-semibold text-text-primary">
                        {formatScore(audit.score)}
                      </span>
                    ) : audit.status === "running" ? (
                      <Loader2 className="mx-auto h-4 w-4 animate-spin text-brand" />
                    ) : (
                      <span className="text-caption text-text-placeholder">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {audit.grade ? (
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-caption font-bold ${gradeColor(audit.grade)}`}
                      >
                        {audit.grade}
                      </span>
                    ) : (
                      <span className="text-caption text-text-placeholder">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-small text-text-secondary">
                    {new Date(audit.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/audit/${audit.id}`}
                      className="text-text-placeholder hover:text-brand transition-colors"
                    >
                      <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
