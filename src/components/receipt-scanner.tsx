"use client";
import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import {
  localReceiptExpense,
  type ReceiptExpense,
} from "@/lib/receipt-expense";
export default function ReceiptScanner({
  currency,
  disabled,
  onExtract,
  onBusyChange,
}: {
  currency: string;
  disabled: boolean;
  onExtract: (fields: ReceiptExpense) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [available, setAvailable] = useState(false),
    [useAI, setUseAI] = useState(false),
    [proposal, setProposal] = useState<ReceiptExpense | null>(null);
  const worker = useRef<import("tesseract.js").Worker | null>(null),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    void fetch("/api/admin/receipt")
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (alive.current) setAvailable(v?.available === true);
      })
      .catch(() => {});
    return () => {
      alive.current = false;
      void worker.current?.terminate().catch(() => {});
    };
  }, []);
  async function scan(file: File) {
    setError("");
    setProposal(null);
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      setError("Usa una foto JPG, PNG o WebP de hasta 10 MB.");
      return;
    }
    setBusy(true);
    onBusyChange(true);
    setStatus("Preparando lectura…");
    let active: import("tesseract.js").Worker | undefined;
    try {
      const { createWorker } = await import("tesseract.js");
      if (!alive.current) return;
      active = await createWorker("spa", undefined, {
        // Rejections are handled below instead of becoming uncaught worker errors.
        errorHandler: () => {},
        logger: (m) => {
          if (alive.current && m.status === "recognizing text")
            setStatus(`Leyendo documento… ${Math.round(m.progress * 100)}%`);
        },
      });
      worker.current = active;
      if (!alive.current) return;
      const { data } = await active.recognize(file);
      if (!alive.current) return;
      let fields = localReceiptExpense(data.text, currency);
      let interpreted = false;
      if (useAI && available) {
        setStatus("Interpretando la compra con IA…");
        try {
          const response = await fetch("/api/admin/receipt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: data.text.slice(0, 10000), currency }),
            signal: AbortSignal.timeout(25000),
          });
          const result = await response.json();
          if (!response.ok) throw Error(result.error ?? "IA no disponible");
          fields = result.fields;
          interpreted = true;
        } catch (error) {
          if (alive.current)
            setError(
              error instanceof Error
                ? error.message
                : "Se usó la lectura normal porque la IA no respondió.",
            );
        }
      }
      if (!alive.current) return;
      setProposal(fields);
      setStatus(
        interpreted
          ? "Propuesta interpretada con IA. Revisa antes de usarla."
          : "Propuesta de la lectura automática. Revisa antes de usarla.",
      );
    } catch {
      if (alive.current)
        setError(
          "No se pudo leer la foto. Intenta con una imagen más nítida o completa los datos a mano.",
        );
    } finally {
      if (active) await active.terminate().catch(() => {});
      worker.current = null;
      if (alive.current) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  }
  return (
    <div className="rounded-xl border border-dashed border-[#cdd7c5] p-4 mb-5">
      <label
        htmlFor="receipt-photo"
        className="flex gap-2 items-center text-sm font-semibold text-[#294e3b]"
      >
        <Camera size={18} />
        Leer boleta de una compra (opcional)
      </label>
      {available ? (
        <label className="flex gap-2 items-start text-xs mt-3">
          <input
            type="checkbox"
            checked={useAI}
            disabled={busy || disabled}
            onChange={(e) => setUseAI(e.target.checked)}
          />
          Usar IA para interpretar el texto y sugerir el gasto. El texto leído
          se enviará a OpenAI; la foto permanece en tu dispositivo.
        </label>
      ) : (
        <p className="muted text-xs mt-2">
          Puedes usar la lectura automática. La interpretación avanzada con IA
          aún no está activada.
        </p>
      )}
      <input
        id="receipt-photo"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        disabled={disabled || busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void scan(file);
        }}
        className="text-xs mt-2"
      />
      <p className="muted text-xs leading-5 mt-2">
        La foto se lee en tu dispositivo y no se guarda. Si activas la IA, solo
        se envía el texto leído para interpretarlo. La primera lectura descarga
        el lector de texto y necesita internet. Siempre confirma los datos
        sugeridos.
      </p>
      <p role="status" className="text-xs mt-2">
        {status}
      </p>
      {proposal && (
        <div className="mt-4 rounded-xl bg-white p-4 space-y-2 text-sm">
          <h3 className="font-semibold">Esto encontramos en tu compra</h3>
          <p>
            Total:{" "}
            <strong>
              {proposal.amount !== undefined
                ? new Intl.NumberFormat("es-CL", {
                    style: "currency",
                    currency,
                  }).format(proposal.amount)
                : "Por completar"}
            </strong>
          </p>
          <p>Fecha: {proposal.date ?? "Por confirmar"}</p>
          <p>
            Tipo:{" "}
            {proposal.kind === "SUPPLIES"
              ? "Insumos para trabajar"
              : proposal.kind === "ASSET"
                ? "Equipo o mueble"
                : proposal.kind === "EXPENSE"
                  ? "Otro gasto"
                  : "Elígelo en el formulario"}
          </p>
          {proposal.description && <p>{proposal.description}</p>}
          {proposal.items.length > 0 && (
            <details>
              <summary className="cursor-pointer">
                Ver artículos detectados ({proposal.items.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {proposal.items.map((item, i) => (
                  <li key={i}>
                    {item.quantity ? `${item.quantity} × ` : ""}
                    {item.name}
                    {item.amount !== null
                      ? ` · ${new Intl.NumberFormat("es-CL", { style: "currency", currency }).format(item.amount)}`
                      : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {proposal.warnings.map((warning, i) => (
            <p className="text-amber-800 text-xs" key={i}>
              {warning}
            </p>
          ))}
          <button
            type="button"
            className="btn"
            disabled={busy || disabled}
            onClick={() => {
              onExtract(proposal);
              setProposal(null);
              setStatus(
                "Datos pasados al formulario. Revísalos y pulsa Guardar movimiento para agregarlos al negocio.",
              );
            }}
          >
            Usar estos datos en mi gasto
          </button>
          <p className="muted text-xs">
            Se registrará una sola compra por el total, con los artículos
            resumidos en la descripción. Todavía no se guarda ningún gasto.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-red-700 text-xs mt-2">
          {error}
        </p>
      )}
    </div>
  );
}
