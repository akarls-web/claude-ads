import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/server/db";
import { audits, auditChecks, connections } from "@/server/db/schema";
import { generateAuditPdf } from "@/server/services/pdf-report";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: auditId } = await params;

  // Fetch audit + connection
  const rows = await db
    .select({
      id: audits.id,
      reportId: audits.reportId,
      status: audits.status,
      score: audits.score,
      grade: audits.grade,
      rawData: audits.rawData,
      aiAnalysis: audits.aiAnalysis,
      summary: audits.summary,
      totalChecks: audits.totalChecks,
      passCount: audits.passCount,
      warningCount: audits.warningCount,
      failCount: audits.failCount,
      skippedCount: audits.skippedCount,
      customerId: connections.externalId,
      customerName: connections.accountName,
      createdAt: audits.createdAt,
    })
    .from(audits)
    .leftJoin(connections, eq(audits.connectionId, connections.id))
    .where(and(eq(audits.id, auditId), eq(audits.userId, userId)));

  const auditRow = rows[0];
  if (!auditRow) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  if (auditRow.status !== "completed") {
    return NextResponse.json(
      { error: "Audit is not completed" },
      { status: 400 }
    );
  }

  // Fetch all checks
  const checks = await db
    .select()
    .from(auditChecks)
    .where(eq(auditChecks.auditId, auditId));

  // Generate PDF
  const pdfDoc = generateAuditPdf({
    audit: {
      ...auditRow,
      rawData: (auditRow.rawData as Record<string, unknown>) ?? null,
      aiAnalysis: (auditRow.aiAnalysis as Record<string, unknown>) ?? null,
    },
    checks,
  });

  // Collect the PDF into a buffer
  const chunks: Buffer[] = [];
  pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
    pdfDoc.on("error", reject);
  });

  // Build filename
  const clientName = (auditRow.customerName ?? "Account")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s+/g, "-");
  const dateStr = new Date(auditRow.createdAt).toISOString().slice(0, 10);
  const filename = `SterlingX-Audit-${clientName}-${dateStr}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdfBuffer.length),
    },
  });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[PDF ROUTE ERROR]", message, stack);
    return NextResponse.json(
      { error: "PDF generation failed", detail: message },
      { status: 500 }
    );
  }
}
