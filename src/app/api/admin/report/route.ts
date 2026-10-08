import { readTaxProfile } from "@/lib/tax-profile";
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { authorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents } from "@/lib/finance-documents";
import { importLegacy, journalReady } from "@/lib/journal";
import { report, isVoided } from "@/lib/reports";
import { accountNames, type JournalView } from "@/lib/accounting";
export async function GET(req: NextRequest) {
  if (!(await authorized()))
    return NextResponse.json({ error: "Acceso restringido" }, { status: 401 });
  const month = req.nextUrl.searchParams.get("month") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    return NextResponse.json({ error: "Mes inválido" }, { status: 400 });
  try {
    const data = await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(29062026)`;
        if (!(await journalReady(tx)))
          throw Error("Contabilidad no disponible");
        const config = await tx.businessConfig.findUniqueOrThrow({
          where: { id: 1 },
        });
        await importLegacy(tx, config.currency);
        const docs = await documents(tx);
        const entries = await tx.journalEntry.findMany({
          include: { lines: true },
          orderBy: { date: "asc" },
        });
        return {
          config,
          taxProfile: await readTaxProfile(tx),
          entries: entries.map((e) => ({
            ...e,
            date: e.date.toISOString(),
            settledAt: e.settledAt?.toISOString() ?? null,
            document: docs.find((d) => d.entryId === e.id),
          })),
        };
      },
      { timeout: 20000 },
    );
    const r = report(
      data.entries,
      month,
      data.config.timezone,
      data.config.currency,
    );
    const book = new ExcelJS.Workbook();
    book.creator = "Aura Barbería";
    book.created = new Date();
    function sheet(
      name: string,
      headers: string[],
      rows: (string | number | boolean | null)[][],
    ) {
      const s = book.addWorksheet(name);
      s.addRow(headers);
      for (const row of rows) s.addRow(row);
      s.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      s.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF202020" },
      };
      s.views = [{ state: "frozen", ySplit: 1 }];
      s.columns = headers.map(() => ({ width: 25 }));
      s.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, s.rowCount), column: headers.length },
      };
      s.eachRow((row, index) => {
        if (index > 1)
          row.eachCell((cell) => {
            if (typeof cell.value === "number")
              cell.numFmt = "#,##0.00;[Red]-#,##0.00";
          });
      });
      return s;
    }
    const amount = (n: number) => n / 100;
    sheet(
      "Leer primero",
      ["Concepto", "Detalle"],
      [
        ["Negocio", data.config.name],
        ["Período", month],
        ["Moneda", data.config.currency],
        ["Zona horaria", data.config.timezone],
        [
          "Uso",
          "Respaldo para revisión del contador; no es F29, F22, DTE ni archivo oficial del RCV.",
        ],
        [
          "Tratamiento de IVA",
          data.taxProfile.treatment === "AFFECTED"
            ? "Afecto a IVA, confirmado por el dueño"
            : data.taxProfile.treatment === "EXEMPT"
              ? "Exento / no afecto, confirmado por el dueño"
              : "Por confirmar; no se asume obligación de IVA.",
        ],
        [
          "IVA",
          "Según documentos registrados y elegibilidad confirmada por el dueño; cotejar con RCV del SII.",
        ],
        ["Operaciones sin documento", r.missing],
        [
          "Estado de resultados",
          "Por devengo, antes de impuestos a la renta. No incluye depreciación, inventario ni remuneraciones no registradas.",
        ],
        [
          "Correcciones",
          "Anulaciones contabilizadas en la fecha original; la fecha de creación registra cuándo se corrigió. No modifica documentos en el SII.",
        ],
        [
          "Saldos",
          "Desde el primer movimiento; sin saldos de apertura o cierre tributario validado.",
        ],
      ],
    );
    sheet(
      "Estado de resultados",
      ["Concepto", "Monto"],
      [
        ...r.resultAccounts.map((v) => [
          accountNames[v.account as keyof typeof accountNames] ?? v.account,
          amount(v.amount),
        ]),
        ["Ingresos netos registrados", amount(r.totals.income)],
        ["Gastos registrados", amount(r.totals.expenses)],
        ["Resultado antes de renta", amount(r.totals.profit)],
        [
          "Margen porcentual",
          r.totals.income ? (r.totals.profit / r.totals.income) * 100 : 0,
        ],
      ],
    );
    sheet(
      "Balance general",
      ["Concepto", "Monto"],
      [
        ["Activos registrados", amount(r.assets)],
        ["Pasivos registrados", amount(r.liabilities)],
        ["Patrimonio y resultado", amount(r.equity)],
        ["Diferencia de cuadre", amount(r.balanceDifference)],
      ],
    );
    sheet(
      "IVA",
      ["Concepto", "Monto"],
      [
        ["IVA débito registrado", amount(r.vatOutput)],
        ["IVA crédito registrado", amount(r.vatInput)],
        ["Diferencia (no equivale a F29)", amount(r.vatDifference)],
        ["IVA de compras documentadas del período", amount(r.purchaseVat)],
        ["IVA de compras pagadas en el período", amount(r.paidPurchaseVat)],
        ["Operaciones por revisar", r.missing],
      ],
    );
    sheet(
      "Balance de comprobación",
      [
        "Cuenta",
        "Debe acumulado",
        "Haber acumulado",
        "Saldo deudor",
        "Saldo acreedor",
      ],
      r.balances.map((v) => [
        accountNames[v.account as keyof typeof accountNames] ?? v.account,
        amount(v.debit),
        amount(v.credit),
        amount(Math.max(0, v.balance)),
        amount(Math.max(0, -v.balance)),
      ]),
    );
    sheet(
      "Libro diario",
      [
        "ID",
        "Fecha",
        "Descripción",
        "Cuenta",
        "Debe",
        "Haber",
        "Registrado el",
      ],
      r.period.flatMap((e) =>
        e.lines.map((l) => [
          e.id,
          e.date,
          e.description,
          accountNames[l.account as keyof typeof accountNames] ?? l.account,
          amount(l.debit),
          amount(l.credit),
          (e as JournalView & { createdAt?: Date }).createdAt?.toISOString() ??
            "",
        ]),
      ),
    );
    sheet(
      "Documentos",
      [
        "ID",
        "Fecha",
        "Operación",
        "Total",
        "Tipo",
        "Folio",
        "RUT",
        "IVA",
        "Crédito declarado",
        "Estado",
      ],
      r.period
        .filter((e) => !e.sourceKey.startsWith("reversal:"))
        .map((e) => [
          e.id,
          e.date,
          e.description,
          amount(e.amount),
          e.document?.type ?? "POR REVISAR",
          e.document?.folio ?? "",
          e.document?.rut ?? "",
          amount(e.document?.vat ?? 0),
          e.document?.recoverable ?? false,
          isVoided(e, data.entries) ? "ANULADA" : "VIGENTE",
        ]),
    );
    const buffer = await book.xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="barberia-${month}.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo generar el reporte" },
      { status: 503 },
    );
  }
}
