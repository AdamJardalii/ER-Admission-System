import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { seedInitialData } from "./db/seed";
import { useAppStore } from "./store/useAppStore";
import { useActiveIncident } from "./db/hooks";
import { WebNav } from "./components/WebNav";
import { CatastropheBanner } from "./components/CatastropheBanner";
import { Toasts } from "./components/Toasts";
import { useIsMobile } from "./lib/useIsMobile";
import { PrototypeRecovery, PrototypeStartupState } from "./components/PrototypeRecovery";

import { Dashboard } from "./screens/normal/Dashboard";
import { QueuePage } from "./screens/normal/QueuePage";
import { BedsPage } from "./screens/normal/BedsPage";
import { PatientsPage } from "./screens/normal/PatientsPage";
import { PatientChart } from "./screens/normal/PatientChart";
import { RegistrationForm } from "./screens/normal/RegistrationForm";
import { OrdersWorkspace } from "./screens/normal/OrdersWorkspace";
import { ResultsWorkspace } from "./screens/normal/ResultsWorkspace";
import { PrototypeSettings } from "./screens/normal/PrototypeSettings";
import { VitalsDuePage } from "./screens/normal/VitalsDuePage";
import { IncidentCommand } from "./screens/normal/IncidentCommand";
import { ReportsPage } from "./screens/normal/ReportsPage";
import { DispositionPage } from "./screens/normal/DispositionPage";
import { FlowWorklist } from "./screens/normal/FlowWorklists";
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
  const [startupError, setStartupError] = useState<string | null>(null);
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const setIncident = useAppStore((s) => s.setIncident);
  const theme = useAppStore((s) => s.theme);
  const activeIncident = useActiveIncident();
  const isMobile = useIsMobile();

  const initializePrototype = useCallback(async () => {
    setReady(false);
    setStartupError(null);
    try {
      await seedInitialData();
      setReady(true);
    } catch (reason) {
      setStartupError(reason instanceof Error ? reason.message : "Saved prototype data could not be opened.");
    }
  }, []);

  useEffect(() => {
    void initializePrototype();
  }, [initializePrototype]);

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

  if (startupError) return <PrototypeRecovery error={startupError} retry={initializePrototype} />;
  if (!ready) return <PrototypeStartupState />;

  const showCrisisUI = mode === "catastrophe" && isMobile;
  const routerBasename = import.meta.env.BASE_URL === "/" ? undefined : import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <BrowserRouter basename={routerBasename}>
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
              <Route path="/orders" element={<OrdersWorkspace />} />
              <Route path="/results" element={<ResultsWorkspace />} />
              <Route path="/disposition" element={<DispositionPage />} />
              <Route path="/admissions" element={<FlowWorklist kind="admissions" />} />
              <Route path="/boarding" element={<FlowWorklist kind="boarding" />} />
              <Route path="/patients/:patientId/orders" element={<OrdersWorkspace />} />
              <Route path="/patients/:patientId/results" element={<ResultsWorkspace />} />
              <Route path="/patients/:encounterId" element={<PatientChart />} />
              <Route path="/vitals-due" element={<VitalsDuePage />} />
              <Route path="/incident" element={<IncidentCommand />} />
              <Route path="/reconcile" element={<ReconciliationWorkspace />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/prototype-settings" element={<PrototypeSettings />} />
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
