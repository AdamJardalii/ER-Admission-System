import type { OrderType } from "../types";

// Mock option catalogs shared by searchable clinical selectors. Forms persist
// the chosen values, while custom entries remain available for clinical detail.
export const CHIEF_COMPLAINT_OPTIONS: string[] = [
  "Abdominal pain",
  "Allergic reaction",
  "Altered mental status",
  "Back pain",
  "Burn",
  "Chest pain",
  "Cough",
  "Diarrhea",
  "Dizziness / vertigo",
  "Eye complaint",
  "Fall",
  "Fever",
  "Head injury",
  "Headache",
  "Laceration / wound",
  "Limb pain or swelling",
  "Loss of consciousness / syncope",
  "Motor vehicle collision",
  "Nausea / vomiting",
  "Palpitations",
  "Pregnancy-related complaint",
  "Seizure",
  "Shortness of breath",
  "Sore throat",
  "Stroke symptoms",
  "Trauma",
  "Urinary symptoms",
  "Weakness / fatigue",
];

export const ALLERGY_OPTIONS: string[] = [
  "No known allergies",
  "Penicillin",
  "Amoxicillin",
  "Cephalosporins",
  "Sulfa drugs",
  "Aspirin / NSAIDs",
  "Codeine",
  "Morphine",
  "Iodine / contrast dye",
  "Latex",
  "Peanuts",
  "Tree nuts",
  "Shellfish",
  "Eggs",
  "Bee stings",
];

export const CONDITION_OPTIONS: string[] = [
  "None known",
  "Hypertension",
  "Diabetes mellitus",
  "Asthma",
  "COPD",
  "Coronary artery disease",
  "Congestive heart failure",
  "Atrial fibrillation",
  "Chronic kidney disease",
  "Epilepsy",
  "Hypothyroidism",
  "GERD",
  "Migraine",
  "Depression / anxiety",
  "Cancer",
  "Chronic liver disease",
  "History of stroke / TIA",
  "Sickle cell disease",
];

export const MEDICATION_OPTIONS: string[] = [
  "Amlodipine 5 mg daily",
  "Lisinopril 10 mg daily",
  "Bisoprolol 5 mg daily",
  "Metformin 500 mg BID",
  "Insulin glargine",
  "Salbutamol inhaler PRN",
  "Omeprazole 20 mg daily",
  "Aspirin 81 mg daily",
  "Atorvastatin 20 mg daily",
  "Levothyroxine 50 mcg daily",
  "Warfarin",
  "Sumatriptan as needed",
];

export const TREATMENT_OPTIONS: string[] = [
  "Oxygen therapy started",
  "IV access obtained",
  "IV fluids (normal saline bolus)",
  "Analgesia given",
  "Antiemetic given",
  "Nebulizer given",
  "Cardiac monitoring started",
  "Wound cleaned and dressed",
  "Splint applied",
  "Urinary catheter placed",
  "Antibiotic first dose given",
  "Reduction and immobilization",
];

export const ORDER_OPTIONS: Partial<Record<OrderType, string[]>> = {
  laboratory: [
    "CBC (Complete Blood Count)",
    "Comprehensive metabolic panel",
    "High-sensitivity troponin",
    "D-dimer",
    "Coagulation panel (PT/INR/aPTT)",
    "Arterial blood gas",
    "Lactate",
    "Urinalysis",
    "C-reactive protein",
    "Blood cultures",
    "Beta-hCG",
    "Blood glucose",
  ],
  imaging: [
    "Chest X-ray",
    "CT head (non-contrast)",
    "CT chest (PE protocol)",
    "CT abdomen/pelvis",
    "Abdominal ultrasound",
    "FAST ultrasound",
    "X-ray extremity",
    "MRI brain",
  ],
  medication: [
    "Aspirin 324 mg PO",
    "Paracetamol 1 g IV",
    "Morphine 2 mg IV",
    "Ondansetron 4 mg IV",
    "Ceftriaxone 1 g IV",
    "Salbutamol nebulizer",
    "Normal saline 1 L IV",
    "Adrenaline 0.5 mg IM",
    "Hydrocortisone 100 mg IV",
    "Furosemide 40 mg IV",
  ],
  procedure: [
    "12-lead ECG",
    "IV cannulation",
    "Suturing / laceration repair",
    "Wound dressing",
    "Urinary catheter insertion",
    "Nasogastric tube insertion",
    "Fracture reduction",
    "Incision and drainage",
  ],
  consultation: [
    "Cardiology",
    "General surgery",
    "Orthopedics",
    "Neurology",
    "Obstetrics & gynecology",
    "Psychiatry",
    "ENT",
    "Ophthalmology",
  ],
  blood_product: [
    "Packed red blood cells",
    "Fresh frozen plasma",
    "Platelets",
    "Cryoprecipitate",
  ],
  monitoring: [
    "Continuous cardiac monitoring",
    "Continuous pulse oximetry",
    "Hourly neuro observations",
    "Strict fluid balance",
  ],
};

export function orderOptionsFor(type: OrderType): string[] {
  return ORDER_OPTIONS[type] ?? [];
}

// --- Catalogs for the first-class domain tabs ------------------------------

export const ROUTE_OPTIONS: string[] = ["PO", "IV", "IM", "SC", "PR", "SL", "Inhaled", "Topical", "Nebulized"];

export const FREQUENCY_OPTIONS: string[] = ["Once daily", "BID", "TID", "QID", "PRN", "Every 4h", "Every 6h", "Every 8h", "Weekly", "STAT"];

export const CONDITION_CATEGORY_OPTIONS: string[] = [
  "Cardiovascular",
  "Respiratory",
  "Endocrine",
  "Neurological",
  "Gastrointestinal",
  "Renal",
  "Musculoskeletal",
  "Psychiatric",
  "Infectious",
  "Oncologic",
];

export const RESULT_OPTIONS: { name: string; unit: string; referenceRange: string }[] = [
  { name: "Hemoglobin", unit: "g/dL", referenceRange: "12.0-16.0" },
  { name: "White blood cells", unit: "10^9/L", referenceRange: "4.0-11.0" },
  { name: "Platelets", unit: "10^9/L", referenceRange: "150-400" },
  { name: "Sodium", unit: "mmol/L", referenceRange: "135-145" },
  { name: "Potassium", unit: "mmol/L", referenceRange: "3.5-5.0" },
  { name: "Creatinine", unit: "mg/dL", referenceRange: "0.6-1.3" },
  { name: "Glucose", unit: "mg/dL", referenceRange: "70-110" },
  { name: "Troponin I (hs)", unit: "ng/L", referenceRange: "<14" },
  { name: "CRP", unit: "mg/L", referenceRange: "<5" },
  { name: "Lactate", unit: "mmol/L", referenceRange: "0.5-2.2" },
];

export const RESULT_NAME_OPTIONS: string[] = RESULT_OPTIONS.map((r) => r.name);

export function resultMetaFor(name: string): { unit: string; referenceRange: string } | null {
  const match = RESULT_OPTIONS.find((r) => r.name.toLowerCase() === name.trim().toLowerCase());
  return match ? { unit: match.unit, referenceRange: match.referenceRange } : null;
}

export const IMMUNIZATION_OPTIONS: string[] = [
  "Tetanus (Td/Tdap)",
  "Influenza",
  "COVID-19",
  "Hepatitis B",
  "Pneumococcal (PPSV23)",
  "MMR",
  "Varicella",
  "Rabies post-exposure",
  "Meningococcal",
  "HPV",
];

export const PROCEDURE_OPTIONS: string[] = [
  "Laceration repair (suturing)",
  "Incision and drainage",
  "Fracture reduction",
  "Joint reduction",
  "Central line insertion",
  "Lumbar puncture",
  "Chest tube insertion",
  "Endotracheal intubation",
  "Plaster cast application",
  "Foreign body removal",
  "Wound debridement",
];

export const PROCEDURE_CATEGORY_OPTIONS: string[] = [
  "Wound care",
  "Orthopedic",
  "Airway",
  "Vascular access",
  "Diagnostic",
  "Resuscitation",
];

export const PROGRAM_OPTIONS: string[] = [
  "Chronic disease management",
  "Diabetes care program",
  "Hypertension follow-up",
  "Smoking cessation",
  "Cancer screening",
  "Cardiac rehabilitation",
  "Anticoagulation clinic",
  "Mental health support",
];

export const BILLING_OPTIONS: { code: string; description: string; category: string; amount: number }[] = [
  { code: "ER-CONS", description: "Emergency consultation", category: "Consultation", amount: 120 },
  { code: "LAB-CBC", description: "Complete blood count", category: "Laboratory", amount: 35 },
  { code: "LAB-CMP", description: "Comprehensive metabolic panel", category: "Laboratory", amount: 45 },
  { code: "IMG-CXR", description: "Chest radiograph", category: "Imaging", amount: 80 },
  { code: "IMG-CT", description: "CT scan", category: "Imaging", amount: 350 },
  { code: "PROC-SUT", description: "Laceration repair", category: "Procedure", amount: 150 },
  { code: "MED-IV", description: "IV medication administration", category: "Medication", amount: 40 },
  { code: "OBS-BED", description: "Observation bed (per hour)", category: "Facility", amount: 60 },
];

export const BILLING_DESCRIPTION_OPTIONS: string[] = BILLING_OPTIONS.map((b) => b.description);

export function billingMetaFor(description: string): { code: string; category: string; amount: number } | null {
  const match = BILLING_OPTIONS.find((b) => b.description.toLowerCase() === description.trim().toLowerCase());
  return match ? { code: match.code, category: match.category, amount: match.amount } : null;
}

export const ATTACHMENT_TITLE_OPTIONS: string[] = [
  "Chest X-ray image",
  "CT scan report",
  "ECG tracing",
  "Discharge summary",
  "Referral letter",
  "Consent form",
  "Insurance card",
  "Wound photograph",
  "Laboratory report",
];
