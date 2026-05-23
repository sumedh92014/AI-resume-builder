import { NextResponse } from "next/server";

type BulletResponse = {
  bestBullet: string;
  shorterBullet: string;
  impactBullet: string;
  metricQuestions: string[];
};

type RewriteInput = {
  section?: string;
  roleOrTitle?: string;
  organization?: string;
  roughNotes?: string;
};

const metricPrompts = [
  "How many users, customers, or stakeholders were impacted?",
  "Was there any measurable change in revenue, conversion, cost, or time?",
  "How many projects, campaigns, or teams did you handle?",
];

function containsMetric(text: string) {
  return /\d/.test(text) || /%/.test(text);
}

function fallbackRewrite(input: RewriteInput): BulletResponse {
  const notes = (input.roughNotes || "").trim();
  const role = (input.roleOrTitle || "").trim();
  const org = (input.organization || "").trim();
  const context = [role, org].filter(Boolean).join(" at ");
  const prefix = context ? `In ${context}, ` : "";

  const bestBullet = `${prefix}improved outcomes by analyzing workflows, identifying opportunities, and executing focused changes across key priorities.`;
  const shorterBullet =
    "Improved outcomes by identifying bottlenecks and executing focused improvements.";
  const impactBullet = containsMetric(notes)
    ? `Delivered measurable improvements by turning analysis into execution and tracking impact using provided metrics (${notes}).`
    : "Drove stronger business outcomes by translating analysis into practical execution across high-priority initiatives.";

  return {
    bestBullet,
    shorterBullet,
    impactBullet,
    metricQuestions: containsMetric(notes) ? [] : metricPrompts,
  };
}

function parseJsonObject(text: string): BulletResponse | null {
  try {
    const parsed = JSON.parse(text) as Partial<BulletResponse>;
    if (
      typeof parsed.bestBullet === "string" &&
      typeof parsed.shorterBullet === "string" &&
      typeof parsed.impactBullet === "string" &&
      Array.isArray(parsed.metricQuestions)
    ) {
      return {
        bestBullet: parsed.bestBullet,
        shorterBullet: parsed.shorterBullet,
        impactBullet: parsed.impactBullet,
        metricQuestions: parsed.metricQuestions.filter(
          (q): q is string => typeof q === "string",
        ),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const body = (await req.json()) as RewriteInput;
  const roughNotes = (body.roughNotes || "").trim();

  if (!roughNotes) {
    return NextResponse.json(
      { error: "roughNotes is required." },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(fallbackRewrite(body));
  }

  const prompt = `
You rewrite resume content for ATS-friendly one-page resumes.
Rules:
- Use only facts provided by the user.
- Never invent metrics, tools, company names, or achievements.
- Use strong action verbs.
- Keep each bullet concise.
- Return strict JSON only.

Input:
Section: ${body.section || ""}
Role/Title: ${body.roleOrTitle || ""}
Organization: ${body.organization || ""}
Rough Notes: ${roughNotes}

Return JSON with:
{
  "bestBullet": "string",
  "shorterBullet": "string",
  "impactBullet": "string",
  "metricQuestions": ["string"]
}
If metrics are missing, add 1-3 optional metric questions.
`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: prompt,
      }),
    });

    if (!response.ok) {
      return NextResponse.json(fallbackRewrite(body));
    }

    const data = (await response.json()) as {
      output_text?: string;
    };
    const parsed = parseJsonObject(data.output_text || "");
    return NextResponse.json(parsed || fallbackRewrite(body));
  } catch {
    return NextResponse.json(fallbackRewrite(body));
  }
}
