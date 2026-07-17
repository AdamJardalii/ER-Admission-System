import type { OrderType } from "../types";

// Mock option catalogs shared by searchable clinical selectors. Forms persist
// the chosen values, while custom entries remain available for clinical detail.
export type ChiefComplaintCategoryId =
  | "common"
  | "cardiovascular"
  | "respiratory"
  | "neurological"
  | "gastrointestinal"
  | "trauma_injury"
  | "musculoskeletal"
  | "general_infectious"
  | "allergic_dermatological"
  | "genitourinary"
  | "obgyn"
  | "pediatric"
  | "mental_health"
  | "toxicology_exposure"
  | "ent_eye_dental"
  | "other";

export type ChiefComplaintOption = {
  id: string;
  label: string;
  category: Exclude<ChiefComplaintCategoryId, "common">;
  keywords: string[];
  common: boolean;
  active: boolean;
  pediatricApplicable?: boolean;
  pregnancyRelevant?: boolean;
  sexRelevance?: "female" | "male";
  sortPriority?: number;
};

export const CHIEF_COMPLAINT_CATEGORIES: { id: ChiefComplaintCategoryId; label: string }[] = [
  { id: "common", label: "Common" },
  { id: "cardiovascular", label: "Cardiovascular" },
  { id: "respiratory", label: "Respiratory" },
  { id: "neurological", label: "Neurological" },
  { id: "gastrointestinal", label: "Gastrointestinal" },
  { id: "trauma_injury", label: "Trauma and injury" },
  { id: "musculoskeletal", label: "Musculoskeletal" },
  { id: "general_infectious", label: "General and infectious" },
  { id: "allergic_dermatological", label: "Allergic and dermatological" },
  { id: "genitourinary", label: "Genitourinary" },
  { id: "obgyn", label: "Obstetric and gynecological" },
  { id: "pediatric", label: "Pediatric" },
  { id: "mental_health", label: "Mental health and behavioral" },
  { id: "toxicology_exposure", label: "Toxicology and exposure" },
  { id: "ent_eye_dental", label: "ENT, eye and dental" },
  { id: "other", label: "Other" },
];

const COMMON_CHIEF_COMPLAINTS = new Set([
  "Chest pain",
  "Shortness of breath",
  "Abdominal pain",
  "Fever",
  "Headache",
  "Dizziness",
  "Fall",
  "Back pain",
  "General weakness",
  "Nausea and vomiting",
  "Allergic reaction",
  "Altered mental status",
]);

const CHIEF_COMPLAINT_KEYWORDS: Record<string, string[]> = {
  "Shortness of breath": ["sob", "dyspnea", "breathing", "difficulty breathing"],
  "Loss of consciousness": ["loc", "passed out", "fainted", "blackout"],
  "Syncope": ["loc", "faint", "passed out"],
  "Motor vehicle collision": ["mva", "mvc", "car accident", "road traffic accident"],
  "Nausea and vomiting": ["n/v", "nv", "emesis", "vomiting"],
  "Altered mental status": ["ams", "confusion", "not acting right"],
  "Suspected stroke": ["cva", "stroke", "facial droop", "weakness", "aphasia"],
  "Chest pain": ["cp", "chest pressure", "tightness"],
  "Palpitations": ["heart racing", "rapid heartbeat"],
  "Coughing blood": ["hemoptysis"],
  "High blood pressure": ["hypertension", "htn"],
  "Low blood pressure": ["hypotension"],
  "Abdominal pain in pregnancy": ["pregnancy pain", "pregnant abdominal pain"],
  "Pregnancy-related concern": ["pregnant", "pregnancy"],
  "Medication overdose": ["od", "overdose"],
  "Drug intoxication": ["intoxication", "substance use"],
  "Alcohol intoxication": ["etoh", "alcohol"],
  "Suspected ingestion": ["ingestion", "swallowed"],
  "Suicidal thoughts": ["si", "suicide"],
  "Self-harm": ["cutting", "self injury"],
  "Vaginal bleeding": ["bleeding pregnancy", "ob bleeding"],
  "Fever in child": ["pediatric fever", "child fever"],
};

const CHIEF_COMPLAINT_GROUPS: Record<Exclude<ChiefComplaintCategoryId, "common">, string[]> = {
  cardiovascular: ["Chest pain", "Palpitations", "Syncope", "Near syncope", "High blood pressure", "Low blood pressure", "Leg swelling", "Rapid heart rate", "Slow heart rate", "Cardiac arrest", "Chest tightness"],
  respiratory: ["Shortness of breath", "Cough", "Wheezing", "Difficulty breathing", "Low oxygen saturation", "Coughing blood", "Choking", "Asthma exacerbation", "COPD exacerbation", "Respiratory arrest", "Suspected aspiration"],
  neurological: ["Headache", "Dizziness", "Altered mental status", "Loss of consciousness", "Seizure", "Weakness", "One-sided weakness", "Numbness or tingling", "Difficulty speaking", "Confusion", "Suspected stroke", "Vision changes", "Unsteady gait"],
  gastrointestinal: ["Abdominal pain", "Nausea", "Vomiting", "Nausea and vomiting", "Diarrhea", "Constipation", "Blood in stool", "Vomiting blood", "Difficulty swallowing", "Abdominal distension", "Loss of appetite", "Rectal pain"],
  trauma_injury: ["Fall", "Motor vehicle collision", "Head injury", "Laceration", "Burn", "Crush injury", "Penetrating injury", "Gunshot wound", "Stab wound", "Suspected fracture", "Dislocation", "Blunt trauma", "Sports injury", "Workplace injury", "Assault", "Animal bite", "Human bite"],
  musculoskeletal: ["Back pain", "Neck pain", "Shoulder pain", "Arm pain", "Wrist or hand pain", "Hip pain", "Leg pain", "Knee pain", "Ankle or foot pain", "Joint swelling", "Muscle pain", "Difficulty walking"],
  general_infectious: ["Fever", "Chills", "General weakness", "Fatigue", "Dehydration", "Suspected infection", "Suspected sepsis", "Body aches", "Unexplained weight loss", "Postoperative concern", "Abnormal laboratory result", "Medical device problem"],
  allergic_dermatological: ["Allergic reaction", "Anaphylaxis", "Rash", "Itching", "Facial swelling", "Lip or tongue swelling", "Skin infection", "Cellulitis", "Abscess", "Wound check", "Insect bite or sting", "Pressure injury"],
  genitourinary: ["Painful urination", "Blood in urine", "Difficulty urinating", "Urinary retention", "Flank pain", "Frequent urination", "Reduced urine output", "Testicular pain", "Penile pain or swelling", "Suspected urinary infection"],
  obgyn: ["Vaginal bleeding", "Pelvic pain", "Pregnancy-related concern", "Abdominal pain in pregnancy", "Reduced fetal movement", "Labor contractions", "Rupture of membranes", "Postpartum bleeding", "Vaginal discharge", "Suspected miscarriage", "Ectopic pregnancy concern", "Sexual assault evaluation"],
  pediatric: ["Fever in child", "Difficulty breathing in child", "Poor feeding", "Persistent crying", "Reduced activity", "Vomiting in child", "Diarrhea in child", "Rash in child", "Pediatric seizure", "Pediatric injury", "Suspected ingestion", "Concern from parent or caregiver"],
  mental_health: ["Anxiety", "Panic attack", "Agitation", "Aggressive behavior", "Depression", "Suicidal thoughts", "Self-harm", "Hallucinations", "Psychosis", "Behavioral change", "Substance-related behavioral concern", "Request for psychiatric assessment"],
  toxicology_exposure: ["Medication overdose", "Drug intoxication", "Alcohol intoxication", "Poisoning", "Chemical exposure", "Smoke inhalation", "Carbon monoxide exposure", "Electrical injury", "Heat exposure", "Heat exhaustion", "Hypothermia", "Suspected ingestion"],
  ent_eye_dental: ["Eye pain", "Eye injury", "Vision loss", "Red eye", "Foreign body in eye", "Ear pain", "Hearing loss", "Nosebleed", "Sore throat", "Foreign body in throat", "Dental pain", "Facial pain", "Facial injury"],
  other: ["Medication refill request", "Medication reaction", "Follow-up concern", "Social concern", "Request for medical assessment", "Other / not listed"],
};

function complaintId(category: string, label: string) {
  return `${category}-${label.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

export const CHIEF_COMPLAINT_CATALOG: ChiefComplaintOption[] = Object.entries(CHIEF_COMPLAINT_GROUPS).flatMap(([category, labels]) =>
  labels.map((label, index) => ({
    id: complaintId(category, label),
    label,
    category: category as ChiefComplaintOption["category"],
    keywords: CHIEF_COMPLAINT_KEYWORDS[label] ?? [],
    common: COMMON_CHIEF_COMPLAINTS.has(label),
    active: true,
    pediatricApplicable: category === "pediatric" || label.toLowerCase().includes("child"),
    pregnancyRelevant: category === "obgyn" || label.toLowerCase().includes("pregnancy") || label.toLowerCase().includes("fetal"),
    sexRelevance: category === "obgyn" ? "female" : label.toLowerCase().includes("testicular") || label.toLowerCase().includes("penile") ? "male" : undefined,
    sortPriority: COMMON_CHIEF_COMPLAINTS.has(label) ? index : undefined,
  })),
);

export const CHIEF_COMPLAINT_RECENT_MOCK = [
  "Chest pain",
  "Fever",
  "Fall",
  "Abdominal pain",
  "Shortness of breath",
];

export const CHIEF_COMPLAINT_OPTIONS: string[] = [...new Set(CHIEF_COMPLAINT_CATALOG.map((complaint) => complaint.label))];

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

export type Icd10ConditionOption = {
  code: string;
  diagnosis: string;
  category: string;
  search: string[];
};

// Curated ED-facing ICD-10-CM quick picks. The codes are common, billable
// diagnosis codes from the active FY2026 ICD-10-CM code set; the official CDC/
// CMS files remain the source of truth for exhaustive coding and sequencing.
export const ICD10_CONDITION_OPTIONS: Icd10ConditionOption[] = [
  { code: "R07.9", diagnosis: "Chest pain, unspecified", category: "Symptoms", search: ["chest pain", "cp"] },
  { code: "R06.02", diagnosis: "Shortness of breath", category: "Symptoms", search: ["sob", "dyspnea"] },
  { code: "R10.9", diagnosis: "Unspecified abdominal pain", category: "Symptoms", search: ["abdominal pain"] },
  { code: "R50.9", diagnosis: "Fever, unspecified", category: "Symptoms", search: ["fever"] },
  { code: "R51.9", diagnosis: "Headache, unspecified", category: "Symptoms", search: ["headache"] },
  { code: "R42", diagnosis: "Dizziness and giddiness", category: "Symptoms", search: ["dizziness", "vertigo"] },
  { code: "R55", diagnosis: "Syncope and collapse", category: "Symptoms", search: ["syncope", "collapse"] },
  { code: "R41.82", diagnosis: "Altered mental status, unspecified", category: "Neurological", search: ["ams", "confusion"] },
  { code: "R53.1", diagnosis: "Weakness", category: "Symptoms", search: ["weakness"] },
  { code: "R11.2", diagnosis: "Nausea with vomiting, unspecified", category: "Gastrointestinal", search: ["nausea", "vomiting"] },
  { code: "R19.7", diagnosis: "Diarrhea, unspecified", category: "Gastrointestinal", search: ["diarrhea"] },
  { code: "K52.9", diagnosis: "Noninfective gastroenteritis and colitis, unspecified", category: "Gastrointestinal", search: ["gastroenteritis"] },
  { code: "K35.80", diagnosis: "Unspecified acute appendicitis", category: "Gastrointestinal", search: ["appendicitis"] },
  { code: "N20.0", diagnosis: "Calculus of kidney", category: "Genitourinary", search: ["renal colic", "kidney stone"] },
  { code: "N39.0", diagnosis: "Urinary tract infection, site not specified", category: "Genitourinary", search: ["uti"] },
  { code: "N30.00", diagnosis: "Acute cystitis without hematuria", category: "Genitourinary", search: ["cystitis"] },
  { code: "J06.9", diagnosis: "Acute upper respiratory infection, unspecified", category: "Respiratory", search: ["uri"] },
  { code: "J18.9", diagnosis: "Pneumonia, unspecified organism", category: "Respiratory", search: ["pneumonia"] },
  { code: "J45.901", diagnosis: "Unspecified asthma with (acute) exacerbation", category: "Respiratory", search: ["asthma exacerbation"] },
  { code: "J44.1", diagnosis: "Chronic obstructive pulmonary disease with (acute) exacerbation", category: "Respiratory", search: ["copd exacerbation"] },
  { code: "U07.1", diagnosis: "COVID-19", category: "Infectious", search: ["covid"] },
  { code: "A41.9", diagnosis: "Sepsis, unspecified organism", category: "Infectious", search: ["sepsis"] },
  { code: "L03.90", diagnosis: "Cellulitis, unspecified", category: "Infectious", search: ["cellulitis"] },
  { code: "L02.91", diagnosis: "Cutaneous abscess, unspecified", category: "Infectious", search: ["abscess"] },
  { code: "T78.40XA", diagnosis: "Allergy, unspecified, initial encounter", category: "Allergic", search: ["allergic reaction"] },
  { code: "T78.2XXA", diagnosis: "Anaphylactic shock, unspecified, initial encounter", category: "Allergic", search: ["anaphylaxis"] },
  { code: "I10", diagnosis: "Essential (primary) hypertension", category: "Cardiovascular", search: ["hypertension", "htn"] },
  { code: "I21.4", diagnosis: "Non-ST elevation (NSTEMI) myocardial infarction", category: "Cardiovascular", search: ["nstemi", "mi"] },
  { code: "I20.9", diagnosis: "Angina pectoris, unspecified", category: "Cardiovascular", search: ["angina"] },
  { code: "I48.91", diagnosis: "Unspecified atrial fibrillation", category: "Cardiovascular", search: ["afib"] },
  { code: "I50.9", diagnosis: "Heart failure, unspecified", category: "Cardiovascular", search: ["heart failure", "chf"] },
  { code: "I63.9", diagnosis: "Cerebral infarction, unspecified", category: "Neurological", search: ["stroke", "cva"] },
  { code: "G45.9", diagnosis: "Transient cerebral ischemic attack, unspecified", category: "Neurological", search: ["tia"] },
  { code: "G40.909", diagnosis: "Epilepsy, unspecified, not intractable, without status epilepticus", category: "Neurological", search: ["seizure", "epilepsy"] },
  { code: "E11.9", diagnosis: "Type 2 diabetes mellitus without complications", category: "Endocrine", search: ["diabetes"] },
  { code: "E11.65", diagnosis: "Type 2 diabetes mellitus with hyperglycemia", category: "Endocrine", search: ["hyperglycemia"] },
  { code: "E16.2", diagnosis: "Hypoglycemia, unspecified", category: "Endocrine", search: ["hypoglycemia"] },
  { code: "E86.0", diagnosis: "Dehydration", category: "Metabolic", search: ["dehydration"] },
  { code: "N17.9", diagnosis: "Acute kidney failure, unspecified", category: "Renal", search: ["aki"] },
  { code: "S09.90XA", diagnosis: "Unspecified injury of head, initial encounter", category: "Trauma", search: ["head injury"] },
  { code: "S06.0X0A", diagnosis: "Concussion without loss of consciousness, initial encounter", category: "Trauma", search: ["concussion"] },
  { code: "S01.81XA", diagnosis: "Laceration without foreign body of other part of head, initial encounter", category: "Trauma", search: ["facial laceration"] },
  { code: "S61.411A", diagnosis: "Laceration without foreign body of right hand, initial encounter", category: "Trauma", search: ["hand laceration"] },
  { code: "S52.501A", diagnosis: "Unspecified fracture of lower end of right radius, initial encounter for closed fracture", category: "Trauma", search: ["distal radius fracture"] },
  { code: "M54.50", diagnosis: "Low back pain, unspecified", category: "Musculoskeletal", search: ["back pain"] },
  { code: "M25.561", diagnosis: "Pain in right knee", category: "Musculoskeletal", search: ["knee pain"] },
  { code: "F41.9", diagnosis: "Anxiety disorder, unspecified", category: "Mental health", search: ["anxiety"] },
  { code: "F32.A", diagnosis: "Depression, unspecified", category: "Mental health", search: ["depression"] },
  { code: "F10.929", diagnosis: "Alcohol use, unspecified with intoxication, unspecified", category: "Toxicology", search: ["alcohol intoxication"] },
  { code: "T50.901A", diagnosis: "Poisoning by unspecified drugs, medicaments and biological substances, accidental, initial encounter", category: "Toxicology", search: ["overdose", "poisoning"] },
  { code: "O26.899", diagnosis: "Other specified pregnancy related conditions, unspecified trimester", category: "Obstetric", search: ["pregnancy concern"] },
  { code: "O20.9", diagnosis: "Hemorrhage in early pregnancy, unspecified", category: "Obstetric", search: ["vaginal bleeding pregnancy"] },
];

export const ICD10_CONDITION_SELECT_OPTIONS = ICD10_CONDITION_OPTIONS.map((item) => ({
  value: item.code,
  label: `${item.code} - ${item.diagnosis}`,
}));

export function icd10ConditionMetaFor(code: string): Icd10ConditionOption | null {
  return ICD10_CONDITION_OPTIONS.find((item) => item.code === code) ?? null;
}

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

export const ASSESSMENT_SYMPTOM_OPTIONS: string[] = [
  "Chest pain: onset, location, radiation, severity, associated dyspnea/diaphoresis reviewed",
  "Shortness of breath: onset, exertional component, cough, wheeze, fever, chest pain reviewed",
  "Abdominal pain: location, migration, vomiting, diarrhea, urinary symptoms, pregnancy risk reviewed",
  "Headache: onset, severity, neurologic symptoms, fever, trauma, anticoagulant use reviewed",
  "Fever: duration, source symptoms, travel/exposure, immunosuppression risk reviewed",
  "Fall/trauma: mechanism, head strike, loss of consciousness, anticoagulant use reviewed",
  "Dizziness/syncope: prodrome, palpitations, neurologic symptoms, injury, recurrence reviewed",
  "Vomiting/diarrhea: duration, hydration status, blood, abdominal pain, sick contacts reviewed",
  "Allergic reaction: trigger, airway symptoms, rash, hypotension, prior anaphylaxis reviewed",
  "Mental health concern: safety risk, suicidal ideation, intoxication, hallucinations reviewed",
];

export const ASSESSMENT_HISTORY_OPTIONS: string[] = [
  "Past medical history reviewed with patient/caregiver",
  "Medication list reviewed and reconciliation pending",
  "Allergies reviewed and visible in chart header",
  "No known chronic medical problems reported",
  "Hypertension",
  "Diabetes mellitus",
  "Coronary artery disease / prior MI",
  "Asthma / COPD",
  "Chronic kidney disease",
  "Anticoagulant or antiplatelet therapy",
  "Pregnancy status considered where relevant",
  "Recent surgery, admission, or antibiotic exposure reviewed",
];

export const ASSESSMENT_EXAM_OPTIONS: string[] = [
  "Alert, oriented, speaking full sentences, no acute distress",
  "Ill-appearing or toxic-appearing; senior review required",
  "Airway patent; no stridor or facial/tongue swelling",
  "Breath sounds equal bilaterally; no wheeze or crackles",
  "Wheeze present; work of breathing increased",
  "Heart sounds regular; peripheral perfusion adequate",
  "Abdomen soft, non-distended, no peritonism",
  "Focal abdominal tenderness without rebound/guarding",
  "Neurologically intact; no focal motor or speech deficit",
  "Focal neurological deficit present; stroke pathway considered",
  "Extremity neurovascular status intact distal to injury",
  "Skin warm and dry; no mottling or cyanosis",
];

export const ASSESSMENT_IMPRESSION_OPTIONS: string[] = [
  "Acute coronary syndrome to rule out",
  "Non-cardiac chest pain likely, pending ECG/troponin correlation",
  "Asthma/COPD exacerbation",
  "Pneumonia or lower respiratory tract infection",
  "Sepsis possible; source evaluation in progress",
  "Gastroenteritis / dehydration",
  "Appendicitis, biliary disease, or other surgical abdomen to rule out",
  "Renal colic / urinary tract pathology",
  "Minor head injury with risk stratification",
  "Fracture or dislocation to rule out",
  "Migraine or primary headache likely",
  "Stroke/TIA to rule out",
  "Medication or allergic reaction",
  "Behavioral health crisis requiring safety assessment",
];

export const ASSESSMENT_PLAN_OPTIONS: string[] = [
  "ECG now and repeat if symptoms persist or evolve",
  "Serial troponin and cardiac monitoring",
  "CBC, chemistry, renal function, electrolytes",
  "Urinalysis and pregnancy test where clinically relevant",
  "Chest X-ray",
  "CT imaging if red flags or abnormal examination persist",
  "Analgesia and antiemetic; reassess response",
  "Oxygen/nebulizer therapy and reassess work of breathing",
  "IV fluids and repeat vital signs",
  "Antibiotics after cultures if infection/sepsis suspected",
  "Specialty consult requested",
  "Observation with repeat assessment and disposition decision",
  "Discharge if stable after treatment, results reviewed, and safety-net advice documented",
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
