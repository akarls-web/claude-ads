"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import {
  Building2,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import Link from "next/link";

export default function NewClientPage() {
  const router = useRouter();
  const utils = trpc.useUtils();

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");

  const create = trpc.clients.create.useMutation({
    onSuccess: (client) => {
      utils.clients.list.invalidate();
      router.push(`/clients/${client.id}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate({
      name: name.trim(),
      industry: industry.trim() || undefined,
      website: website.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link
          href="/clients"
          className="mb-3 inline-flex items-center gap-1 text-small font-medium text-text-secondary hover:text-brand transition-colors"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Back to clients
        </Link>
        <h1 className="text-h1 font-heading font-bold tracking-tight text-text-primary">
          Add Client
        </h1>
        <p className="mt-1 text-body text-text-secondary">
          Create a new client to organize connections and audits
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-lg border border-border-light bg-white p-6 shadow-sm"
      >
        {/* Name */}
        <div>
          <label
            htmlFor="name"
            className="mb-1.5 block text-small font-medium text-text-primary"
          >
            Client Name <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acme Corp"
            required
            className="w-full rounded-md border border-border-light bg-white px-3.5 py-2.5 text-body text-text-primary placeholder:text-text-placeholder outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          />
        </div>

        {/* Industry */}
        <div>
          <label
            htmlFor="industry"
            className="mb-1.5 block text-small font-medium text-text-primary"
          >
            Industry
          </label>
          <input
            id="industry"
            type="text"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="e.g. E-commerce, SaaS, Legal"
            className="w-full rounded-md border border-border-light bg-white px-3.5 py-2.5 text-body text-text-primary placeholder:text-text-placeholder outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          />
        </div>

        {/* Website */}
        <div>
          <label
            htmlFor="website"
            className="mb-1.5 block text-small font-medium text-text-primary"
          >
            Website
          </label>
          <input
            id="website"
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://example.com"
            className="w-full rounded-md border border-border-light bg-white px-3.5 py-2.5 text-body text-text-primary placeholder:text-text-placeholder outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          />
        </div>

        {/* Notes */}
        <div>
          <label
            htmlFor="notes"
            className="mb-1.5 block text-small font-medium text-text-primary"
          >
            Notes
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional context about this client..."
            rows={3}
            className="w-full rounded-md border border-border-light bg-white px-3.5 py-2.5 text-body text-text-primary placeholder:text-text-placeholder outline-none transition-colors resize-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          />
        </div>

        {/* Error */}
        {create.error && (
          <p className="text-small text-red-600">
            {create.error.message}
          </p>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-3 pt-2">
          <Link
            href="/clients"
            className="rounded-md border border-border-light px-4 py-2.5 text-small font-medium text-text-secondary hover:bg-surface transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={!name.trim() || create.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2.5 text-small font-semibold text-white shadow-sm hover:bg-brand-light disabled:opacity-50 transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            {create.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <Building2 className="h-4 w-4" strokeWidth={1.75} />
                Create Client
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
