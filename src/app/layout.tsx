import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Studio Barber · Tu próximo buen corte",
  description: "Reserva tu corte en tres pasos.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
