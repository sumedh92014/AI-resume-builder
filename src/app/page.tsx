"use client";

import { useEffect, useMemo, useState } from "react";

type SectionId =
  | "education"
  | "workExperience"
  | "internships"
  | "projects"
  | "skills"
  | "certifications"
  | "positionsOfResponsibility"
  | "awards"
  | "extracurriculars";

type SectionConfig = {
  id: SectionId;
  label: string;
  enabled: boolean;
};
type ContentSectionId = Exclude<SectionId, "skills">;
type ContentSectionConfig = Omit<SectionConfig, "id"> & { id: ContentSectionId };

type ResumeEntry = {
  id: string;
  title: string;
  organization?: string;
  startDate?: string;
  endDate?: string;
  roughNotes?: string;
  bullets: string[];
};

type ResumeState = {
  header: {
    fullName: string;
    email: string;
    phone: string;
    linkedin: string;
    location: string;
  };
  education: ResumeEntry[];
  workExperience: ResumeEntry[];
  internships: ResumeEntry[];
  projects: ResumeEntry[];
  skills: string;
  certifications: ResumeEntry[];
  positionsOfResponsibility: ResumeEntry[];
  awards: ResumeEntry[];
  extracurriculars: ResumeEntry[];
};

const initialSections: SectionConfig[] = [
  { id: "education", label: "Education", enabled: true },
  { id: "workExperience", label: "Work Experience", enabled: true },
  { id: "internships", label: "Internships", enabled: true },
  { id: "projects", label: "Projects", enabled: true },
  { id: "skills", label: "Skills", enabled: true },
  { id: "certifications", label: "Certifications", enabled: false },
  {
    id: "positionsOfResponsibility",
    label: "Positions of Responsibility",
    enabled: false,
  },
  { id: "awards", label: "Awards / Achievements", enabled: false },
  { id: "extracurriculars", label: "Extra-curriculars", enabled: false },
];

const emptyEntry = (id: string): ResumeEntry => ({
  id,
  title: "",
  organization: "",
  startDate: "",
  endDate: "",
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
};

const managedSections: Exclude<SectionId, "skills">[] = [
  "education",
  "workExperience",
  "internships",
  "projects",
  "certifications",
  "positionsOfResponsibility",
  "awards",
  "extracurriculars",
];

type BulletApiResult = {
  bestBullet: string;
  shorterBullet: string;
  impactBullet: string;
  metricQuestions: string[];
};

type AiEntryState = {
  loading: boolean;
  error?: string;
  result?: BulletApiResult;
};

const aiSupportedSections: SectionId[] = [
  "workExperience",
  "internships",
  "projects",
];
const STORAGE_KEY = "ai-resume-builder-draft-v1";

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

function compressBulletText(bullet: string) {
  let next = bullet.replace(/\s+/g, " ").trim();
  for (const rule of shorteners) {
    next = next.replace(rule.from, rule.to);
  }
  next = next.replace(/\s+,/g, ",").replace(/\s{2,}/g, " ").trim();
  if (next.length > 145) {
    next = `${next.slice(0, 142).trimEnd()}...`;
  }
  return next;
}

export default function Home() {
  const [sections, setSections] = useState(initialSections);
  const [resume, setResume] = useState(initialResume);
  const [aiStateByEntry, setAiStateByEntry] = useState<Record<string, AiEntryState>>({});
  const [guardrailMessage, setGuardrailMessage] = useState("");
  const [draggingSectionId, setDraggingSectionId] = useState<SectionId | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return;
    }
    try {
      const parsed = JSON.parse(saved) as { sections: SectionConfig[]; resume: ResumeState };
      if (parsed.sections && parsed.resume) {
        setSections(parsed.sections);
        setResume(parsed.resume);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sections, resume }));
  }, [sections, resume]);

  const fullness = useMemo(() => {
    const base = 20;
    const sectionWeight = sections.filter((s) => s.enabled).length * 7;
    const entryCount = managedSections.reduce((total, sectionId) => {
      return total + resume[sectionId].length;
    }, 0);
    const bulletCount = managedSections.reduce((total, sectionId) => {
      return (
        total +
        resume[sectionId].reduce((sum, entry) => {
          return sum + entry.bullets.filter((b) => b.trim().length > 0).length;
        }, 0)
      );
    }, 0);
    return Math.min(140, base + sectionWeight + entryCount * 5 + bulletCount * 3);
  }, [sections, resume]);

  const fitStatus =
    fullness <= 100
      ? { label: "Fits in 1 page", tone: "text-emerald-700 bg-emerald-50" }
      : fullness <= 110
        ? { label: "Slightly long", tone: "text-amber-700 bg-amber-50" }
        : { label: "Too long", tone: "text-red-700 bg-red-50" };

  const overflowPercent = Math.max(0, fullness - 100);
  const overflowBullets = Math.max(0, Math.ceil(overflowPercent / 4));

  const toggleSection = (sectionId: SectionId) => {
    setSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? { ...section, enabled: !section.enabled }
          : section,
      ),
    );
  };

  const addEntry = (sectionId: Exclude<SectionId, "skills">) => {
    const nextId = `${sectionId}-${Date.now()}`;
    setResume((prev) => ({
      ...prev,
      [sectionId]: [...prev[sectionId], emptyEntry(nextId)],
    }));
  };

  const deleteEntry = (sectionId: Exclude<SectionId, "skills">, entryId: string) => {
    setResume((prev) => ({
      ...prev,
      [sectionId]: prev[sectionId].filter((entry) => entry.id !== entryId),
    }));
  };

  const updateEntry = (
    sectionId: Exclude<SectionId, "skills">,
    entryId: string,
    field: keyof ResumeEntry,
    value: string,
  ) => {
    setResume((prev) => ({
      ...prev,
      [sectionId]: prev[sectionId].map((entry) =>
        entry.id === entryId ? { ...entry, [field]: value } : entry,
      ),
    }));
  };

  const updateBullet = (
    sectionId: Exclude<SectionId, "skills">,
    entryId: string,
    bulletIndex: number,
    value: string,
  ) => {
    setResume((prev) => ({
      ...prev,
      [sectionId]: prev[sectionId].map((entry) => {
        if (entry.id !== entryId) {
          return entry;
        }
        const bullets = [...entry.bullets];
        bullets[bulletIndex] = value;
        return { ...entry, bullets };
      }),
    }));
  };

  const addBullet = (sectionId: Exclude<SectionId, "skills">, entryId: string) => {
    setResume((prev) => ({
      ...prev,
      [sectionId]: prev[sectionId].map((entry) =>
        entry.id === entryId ? { ...entry, bullets: [...entry.bullets, ""] } : entry,
      ),
    }));
  };

  const shortenSingleBullet = (
    sectionId: Exclude<SectionId, "skills">,
    entryId: string,
    bulletIndex: number,
  ) => {
    setResume((prev) => ({
      ...prev,
      [sectionId]: prev[sectionId].map((entry) => {
        if (entry.id !== entryId) {
          return entry;
        }
        const bullets = [...entry.bullets];
        bullets[bulletIndex] = compressBulletText(bullets[bulletIndex] || "");
        return { ...entry, bullets };
      }),
    }));
  };

  const enabledSections = sections.filter((section) => section.enabled);
  const orderedContentSections = sections.filter(
    (section): section is ContentSectionConfig => section.id !== "skills",
  );

  const sectionScores = useMemo(() => {
    return orderedContentSections.map((section) => {
      const entries = resume[section.id];
      const score = entries.reduce((total, entry) => {
        const titleScore = entry.title.trim().length > 0 ? 1 : 0;
        const bulletsScore = entry.bullets
          .filter((b) => b.trim().length > 0)
          .reduce((sum, bullet) => sum + Math.ceil(bullet.length / 90), 0);
        return total + titleScore + bulletsScore;
      }, 0);
      return { sectionId: section.id, label: section.label, score };
    });
  }, [orderedContentSections, resume]);

  const topOverflowSections = [...sectionScores]
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .filter((item) => item.score > 0);

  const moveSectionById = (draggedId: SectionId, targetId: SectionId) => {
    if (draggedId === targetId) {
      return;
    }

    setSections((prev) => {
      const next = [...prev];
      const fromIndex = next.findIndex((s) => s.id === draggedId);
      const toIndex = next.findIndex((s) => s.id === targetId);
      if (fromIndex < 0 || toIndex < 0) {
        return prev;
      }
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const hasMinimumContent = () => {
    const primarySections: ContentSectionId[] = [
      "education",
      "workExperience",
      "internships",
      "projects",
    ];
    return primarySections.some((sectionId) =>
      resume[sectionId].some(
        (entry) =>
          entry.title.trim().length > 0 ||
          entry.organization?.trim().length ||
          entry.bullets.some((b) => b.trim().length > 0),
      ),
    );
  };

  const runPreExportChecks = () => {
    const errors: string[] = [];
    if (!resume.header.fullName.trim()) {
      errors.push("Add your full name.");
    }
    if (!resume.header.email.trim()) {
      errors.push("Add your email.");
    }
    if (!hasMinimumContent()) {
      errors.push("Add at least one education, experience, internship, or project entry.");
    }
    setGuardrailMessage(
      errors.length === 0 ? "Looks good for export checks." : `Fix: ${errors.join(" ")}`,
    );
  };

  const applyBulletOption = (
    sectionId: Exclude<SectionId, "skills">,
    entryId: string,
    bullet: string,
  ) => {
    setResume((prev) => ({
      ...prev,
      [sectionId]: prev[sectionId].map((entry) => {
        if (entry.id !== entryId) {
          return entry;
        }
        const nextBullets = [...entry.bullets];
        const emptyIndex = nextBullets.findIndex((item) => item.trim().length === 0);
        if (emptyIndex >= 0) {
          nextBullets[emptyIndex] = bullet;
        } else {
          nextBullets.unshift(bullet);
        }
        return { ...entry, bullets: nextBullets };
      }),
    }));
  };

  const generateBulletOptions = async (
    sectionId: Exclude<SectionId, "skills">,
    entry: ResumeEntry,
  ) => {
    const roughNotes = entry.roughNotes?.trim() || "";
    if (!roughNotes) {
      setAiStateByEntry((prev) => ({
        ...prev,
        [entry.id]: {
          loading: false,
          error: "Add rough notes first.",
        },
      }));
      return;
    }

    setAiStateByEntry((prev) => ({
      ...prev,
      [entry.id]: { loading: true, error: undefined, result: undefined },
    }));

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

      if (!response.ok) {
        throw new Error("Could not generate bullets. Please try again.");
      }

      const data = (await response.json()) as BulletApiResult;
      setAiStateByEntry((prev) => ({
        ...prev,
        [entry.id]: { loading: false, result: data, error: undefined },
      }));
    } catch {
      setAiStateByEntry((prev) => ({
        ...prev,
        [entry.id]: {
          loading: false,
          error: "Could not generate bullets. Please try again.",
        },
      }));
    }
  };

  const makeItFitOnePage = () => {
    let updatesRemaining = overflowBullets > 0 ? overflowBullets : 2;

    setResume((prev) => {
      const next = { ...prev };
      const candidates: Array<{
        sectionId: Exclude<SectionId, "skills">;
        entryId: string;
        bulletIndex: number;
        text: string;
      }> = [];

      for (const sectionId of managedSections) {
        for (const entry of next[sectionId]) {
          entry.bullets.forEach((bullet, bulletIndex) => {
            if (bullet.trim().length > 45) {
              candidates.push({
                sectionId,
                entryId: entry.id,
                bulletIndex,
                text: bullet,
              });
            }
          });
        }
      }

      candidates.sort((a, b) => b.text.length - a.text.length);
      const selected = candidates.slice(0, updatesRemaining);

      if (selected.length === 0) {
        if (next.skills.length > 65) {
          next.skills = compressBulletText(next.skills);
        }
        return next;
      }

      for (const item of selected) {
        next[item.sectionId] = next[item.sectionId].map((entry) => {
          if (entry.id !== item.entryId) {
            return entry;
          }
          const bullets = [...entry.bullets];
          bullets[item.bulletIndex] = compressBulletText(bullets[item.bulletIndex] || "");
          return { ...entry, bullets };
        });
      }

      updatesRemaining -= selected.length;

      if (updatesRemaining > 0 && next.skills.length > 65) {
        next.skills = compressBulletText(next.skills);
      }

      return next;
    });
  };

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold">One-Page ATS Resume Builder</h1>
            <p className="text-sm text-zinc-600">Strict template, smarter bullets.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded px-3 py-1 text-xs font-medium ${fitStatus.tone}`}>
              {fitStatus.label}: {fullness}%
            </span>
            {overflowPercent > 0 ? (
              <span className="rounded bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                Reduce around {overflowBullets} bullet{overflowBullets > 1 ? "s" : ""}
              </span>
            ) : null}
            <button
              className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900"
              onClick={makeItFitOnePage}
            >
              Make It Fit
            </button>
            <button
              className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
              onClick={runPreExportChecks}
            >
              Run Export Checks
            </button>
          </div>
        </div>
        {guardrailMessage ? (
          <div className="mx-auto max-w-[1500px] px-4 pb-3 text-xs text-zinc-700">
            {guardrailMessage}
          </div>
        ) : null}
      </header>

      <main className="mx-auto grid max-w-[1500px] gap-4 p-4 lg:grid-cols-[280px_minmax(420px,1fr)_minmax(420px,1fr)]">
        <aside className="border border-zinc-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-700">
            Section Manager
          </h2>
          <div className="space-y-2">
            {sections.map((section) => (
              <div
                key={section.id}
                draggable
                onDragStart={() => setDraggingSectionId(section.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (!draggingSectionId) return;
                  moveSectionById(draggingSectionId, section.id);
                  setDraggingSectionId(null);
                }}
                onDragEnd={() => setDraggingSectionId(null)}
                className={`flex cursor-move items-center justify-between border px-2 py-2 text-sm ${
                  draggingSectionId === section.id
                    ? "border-cyan-400 bg-cyan-50"
                    : "border-zinc-200 bg-white"
                }`}
              >
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={section.enabled}
                    onChange={() => toggleSection(section.id)}
                  />
                  <span>{section.label}</span>
                </label>
                <span className="text-xs text-zinc-500">Drag</span>
              </div>
            ))}
          </div>
        </aside>

        <section className="border border-zinc-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-700">
            Input Editor
          </h2>
          {overflowPercent > 0 ? (
            <div className="mb-4 border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              Resume is {fullness}% full. Try reducing {overflowBullets} bullet
              {overflowBullets > 1 ? "s" : ""}, especially in{" "}
              {topOverflowSections.map((item) => item.label).join(" and ") || "long sections"}.
            </div>
          ) : (
            <div className="mb-4 border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
              Great fit. Your resume currently fits in one page.
            </div>
          )}

          <div className="mb-6 space-y-3 border-b border-zinc-200 pb-5">
            <h3 className="text-sm font-semibold">Header</h3>
            <div className="grid gap-2 md:grid-cols-2">
              {(
                [
                  ["fullName", "Full Name"],
                  ["email", "Email"],
                  ["phone", "Phone"],
                  ["linkedin", "LinkedIn"],
                  ["location", "Location"],
                ] as const
              ).map(([field, label]) => (
                <label key={field} className="text-xs">
                  <span className="mb-1 block text-zinc-600">{label}</span>
                  <input
                    className="w-full border border-zinc-300 px-2 py-1.5 text-sm"
                    value={resume.header[field]}
                    onChange={(event) =>
                      setResume((prev) => ({
                        ...prev,
                        header: { ...prev.header, [field]: event.target.value },
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            {orderedContentSections.map((orderedSection) => {
              const sectionId = orderedSection.id;
              const sectionMeta = sections.find((section) => section.id === sectionId);
              if (!sectionMeta?.enabled) {
                return null;
              }
              return (
                <div key={sectionId} className="border-b border-zinc-200 pb-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{sectionMeta.label}</h3>
                    <button
                      className="border border-zinc-300 px-2 py-1 text-xs"
                      onClick={() => addEntry(sectionId)}
                    >
                      Add Entry
                    </button>
                  </div>
                  <div className="space-y-4">
                    {resume[sectionId].map((entry) => (
                      <div key={entry.id} className="border border-zinc-200 p-3">
                        <div className="mb-2 grid gap-2 md:grid-cols-2">
                          <input
                            className="border border-zinc-300 px-2 py-1.5 text-sm"
                            placeholder="Title / Role / Degree"
                            value={entry.title}
                            onChange={(event) =>
                              updateEntry(sectionId, entry.id, "title", event.target.value)
                            }
                          />
                          <input
                            className="border border-zinc-300 px-2 py-1.5 text-sm"
                            placeholder="Organization / Institution / Company"
                            value={entry.organization}
                            onChange={(event) =>
                              updateEntry(
                                sectionId,
                                entry.id,
                                "organization",
                                event.target.value,
                              )
                            }
                          />
                          <input
                            className="border border-zinc-300 px-2 py-1.5 text-sm"
                            placeholder="Start Date"
                            value={entry.startDate}
                            onChange={(event) =>
                              updateEntry(sectionId, entry.id, "startDate", event.target.value)
                            }
                          />
                          <input
                            className="border border-zinc-300 px-2 py-1.5 text-sm"
                            placeholder="End Date / Present"
                            value={entry.endDate}
                            onChange={(event) =>
                              updateEntry(sectionId, entry.id, "endDate", event.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          {aiSupportedSections.includes(sectionId) ? (
                            <div className="space-y-2 border border-zinc-200 bg-zinc-50 p-2">
                              <p className="text-xs font-medium text-zinc-700">
                                Rough notes (plain language)
                              </p>
                              <textarea
                                className="w-full border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                                rows={3}
                                placeholder="Describe what you did in plain language. AI will rewrite it into resume-style bullets."
                                value={entry.roughNotes || ""}
                                onChange={(event) =>
                                  updateEntry(
                                    sectionId,
                                    entry.id,
                                    "roughNotes",
                                    event.target.value,
                                  )
                                }
                              />
                              <button
                                className="border border-zinc-300 bg-white px-2 py-1 text-xs"
                                onClick={() => generateBulletOptions(sectionId, entry)}
                                disabled={aiStateByEntry[entry.id]?.loading}
                              >
                                {aiStateByEntry[entry.id]?.loading
                                  ? "Generating..."
                                  : "Generate AI Bullet Options"}
                              </button>

                              {aiStateByEntry[entry.id]?.error ? (
                                <p className="text-xs text-red-700">
                                  {aiStateByEntry[entry.id]?.error}
                                </p>
                              ) : null}

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
                                        className="border border-zinc-200 bg-white p-2"
                                      >
                                        <p className="text-[11px] font-semibold uppercase text-zinc-600">
                                          {label}
                                        </p>
                                        <p className="mt-1 text-xs">{option}</p>
                                        <button
                                          className="mt-2 border border-zinc-300 px-2 py-1 text-xs"
                                          onClick={() =>
                                            applyBulletOption(sectionId, entry.id, option)
                                          }
                                        >
                                          Use This
                                        </button>
                                      </div>
                                    ) : null,
                                  )}
                                  {(aiStateByEntry[entry.id]?.result?.metricQuestions.length || 0) >
                                  0 ? (
                                    <div className="border border-zinc-200 bg-white p-2">
                                      <p className="text-[11px] font-semibold uppercase text-zinc-600">
                                        Optional metric prompts
                                      </p>
                                      <ul className="mt-1 list-disc pl-4 text-xs">
                                        {aiStateByEntry[entry.id]?.result?.metricQuestions.map(
                                          (question) => (
                                            <li key={`${entry.id}-${question}`}>{question}</li>
                                          ),
                                        )}
                                      </ul>
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {entry.bullets.map((bullet, index) => (
                            <div key={`${entry.id}-bullet-${index}`} className="space-y-1">
                              <textarea
                                className="w-full border border-zinc-300 px-2 py-1.5 text-sm"
                                rows={2}
                                placeholder="Add rough note or resume bullet"
                                value={bullet}
                                onChange={(event) =>
                                  updateBullet(
                                    sectionId,
                                    entry.id,
                                    index,
                                    event.target.value,
                                  )
                                }
                              />
                              <div className="flex justify-end">
                                <button
                                  className="border border-zinc-300 bg-white px-2 py-1 text-xs"
                                  onClick={() =>
                                    shortenSingleBullet(sectionId, entry.id, index)
                                  }
                                >
                                  Shorten
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <button
                            className="border border-zinc-300 px-2 py-1 text-xs"
                            onClick={() => addBullet(sectionId, entry.id)}
                          >
                            Add Bullet
                          </button>
                          <button
                            className="border border-zinc-300 px-2 py-1 text-xs text-red-700"
                            onClick={() => deleteEntry(sectionId, entry.id)}
                          >
                            Delete Entry
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {sections.find((section) => section.id === "skills")?.enabled ? (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Skills</h3>
                <textarea
                  className="w-full border border-zinc-300 px-2 py-1.5 text-sm"
                  rows={3}
                  value={resume.skills}
                  onChange={(event) =>
                    setResume((prev) => ({ ...prev, skills: event.target.value }))
                  }
                />
              </div>
            ) : null}
          </div>
        </section>

        <section className="border border-zinc-200 bg-zinc-50 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-700">
            Live Resume Preview
          </h2>
          <div className="mx-auto h-[842px] w-full max-w-[595px] overflow-hidden border border-zinc-300 bg-white px-8 py-7 shadow-sm">
            <div className="pb-2">
              <h1 className="text-[34px] font-semibold leading-tight text-cyan-700">
                {resume.header.fullName}
              </h1>
              <div className="mt-3 h-[2px] w-full bg-cyan-600" />
              <p className="mt-2 truncate text-[10px] leading-[1.3] text-zinc-800">
                {resume.header.email} | {resume.header.phone} | {resume.header.linkedin}
                {resume.header.location ? ` | ${resume.header.location}` : ""}
              </p>
            </div>

            <div className="mt-3 space-y-3 text-[10px] leading-[1.32]">
              {enabledSections.map((section) => {
                if (section.id === "skills") {
                  return (
                    <div key={section.id}>
                      <h3 className="border-b border-zinc-300 pb-0.5 text-[11px] font-bold uppercase tracking-wide text-zinc-900">
                        Skills
                      </h3>
                      <p className="mt-1 text-[10px] leading-[1.3]">{resume.skills}</p>
                    </div>
                  );
                }

                const entries = resume[section.id];
                if (entries.length === 0) {
                  return null;
                }

                return (
                  <div key={section.id}>
                    <h3 className="border-b border-zinc-300 pb-0.5 text-[11px] font-bold uppercase tracking-wide text-zinc-900">
                      {section.label}
                    </h3>
                    <div className="mt-1.5 space-y-2">
                      {entries.map((entry) => (
                        <div key={entry.id}>
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[10px] font-semibold leading-[1.3]">
                              {entry.title || "Title"}{" "}
                              {entry.organization ? `| ${entry.organization}` : ""}
                            </p>
                            <p className="shrink-0 text-[10px] leading-[1.3] text-zinc-700">
                              {entry.startDate} {entry.startDate || entry.endDate ? "-" : ""}{" "}
                              {entry.endDate}
                            </p>
                          </div>
                          <ul className="mt-0.5 list-disc pl-4 text-[10px] leading-[1.3]">
                            {entry.bullets
                              .filter((bullet) => bullet.trim().length > 0)
                              .map((bullet, index) => (
                                <li key={`${entry.id}-preview-${index}`}>{bullet}</li>
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
