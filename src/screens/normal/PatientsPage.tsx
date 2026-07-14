import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAllActiveEncounters } from "../../db/hooks";
import { sortQueue } from "../../lib/sortQueue";
import { QueueTable } from "../../components/QueueTable";

export function PatientsPage() {
  const encounters = useAllActiveEncounters();
  const navigate = useNavigate();
  const sorted = sortQueue(encounters);

  return (
    <div className="mx-auto max-w-[1440px] space-y-3 p-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Patients</h1>
        <button
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white"
          style={{ background: "var(--color-primary)" }}
          onClick={() => navigate("/patients/new")}
        >
          <Plus size={16} />
          New patient
        </button>
      </div>
      <div className="card">
        <QueueTable rows={sorted} />
      </div>
    </div>
  );
}
