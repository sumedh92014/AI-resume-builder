import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

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
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;

    const raw = text.slice(start, end + 1);
    const parsed = JSON.parse(raw) as Partial<BulletResponse>;

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

function buildPrompt(body: RewriteInput, roughNotes: string) {
  return `
You are an expert ATS resume bullet writer.

Rules (must follow):
- Use only the facts provided by the user.
- Do NOT invent metrics, tools, company names, achievements, or scope.
- Keep each bullet concise (1–2 lines).
- Start with a strong action verb.
- Use professional, recruiter-friendly language.
- If metrics are missing, ask up to 3 optional metric questions.
- Return strict JSON only. No markdown. No explanations.

Input:
Section: ${body.section || ""}
Role/Title: ${body.roleOrTitle || ""}
Organization: ${body.organization || ""}
Rough Notes: ${roughNotes}

Output JSON:
{
  "bestBullet": "string",
  "shorterBullet": "string",
  "impactBullet": "string",
  "metricQuestions": ["string"]
}
`;
}

export async function POST(req: Request) {
  const body = (await req.json()) as RewriteInput;
  const roughNotes = (body.roughNotes || "").trim();

  if (!roughNotes) {
    return NextResponse.json({ error: "roughNotes is required." }, { status: 400 });
  }

  if (roughNotes.length > 1200) {
    return NextResponse.json(
      { error: "roughNotes is too long. Keep it under 1200 characters." },
      { status: 400 },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(fallbackRewrite(body));
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = buildPrompt(body, roughNotes);
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    let parsed = parseJsonObject(text);

    if (!parsed) {
      const retryPrompt = `${prompt}\n\nIMPORTANT: Return ONLY valid JSON object. No markdown, no backticks, no extra text.`;
      const retryResult = await model.generateContent(retryPrompt);
      const retryText = retryResult.response.text();
      parsed = parseJsonObject(retryText);
    }

    if (parsed) {
      return NextResponse.json(parsed);
    }

    return NextResponse.json(fallbackRewrite(body));
  } catch (error) {
    console.error("Gemini error:", error);
    return NextResponse.json(fallbackRewrite(body));
  }
}
