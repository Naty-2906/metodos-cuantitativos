import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Aura Barbería · Estilo urbano, precisión y carácter",
  description:
    "Cortes y barba con inspiración New York y New Jersey. Reserva tu hora en Aura Barbería y conoce nuestros cortes en Instagram.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
