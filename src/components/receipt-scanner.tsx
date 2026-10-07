"use client";
import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { extractReceiptFields, type ReceiptFields } from "@/lib/receipt";
export default function ReceiptScanner({
  currency,
  disabled,
  onExtract,
  onBusyChange,
}: {
  currency: string;
  disabled: boolean;
  onExtract: (fields: ReceiptFields) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const worker = useRef<import("tesseract.js").Worker | null>(null),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      void worker.current?.terminate().catch(() => {});
    };
  }, []);
  async function scan(file: File) {
    setError("");
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
      const fields = extractReceiptFields(data.text, currency);
      onExtract(fields);
      setStatus(
        fields.amount || fields.date
          ? "Datos sugeridos. Revisa monto y fecha antes de guardar."
          : "No pudimos identificar el total o la fecha. Puedes ingresarlos manualmente.",
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
        Escanear boleta o comprobante (opcional)
      </label>
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
        La foto se procesa en tu dispositivo; no se sube ni se guarda. La
        primera lectura descarga el lector de texto y necesita internet. Siempre
        confirma los datos sugeridos.
      </p>
      <p role="status" className="text-xs mt-2">
        {status}
      </p>
      {error && (
        <p role="alert" className="text-red-700 text-xs mt-2">
          {error}
        </p>
      )}
    </div>
  );
}
