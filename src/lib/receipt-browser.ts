export async function receiptImage(file: Blob) {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(2, 3200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("No se pudo preparar la imagen");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let image = canvas.toDataURL("image/jpeg", 0.85);
  if (image.length > 2400000) image = canvas.toDataURL("image/jpeg", 0.55);
  return { canvas, image: image.length <= 2400000 ? image : undefined };
}
export async function pdfReceipt(
  file: File,
  ocr: (image: HTMLCanvasElement) => Promise<string>,
) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  const pdf = await task.promise;
  try {
    if (pdf.numPages > 5)
      throw Error("Usa un PDF de hasta 5 páginas y una sola boleta o factura");
    const parts: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      let text = "",
        y: number | undefined;
      for (const item of content.items)
        if ("str" in item) {
          const row = item.transform[5];
          if (y !== undefined && Math.abs(row - y) > 3) text += "\n";
          text += item.str + (item.hasEOL ? "\n" : " ");
          y = row;
        }
      if (text.replace(/\s/g, "").length < 25) {
        const viewport = page.getViewport({ scale: 2 });
        if (viewport.width * viewport.height > 16000000)
          throw Error("La página del PDF es demasiado grande");
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvas, viewport }).promise;
        text = await ocr(canvas);
      }
      parts.push(text);
    }
    return parts.join("\n");
  } finally {
    await task.destroy();
  }
}

export function receiptContrast(source: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("No se pudo preparar la segunda lectura");
  ctx.filter = "grayscale(1) contrast(1.6) brightness(1.1)";
  ctx.drawImage(source, 0, 0);
  return canvas;
}
export function receiptTotalCrop(source: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  const top = Math.floor(source.height * 0.4);
  canvas.width = source.width;
  canvas.height = source.height - top;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("No se pudo revisar el total");
  ctx.drawImage(
    source,
    0,
    top,
    source.width,
    canvas.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}
