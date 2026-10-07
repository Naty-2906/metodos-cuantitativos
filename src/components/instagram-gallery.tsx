"use client";
import { useState } from "react";
import { Camera as Instagram, ArrowUpRight } from "lucide-react";
const profile = "https://www.instagram.com/aura_barberia17/";
export default function InstagramGallery() {
  const [showProfile, setShowProfile] = useState(false);
  return (
    <section id="instagram" className="aura-instagram scroll-mt-6">
      <div className="aura-instagram-copy">
        <p className="eyebrow">EL ESTILO HABLA POR SÍ SOLO</p>
        <h2 className="text-4xl md:text-5xl font-semibold uppercase leading-tight mt-5">
          Nuestro oficio.
          <br />
          <span className="text-[#c6a477]">Tu próximo corte.</span>
        </h2>
        <p className="mt-5 text-[#bcb7ae] leading-7 max-w-md">
          Conoce los cortes y el trabajo de Aura Barbería en Instagram.
          Encuentra tu inspiración y trae tu referencia a la próxima cita.
        </p>
        <a
          href={profile}
          target="_blank"
          rel="noopener noreferrer"
          className="aura-instagram-link mt-7"
        >
          <Instagram size={20} /> @aura_barberia17 <ArrowUpRight size={18} />
        </a>
        <p className="text-xs text-[#bcb7ae] mt-5 leading-5">
          También puedes abrir el perfil directamente si Instagram no muestra su
          contenido aquí.
        </p>
      </div>
      <div className="aura-instagram-preview">
        {showProfile ? (
          <>
            <iframe
              src={`${profile}embed/`}
              title="Cortes de Aura Barbería en Instagram"
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              className="w-full border-0 bg-white rounded-xl"
              height="540"
            />
            <a
              href={profile}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-sm underline underline-offset-4 mt-4"
            >
              Ver todas las publicaciones en Instagram
            </a>
          </>
        ) : (
          <div className="text-center py-12 px-6">
            <Instagram
              size={48}
              strokeWidth={1}
              className="mx-auto text-[#c6a477]"
            />
            <p className="text-xl font-semibold mt-6">
              El sello Aura, en cada corte.
            </p>
            <p className="text-sm text-[#bcb7ae] mt-3 mb-6">
              Explora nuestro perfil sin salir de la página.
            </p>
            <button onClick={() => setShowProfile(true)} className="primary">
              Mostrar Instagram
            </button>
            <p className="text-xs text-[#bcb7ae] mt-5">
              Al cargar el perfil te conectas con Instagram.
              <br />
              Su visualización depende de la configuración del perfil y de tu
              navegador.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
