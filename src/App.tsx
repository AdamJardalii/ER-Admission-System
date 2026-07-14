import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { seedInitialData } from "./db/seed";
import { useAppStore } from "./store/useAppStore";
import { useActiveIncident } from "./db/hooks";
import { WebNav } from "./components/WebNav";
import { CatastropheBanner } from "./components/CatastropheBanner";
import { Toasts } from "./components/Toasts";
import { useIsMobile } from "./lib/useIsMobile";

import { Dashboard } from "./screens/normal/Dashboard";
import { QueuePage } from "./screens/normal/QueuePage";
import { BedsPage } from "./screens/normal/BedsPage";
import { PatientsPage } from "./screens/normal/PatientsPage";
import { PatientChart } from "./screens/normal/PatientChart";
import { RegistrationForm } from "./screens/normal/RegistrationForm";
import { IncidentCommand } from "./screens/normal/IncidentCommand";
import { ReportsPage } from "./screens/normal/ReportsPage";
import { ReconciliationWorkspace } from "./screens/reconcile/ReconciliationWorkspace";

import { CrisisDashboard } from "./screens/crisis/CrisisDashboard";
import { ColorPicker } from "./screens/crisis/ColorPicker";
import { CrisisPatientCard } from "./screens/crisis/CrisisPatientCard";
import { BulkArrival } from "./screens/crisis/BulkArrival";
import { ScanFind } from "./screens/crisis/ScanFind";

import { MobileHome } from "./screens/mobile/MobileHome";
import { MobilePatientChart } from "./screens/mobile/MobilePatientChart";

function App() {
  const [ready, setReady] = useState(false);
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const setIncident = useAppStore((s) => s.setIncident);
  const theme = useAppStore((s) => s.theme);
  const activeIncident = useActiveIncident();
  const isMobile = useIsMobile();

  useEffect(() => {
    seedInitialData().finally(() => setReady(true));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("er-theme", theme);
  }, [theme]);

  // Mode lives in an in-memory store, so a refresh loses it — rederive it from
  // whether an Incident record is still active (deactivatedAt === null), which
  // is the durable source of truth in IndexedDB.
  useEffect(() => {
    if (!ready) return;
    if (activeIncident) {
      setIncident(activeIncident.id, activeIncident.code);
      setMode("catastrophe");
    } else {
      setIncident(null, null);
      setMode("normal");
    }
  }, [ready, activeIncident, setIncident, setMode]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--color-ink-secondary)] text-sm">
        Loading ER Command…
      </div>
    );
  }

  const showCrisisUI = mode === "catastrophe" && isMobile;

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        {mode === "catastrophe" && <CatastropheBanner />}
        {!showCrisisUI && <WebNav />}
        <div className="flex-1">
          {showCrisisUI ? (
            <Routes>
              <Route path="/" element={<CrisisDashboard />} />
              <Route path="/crisis" element={<CrisisDashboard />} />
              <Route path="/crisis/new/:encounterId" element={<ColorPicker />} />
              <Route path="/crisis/patient/:encounterId" element={<CrisisPatientCard />} />
              <Route path="/crisis/bulk" element={<BulkArrival />} />
              <Route path="/crisis/scan" element={<ScanFind />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          ) : (
            <Routes>
              <Route
                path="/"
                element={mode === "catastrophe" ? <CrisisDashboard webEmbed /> : <Dashboard />}
              />
              <Route path="/queue" element={<QueuePage />} />
              <Route path="/beds" element={<BedsPage />} />
              <Route path="/patients" element={<PatientsPage />} />
              <Route path="/patients/new" element={<RegistrationForm />} />
              <Route path="/patients/:encounterId" element={<PatientChart />} />
              <Route path="/incident" element={<IncidentCommand />} />
              <Route path="/reconcile" element={<ReconciliationWorkspace />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/crisis/new/:encounterId" element={<ColorPicker />} />
              <Route path="/crisis/patient/:encounterId" element={<CrisisPatientCard />} />
              <Route path="/crisis/bulk" element={<BulkArrival />} />
              <Route path="/m" element={<MobileHome />} />
              <Route path="/m/patients/:encounterId" element={<MobilePatientChart />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </div>
        <Toasts />
      </div>
    </BrowserRouter>
  );
}

export default App;
