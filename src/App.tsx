import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
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

function RouteFallback() {
  return <div className="route-loading" aria-live="polite" />;
}

export default function App() {
  return (
    <PlayerProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<SiteLayout />}>
            <Route index element={<RadioHomePage />} />
            <Route path="/radio" element={<RadioHomePage />} />
            <Route path="/programacao" element={<ScheduleStationPage />} />
            <Route path="/pedidos" element={<RequestsStationPage />} />
            <Route path="/bate-papo" element={<ChatStationPage />} />
            <Route path="/camera" element={<CameraStationPage />} />
            <Route path="/equalizador" element={<EqualizerStationPage />} />
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
