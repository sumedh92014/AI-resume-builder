"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type BaseSectionId =
  | "education"
  | "workExperience"
  | "internships"
  | "projects"
  | "skills"
  | "certifications"
  | "positionsOfResponsibility"
  | "awards"
  | "extracurriculars";
type SectionId = BaseSectionId | `custom-${string}`;
type BaseContentSectionId = Exclude<BaseSectionId, "skills">;
type ContentSectionId = BaseContentSectionId | `custom-${string}`;

type SectionConfig = { id: SectionId; label: string; enabled: boolean };
type ContentSectionConfig = Omit<SectionConfig, "id"> & { id: ContentSectionId };

type ResumeEntry = {
  id: string;
  title: string;
  organization?: string;
  cgpa?: string;
  startDate?: string;
  endDate?: string;
  startMonth?: string;
  startYear?: string;
  endMonth?: string;
  endYear?: string;
  roughNotes?: string;
  bullets: string[];
};

type ResumeState = {
  header: { fullName: string; email: string; phone: string; linkedin: string; location: string };
  education: ResumeEntry[];
  workExperience: ResumeEntry[];
  internships: ResumeEntry[];
  projects: ResumeEntry[];
  skills: string;
  certifications: ResumeEntry[];
  positionsOfResponsibility: ResumeEntry[];
  awards: ResumeEntry[];
  extracurriculars: ResumeEntry[];
  customSections: Record<string, ResumeEntry[]>;
};

type BulletApiResult = {
  bestBullet: string;
  shorterBullet: string;
  impactBullet: string;
  metricQuestions: string[];
};

type AiEntryState = { loading: boolean; error?: string; result?: BulletApiResult };

const STORAGE_KEY = "ai-resume-builder-draft-v1";
const aiSupportedSections: BaseSectionId[] = ["workExperience", "internships", "projects"];

const initialSections: SectionConfig[] = [
  { id: "education", label: "Education", enabled: true },
  { id: "workExperience", label: "Work Experience", enabled: true },
  { id: "internships", label: "Internships", enabled: true },
  { id: "projects", label: "Projects", enabled: true },
  { id: "skills", label: "Skills", enabled: true },
  { id: "certifications", label: "Certifications", enabled: false },
  { id: "positionsOfResponsibility", label: "Positions of Responsibility", enabled: false },
  { id: "awards", label: "Awards / Achievements", enabled: false },
  { id: "extracurriculars", label: "Extra-curriculars", enabled: false },
];

const emptyEntry = (id: string): ResumeEntry => ({
  id,
  title: "",
  organization: "",
  cgpa: "",
  startDate: "",
  endDate: "",
  startMonth: "",
  startYear: "",
  endMonth: "",
  endYear: "",
  roughNotes: "",
  bullets: [""],
});

const initialResume: ResumeState = {
  header: {
    fullName: "Your Name",
    email: "you@email.com",
    phone: "+91 98765 43210",
    linkedin: "linkedin.com/in/yourprofile",
    location: "Bengaluru, India",
  },
  education: [emptyEntry("education-1")],
  workExperience: [emptyEntry("work-1")],
  internships: [emptyEntry("internship-1")],
  projects: [emptyEntry("project-1")],
  skills: "Product Strategy | SQL | Excel | Growth Analytics | User Research",
  certifications: [],
  positionsOfResponsibility: [],
  awards: [],
  extracurriculars: [],
  customSections: {},
};

type StoredDraft = {
  sections: SectionConfig[];
  resume: ResumeState;
  collapsedSections: Record<string, boolean>;
};

function loadDraftFromStorage(): StoredDraft {
  if (typeof window === "undefined") {
    return {
      sections: initialSections,
      resume: initialResume,
      collapsedSections: {},
    };
  }

  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return {
      sections: initialSections,
      resume: initialResume,
      collapsedSections: {},
    };
  }

  try {
    const parsed = JSON.parse(saved) as Partial<StoredDraft>;
    return {
      sections: parsed.sections || initialSections,
      resume: parsed.resume
        ? { ...parsed.resume, customSections: parsed.resume.customSections || {} }
        : initialResume,
      collapsedSections: parsed.collapsedSections || {},
    };
  } catch {
    return {
      sections: initialSections,
      resume: initialResume,
      collapsedSections: {},
    };
  }
}

const shorteners = [
  { from: /\bresponsible for\b/gi, to: "led" },
  { from: /\bin order to\b/gi, to: "to" },
  { from: /\bworked on\b/gi, to: "delivered" },
  { from: /\butilized\b/gi, to: "used" },
  { from: /\bvarious\b/gi, to: "" },
  { from: /\bsuccessfully\b/gi, to: "" },
  { from: /\bvery\b/gi, to: "" },
  { from: /\bthat\b/gi, to: "" },
];

const monthMap: Record<string, string> = {
  jan: "January",
  january: "January",
  feb: "February",
  february: "February",
  mar: "March",
  march: "March",
  apr: "April",
  april: "April",
  may: "May",
  jun: "June",
  june: "June",
  jul: "July",
  july: "July",
  aug: "August",
  august: "August",
  sep: "September",
  sept: "September",
  september: "September",
  oct: "October",
  october: "October",
  nov: "November",
  november: "November",
  dec: "December",
  december: "December",
};

function capitalizeFirstLetter(text: string) {
  const t = text.trim();
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function normalizeMonth(text: string) {
  const key = text.trim().toLowerCase();
  return monthMap[key] || capitalizeFirstLetter(text);
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, "");
}

function compressBulletText(bullet: string) {
  let next = stripHtml(bullet).replace(/\s+/g, " ").trim();
  for (const r of shorteners) next = next.replace(r.from, r.to);
  next = next.replace(/\s+,/g, ",").replace(/\s{2,}/g, " ").trim();
  return next.length > 145 ? `${next.slice(0, 142).trimEnd()}...` : next;
}

export default function Home() {
  const [sections, setSections] = useState<SectionConfig[]>(() => loadDraftFromStorage().sections);
  const [resume, setResume] = useState<ResumeState>(() => loadDraftFromStorage().resume);
  const [aiStateByEntry, setAiStateByEntry] = useState<Record<string, AiEntryState>>({});
  const [guardrailMessage, setGuardrailMessage] = useState("");
  const [draggingSectionId, setDraggingSectionId] = useState<SectionId | null>(null);
  const [customSectionName, setCustomSectionName] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [previewScale, setPreviewScale] = useState(1);
  const [sectionHeaderColor, setSectionHeaderColor] = useState("#000000");
  const [mounted, setMounted] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(
    () => loadDraftFromStorage().collapsedSections,
  );
  const previewRef = useRef<HTMLDivElement | null>(null);
  const bulletRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const getEntries = useCallback(
    (sectionId: ContentSectionId): ResumeEntry[] =>
      sectionId.startsWith("custom-")
        ? resume.customSections[sectionId] || []
        : resume[sectionId as BaseContentSectionId],
    [resume],
  );

  const setEntries = (sectionId: ContentSectionId, entries: ResumeEntry[]) => {
    if (sectionId.startsWith("custom-")) {
      setResume((prev) => ({
        ...prev,
        customSections: { ...prev.customSections, [sectionId]: entries },
      }));
    } else {
      setResume((prev) => ({ ...prev, [sectionId as BaseContentSectionId]: entries }));
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sections, resume, collapsedSections }));
  }, [sections, resume, collapsedSections]);

  const saveDraftNow = () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ sections, resume, collapsedSections }),
    );
    const now = new Date();
    setSaveMessage(`Saved at ${now.toLocaleTimeString()}`);
  };

  const toggleSectionCollapse = (sectionId: SectionId) => {
    setCollapsedSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const orderedContentSections = sections.filter(
    (section): section is ContentSectionConfig => section.id !== "skills",
  );
  const enabledSections = sections.filter((section) => section.enabled);

  const fullness = useMemo(() => {
    const base = 20;
    const sectionWeight = sections.filter((s) => s.enabled).length * 7;
    const entryCount = orderedContentSections.reduce(
      (total, section) => total + getEntries(section.id).length,
      0,
    );
    const bulletCount = orderedContentSections.reduce(
      (total, section) =>
        total +
        getEntries(section.id).reduce(
          (sum, entry) => sum + entry.bullets.filter((b) => b.trim().length > 0).length,
          0,
        ),
      0,
    );
    return Math.min(140, base + sectionWeight + entryCount * 5 + bulletCount * 3);
  }, [sections, orderedContentSections, getEntries]);

  const fitStatus =
    fullness <= 100
      ? { label: "Fits in 1 page", tone: "text-emerald-700 bg-emerald-50" }
      : fullness <= 110
        ? { label: "Slightly long", tone: "text-amber-700 bg-amber-50" }
        : { label: "Too long", tone: "text-red-700 bg-red-50" };

  const overflowPercent = Math.max(0, fullness - 100);
  const overflowBullets = Math.max(0, Math.ceil(overflowPercent / 4));

  const sectionScores = orderedContentSections.map((section) => ({
    sectionId: section.id,
    label: section.label,
    score: getEntries(section.id).reduce((total, entry) => {
      const titleScore = entry.title.trim().length > 0 ? 1 : 0;
      const bulletScore = entry.bullets
        .filter((b) => b.trim().length > 0)
        .reduce((sum, b) => sum + Math.ceil(b.length / 90), 0);
      return total + titleScore + bulletScore;
    }, 0),
  }));
  const topOverflowSections = [...sectionScores]
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .filter((item) => item.score > 0);

  const toggleSection = (sectionId: SectionId) =>
    setSections((prev) => {
      const target = prev.find((section) => section.id === sectionId);
      const nextEnabled = target ? !target.enabled : true;

      if (nextEnabled && sectionId !== "skills") {
        setResume((prevResume) => {
          if (sectionId.startsWith("custom-")) {
            const existing = prevResume.customSections[sectionId] || [];
            if (existing.length > 0) return prevResume;
            return {
              ...prevResume,
              customSections: {
                ...prevResume.customSections,
                [sectionId]: [emptyEntry(`${sectionId}-${Date.now()}`)],
              },
            };
          }

          const key = sectionId as BaseContentSectionId;
          const existing = prevResume[key];
          if (existing.length > 0) return prevResume;
          return {
            ...prevResume,
            [key]: [emptyEntry(`${key}-${Date.now()}`)],
          };
        });
      }

      return prev.map((section) =>
        section.id === sectionId ? { ...section, enabled: !section.enabled } : section,
      );
    });

  const moveSectionById = (draggedId: SectionId, targetId: SectionId) => {
    if (draggedId === targetId) return;
    setSections((prev) => {
      const next = [...prev];
      const fromIndex = next.findIndex((s) => s.id === draggedId);
      const toIndex = next.findIndex((s) => s.id === targetId);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const addCustomSection = () => {
    const label = customSectionName.trim();
    if (!label) return;
    const sectionId = `custom-${Date.now()}` as const;
    setSections((prev) => [...prev, { id: sectionId, label, enabled: true }]);
    setResume((prev) => ({
      ...prev,
      customSections: { ...prev.customSections, [sectionId]: [emptyEntry(`${sectionId}-1`)] },
    }));
    setCustomSectionName("");
  };

  const deleteSection = (sectionId: SectionId) => {
    const sectionMeta = sections.find((section) => section.id === sectionId);
    const label = sectionMeta?.label || "this section";
    const isCustomSection = sectionId.startsWith("custom-");
    const confirmed = window.confirm(
      isCustomSection
        ? `Delete "${label}" section and all its entries? This cannot be undone.`
        : `Disable and clear "${label}" section content? This cannot be undone.`,
    );
    if (!confirmed) return;

    if (sectionId.startsWith("custom-")) {
      setSections((prev) => prev.filter((section) => section.id !== sectionId));
      setResume((prev) => {
        const nextCustom = { ...prev.customSections };
        delete nextCustom[sectionId];
        return { ...prev, customSections: nextCustom };
      });
      return;
    }

    setSections((prev) =>
      prev.map((section) => (section.id === sectionId ? { ...section, enabled: false } : section)),
    );

    if (sectionId === "skills") {
      setResume((prev) => ({ ...prev, skills: "" }));
      return;
    }

    setResume((prev) => ({ ...prev, [sectionId]: [] }));
  };

  const addEntry = (sectionId: ContentSectionId) =>
    setEntries(sectionId, [...getEntries(sectionId), emptyEntry(`${sectionId}-${Date.now()}`)]);

  const deleteEntry = (sectionId: ContentSectionId, entryId: string) =>
    setEntries(
      sectionId,
      getEntries(sectionId).filter((entry) => entry.id !== entryId),
    );

  const updateEntry = (
    sectionId: ContentSectionId,
    entryId: string,
    field: keyof ResumeEntry,
    value: string,
  ) =>
    setEntries(
      sectionId,
      getEntries(sectionId).map((entry) => (entry.id === entryId ? { ...entry, [field]: value } : entry)),
    );

  const normalizeEntryField = (
    sectionId: ContentSectionId,
    entryId: string,
    field: keyof ResumeEntry,
  ) => {
    const entry = getEntries(sectionId).find((item) => item.id === entryId);
    if (!entry) return;
    const raw = String(entry[field] || "");
    let next = raw;
    if (field === "startMonth" || field === "endMonth") {
      next = normalizeMonth(raw);
    } else if (
      field === "title" ||
      field === "organization" ||
      field === "startDate" ||
      field === "endDate"
    ) {
      next = capitalizeFirstLetter(raw);
    }
    if (next !== raw) updateEntry(sectionId, entryId, field, next);
  };

  const updateBullet = (
    sectionId: ContentSectionId,
    entryId: string,
    bulletIndex: number,
    value: string,
  ) =>
    setEntries(
      sectionId,
      getEntries(sectionId).map((entry) => {
        if (entry.id !== entryId) return entry;
        const bullets = [...entry.bullets];
        bullets[bulletIndex] = value;
        return { ...entry, bullets };
      }),
    );

  const normalizeBullet = (
    sectionId: ContentSectionId,
    entryId: string,
    bulletIndex: number,
  ) => {
    const entry = getEntries(sectionId).find((item) => item.id === entryId);
    if (!entry) return;
    const current = entry.bullets[bulletIndex] || "";
    const plain = stripHtml(current);
    const normalized = capitalizeFirstLetter(plain);
    if (normalized && normalized !== plain) {
      updateBullet(sectionId, entryId, bulletIndex, normalized);
    }
  };

  const addBullet = (sectionId: ContentSectionId, entryId: string) =>
    setEntries(
      sectionId,
      getEntries(sectionId).map((entry) =>
        entry.id === entryId ? { ...entry, bullets: [...entry.bullets, ""] } : entry,
      ),
    );

  const normalizeBulletHtml = (html: string) =>
    html
      .replace(/<(?!\/?(strong|b|br)\b)[^>]*>/gi, "")
      .replace(/<b>/gi, "<strong>")
      .replace(/<\/b>/gi, "</strong>");

  const shortenSingleBullet = (sectionId: ContentSectionId, entryId: string, bulletIndex: number) =>
    setEntries(
      sectionId,
      getEntries(sectionId).map((entry) => {
        if (entry.id !== entryId) return entry;
        const bullets = [...entry.bullets];
        bullets[bulletIndex] = compressBulletText(bullets[bulletIndex] || "");
        return { ...entry, bullets };
      }),
    );

  const hasMinimumContent = () =>
    ["education", "workExperience", "internships", "projects"].some((sectionId) =>
      getEntries(sectionId as ContentSectionId).some(
        (entry) =>
          entry.title.trim().length > 0 ||
          entry.organization?.trim().length ||
          entry.bullets.some((b) => b.trim().length > 0),
      ),
    );

  const runPreExportChecks = () => {
    const errors: string[] = [];
    if (!resume.header.fullName.trim()) errors.push("Add your full name.");
    if (!resume.header.email.trim()) errors.push("Add your email.");
    if (!hasMinimumContent()) {
      errors.push("Add at least one education, experience, internship, or project entry.");
    }
    setGuardrailMessage(errors.length === 0 ? "Looks good for export checks." : `Fix: ${errors.join(" ")}`);
    return errors.length === 0;
  };

  const exportToPdf = () => {
    const isValid = runPreExportChecks();
    if (!isValid) return;
    document.body.classList.add("printing-resume");
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.body.classList.remove("printing-resume");
      }, 300);
    }, 50);
  };

  const applyBulletOption = (sectionId: ContentSectionId, entryId: string, bullet: string) =>
    setEntries(
      sectionId,
      getEntries(sectionId).map((entry) => {
        if (entry.id !== entryId) return entry;
        const nextBullets = [...entry.bullets];
        const emptyIndex = nextBullets.findIndex((item) => item.trim().length === 0);
        if (emptyIndex >= 0) nextBullets[emptyIndex] = bullet;
        else nextBullets.unshift(bullet);
        return { ...entry, bullets: nextBullets };
      }),
    );

  const generateBulletOptions = async (sectionId: ContentSectionId, entry: ResumeEntry) => {
    const roughNotes = entry.roughNotes?.trim() || "";
    if (!roughNotes) {
      setAiStateByEntry((prev) => ({ ...prev, [entry.id]: { loading: false, error: "Add rough notes first." } }));
      return;
    }
    setAiStateByEntry((prev) => ({ ...prev, [entry.id]: { loading: true } }));
    try {
      const response = await fetch("/api/ai/bullets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
	 section: sectionId, 
	 roleOrTitle: entry.title,
	 organization: entry.organization,
	 roughNotes,
	 }),
      });
      if (!response.ok) throw new Error();
const data = (await response.json()) as BulletApiResult;
 setAiStateByEntry((prev) => ({ 
...prev,
 [entry.id]: { loading: false, result: data }
 }));
    } catch {
      setAiStateByEntry((prev) => ({ ...prev, [entry.id]: { loading: false, error: "Could not generate bullets. Please try again." } }));
    }
  };

  const makeItFitOnePage = () => {
    const candidates: Array<{ sectionId: ContentSectionId; entryId: string; bulletIndex: number; text: string }> = [];
    for (const section of orderedContentSections) {
      for (const entry of getEntries(section.id)) {
        entry.bullets.forEach((bullet, bulletIndex) => {
          if (bullet.trim().length > 45) candidates.push({ sectionId: section.id, entryId: entry.id, bulletIndex, text: bullet });
        });
      }
    }
    candidates.sort((a, b) => b.text.length - a.text.length);
    const count = overflowBullets > 0 ? overflowBullets : 2;
    const selected = candidates.slice(0, count);
    for (const item of selected) shortenSingleBullet(item.sectionId, item.entryId, item.bulletIndex);
    if (selected.length === 0 && resume.skills.length > 65) {
      setResume((prev) => ({ ...prev, skills: compressBulletText(prev.skills) }));
    }
  };

  const formatDateRange = (entry: ResumeEntry) => {
    const start = [entry.startMonth, entry.startYear].filter(Boolean).join(" ");
    const end = [entry.endMonth, entry.endYear].filter(Boolean).join(" ");
    if (start || end) return `${start}${start || end ? " - " : ""}${end}`;
    return `${entry.startDate || ""}${entry.startDate || entry.endDate ? " - " : ""}${entry.endDate || ""}`;
  };

  const getAddEntryLabel = (sectionLabel: string) => `Add Another ${sectionLabel.replace(" / ", " ")}`;

  const getCollapsedSummary = (section: ContentSectionConfig, entries: ResumeEntry[]) => {
    const entryCount = entries.length;
    const bulletCount = entries.reduce(
      (total, entry) => total + entry.bullets.filter((b) => stripHtml(b).trim().length > 0).length,
      0,
    );

    if (section.id === "education") {
      return `${entryCount} education entr${entryCount === 1 ? "y" : "ies"} and ${bulletCount} bullet point${bulletCount === 1 ? "" : "s"}.`;
    }
    if (section.id === "workExperience") {
      return `${entryCount} compan${entryCount === 1 ? "y" : "ies"} and ${bulletCount} bullet point${bulletCount === 1 ? "" : "s"}.`;
    }
    if (section.id === "internships") {
      return `${entryCount} internship entr${entryCount === 1 ? "y" : "ies"} and ${bulletCount} bullet point${bulletCount === 1 ? "" : "s"}.`;
    }
    if (section.id === "projects") {
      return `${entryCount} project${entryCount === 1 ? "" : "s"} and ${bulletCount} bullet point${bulletCount === 1 ? "" : "s"}.`;
    }
    return `${entryCount} entr${entryCount === 1 ? "y" : "ies"} and ${bulletCount} bullet point${bulletCount === 1 ? "" : "s"}.`;
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <header className="print-hidden sticky top-0 z-20 border-b border-zinc-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1880px] flex-col gap-3 px-3 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-0.5">
            <h1 className="text-lg font-semibold tracking-tight">One-Page ATS Resume Builder</h1>
            <p className="text-xs text-zinc-500">Single template. One page. Recruiter-ready.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-3 py-1.5 text-xs font-semibold ${fitStatus.tone}`}>
              {fitStatus.label}: {fullness}%
            </span>
            <button
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium hover:bg-zinc-100"
              onClick={saveDraftNow}
            >
              Save
            </button>
            <button
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium hover:bg-zinc-100"
              onClick={makeItFitOnePage}
            >
              Make It Fit
            </button>
            <button
              className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
              onClick={runPreExportChecks}
            >
              Run Export Checks
            </button>
            <label className="ml-1 flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-600">
              Header Color
              <input
                type="color"
                value={sectionHeaderColor}
                onChange={(e) => setSectionHeaderColor(e.target.value)}
                className="h-5 w-7 cursor-pointer border-0 bg-transparent p-0"
              />
            </label>
            <div className="ml-1 flex items-center gap-1 rounded-md border border-zinc-300 bg-white p-1">
              <button
                className="rounded px-2 py-1 text-xs font-semibold hover:bg-zinc-100"
                onClick={() => setPreviewScale((prev) => Math.max(0.8, Number((prev - 0.05).toFixed(2))))}
              >
                -
              </button>
              <span className="px-1 text-[11px] text-zinc-600">
                {Math.round(previewScale * 100)}%
              </span>
              <button
                className="rounded px-2 py-1 text-xs font-semibold hover:bg-zinc-100"
                onClick={() => setPreviewScale((prev) => Math.min(1.35, Number((prev + 0.05).toFixed(2))))}
              >
                +
              </button>
            </div>
            <button
              className="rounded-md bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
              onClick={exportToPdf}
            >
              Export PDF
            </button>
          </div>
        </div>
        {guardrailMessage ? (
          <div className="mx-auto w-full max-w-[1880px] border-t border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
            {guardrailMessage}
          </div>
        ) : null}
        {saveMessage ? (
          <div className="mx-auto w-full max-w-[1880px] border-t border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
            {saveMessage}
          </div>
        ) : null}
      </header>

      <main className="print-root mx-auto grid w-full max-w-[1880px] gap-3 px-3 py-4 lg:grid-cols-[300px_minmax(520px,1fr)_minmax(560px,1fr)]">
        <aside className="print-hidden h-auto w-full overflow-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-sm lg:h-[calc(100vh-100px)] lg:w-[300px] lg:min-w-[300px] lg:max-w-[300px]">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Section Manager</h2>
          <div className="space-y-2">
            {sections.map((section) => (
              <div
                key={section.id}
                draggable
                onDragStart={() => setDraggingSectionId(section.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (draggingSectionId) moveSectionById(draggingSectionId, section.id);
                  setDraggingSectionId(null);
                }}
                onDragEnd={() => setDraggingSectionId(null)}
                className={`flex cursor-move items-center justify-between rounded-lg border px-3 py-2 text-sm transition ${
                  draggingSectionId === section.id
                    ? "border-cyan-500 bg-cyan-50"
                    : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
                }`}
              >
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={section.enabled}
                    onChange={() => toggleSection(section.id)}
                    className="h-4 w-4 accent-zinc-900"
                  />
                  <span>{section.label}</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded border border-red-300 px-1.5 py-0.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                    onClick={() => deleteSection(section.id)}
                    title="Delete section"
                    aria-label="Delete section"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-zinc-200 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Add Custom Section
            </p>
            <input
              className="mb-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none ring-zinc-900/10 placeholder:text-zinc-400 focus:ring-2"
              value={customSectionName}
              onChange={(e) => setCustomSectionName(e.target.value)}
              placeholder="Example: Publications"
            />
            <button
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50"
              onClick={addCustomSection}
            >
              Add Section
            </button>
          </div>
        </aside>

        <section className="print-hidden h-auto overflow-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-sm lg:h-[calc(100vh-100px)]">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Input Editor</h2>
          {overflowPercent > 0 ? (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              Resume is {fullness}% full. Reduce {overflowBullets} bullets, especially in{" "}
              {topOverflowSections.map((s) => s.label).join(" and ") || "long sections"}.
            </div>
          ) : (
            <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
              Great fit. Your resume currently fits in one page.
            </div>
          )}

          <div className="mb-6 space-y-3 border-b border-zinc-200 pb-5">
            <h3 className="text-sm font-semibold tracking-tight">Header</h3>
            <div className="grid gap-2 md:grid-cols-2">
              {([["fullName", "Full Name"], ["email", "Email"], ["phone", "Phone"], ["linkedin", "LinkedIn"], ["location", "Location"]] as const).map(([field, label]) => (
                <label key={field} className="text-xs">
                  <span className="mb-1 block text-zinc-600">{label}</span>
                  <input
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none ring-zinc-900/10 placeholder:text-zinc-400 focus:ring-2"
                    value={resume.header[field]}
                    onChange={(e) =>
                      setResume((prev) => ({
                        ...prev,
                        header: { ...prev.header, [field]: e.target.value },
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            {orderedContentSections.map((section) => {
              if (!section.enabled) return null;
              const entries = getEntries(section.id);
              const aiEnabled = aiSupportedSections.includes(section.id as BaseSectionId);
              return (
                <div key={section.id} className="border-b border-zinc-200 pb-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
                    <h3 className="text-sm font-semibold text-zinc-900">{section.label}</h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-100"
                        onClick={() => toggleSectionCollapse(section.id)}
                      >
                        {collapsedSections[section.id] ? "Expand" : "Collapse"}
                      </button>
                      <button
                        className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-100"
                        onClick={() => addEntry(section.id)}
                      >
                        {getAddEntryLabel(section.label)}
                      </button>
                    </div>
                  </div>
                  {collapsedSections[section.id] ? (
                    <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                      {getCollapsedSummary(section, entries)}
                    </div>
                  ) : (
                    <div className="space-y-4">
                    {entries.map((entry, entryIndex) => (
                      <div key={entry.id} className="rounded-lg border border-zinc-300 bg-zinc-50/40 p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5">
                          <p className="text-xs font-semibold text-zinc-700">
                            {section.label} #{entryIndex + 1}
                          </p>
                          <p className="text-[11px] text-zinc-500">Editing this block</p>
                        </div>
                        <div className="mb-2 grid gap-2 md:grid-cols-2">
                          <input className="rounded-md border border-zinc-300 px-3 py-2 text-sm" placeholder="Title / Role / Degree" value={entry.title} onChange={(e) => updateEntry(section.id, entry.id, "title", e.target.value)} onBlur={() => normalizeEntryField(section.id, entry.id, "title")} />
                          <input className="rounded-md border border-zinc-300 px-3 py-2 text-sm" placeholder="Organization" value={entry.organization} onChange={(e) => updateEntry(section.id, entry.id, "organization", e.target.value)} onBlur={() => normalizeEntryField(section.id, entry.id, "organization")} />
                          {section.id !== "workExperience" ? (
                            <>
                              <input className="rounded-md border border-zinc-300 px-3 py-2 text-sm" placeholder="Start Date" value={entry.startDate} onChange={(e) => updateEntry(section.id, entry.id, "startDate", e.target.value)} />
                              <input className="rounded-md border border-zinc-300 px-3 py-2 text-sm" placeholder="End Date / Present" value={entry.endDate} onChange={(e) => updateEntry(section.id, entry.id, "endDate", e.target.value)} />
                            </>
                          ) : (
                            <>
                              <div />
                              <div />
                            </>
                          )}
                        </div>
                        {section.id === "education" ? (
                          <div className="mb-2 grid gap-2 md:grid-cols-2">
                            <input
                              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                              placeholder="CGPA / Percentage"
                              value={entry.cgpa}
                              onChange={(e) => updateEntry(section.id, entry.id, "cgpa", e.target.value)}
                            />
                            <div />
                          </div>
                        ) : null}
                        {(section.id === "workExperience" ||
                          section.id === "internships" ||
                          section.id === "projects") ? (
                          <div className="mb-2 grid gap-2 md:grid-cols-4">
                            <input
                              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                              placeholder="Start Month"
                              value={entry.startMonth}
                              onChange={(e) =>
                                updateEntry(section.id, entry.id, "startMonth", e.target.value)
                              }
                              onBlur={() => normalizeEntryField(section.id, entry.id, "startMonth")}
                            />
                            <input
                              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                              placeholder="Start Year"
                              value={entry.startYear}
                              onChange={(e) =>
                                updateEntry(section.id, entry.id, "startYear", e.target.value)
                              }
                            />
                            <input
                              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                              placeholder="End Month"
                              value={entry.endMonth}
                              onChange={(e) =>
                                updateEntry(section.id, entry.id, "endMonth", e.target.value)
                              }
                              onBlur={() => normalizeEntryField(section.id, entry.id, "endMonth")}
                            />
                            <input
                              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                              placeholder="End Year / Present"
                              value={entry.endYear}
                              onChange={(e) =>
                                updateEntry(section.id, entry.id, "endYear", e.target.value)
                              }
                            />
                          </div>
                        ) : null}
                        {aiEnabled ? (
                          <div className="mb-2 space-y-2 rounded-md border border-zinc-200 bg-white p-2">
                            <textarea className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm" rows={3} placeholder="Rough notes for AI rewrite" value={entry.roughNotes || ""} onChange={(e) => updateEntry(section.id, entry.id, "roughNotes", e.target.value)} />
                            <button className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-50" onClick={() => generateBulletOptions(section.id, entry)}>{aiStateByEntry[entry.id]?.loading ? "Generating..." : "Generate AI Bullet Options"}</button>
                            {aiStateByEntry[entry.id]?.result ? (
                              <div className="space-y-2">
                                {(
                                  [
                                    ["Best", aiStateByEntry[entry.id]?.result?.bestBullet],
                                    ["Shorter", aiStateByEntry[entry.id]?.result?.shorterBullet],
                                    ["Impact", aiStateByEntry[entry.id]?.result?.impactBullet],
                                  ] as const
                                ).map(([label, option]) =>
                                  option ? (
                                    <div
                                      key={`${entry.id}-${label}`}
                                    className="rounded-md border border-zinc-200 bg-zinc-50 p-2"
                                  >
                                      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                                        {label}
                                      </p>
                                      <p className="text-xs">{option}</p>
                                      <button
                                        className="mt-1 rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-white"
                                        onClick={() =>
                                          applyBulletOption(section.id, entry.id, option)
                                        }
                                      >
                                        Use This
                                      </button>
                                    </div>
                                  ) : null,
                                )}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        {entry.bullets.map((bullet, index) => (
                          <div key={`${entry.id}-${index}`} className="mb-1">
                            <div
                              ref={(el) => {
                                bulletRefs.current[`${entry.id}-${index}`] = el;
                              }}
                              contentEditable
                              suppressContentEditableWarning
                              className="min-h-[64px] w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
                              onInput={(e) =>
                                updateBullet(
                                  section.id,
                                  entry.id,
                                  index,
                                  normalizeBulletHtml(e.currentTarget.innerHTML),
                                )
                              }
                              onBlur={() => normalizeBullet(section.id, entry.id, index)}
                              onKeyDown={(e) => {
                                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
                                  e.preventDefault();
                                  document.execCommand("bold");
                                }
                              }}
                              dangerouslySetInnerHTML={{
                                __html: bullet || "Type bullet here...",
                              }}
                            />
                            <div className="mt-1 flex justify-end gap-1">
                              <button className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-white" onClick={() => shortenSingleBullet(section.id, entry.id, index)}>Shorten</button>
                            </div>
                            </div>
                        ))}
                        <div className="mt-2 flex gap-2">
                          <button
                            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium hover:bg-zinc-100"
                            onClick={() => addBullet(section.id, entry.id)}
                          >
                            Add Bullet in This {section.label}
                          </button>
                          <button
                            className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                            onClick={() => deleteEntry(section.id, entry.id)}
                          >
                            Delete This {section.label}
                          </button>
                        </div>
                      </div>
                    ))}
                    </div>
                  )}
                </div>
              );
            })}
            {sections.find((s) => s.id === "skills")?.enabled ? <div><h3 className="mb-2 text-sm font-semibold tracking-tight">Skills</h3><textarea className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" rows={3} value={resume.skills} onChange={(e) => setResume((prev) => ({ ...prev, skills: e.target.value }))} /></div> : null}
          </div>
        </section>

        <section className="print-only-resume h-auto overflow-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-sm lg:h-[calc(100vh-100px)]">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Live Resume Preview</h2>
          <div
            ref={previewRef}
            className="print-preview-wrap mx-auto h-[842px] w-full overflow-hidden rounded-sm border border-zinc-300 bg-white px-8 py-7 shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
            style={{ maxWidth: `${Math.round(595 * previewScale)}px` }}
          >
            <div className="pb-2">
              <h1 className="text-[34px] font-semibold leading-tight" style={{ color: sectionHeaderColor }}>{resume.header.fullName}</h1>
              <div className="mt-3 h-[2px] w-full bg-black" />
              <p className="mt-2 truncate text-[10px] leading-[1.3] text-zinc-800">
                {resume.header.email} | {resume.header.phone}
                {resume.header.linkedin ? (
                  <>
                    {" | "}
                    <a
                      href={resume.header.linkedin}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      LinkedIn
                    </a>
                  </>
                ) : null}
                {resume.header.location ? ` | ${resume.header.location}` : ""}
              </p>
            </div>
            <div className="mt-3 space-y-3 text-[10px] leading-[1.32]">
              {enabledSections.map((section) => {
                if (section.id === "skills") return <div key={section.id}><h3 className="border-b border-zinc-300 pb-0.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: sectionHeaderColor }}>Skills</h3><p className="mt-1">{resume.skills}</p></div>;
                const entries = getEntries(section.id as ContentSectionId);
                if (entries.length === 0) return null;
                return (
                  <div key={section.id}>
                    <h3 className="border-b border-zinc-300 pb-0.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: sectionHeaderColor }}>{section.label}</h3>
                    <div className="mt-1.5 space-y-2">
                      {entries.map((entry) => (
                        <div key={entry.id}>
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[10px] font-semibold leading-[1.3]">{entry.title || "Title"} {entry.organization ? `| ${entry.organization}` : ""}</p>
                            <p className="shrink-0 text-[10px] leading-[1.3] text-zinc-700">{formatDateRange(entry)}</p>
                          </div>
                          {section.id === "education" && entry.cgpa ? (
                            <p className="text-[10px] leading-[1.3] text-zinc-700">CGPA: {entry.cgpa}</p>
                          ) : null}
                          <ul className="mt-0.5 list-disc pl-4 text-[10px] leading-[1.3]">
                            {entry.bullets
                              .filter((b) => b.trim().length > 0)
                              .map((b, i) => (
                                <li
                                  key={`${entry.id}-${i}`}
                                  dangerouslySetInnerHTML={{ __html: normalizeBulletHtml(b) }}
                                />
                              ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
