"use client";

import { trpc } from "@/lib/trpc";
import {
  Link2,
  ExternalLink,
  Trash2,
  PlayCircle,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Plus,
  FolderTree,
  ChevronRight,
  ChevronDown,
  Building2,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

/* ─── MCC Drill-Down Component ───────────────────────────── */

/** Map tree depth to Tailwind padding class (supports 5 levels) */
const depthPadding = ["pl-0", "pl-5", "pl-10", "pl-16", "pl-20", "pl-24"] as const;
function padCls(depth: number, extra = 0): string {
  const idx = Math.min(depth + extra, depthPadding.length - 1);
  return depthPadding[idx];
}

function MccBrowser({
  rootMccId,
  onAdd,
  existingCids,
}: {
  rootMccId: string;
  onAdd: (accounts: { customerId: string; customerName: string }[]) => void;
  existingCids: Set<string>;
}) {
  const [selected, setSelected] = useState<
    Map<string, { customerId: string; customerName: string }>
  >(new Map());

  return (
    <div className="space-y-3">
      <MccLevel
        mccId={rootMccId}
        depth={0}
        selected={selected}
        setSelected={setSelected}
        existingCids={existingCids}
      />
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-md border border-brand-subtle bg-white p-3">
          <p className="text-small text-text-secondary">
            <span className="font-semibold text-brand">{selected.size}</span>{" "}
            account{selected.size !== 1 ? "s" : ""} selected
          </p>
          <button
            onClick={() => {
              onAdd(Array.from(selected.values()));
              setSelected(new Map());
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-small font-semibold text-white hover:bg-brand-light transition-colors"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Add Selected
          </button>
        </div>
      )}
    </div>
  );
}

function MccLevel({
  mccId,
  depth,
  selected,
  setSelected,
  existingCids,
}: {
  mccId: string;
  depth: number;
  selected: Map<string, { customerId: string; customerName: string }>;
  setSelected: React.Dispatch<
    React.SetStateAction<
      Map<string, { customerId: string; customerName: string }>
    >
  >;
  existingCids: Set<string>;
}) {
  const children = trpc.account.mccChildren.useQuery({ mccId });
  const [expandedMccs, setExpandedMccs] = useState<Set<string>>(new Set());

  if (children.isLoading) {
    return (
      <div className={`flex items-center gap-2 py-3 ${padCls(depth)}`}>
        <Loader2 className="h-4 w-4 animate-spin text-brand" />
        <span className="text-small text-text-secondary">Loading accounts…</span>
      </div>
    );
  }

  if (children.error) {
    return (
      <div className={`flex items-center gap-2 py-2 text-small text-red-600 ${padCls(depth)}`}>
        <AlertCircle className="h-4 w-4" strokeWidth={1.75} />
        {children.error.message}
      </div>
    );
  }

  const items = children.data ?? [];
  const managers = items.filter((a) => a.isManager && a.id !== mccId);
  const clients = items.filter((a) => !a.isManager);

  const toggleExpand = (id: string) => {
    setExpandedMccs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelect = (acct: { customerId: string; customerName: string }) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(acct.customerId)) next.delete(acct.customerId);
      else next.set(acct.customerId, acct);
      return next;
    });
  };

  return (
    <div>
      {managers.map((mgr) => (
        <div key={mgr.id}>
          <button
            onClick={() => toggleExpand(mgr.id)}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-small hover:bg-brand-wash transition-colors ${padCls(depth)}`}
          >
            {expandedMccs.has(mgr.id) ? (
              <ChevronDown className="h-4 w-4 text-text-placeholder" />
            ) : (
              <ChevronRight className="h-4 w-4 text-text-placeholder" />
            )}
            <Building2 className="h-4 w-4 text-brand" strokeWidth={1.75} />
            <span className="font-medium text-text-primary">{mgr.name}</span>
            <span className="text-caption text-text-placeholder">MCC · {mgr.id}</span>
          </button>
          {expandedMccs.has(mgr.id) && (
            <MccLevel
              mccId={mgr.id}
              depth={depth + 1}
              selected={selected}
              setSelected={setSelected}
              existingCids={existingCids}
            />
          )}
        </div>
      ))}

      {clients.map((acct) => {
        const already = existingCids.has(acct.id);
        const isSelected = selected.has(acct.id);
        return (
          <label
            key={acct.id}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-small cursor-pointer transition-colors ${padCls(depth, 1)} ${
              already
                ? "opacity-50 cursor-default"
                : isSelected
                  ? "bg-brand-wash"
                  : "hover:bg-brand-wash/50"
            }`}
          >
            <input
              type="checkbox"
              checked={isSelected || already}
              disabled={already}
              onChange={() =>
                !already &&
                toggleSelect({ customerId: acct.id, customerName: acct.name })
              }
              className="h-4 w-4 rounded border-border-light text-brand focus:ring-brand"
            />
            <Users className="h-4 w-4 text-text-placeholder" strokeWidth={1.75} />
            <span className={already ? "line-through text-text-placeholder" : "text-text-primary"}>
              {acct.name}
            </span>
            <span className="text-caption text-text-placeholder">
              {acct.id} {acct.currencyCode && `· ${acct.currencyCode}`}
            </span>
            {already && (
              <span className="ml-auto text-caption text-green-600">Already added</span>
            )}
          </label>
        );
      })}

      {items.length === 0 && (
        <p className={`py-2 text-small text-text-placeholder ${padCls(depth, 1)}`}>
          No child accounts found
        </p>
      )}
    </div>
  );
}

/* ─── Main Connect Page ──────────────────────────────────── */
export default function ConnectPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const detail = searchParams.get("detail");
  const success = searchParams.get("success");
  const count = searchParams.get("count");
  const manual = searchParams.get("manual");
  const accounts = trpc.account.list.useQuery();
  const disconnect = trpc.account.disconnect.useMutation({
    onSuccess: () => accounts.refetch(),
  });
  const addManual = trpc.account.addManual.useMutation({
    onSuccess: () => {
      accounts.refetch();
      setManualCid("");
      setManualError(null);
      setManualSuccess(true);
    },
    onError: (err) => setManualError(err.message),
  });
  const addFromMcc = trpc.account.addFromMcc.useMutation({
    onSuccess: (data) => {
      accounts.refetch();
      setMccAddResult(`Added ${data.added.length} account${data.added.length !== 1 ? "s" : ""}`);
    },
    onError: (err) => setMccAddResult(`Error: ${err.message}`),
  });
  const runAudit = trpc.audit.run.useMutation();

  const [runningFor, setRunningFor] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(manual === "true");
  const [showMccBrowser, setShowMccBrowser] = useState(false);
  const [manualCid, setManualCid] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualSuccess, setManualSuccess] = useState(false);
  const [mccAddResult, setMccAddResult] = useState<string | null>(null);

  const mccId = process.env.NEXT_PUBLIC_GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? "";

  const handleAddManual = () => {
    setManualError(null);
    setManualSuccess(false);
    const cleaned = manualCid.replace(/[-\s]/g, "");
    if (!/^\d{5,15}$/.test(cleaned)) {
      setManualError("Enter a valid Google Ads Customer ID (e.g. 123-456-7890)");
      return;
    }
    addManual.mutate({ customerId: cleaned });
  };

  const handleConnect = () => {
    window.location.href = "/api/google";
  };

  const handleRunAudit = async (accountId: string) => {
    setRunningFor(accountId);
    try {
      const result = await runAudit.mutateAsync({ googleAccountId: accountId });
      window.location.href = `/audit/${result.audit.id}`;
    } catch {
      setRunningFor(null);
    }
  };

  const existingCids = new Set(
    (accounts.data ?? []).map((a) => a.externalId)
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-h1 font-heading font-bold tracking-tight text-text-primary">
          Google Ads Accounts
        </h1>
        <p className="mt-1 text-body text-text-secondary">
          Connect and manage your Google Ads accounts for auditing
        </p>
      </div>

      {/* Status messages */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" strokeWidth={1.75} />
          <div>
            <p className="text-body font-semibold text-red-800">
              {error === "access_denied" && "You denied access to your Google Ads account."}
              {error === "no_tokens" && "Google did not return authentication tokens."}
              {error === "list_failed" && "Connected but couldn't load your ad accounts."}
              {error === "oauth_failed" && "OAuth authentication failed."}
              {error === "missing_params" && "Missing parameters from Google callback."}
              {error === "invalid_state" && "Invalid session state — please try again."}
            </p>
            {detail && (
              <p className="mt-1 text-small text-red-600 break-all">{detail}</p>
            )}
            <p className="mt-2 text-small text-red-700">
              Check that the <strong>Google Ads API</strong> is enabled in your Google Cloud project
              and your developer token is approved.
            </p>
          </div>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" strokeWidth={1.75} />
          <div>
            <p className="text-body font-semibold text-green-800">
              {manual === "true"
                ? "OAuth connected! Add your Google Ads Customer IDs below."
                : `Successfully connected ${count} account${count !== "1" ? "s" : ""}!`}
            </p>
            {manual === "true" && (
              <p className="mt-1 text-small text-green-700">
                We couldn&apos;t auto-discover your accounts (common with nested MCC structures).
                Use the &quot;Add by Customer ID&quot; button or browse your MCC below.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleConnect}
          className="inline-flex items-center gap-2 rounded-md bg-brand px-5 py-2.5 text-small font-semibold text-white shadow-sm hover:bg-brand-light hover:shadow-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 transition-all"
        >
          <Link2 className="h-4 w-4" strokeWidth={1.75} />
          Connect Google Ads Account
        </button>
        {mccId && (
          <button
            onClick={() => {
              setShowMccBrowser((v) => !v);
              setMccAddResult(null);
            }}
            className={`inline-flex items-center gap-1.5 rounded-md border px-4 py-2.5 text-small font-medium transition-colors ${
              showMccBrowser
                ? "border-brand bg-brand-wash text-brand"
                : "border-border-light text-text-secondary hover:text-brand hover:border-brand"
            }`}
          >
            <FolderTree className="h-4 w-4" strokeWidth={1.75} />
            Browse MCC
          </button>
        )}
        <button
          onClick={() => setShowManual((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border-light px-4 py-2.5 text-small font-medium text-text-secondary hover:text-brand hover:border-brand transition-colors"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} />
          Add by Customer ID
        </button>
      </div>

      {/* MCC Browser */}
      {showMccBrowser && mccId && (
        <div className="rounded-lg border border-brand-subtle bg-white overflow-hidden">
          <div className="border-b border-brand-subtle bg-brand-wash/50 px-5 py-3">
            <h3 className="text-body font-semibold text-text-primary">
              Browse MCC Accounts
            </h3>
            <p className="mt-0.5 text-small text-text-secondary">
              Drill into your MCC hierarchy. Expand sub-managers and select accounts to add.
            </p>
          </div>

          {mccAddResult && (
            <div className="mx-4 mt-3 flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-small text-green-700">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
              {mccAddResult}
            </div>
          )}

          <div className="max-h-[400px] overflow-y-auto px-2 py-2">
            <MccBrowser
              rootMccId={mccId}
              existingCids={existingCids}
              onAdd={(accts) => {
                setMccAddResult(null);
                addFromMcc.mutate({ accounts: accts });
              }}
            />
          </div>

          {addFromMcc.isPending && (
            <div className="flex items-center gap-2 border-t border-brand-subtle px-5 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-brand" />
              <span className="text-small text-text-secondary">Adding accounts…</span>
            </div>
          )}
        </div>
      )}

      {/* Manual entry section */}
      {showManual && (
        <div className="rounded-lg border border-brand-subtle bg-brand-wash p-5 space-y-3">
          <div>
            <h3 className="text-body font-semibold text-text-primary">
              Add Account Manually
            </h3>
            <p className="mt-0.5 text-small text-text-secondary">
              Enter a Google Ads Customer ID to add it directly. You must have
              connected via OAuth first so we have your access tokens.
            </p>
          </div>

          {manualError && (
            <div className="flex items-center gap-2 text-small text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
              {manualError}
            </div>
          )}

          {manualSuccess && (
            <div className="flex items-center gap-2 text-small text-green-700">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
              Account added successfully!
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={manualCid}
              onChange={(e) => setManualCid(e.target.value)}
              placeholder="123-456-7890"
              className="flex-1 rounded-md border border-border-light bg-white px-3 py-2 text-body text-text-primary placeholder:text-text-placeholder focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              onKeyDown={(e) => e.key === "Enter" && handleAddManual()}
            />
            <button
              onClick={handleAddManual}
              disabled={addManual.isPending || !manualCid.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-small font-semibold text-white hover:bg-brand-light disabled:opacity-50 transition-colors"
            >
              {addManual.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" strokeWidth={1.75} />
              )}
              Add
            </button>
          </div>
        </div>
      )}

      {/* Account list */}
      {accounts.isLoading ? (
        <div className="flex items-center justify-center rounded-lg border border-border-light bg-white p-12">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
        </div>
      ) : !accounts.data?.length ? (
        <div className="flex flex-col items-center rounded-lg border border-dashed border-border-light bg-white p-12 text-center">
          <Link2
            className="mb-3 h-10 w-10 text-text-placeholder"
            strokeWidth={1.75}
          />
          <p className="text-body font-medium text-text-secondary">
            No accounts connected
          </p>
          <p className="mt-1 text-small text-text-placeholder">
            Click the button above to connect your first Google Ads account
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.data.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between rounded-lg border border-border-light bg-white p-5 shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div className="rounded-md bg-green-50 p-2 text-green-600">
                  <CheckCircle2 className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-body font-semibold text-text-primary">
                    {account.accountName ?? "Google Ads Account"}
                  </p>
                  <p className="text-small text-text-secondary">
                    Customer ID: {account.externalId}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    handleRunAudit(account.id)
                  }
                  disabled={runningFor === account.id}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-2 text-caption font-semibold text-white hover:bg-brand-light disabled:opacity-50 transition-colors"
                >
                  {runningFor === account.id ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Running…
                    </>
                  ) : (
                    <>
                      <PlayCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Run Audit
                    </>
                  )}
                </button>

                <a
                  href={`https://ads.google.com/aw/overview?ocid=${account.externalId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open in Google Ads"
                  className="rounded-md border border-border-light p-2 text-text-secondary hover:text-brand hover:border-brand transition-colors"
                >
                  <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
                </a>

                <button
                  onClick={() => disconnect.mutate({ accountId: account.id })}
                  disabled={disconnect.isPending}
                  aria-label="Disconnect account"
                  className="rounded-md border border-border-light p-2 text-text-secondary hover:text-red-600 hover:border-red-300 transition-colors"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
