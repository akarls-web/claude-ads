"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import {
  Building2,
  Plus,
  ArrowRight,
  Loader2,
  Globe,
  Briefcase,
} from "lucide-react";

export default function ClientsPage() {
  const clients = trpc.clients.list.useQuery();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1 font-heading font-bold tracking-tight text-text-primary">
            Clients
          </h1>
          <p className="mt-1 text-body text-text-secondary">
            Manage the businesses you&rsquo;re auditing
          </p>
        </div>
        <Link
          href="/clients/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2.5 text-small font-semibold text-white shadow-sm hover:bg-brand-light transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} />
          Add Client
        </Link>
      </div>

      {clients.isLoading ? (
        <div className="flex items-center justify-center rounded-lg border border-border-light bg-white p-16">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
        </div>
      ) : (clients.data?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border-light bg-white p-16 text-center">
          <Building2
            className="mb-3 h-10 w-10 text-text-placeholder"
            strokeWidth={1.75}
          />
          <p className="text-body font-medium text-text-secondary">
            No clients yet
          </p>
          <p className="mt-1 text-small text-text-placeholder">
            Add a client to organize your audits by business
          </p>
          <Link
            href="/clients/new"
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-small font-semibold text-white hover:bg-brand-light transition-colors"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Add your first client
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-border-light rounded-lg border border-border-light bg-white shadow-sm">
          {clients.data!.map((client) => (
            <Link
              key={client.id}
              href={`/clients/${client.id}`}
              className="flex items-center justify-between p-5 transition-colors hover:bg-brand-wash/30"
            >
              <div className="flex items-center gap-4">
                <div className="rounded-md bg-brand-wash p-2.5 text-brand">
                  <Building2 className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-body font-semibold text-text-primary">
                    {client.name}
                  </p>
                  <div className="mt-0.5 flex items-center gap-3 text-caption text-text-placeholder">
                    {client.industry && (
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-3 w-3" strokeWidth={1.75} />
                        {client.industry}
                      </span>
                    )}
                    {client.website && (
                      <span className="flex items-center gap-1">
                        <Globe className="h-3 w-3" strokeWidth={1.75} />
                        {client.website.replace(/^https?:\/\//, "")}
                      </span>
                    )}
                    {!client.industry && !client.website && (
                      <span>
                        Added{" "}
                        {new Date(client.createdAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <ArrowRight
                className="h-5 w-5 text-text-placeholder"
                strokeWidth={1.75}
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
