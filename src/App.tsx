import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
  CameraStationPage,
  ChatStationPage,
  EqualizerStationPage,
  PoliciesStationPage,
  RadioHomePage,
  RequestsStationPage,
  ScheduleStationPage,
  SiteLayout,
} from "./pages/HomePage";
import { PlayerProvider } from "./player/PlayerProvider";

const AdsAdminPage = lazy(() =>
  import("./pages/AdsAdminPage").then((module) => ({ default: module.AdsAdminPage })),
);

const siteUrl = "https://webradioconexaojamaica.com";
const defaultSeo = {
  title: "Web Rádio Conexão Jamaica | Reggae ao vivo",
  description:
    "Ouça a Web Rádio Conexão Jamaica ao vivo: reggae em todas as vertentes, programação online, pedidos musicais, bate-papo, câmera do estúdio e novidades para ouvintes.",
};

const routeSeo: Record<string, typeof defaultSeo> = {
  "/": defaultSeo,
  "/radio": defaultSeo,
  "/programacao": {
    title: "Programação | Web Rádio Conexão Jamaica",
    description:
      "Confira a programação da Web Rádio Conexão Jamaica e acompanhe os horários dos programas, seleções reggae e transmissões ao vivo.",
  },
  "/pedidos": {
    title: "Peça sua música | Web Rádio Conexão Jamaica",
    description:
      "Envie seu pedido musical para a Web Rádio Conexão Jamaica e participe da programação reggae ao vivo.",
  },
  "/bate-papo": {
    title: "Bate-papo | Web Rádio Conexão Jamaica",
    description:
      "Entre no bate-papo da Web Rádio Conexão Jamaica para participar com outros ouvintes enquanto acompanha a rádio ao vivo.",
  },
  "/camera": {
    title: "Câmera do estúdio | Web Rádio Conexão Jamaica",
    description:
      "Acompanhe a câmera do estúdio e veja a transmissão ao vivo da Web Rádio Conexão Jamaica.",
  },
  "/ao-vivo": {
    title: "Ao vivo | Web Rádio Conexão Jamaica",
    description:
      "Veja a transmissão ao vivo da Web Rádio Conexão Jamaica com reggae, programação e participação dos ouvintes.",
  },
  "/equalizador": {
    title: "Equalizador | Web Rádio Conexão Jamaica",
    description:
      "Ajuste a experiência de áudio da Web Rádio Conexão Jamaica para ouvir reggae ao vivo do seu jeito.",
  },
  "/ajustes": {
    title: "Ajustes | Web Rádio Conexão Jamaica",
    description:
      "Ajuste a experiência de áudio e preferências da Web Rádio Conexão Jamaica.",
  },
  "/politicas": {
    title: "Privacidade | Web Rádio Conexão Jamaica",
    description:
      "Entenda como a Web Rádio Conexão Jamaica trata dados de navegação, pedidos musicais, bate-papo e recursos do site.",
  },
  "/ads": {
    title: "Área restrita | Web Rádio Conexão Jamaica",
    description:
      "Área restrita para administradores da Web Rádio Conexão Jamaica gerenciarem anúncios e patrocinadores.",
  },
};

function setMeta(selector: string, value: string) {
  const element = document.querySelector<HTMLMetaElement>(selector);

  if (element) {
    element.content = value;
  }
}

function setCanonical(pathname: string) {
  const element = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  if (element) {
    element.href = new URL(pathname, siteUrl).href;
  }
}

function SeoSync() {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = routeSeo[pathname] ?? defaultSeo;
    const url = new URL(pathname, siteUrl).href;

    document.title = meta.title;
    setMeta('meta[name="description"]', meta.description);
    setMeta('meta[property="og:title"]', meta.title);
    setMeta('meta[property="og:description"]', meta.description);
    setMeta('meta[property="og:url"]', url);
    setMeta('meta[name="twitter:title"]', meta.title);
    setMeta('meta[name="twitter:description"]', meta.description);
    setCanonical(pathname);
  }, [pathname]);

  return null;
}

function RouteFallback() {
  return <div className="route-loading" aria-live="polite" />;
}

export default function App() {
  return (
    <PlayerProvider>
      <BrowserRouter>
        <SeoSync />
        <Routes>
          <Route element={<SiteLayout />}>
            <Route index element={<RadioHomePage />} />
            <Route path="/radio" element={<RadioHomePage />} />
            <Route path="/programacao" element={<ScheduleStationPage />} />
            <Route path="/pedidos" element={<RequestsStationPage />} />
            <Route path="/bate-papo" element={<ChatStationPage />} />
            <Route path="/camera" element={<CameraStationPage />} />
            <Route path="/ao-vivo" element={<CameraStationPage />} />
            <Route path="/equalizador" element={<EqualizerStationPage />} />
            <Route path="/ajustes" element={<EqualizerStationPage />} />
            <Route path="/politicas" element={<PoliciesStationPage />} />
          </Route>
          <Route
            path="/ads"
            element={
              <Suspense fallback={<RouteFallback />}>
                <AdsAdminPage />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/radio" replace />} />
        </Routes>
      </BrowserRouter>
    </PlayerProvider>
  );
}
