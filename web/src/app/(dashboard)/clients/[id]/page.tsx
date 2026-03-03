"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  Building2,
  Globe,
  Briefcase,
  Pencil,
  Trash2,
  Loader2,
  Save,
  X,
  Link2,
  ClipboardList,
  ArrowRight,
} from "lucide-react";
import { formatScore, gradeColor } from "@/lib/utils";

export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const utils = trpc.useUtils();

  const client = trpc.clients.get.useQuery({ id });
  const audits = trpc.audit.list.useQuery();
  const accounts = trpc.account.list.useQuery();

  const update = trpc.clients.update.useMutation({
    onSuccess: () => {
      utils.clients.get.invalidate({ id });
      utils.clients.list.invalidate();
      setEditing(false);
    },
  });

  const archive = trpc.clients.archive.useMutation({
    onSuccess: () => {
      utils.clients.list.invalidate();
      router.push("/clients");
    },
  });

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");

  const startEdit = () => {
    if (!client.data) return;
    setName(client.data.name);
    setIndustry(client.data.industry ?? "");
    setWebsite(client.data.website ?? "");
    setNotes(client.data.notes ?? "");
    setEditing(true);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    update.mutate({
      id,
      name: name.trim(),
      industry: industry.trim() || undefined,
      website: website.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  // Filter audits for this client
  const clientAudits = (audits.data ?? []).filter(
    (a) => (a as { clientId?: string }).clientId === id
  );

  // Filter connections for this client
  const clientConnections = (accounts.data ?? []).filter(
    (c) => (c as { clientId?: string }).clientId === id
  );

  if (client.isLoading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  if (!client.data) {
    return (
      <div className="mx-auto max-w-xl text-center p-16">
        <Building2
          className="mx-auto mb-3 h-10 w-10 text-text-placeholder"
          strokeWidth={1.75}
        />
        <p className="text-body font-medium text-text-secondary">
          Client not found
        </p>
        <Link
          href="/clients"
          className="mt-3 inline-flex items-center gap-1 text-small font-medium text-brand hover:text-brand-light"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Back to clients
        </Link>
      </div>
    );
  }

  const c = client.data;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/clients"
          className="mb-3 inline-flex items-center gap-1 text-small font-medium text-text-secondary hover:text-brand transition-colors"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Back to clients
        </Link>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-brand-wash p-3 text-brand">
              <Building2 className="h-6 w-6" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-h1 font-heading font-bold tracking-tight text-text-primary">
                {c.name}
              </h1>
              <div className="mt-1 flex items-center gap-3 text-small text-text-secondary">
                {c.industry && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {c.industry}
                  </span>
                )}
                {c.website && (
                  <a
                    href={c.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-brand transition-colors"
                  >
                    <Globe className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {c.website.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={startEdit}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-light px-3 py-2 text-caption font-medium text-text-secondary hover:bg-surface hover:text-brand transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
              Edit
            </button>
            <button
              onClick={() => {
                if (confirm(`Archive "${c.name}"? This can be undone.`)) {
                  archive.mutate({ id });
                }
              }}
              disabled={archive.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-2 text-caption font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              Archive
            </button>
          </div>
        </div>
      </div>

      {/* Edit form (inline) */}
      {editing && (
        <form
          onSubmit={handleUpdate}
          className="space-y-4 rounded-lg border border-brand/30 bg-brand-wash/30 p-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="edit-name"
                className="mb-1 block text-caption font-medium text-text-primary"
              >
                Name <span className="text-red-500">*</span>
              </label>
              <input
                id="edit-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-md border border-border-light bg-white px-3 py-2 text-small text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              />
            </div>
            <div>
              <label
                htmlFor="edit-industry"
                className="mb-1 block text-caption font-medium text-text-primary"
              >
                Industry
              </label>
              <input
                id="edit-industry"
                type="text"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full rounded-md border border-border-light bg-white px-3 py-2 text-small text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              />
            </div>
            <div>
              <label
                htmlFor="edit-website"
                className="mb-1 block text-caption font-medium text-text-primary"
              >
                Website
              </label>
              <input
                id="edit-website"
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-md border border-border-light bg-white px-3 py-2 text-small text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="edit-notes"
              className="mb-1 block text-caption font-medium text-text-primary"
            >
              Notes
            </label>
            <textarea
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-border-light bg-white px-3 py-2 text-small text-text-primary outline-none resize-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            />
          </div>
          {update.error && (
            <p className="text-caption text-red-600">
              {update.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="inline-flex items-center gap-1 rounded-md border border-border-light px-3 py-1.5 text-caption font-medium text-text-secondary hover:bg-white transition-colors"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} />
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || update.isPending}
              className="inline-flex items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-caption font-semibold text-white hover:bg-brand-light disabled:opacity-50 transition-colors"
            >
              {update.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" strokeWidth={1.75} />
              )}
              Save
            </button>
          </div>
        </form>
      )}

      {/* Notes (if any, and not editing) */}
      {!editing && c.notes && (
        <div className="rounded-lg border border-border-light bg-white p-5 shadow-sm">
          <h3 className="mb-2 text-small font-semibold text-text-primary">
            Notes
          </h3>
          <p className="text-small text-text-secondary whitespace-pre-wrap">
            {c.notes}
          </p>
        </div>
      )}

      {/* Connected Accounts */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-h3 font-semibold text-text-primary">
            Connections
          </h2>
          <Link
            href="/connect"
            className="text-small font-medium text-brand hover:text-brand-light transition-colors"
          >
            Manage connections &rarr;
          </Link>
        </div>

        {clientConnections.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed border-border-light bg-white p-8 text-center">
            <Link2
              className="mb-2 h-6 w-6 text-text-placeholder"
              strokeWidth={1.75}
            />
            <p className="text-small text-text-secondary">
              No connections linked to this client yet
            </p>
            <Link
              href="/connect"
              className="mt-2 text-caption font-medium text-brand hover:text-brand-light"
            >
              Connect an account
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border-light rounded-lg border border-border-light bg-white shadow-sm">
            {clientConnections.map((conn) => (
              <div
                key={conn.id}
                className="flex items-center justify-between p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-green-50 p-2 text-green-600">
                    <Link2 className="h-4 w-4" strokeWidth={1.75} />
                  </div>
                  <div>
                    <p className="text-small font-medium text-text-primary">
                      {conn.accountName ?? "Connected Account"}
                    </p>
                    <p className="text-caption text-text-placeholder">
                      {conn.externalId}
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-brand-wash px-2 py-0.5 text-caption font-medium text-brand">
                  {(conn.platform ?? "google_ads").replace(/_/g, " ")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Audits */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-h3 font-semibold text-text-primary">
            Audits
          </h2>
          <Link
            href="/audits"
            className="text-small font-medium text-brand hover:text-brand-light transition-colors"
          >
            View all audits &rarr;
          </Link>
        </div>

        {clientAudits.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed border-border-light bg-white p-8 text-center">
            <ClipboardList
              className="mb-2 h-6 w-6 text-text-placeholder"
              strokeWidth={1.75}
            />
            <p className="text-small text-text-secondary">
              No audits for this client yet
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border-light rounded-lg border border-border-light bg-white shadow-sm">
            {clientAudits.slice(0, 10).map((audit) => (
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
                  {audit.status === "completed" && audit.score !== null && (
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
                  )}
                  {audit.status === "running" && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
                  )}
                  <ArrowRight
                    className="h-4 w-4 text-text-placeholder"
                    strokeWidth={1.75}
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
