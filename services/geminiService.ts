import { GoogleGenAI, Type, Part } from "@google/genai";
import { CoachMode, Feedback, UploadedFile } from "../types";
import { BACKEND_URL } from "../utils/config";

// Centralized model candidates and retry helper to improve resiliency against transient 503s
const DEFAULT_MODEL_CANDIDATES = [
  // Only using Gemini 2.0+ (1.5 is deprecated/not found)
  "gemini-2.0-flash",
  "gemini-2.5-flash",
];

function getModelCandidates(preferred?: string | null): string[] {
  const envModel = (
    typeof import.meta !== "undefined"
      ? (import.meta as any)?.env?.VITE_GEMINI_MODEL
      : undefined
  ) as string | undefined;
  const runtimeModel =
    (typeof localStorage !== "undefined"
      ? localStorage.getItem("VITE_GEMINI_MODEL")
      : null) || undefined;
  const configured = preferred || runtimeModel || envModel;
  const list = configured
    ? [configured, ...DEFAULT_MODEL_CANDIDATES]
    : [...DEFAULT_MODEL_CANDIDATES];
  // Deduplicate while preserving order
  return Array.from(new Set(list));
}

async function callWithRetry<T>(
  ai: GoogleGenAI,
  makeRequest: (model: string) => Promise<T>,
  options?: {
    retries?: number;
    initialDelayMs?: number;
    preferredModel?: string | null;
    perAttemptTimeoutMs?: number;
  },
): Promise<T> {
  const retries = options?.retries ?? 1; // Reduced from 2 to avoid rate limits
  const initialDelayMs = options?.initialDelayMs ?? 800; // Increased delay
  const perAttemptTimeoutMs = options?.perAttemptTimeoutMs ?? 7000;
  const models = getModelCandidates(options?.preferredModel);

  let lastError: unknown = null;

  // Try each model with exponential backoff on 503
  for (const model of models) {
    let attempt = 0;
    let delay = initialDelayMs;
    while (attempt <= retries) {
      try {
        const withTimeout = <U>(p: Promise<U>, ms: number) =>
          new Promise<U>((resolve, reject) => {
            const t = setTimeout(
              () => reject(new Error("request timeout")),
              ms,
            );
            p.then(
              (v) => {
                clearTimeout(t);
                resolve(v);
              },
              (e) => {
                clearTimeout(t);
                reject(e);
              },
            );
          });
        return await withTimeout(makeRequest(model), perAttemptTimeoutMs);
      } catch (err: any) {
        lastError = err;
        const message = typeof err?.message === "string" ? err.message : "";
        const code = (err?.error?.code ?? err?.status ?? err?.code) as
          | number
          | string
          | undefined;
        const is503 =
          message.includes("overloaded") ||
          message.includes("UNAVAILABLE") ||
          code === 503 ||
          code === "503";
        const is429 =
          message.includes("Resource exhausted") ||
          message.includes("RESOURCE_EXHAUSTED") ||
          code === 429 ||
          code === "429";
        const isTimeout = message.includes("timeout");

        // Non-retryable: break inner loop and try next model immediately
        if (!is503 && !is429 && !isTimeout) break;

        // 503 -> retry with backoff
        if (attempt === retries) break;
        await new Promise((res) => setTimeout(res, delay));
        delay *= 2;
        attempt += 1;
      }
    }
    // Try next model
  }

  // Check if it's a rate limit error and provide user-friendly message
  const lastErrorMessage = lastError instanceof Error ? lastError.message : String(lastError);
  const isRateLimit = lastErrorMessage.includes("Resource exhausted") ||
    lastErrorMessage.includes("RESOURCE_EXHAUSTED") ||
    lastErrorMessage.includes("429");

  const isQuotaExceeded = lastErrorMessage.includes("quota") ||
    lastErrorMessage.includes("QUOTA_EXCEEDED");

  const isNetworkError = lastErrorMessage.includes("Failed to fetch") ||
    lastErrorMessage.includes("NetworkError") ||
    lastErrorMessage.includes("ERR_NETWORK");

  if (isRateLimit) {
    throw new Error("⚠️ Server is busy due to high traffic. Please try again in a few moments.");
  }

  if (isQuotaExceeded) {
    throw new Error("⚠️ API quota exceeded. Please try again later or contact support.");
  }

  if (isNetworkError) {
    throw new Error("⚠️ Network connection issue. Please check your internet and try again.");
  }

  throw lastError ?? new Error("Unknown error calling Gemini API");
}

/**
 * Converts an HTMLImageElement to a GoogleGenerativeAI.Part object.
 * Since external images have CORS issues, we'll upload them to Gemini using the URL directly
 * by converting to a data URL in the browser.
 */
export async function imageToGenerativePart(
  imageElement: HTMLImageElement,
): Promise<Part> {
  console.log("📸 Converting image to base64...");
  try {
    // Create a canvas and draw the image to it
    const canvas = document.createElement("canvas");

    // Set canvas dimensions
    // Keep payloads lean for reliability
    const maxDimension = 1024;
    let width = imageElement.naturalWidth;
    let height = imageElement.naturalHeight;

    // Resize if too large
    if (width > maxDimension || height > maxDimension) {
      const ratio = Math.min(maxDimension / width, maxDimension / height);
      width = Math.floor(width * ratio);
      height = Math.floor(height * ratio);
    }

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not get canvas context");
    }

    // Draw the image to canvas
    ctx.drawImage(imageElement, 0, 0, width, height);

    // Convert to base64 data URL
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    const base64data = dataUrl.split(",")[1];

    console.log("✅ Image converted to base64 via canvas");

    return {
      inlineData: {
        mimeType: "image/jpeg",
        data: base64data,
      },
    };
  } catch (e) {
    // Fallback: fetch image bytes and base64-encode, avoiding canvas export
    const src = imageElement.currentSrc || imageElement.src;
    console.warn(
      "⚠️ Canvas tainted, using fetch fallback for image bytes:",
      src,
    );
    const response = await fetch(src, { mode: "no-cors" as RequestMode }).catch(
      () => fetch(src),
    );
    if (!response) throw new Error("Failed to fetch image for analysis");
    try {
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++)
        binary += String.fromCharCode(bytes[i]);
      const base64data = btoa(binary);
      const mimeType = blob.type || "image/jpeg";
      console.log("✅ Image converted to base64 via fetch fallback");
      return {
        inlineData: {
          mimeType,
          data: base64data,
        },
      };
    } catch {
      // If blob read fails (due to opaque response), send the URL directly as a text prompt cue
      console.warn(
        "⚠️ Blob read failed; falling back to URL reference in prompt",
      );
      const urlText = `Image URL (analyze this image by URL): ${src}`;
      return {
        inlineData: {
          mimeType: "text/plain",
          data: btoa(urlText),
        },
      } as unknown as Part;
    }
  }
}

/**
 * Generates a powerful, concise strategy for explaining an image.
 */
export async function getExplanationStrategy(
  ai: GoogleGenAI,
  imagePart: Part,
): Promise<string> {
  const systemInstruction = `You are a master communicator and rhetoric coach. Your task is to analyze an image and provide a single, powerful, and concise strategy for explaining it effectively.

  **RULES:**
  1.  **DO NOT describe the image.**
  2.  Focus on a **structural or narrative approach**.
  3.  The strategy should be a single sentence.
  4.  Frame it as a direct suggestion, starting with "Try..." or "Focus on...".

  **Examples of good strategies:**
  - "Try starting with the overall mood of the scene, then zoom in on the details that create that feeling."
  - "Focus on the main subject first, then describe their relationship to the environment around them."
  - "Build a narrative: what might have happened before this moment, what is happening now, and what could happen next?"

  Your output must be only the strategy text, with no extra formatting or explanation.`;

  const response = await callWithRetry(
    ai,
    async (model) => {
      // Prefer backend proxy if available
      const apiBase = BACKEND_URL;
      if (apiBase) {
        const r = await fetch(`${apiBase}/api/ai/generate-content`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            contents: [
              { role: "user", parts: [imagePart, { text: systemInstruction }] },
            ],
            config: { temperature: 0.2 },
          }),
        });
        if (!r.ok) throw new Error(`Proxy error ${r.status}`);
        const data = await r.json();
        return { text: data.text } as any;
      }
      return ai.models.generateContent({
        model,
        contents: [
          { parts: [imagePart, { text: systemInstruction }] },
        ],
        config: { temperature: 0.2 },
      });
    },
    { preferredModel: "gemini-2.0-flash", perAttemptTimeoutMs: 6000 },
  );
  return response.text.trim();
}

/**
 * Generates a descriptive caption for a given image part.
 */
export async function generateImageCaption(
  ai: GoogleGenAI,
  imagePart: Part,
): Promise<string> {
  const prompt =
    "Describe this image in detail. What are the main subjects, what are they doing, what is in the background, and what is the overall mood?";
  const response = await callWithRetry(
    ai,
    async (model) => {
      const apiBase =
        (typeof window !== "undefined" && (window as any).__AI_PROXY__) || "";
      if (apiBase) {
        const r = await fetch(`${apiBase}/api/ai/generate-content`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            contents: [{ parts: [imagePart, { text: prompt }] }],
          }),
        });
        if (!r.ok) throw new Error(`Proxy error ${r.status}`);
        const data = await r.json();
        return { text: data.text } as any;
      }
      return ai.models.generateContent({
        model,
        contents: [{ parts: [imagePart, { text: prompt }] }],
      });
    },
    { preferredModel: "gemini-2.0-flash", perAttemptTimeoutMs: 7000 },
  );
  return response.text;
}

/**
 * Refines and organizes a user's scenario into a clear, structured teaching topic.
 * This helps prepare the scenario for the user to explain as a teacher.
 */
export async function refineScenarioForTeaching(
  ai: GoogleGenAI,
  userScenario: string,
): Promise<string> {
  console.log("🎯 refineScenarioForTeaching called with:", {
    userScenarioLength: userScenario.length,
  });

  const systemInstruction = `You are an expert educational content organizer. Your task is to take a user's raw scenario, topic, or concept and refine it into a clear, structured, and teachable format.

**Your Goal:**
Transform the user's input into a well-organized teaching scenario that a person can effectively explain to others.

**What to do:**
1. **Clarify the main concept** - What is the core topic or idea?
2. **Structure the content** - Break it down into logical components
3. **Add context** - Provide background or examples if needed
4. **Make it teachable** - Format it so someone can explain it step-by-step
5. **Keep it concise** - Aim for 2-3 paragraphs maximum

**Output Format:**
Create a refined scenario that includes:
- A clear title/topic
- The main concept explained simply
- Key points or steps to cover
- Context or examples if helpful

**Input:**
${userScenario}

**Output:**
Provide only the refined, structured scenario text. No extra formatting or explanations.`;

  console.log("🤖 Sending scenario refinement request to Gemini API...");
  const response = await callWithRetry(
    ai,
    async (model) =>
      ai.models.generateContent({
        model,
        contents: systemInstruction,
        config: {
          temperature: 0.3,
        },
      }),
    { preferredModel: "gemini-2.5-flash", perAttemptTimeoutMs: 10000 },
  );

  const refinedText = response.text.trim();
  console.log(
    "✅ Scenario refined successfully:",
    refinedText.substring(0, 100) + "...",
  );
  return refinedText;
}

/**
 * Refines and transforms a user's story idea into an engaging, creative storytelling prompt.
 * This helps prepare the scenario for the user to develop into a compelling story.
 */
export async function refineScenarioForStorytelling(
  ai: GoogleGenAI,
  userScenario: string,
): Promise<string> {
  console.log("🎯 refineScenarioForStorytelling called with:", {
    userScenarioLength: userScenario.length,
  });

  const systemInstruction = `You are a master storyteller and creative writing coach. Your job is to transform the user's idea into an engaging story prompt that is STRICTLY about their topic.

**PRIMARY RULE – STRICT RELEVANCE (MANDATORY):**
- Stay tightly on-topic. Do NOT introduce unrelated settings, genres, characters, or themes.
- Reuse the user's key terms and entities. If the idea mentions specific names, places, domains, or time periods, they MUST appear in the prompt.
- If details are sparse, expand conservatively with common knowledge that logically fits the user's topic. Do not drift.
- Never switch subject domain (e.g., from science to fantasy) unless the user explicitly asks.

**Build the prompt:**
1) Enhance the concept with depth and atmosphere that MATCH the user's topic.
2) Add realistic conflict/tension that logically follows from the user's idea.
3) Suggest characters/roles that belong in this exact context.
4) Keep it open-ended, but focused on the same topic.

**Keep it concise and vivid. No meta commentary. No headings. No bullets. Output only the prompt.**

User Idea:
${userScenario}

Output only the refined, on-topic storytelling prompt.`;

  console.log("🤖 Sending story refinement request to Gemini API...");
  const response = await callWithRetry(
    ai,
    async (model) =>
      ai.models.generateContent({
        model,
        contents: systemInstruction,
        config: {
          temperature: 0.25,
        },
      }),
    { preferredModel: "gemini-2.5-flash", perAttemptTimeoutMs: 10000 },
  );

  const refinedText = response.text.trim();
  console.log(
    "✅ Story prompt refined successfully:",
    refinedText.substring(0, 100) + "...",
  );
  return refinedText;
}

/**
 * Gets AI's debate response - either initial stance or rebuttal to user's argument.
 * Returns structured response with AI's position and argument.
 */
export async function getDebateResponse(
  ai: GoogleGenAI,
  topic: string,
  userArgument: string,
  turnNumber: number,
  isInitialStance: boolean,
): Promise<{ content: string; aiStance: string; userStance: string }> {
  console.log("🎯 getDebateResponse called with:", {
    topic,
    userArgumentLength: userArgument.length,
    turnNumber,
    isInitialStance,
  });

  if (isInitialStance) {
    // Initial stance - AI takes opposite position
    const systemInstruction = `You're debating someone like a real person would. Figure out what side they'll take on this topic, then argue the opposite side. Don't sound like an AI - talk like an actual human having a real debate.

**Topic:** ${topic}

**How to argue:**
- Talk naturally, like you're texting a friend you disagree with
- Use everyday language - "Look", "Come on", "Here's the thing", "I mean"
- Mix short and medium sentences, not robotic patterns
- Be direct but not overly aggressive - challenge ideas, not personal attacks
- Use real examples people actually know about
- Show you care about your position - "This matters because..."
- Ask questions that make them think - "But what about...?", "How do you explain...?"
- Vary your tone - sometimes firm, sometimes questioning, sometimes passionate
- No formulaic phrases like "Furthermore", "Moreover", "In conclusion"
- Sound like someone who actually believes what they're saying

**Examples of natural human debate:**
- "Look, I get where you're coming from, but here's the problem with that..."
- "Okay but think about it - when has that ever actually worked?"
- "Come on, you're ignoring the obvious issue here. What about all the people who..."
- "I mean, sure, in theory that sounds good, but in reality..."
- "Hold on - you really think that's true? Because the data shows something completely different."

**Output Format:**
JSON with:
- "userStance": What you think the user will argue for
- "aiStance": Your opposing position
- "content": Your opening argument (2-3 concise sentences, natural flow)

Write 2-3 sentences. Mix sentence lengths. Sound human, not formulaic.`;

    const response = await callWithRetry(
      ai,
      async (model) =>
        ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: systemInstruction }] }],
          config: {
            temperature: 0.9,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                userStance: {
                  type: Type.STRING,
                  description: "The stance the user will likely take.",
                },
                aiStance: {
                  type: Type.STRING,
                  description: "Your opposing stance.",
                },
                content: {
                  type: Type.STRING,
                  description: "Your opening argument.",
                },
              },
              required: ["userStance", "aiStance", "content"],
            },
          },
        }),
      { preferredModel: "gemini-2.0-flash", perAttemptTimeoutMs: 7000 },
    );

    const result = JSON.parse(response.text);
    console.log("✅ Initial debate stance generated");
    return result;
  } else {
    // Rebuttal to user's argument
    const systemInstruction = `You're a FIERCE human debater who FIGHTS HARD for your position. You're not here to be polite - you're here to WIN this debate using every tactical weapon in your arsenal.

**Topic:** ${topic}
**Their Weak Argument:** ${userArgument}

**DEBATE TACTICS TO USE:**
- **Attack their logic:** "That's completely illogical because...", "Your reasoning falls apart when..."
- **Demand evidence:** "Where's your proof?", "Show me the data", "That's just your opinion"
- **Point out contradictions:** "You just contradicted yourself", "That makes no sense with what you said before"
- **Use counterexamples:** "What about [specific example that destroys their point]?"
- **Challenge assumptions:** "You're assuming X, but that's totally wrong because..."
- **Expose weaknesses:** "The flaw in your argument is...", "You're ignoring the obvious problem..."
- **Use their words against them:** Quote them back and show why it's wrong
- **Be relentless:** Don't let them off the hook, keep pushing

**AGGRESSIVE DEBATE STYLE:**
- Start with immediate pushback: "No, that's wrong", "Are you serious?", "That's ridiculous"
- Use strong language: "completely false", "totally backwards", "makes no sense"
- Challenge everything: "Prove it", "Says who?", "Based on what?"
- Be direct and confrontational: "You're missing the point", "That's not how it works"
- Show you're fired up about this topic
- Use real examples that crush their argument
- Don't give ground - fight for every point

**HUMAN DEBATE TACTICS:**
- "Look, here's what you're not getting..."
- "Come on, everyone knows that..."
- "You can't be serious. The evidence clearly shows..."
- "That's exactly the kind of thinking that causes..."
- "Hold up - you just proved my point by saying..."
- "So you're telling me that [restate their position to show how absurd it is]?"

**BE A REAL DEBATER:**
- Fight like you actually believe your position
- Use logic, evidence, and examples to destroy their argument
- Be passionate and confrontational
- Don't back down or be wishy-washy
- Make them defend every single point
- Show why their thinking is flawed

Write 2-3 punchy sentences. Be aggressive, logical, and human. FIGHT BACK HARD.`;

    const response = await callWithRetry(
      ai,
      async (model) =>
        ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: systemInstruction }] }],
          config: {
            temperature: 0.9,
          },
        }),
      { preferredModel: "gemini-1.5-flash", perAttemptTimeoutMs: 7000 },
    );

    const content = response.text.trim();
    console.log("✅ Debate rebuttal generated");
    return { content, aiStance: "", userStance: "" };
  }
}

/**
 * Evaluates debate performance by analyzing the entire conversation history.
 * Returns structured feedback on argumentation skills with accurate, meaningful scoring.
 */
export async function getDebateEvaluation(
  ai: GoogleGenAI,
  debateTopic: string,
  conversationHistory: Array<{
    type: "user" | "ai";
    content: string;
    turnNumber: number;
  }>,
  userStance: string,
  aiStance: string,
): Promise<any> {
  console.log("🎯 getDebateEvaluation called with:", {
    debateTopic,
    conversationLength: conversationHistory.length,
    userStance,
    aiStance,
  });

  // Format conversation history for analysis
  const conversationText = conversationHistory
    .map(
      (msg) =>
        `${msg.type === "user" ? "USER" : "AI"} (Turn ${msg.turnNumber}): ${msg.content}`,
    )
    .join("\n\n");

  const systemInstruction = `You're a brutally honest debate coach who's been judging debates for 20+ years. You've seen it all - from terrible arguments to masterful performances. Your job is to give REAL, ACCURATE feedback that actually helps people improve.

**MANDATORY RELEVANCE & ACCURACY CHECK:**
Before scoring, you MUST verify if the USER'S arguments actually address the 'Topic' and respond to the 'AI's Stance'.
1. If the user's arguments are irrelevant, garbage, nonsense, or completely unrelated to the debate topic:
   - YOU MUST AWARD ZERO (0) for ALL individual category scores and the overall_score.
   - The 'feedback' MUST explicitly state that the arguments are irrelevant.
2. If the user's total arguments are extremely shallow (e.g., less than 10 words total):
   - AWARD a maximum overall_score of 10.

**DEBATE CONTEXT:**
Topic: ${debateTopic}
User's Stance: ${userStance}
AI's Stance: ${aiStance}

**FULL CONVERSATION HISTORY:**
${conversationText}

**REALISTIC SCORING SYSTEM (0-20 points each):**

1. **Argument Quality (0-20):**
   - 0-5: Terrible arguments, no logic, just opinions
   - 6-10: Basic arguments, some reasoning but weak
   - 11-15: Good arguments with solid reasoning
   - 16-20: Excellent arguments that are compelling and well-reasoned

2. **Evidence & Examples (0-20):**
   - 0-5: No evidence, just random claims
   - 6-10: Weak examples, not convincing
   - 11-15: Good examples that support the argument
   - 16-20: Strong evidence that really proves the point

3. **Logic & Reasoning (0-20):**
   - 0-5: Makes no sense, contradictions everywhere
   - 6-10: Some logic but has holes
   - 11-15: Mostly logical with minor issues
   - 16-20: Flawless logic, everything connects

4. **Rebuttal Skills (0-20):**
   - 0-5: Ignores opponent completely
   - 6-10: Weak responses, doesn't really counter
   - 11-15: Good counterarguments
   - 16-20: Destroys opponent's arguments

5. **Persuasion (0-20):**
   - 0-5: Boring, unconvincing
   - 6-10: Somewhat convincing
   - 11-15: Pretty convincing
   - 16-20: Highly persuasive and compelling

6. **Engagement (0-20):**
   - 0-5: Doesn't engage, just talks at opponent
   - 6-10: Some engagement
   - 11-15: Good back-and-forth
   - 16-20: Excellent engagement, builds on what opponent says

**BRUTAL HONESTY RULES:**
- Most people are TERRIBLE at debating - score them accordingly
- 2-word responses = 0-5 points total
- 1 sentence = 5-15 points total
- Only detailed, thoughtful arguments get 70+ points
- Be RUTHLESS but FAIR
- Quote EXACTLY what they said
- Point out SPECIFIC problems
- Give REAL, actionable advice

**ANALYSIS REQUIREMENTS:**
- Quote their exact words
- Identify their worst and best moments
- Show how they could have done better
- Give specific examples of improvements
- Be direct and honest about their performance

**Output Instructions:**
Your entire output MUST be a single, valid JSON object without any markdown or extra text.`;

  const response = await callWithRetry(
    ai,
    async (model) =>
      ai.models.generateContent({
        model,
        contents: systemInstruction,
        config: {
          temperature: 0.3,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              role: {
                type: Type.STRING,
                description: "The coaching role used (Debater).",
              },
              overall_score: {
                type: Type.INTEGER,
                description:
                  "Overall score out of 100 based on comprehensive analysis.",
              },
              category_scores: {
                type: Type.OBJECT,
                description:
                  "Individual scores for each of the 6 categories (0-20 each).",
                properties: {
                  argumentStrength: {
                    type: Type.INTEGER,
                    description: "Argument Strength score (0-20).",
                  },
                  evidenceSupport: {
                    type: Type.INTEGER,
                    description: "Evidence & Support score (0-20).",
                  },
                  logicalReasoning: {
                    type: Type.INTEGER,
                    description: "Logical Reasoning score (0-20).",
                  },
                  rebuttalEffectiveness: {
                    type: Type.INTEGER,
                    description: "Rebuttal Effectiveness score (0-20).",
                  },
                  persuasionImpact: {
                    type: Type.INTEGER,
                    description: "Persuasion & Impact score (0-20).",
                  },
                  engagementResponsiveness: {
                    type: Type.INTEGER,
                    description: "Engagement & Responsiveness score (0-20).",
                  },
                },
                required: [
                  "argumentStrength",
                  "evidenceSupport",
                  "logicalReasoning",
                  "rebuttalEffectiveness",
                  "persuasionImpact",
                  "engagementResponsiveness",
                ],
              },
              feedback: {
                type: Type.STRING,
                description:
                  "Comprehensive feedback analyzing the entire debate performance with specific examples.",
              },
              tips: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  "5-7 specific improvement tips based on actual performance in the debate.",
              },
              // Legacy fields for backward compatibility
              score: {
                type: Type.INTEGER,
                description: "Legacy overall score (same as overall_score).",
              },
              whatYouDidWell: {
                type: Type.STRING,
                description: "BRIEF strengths - MAX 1 sentence.",
              },
              areasForImprovement: {
                type: Type.STRING,
                description: "BRIEF improvement areas - MAX 1 sentence.",
              },
              personalizedTip: {
                type: Type.STRING,
                description: "SHORT personalized tip - MAX 1 sentence.",
              },
              spokenResponse: {
                type: Type.STRING,
                description: "BRIEF spoken summary - MAX 1 sentence.",
              },
              communicationBehavior: {
                type: Type.OBJECT,
                description:
                  "Communication profile analysis based on debate performance.",
                properties: {
                  profile: {
                    type: Type.STRING,
                    description: "BRIEF debate profile - MAX 3 words.",
                  },
                  strength: {
                    type: Type.STRING,
                    description: "BRIEF key strength - MAX 1 sentence.",
                  },
                  growthArea: {
                    type: Type.STRING,
                    description: "BRIEF growth area - MAX 1 sentence.",
                  },
                },
                required: ["profile", "strength", "growthArea"],
              },
              exampleRewrite: {
                type: Type.OBJECT,
                description:
                  "Example improvement of a specific argument from the debate.",
                properties: {
                  original: {
                    type: Type.STRING,
                    description: "Original argument from the debate.",
                  },
                  improved: {
                    type: Type.STRING,
                    description: "Improved version of the argument.",
                  },
                  reasoning: {
                    type: Type.STRING,
                    description: "Reasoning for the improvement.",
                  },
                },
                required: ["original", "improved", "reasoning"],
              },
              debateAnalysis: {
                type: Type.OBJECT,
                description: "Detailed analysis of the debate performance.",
                properties: {
                  strongestArgument: {
                    type: Type.STRING,
                    description: "The user's strongest argument from the debate.",
                  },
                  weakestArgument: {
                    type: Type.STRING,
                    description: "The user's weakest argument from the debate.",
                  },
                  bestRebuttal: {
                    type: Type.STRING,
                    description: "The user's best rebuttal to the AI.",
                  },
                  missedOpportunities: {
                    type: Type.STRING,
                    description: "Key opportunities the user missed.",
                  },
                  improvementOverTime: {
                    type: Type.STRING,
                    description:
                      "How the user's performance changed throughout the debate.",
                  },
                },
                required: [
                  "strongestArgument",
                  "weakestArgument",
                  "bestRebuttal",
                  "missedOpportunities",
                  "improvementOverTime",
                ],
              },
            },
            required: [
              "role",
              "overall_score",
              "category_scores",
              "feedback",
              "tips",
              "score",
              "whatYouDidWell",
              "areasForImprovement",
              "personalizedTip",
              "spokenResponse",
              "communicationBehavior",
              "exampleRewrite",
              "debateAnalysis",
            ],
          },
        },
      }),
    { preferredModel: "gemini-2.5-flash", perAttemptTimeoutMs: 12000 },
  );

  const result = JSON.parse(response.text);
  console.log("✅ Comprehensive debate evaluation generated");
  return result;
}

/**
 * Gets coaching feedback for text scenarios without image analysis.
 * Returns structured feedback with role-based personalities and specialized scoring.
 */
export async function getTextScenarioFeedback(
  ai: GoogleGenAI,
  userText: string,
  mode: CoachMode,
): Promise<Feedback> {
  console.log("🎯 getTextScenarioFeedback called with:", {
    mode,
    userTextLength: userText.length,
  });

  if (mode === CoachMode.Teacher) {
    return await getTeacherEvaluation(ai, userText);
  } else if (mode === CoachMode.Storyteller) {
    return await getStorytellerEvaluation(ai, userText);
  } else {
    // Fallback to generic evaluation
    return await getGenericTextEvaluation(ai, userText, mode);
  }
}

/**
 * Specialized evaluation for Teacher mode with teaching-specific criteria.
 */
async function getTeacherEvaluation(
  ai: GoogleGenAI,
  userText: string,
): Promise<Feedback> {
  const systemInstruction = `You are an elite education professor and pedagogical auditor. Your mission is to provide RIGOROUS, ACCURATE, and MEANINGFUL evaluation of teaching performance.

**MANDATORY RELEVANCE CHECK:**
Before scoring, you MUST verify if the 'User Teaching' is actually an attempt to teach.
1. If the input is irrelevant, garbage, nonsense, or completely unrelated to any teaching topic:
   - YOU MUST AWARD ZERO (0) for ALL category scores and the overall_score.
   - The 'feedback' MUST explicitly state that the content is irrelevant/invalid.
2. If the input is a brief greeting or single sentence:
   - AWARD a maximum overall_score of 5.

**EVALUATION CRITERIA:**
- Judge whether the explanation sounds like an actual teacher: objectives, scaffolding, examples, and checks for understanding.
- Reward: Clear structure, simplified complex concepts, and engaging delivery.
- Penalize: Casual chat, superficial opinions, factual inaccuracies, or missing steps.
- Score each category (0-20) and overall (0-100) independently based on actual impact.
- Be accurate and honest - most teachers score 30-60 overall. Only truly exceptional teaching gets 70+.

**ANALYSIS REQUIREMENTS:**
- Reference specific parts of their teaching as evidence.
- Identify strongest/weakest moments objectively.
- Assess pedagogical techniques and accessibility.

**Input:**
- **The User's Teaching:** ${userText}

**Output Instructions:**
Your entire output MUST be a single, valid JSON object without any markdown or extra text.`;

  const response = await callWithRetry(
    ai,
    async (model) =>
      ai.models.generateContent({
        model,
        contents: systemInstruction,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              role: {
                type: Type.STRING,
                description: "The coaching role used (Teacher).",
              },
              overall_score: {
                type: Type.INTEGER,
                description: "Overall teaching score out of 100 - INDEPENDENT evaluation of complete teaching effectiveness, NOT calculated from category scores.",
              },
              category_scores: {
                type: Type.OBJECT,
                description:
                  "Individual scores for each of the 6 teaching categories (0-20 each).",
                properties: {
                  clarity: {
                    type: Type.INTEGER,
                    description: "Clarity & Explanation score (0-20).",
                  },
                  structure: {
                    type: Type.INTEGER,
                    description: "Structure & Organization score (0-20).",
                  },
                  engagement: {
                    type: Type.INTEGER,
                    description: "Engagement & Interest score (0-20).",
                  },
                  educationalValue: {
                    type: Type.INTEGER,
                    description: "Educational Value score (0-20).",
                  },
                  accessibility: {
                    type: Type.INTEGER,
                    description: "Accessibility & Adaptability score (0-20).",
                  },
                  completeness: {
                    type: Type.INTEGER,
                    description: "Completeness & Depth score (0-20).",
                  },
                },
                required: [
                  "clarity",
                  "structure",
                  "engagement",
                  "educationalValue",
                  "accessibility",
                  "completeness",
                ],
              },
              feedback: {
                type: Type.STRING,
                description:
                  "Comprehensive teaching feedback with specific examples.",
              },
              tips: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "5-7 specific teaching improvement tips.",
              },
              // Legacy fields for backward compatibility
              score: {
                type: Type.INTEGER,
                description: "Legacy overall score (same as overall_score).",
              },
              whatYouDidWell: {
                type: Type.STRING,
                description: "Specific teaching strengths with examples.",
              },
              areasForImprovement: {
                type: Type.STRING,
                description: "Specific areas for teaching improvement.",
              },
              personalizedTip: {
                type: Type.STRING,
                description: "Most important teaching tip.",
              },
              spokenResponse: {
                type: Type.STRING,
                description: "BRIEF spoken summary - MAX 1 sentence.",
              },
              communicationBehavior: {
                type: Type.OBJECT,
                description: "Teaching style analysis.",
                properties: {
                  profile: {
                    type: Type.STRING,
                    description: "Teaching style profile (2-4 words).",
                  },
                  strength: {
                    type: Type.STRING,
                    description: "Key teaching strength.",
                  },
                  growthArea: {
                    type: Type.STRING,
                    description: "Primary teaching growth area.",
                  },
                },
                required: ["profile", "strength", "growthArea"],
              },
              exampleRewrite: {
                type: Type.OBJECT,
                description: "Example teaching improvement.",
                properties: {
                  original: {
                    type: Type.STRING,
                    description: "Original teaching explanation.",
                  },
                  improved: {
                    type: Type.STRING,
                    description: "Improved teaching explanation.",
                  },
                  reasoning: {
                    type: Type.STRING,
                    description: "Reasoning for improvement.",
                  },
                },
                required: ["original", "improved", "reasoning"],
              },
              teachingAnalysis: {
                type: Type.OBJECT,
                description: "Detailed teaching analysis.",
                properties: {
                  strongestMoment: {
                    type: Type.STRING,
                    description: "The user's strongest teaching moment.",
                  },
                  weakestMoment: {
                    type: Type.STRING,
                    description: "The user's weakest teaching moment.",
                  },
                  bestExplanation: {
                    type: Type.STRING,
                    description: "The user's best explanation technique.",
                  },
                  missedOpportunities: {
                    type: Type.STRING,
                    description: "Key teaching opportunities missed.",
                  },
                  audienceAdaptation: {
                    type: Type.STRING,
                    description: "How well they adapted to their audience.",
                  },
                },
                required: [
                  "strongestMoment",
                  "weakestMoment",
                  "bestExplanation",
                  "missedOpportunities",
                  "audienceAdaptation",
                ],
              },
            },
            required: [
              "role",
              "overall_score",
              "category_scores",
              "feedback",
              "tips",
              "score",
              "whatYouDidWell",
              "areasForImprovement",
              "personalizedTip",
              "spokenResponse",
              "communicationBehavior",
              "exampleRewrite",
              "teachingAnalysis",
            ],
          },
        },
      }),
    { preferredModel: "gemini-2.5-flash", perAttemptTimeoutMs: 10000 },
  );

  const result = JSON.parse(response.text);
  console.log("✅ Teacher evaluation generated");
  return result;
}

/**
 * Specialized evaluation for Storyteller mode with storytelling-specific criteria.
 */
async function getStorytellerEvaluation(
  ai: GoogleGenAI,
  userText: string,
): Promise<Feedback> {
  const systemInstruction = `You are a professional narrative auditor and literary critic. Your task is to provide RIGOROUS and ACCURATE evaluation of storytelling performance using a strict 0-20 category scoring system.

**MANDATORY RELEVANCE & QUALITY CHECK:**
Before scoring, you MUST verify if the 'User Story' is a meaningful narrative.
1. If the input is irrelevant, garbage, nonsense, or completely unrelated to storytelling:
   - YOU MUST AWARD ZERO (0) for ALL category scores and the overall_score.
   - The 'feedback' MUST explicitly state that the content is irrelevant/invalid.
2. If the input is a single sentence or extremely low-effort:
   - AWARD a maximum overall_score of 5.

**SCORING PHILOSOPHY:**
- 0–5: Fundamentally broken, incoherent, irrelevant, or severely flawed
- 6–10: Weak execution, shallow depth, basic competence only
- 11-16: Solid, readable, but safe or limited
- 17-20: Rare, exceptional, emotionally or structurally outstanding
- Score each category (0-20) and overall (0-100) independently.
- Most stories score 30-60 overall. Only exceptional narratives get 70+.

**ANALYSIS REQUIREMENTS:**
- Focus on narrative logic, character depth, and emotional resonance.
- Quote specific passages as evidence for scores.
- Identify clearest strengths and most critical areas for growth.
- Do NOT be a cheerleader; be a precise mentor.

**Output Instructions:**
Your entire output MUST be a single, valid JSON object without any markdown or extra text.`;

  const response = await callWithRetry(
    ai,
    async (model) =>
      ai.models.generateContent({
        model,
        contents: systemInstruction,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              role: {
                type: Type.STRING,
                description: "The coaching role used (Storyteller).",
              },
              overall_score: {
                type: Type.INTEGER,
                description: "Overall storytelling score out of 100.",
              },
              category_scores: {
                type: Type.OBJECT,
                description:
                  "Individual scores for each of the 6 storytelling categories (0-20 each).",
                properties: {
                  narrativeStructure: {
                    type: Type.INTEGER,
                    description: "Narrative Structure score (0-20).",
                  },
                  characterDevelopment: {
                    type: Type.INTEGER,
                    description: "Character Development score (0-20).",
                  },
                  descriptiveLanguage: {
                    type: Type.INTEGER,
                    description: "Descriptive Language score (0-20).",
                  },
                  emotionalImpact: {
                    type: Type.INTEGER,
                    description: "Emotional Impact score (0-20).",
                  },
                  creativity: {
                    type: Type.INTEGER,
                    description: "Creativity & Originality score (0-20).",
                  },
                  engagement: {
                    type: Type.INTEGER,
                    description: "Engagement & Pacing score (0-20).",
                  },
                },
                required: [
                  "narrativeStructure",
                  "characterDevelopment",
                  "descriptiveLanguage",
                  "emotionalImpact",
                  "creativity",
                  "engagement",
                ],
              },
              feedback: {
                type: Type.STRING,
                description:
                  "Comprehensive storytelling feedback with specific examples.",
              },
              tips: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "5-7 specific storytelling improvement tips.",
              },
              // Legacy fields for backward compatibility
              score: {
                type: Type.INTEGER,
                description: "Legacy overall score (same as overall_score).",
              },
              whatYouDidWell: {
                type: Type.STRING,
                description: "Specific storytelling strengths with examples.",
              },
              areasForImprovement: {
                type: Type.STRING,
                description: "Specific areas for storytelling improvement.",
              },
              personalizedTip: {
                type: Type.STRING,
                description: "Most important storytelling tip.",
              },
              spokenResponse: {
                type: Type.STRING,
                description: "BRIEF spoken summary - MAX 1 sentence.",
              },
              communicationBehavior: {
                type: Type.OBJECT,
                description: "Storytelling style analysis.",
                properties: {
                  profile: {
                    type: Type.STRING,
                    description: "Storytelling style profile (2-4 words).",
                  },
                  strength: {
                    type: Type.STRING,
                    description: "Key storytelling strength.",
                  },
                  growthArea: {
                    type: Type.STRING,
                    description: "Primary storytelling growth area.",
                  },
                },
                required: ["profile", "strength", "growthArea"],
              },
              exampleRewrite: {
                type: Type.OBJECT,
                description: "Example storytelling improvement.",
                properties: {
                  original: {
                    type: Type.STRING,
                    description: "Original story passage.",
                  },
                  improved: {
                    type: Type.STRING,
                    description: "Improved story passage.",
                  },
                  reasoning: {
                    type: Type.STRING,
                    description: "Reasoning for improvement.",
                  },
                },
                required: ["original", "improved", "reasoning"],
              },
              storytellingAnalysis: {
                type: Type.OBJECT,
                description: "Detailed storytelling analysis.",
                properties: {
                  strongestMoment: {
                    type: Type.STRING,
                    description: "The user's strongest storytelling moment.",
                  },
                  weakestMoment: {
                    type: Type.STRING,
                    description: "The user's weakest storytelling moment.",
                  },
                  bestTechnique: {
                    type: Type.STRING,
                    description: "The user's best storytelling technique.",
                  },
                  missedOpportunities: {
                    type: Type.STRING,
                    description: "Key storytelling opportunities missed.",
                  },
                  emotionalConnection: {
                    type: Type.STRING,
                    description: "How well they created emotional connection.",
                  },
                },
                required: [
                  "strongestMoment",
                  "weakestMoment",
                  "bestTechnique",
                  "missedOpportunities",
                  "emotionalConnection",
                ],
              },
            },
            required: [
              "role",
              "overall_score",
              "category_scores",
              "feedback",
              "tips",
              "score",
              "whatYouDidWell",
              "areasForImprovement",
              "personalizedTip",
              "spokenResponse",
              "communicationBehavior",
              "exampleRewrite",
              "storytellingAnalysis",
            ],
          },
        },
      }),
    { preferredModel: "gemini-2.5-flash", perAttemptTimeoutMs: 10000 },
  );

  const result = JSON.parse(response.text);
  console.log("✅ Storyteller evaluation generated");
  return result;
}

/**
 * Generic evaluation for other modes (fallback).
 */
async function getGenericTextEvaluation(
  ai: GoogleGenAI,
  userText: string,
  mode: CoachMode,
): Promise<Feedback> {
  const systemInstruction = `You are an elite communication coach with a Ph.D. in rhetoric and psychology. Your analysis is brutally accurate, insightful, and always focused on making the user a more impactful and persuasive speaker.

**Your Role: ${mode}**
You embody the analytical personality of a ${mode}. Your approach is methodical analysis with clear improvement objectives.

**Your Task:**
You will receive the user's text. Your job is to dissect their communication style across 6 key categories and provide role-specific feedback.

**6-Category Scoring System (0-20 points each, total 120):**
1. **Clarity (0-20):** How clear and understandable is their text? Do they use precise language?
2. **Vocabulary Richness (0-20):** Variety and sophistication of word choice, avoiding repetition
3. **Grammar Accuracy (0-20):** Correct sentence structure, punctuation, and language mechanics
4. **Logic/Coherence (0-20):** Logical flow, organization, and connection between ideas
5. **Fluency (0-20):** Smoothness of writing, natural rhythm, and ease of understanding
6. **Creativity (0-20):** Originality, imaginative expression, and engaging storytelling elements

**Input:**
- **The User's Text:** ${userText}

**Output Instructions:**
Your entire output MUST be a single, valid JSON object without any markdown or extra text.`;

  const response = await callWithRetry(
    ai,
    async (model) =>
      ai.models.generateContent({
        model,
        contents: systemInstruction,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              role: { type: Type.STRING, description: "The coaching role used." },
              overall_score: {
                type: Type.INTEGER,
                description: "Overall score out of 100.",
              },
              category_scores: {
                type: Type.OBJECT,
                description:
                  "Individual scores for each of the 6 categories (0-20 each).",
                properties: {
                  clarity: {
                    type: Type.INTEGER,
                    description: "Clarity score (0-20).",
                  },
                  vocabulary: {
                    type: Type.INTEGER,
                    description: "Vocabulary score (0-20).",
                  },
                  grammar: {
                    type: Type.INTEGER,
                    description: "Grammar score (0-20).",
                  },
                  logic: { type: Type.INTEGER, description: "Logic score (0-20)." },
                  fluency: {
                    type: Type.INTEGER,
                    description: "Fluency score (0-20).",
                  },
                  creativity: {
                    type: Type.INTEGER,
                    description: "Creativity score (0-20).",
                  },
                },
                required: [
                  "clarity",
                  "vocabulary",
                  "grammar",
                  "logic",
                  "fluency",
                  "creativity",
                ],
              },
              feedback: {
                type: Type.STRING,
                description: "Role-specific feedback message.",
              },
              tips: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "3-5 personalized improvement tips.",
              },
              // Legacy fields for backward compatibility
              score: {
                type: Type.INTEGER,
                description: "Legacy overall score (same as overall_score).",
              },
              whatYouDidWell: {
                type: Type.STRING,
                description: "What they did well.",
              },
              areasForImprovement: {
                type: Type.STRING,
                description: "Areas for improvement.",
              },
              personalizedTip: {
                type: Type.STRING,
                description: "Personalized tip.",
              },
              spokenResponse: {
                type: Type.STRING,
                description: "Spoken response.",
              },
              communicationBehavior: {
                type: Type.OBJECT,
                description: "Communication profile analysis - REQUIRED FIELD.",
                properties: {
                  profile: {
                    type: Type.STRING,
                    description:
                      'Communication style profile (e.g., "Concise Communicator", "Detail-Oriented", "Storyteller").',
                  },
                  strength: {
                    type: Type.STRING,
                    description: "Primary communication strength.",
                  },
                  growthArea: {
                    type: Type.STRING,
                    description: "Main area for improvement.",
                  },
                },
                required: ["profile", "strength", "growthArea"],
              },
              exampleRewrite: {
                type: Type.OBJECT,
                description: "Example improvement - REQUIRED FIELD.",
                properties: {
                  original: {
                    type: Type.STRING,
                    description: "The user's original explanation.",
                  },
                  improved: {
                    type: Type.STRING,
                    description: "An improved version of their explanation.",
                  },
                  reasoning: {
                    type: Type.STRING,
                    description: "Why the improved version is better.",
                  },
                },
                required: ["original", "improved", "reasoning"],
              },
            },
            required: [
              "role",
              "overall_score",
              "category_scores",
              "feedback",
              "tips",
              "score",
              "whatYouDidWell",
              "areasForImprovement",
              "personalizedTip",
              "spokenResponse",
              "communicationBehavior",
              "exampleRewrite",
            ],
          },
        },
      }),
    { preferredModel: "gemini-2.5-flash", perAttemptTimeoutMs: 10000 },
  );

  const result = JSON.parse(response.text);
  console.log("✅ Generic evaluation generated");
  return result;
}

/**
 * Gets AI agent response for group discussion - either initial response or response to user's contribution.
 * Returns structured response with agent information and natural conversation.
 */
export async function getGroupDiscussionResponse(
  ai: GoogleGenAI,
  topic: string,
  userContribution: string,
  roundNumber: number,
  isInitialResponse: boolean,
  activeAgents: Array<{
    name: string;
    personality: string;
    description: string;
    avatar: string;
    color: string;
  }>,
  messageHistory?: Array<{
    type: string;
    content: string;
    agentName?: string;
    agentPersonality?: string;
  }>,
): Promise<{ content: string; agentName: string; agentPersonality: string }> {
  console.log("🎯 getGroupDiscussionResponse called with:", {
    topic,
    userContributionLength: userContribution.length,
    roundNumber,
    isInitialResponse,
    activeAgentsCount: activeAgents.length,
  });

  if (isInitialResponse) {
    // Initial response - one agent starts the discussion
    const startingAgent = activeAgents[0];
    const systemInstruction = `You are ${startingAgent.name}, a professional participant in a group discussion. You have the personality of a "${startingAgent.personality}" - ${startingAgent.description}.

**Discussion Topic:** ${topic}

**Your Task:**
Start the discussion with 1-2 sentences. Be direct and authentic.

**Collaborative Style:**
- Maximum 2 sentences
- Be supportive and constructive
- Share insights or ask helpful questions
- Build on the topic positively
- Sound like a helpful colleague

**Your Professional Approach:**
- ${startingAgent.personality === "Analytical Thinker" ? "Focus on data, logic, and evidence. Ask for specifics and challenge vague statements." : ""}
- ${startingAgent.personality === "Creative Visionary" ? "Think outside the box, challenge assumptions, and propose innovative solutions." : ""}
- ${startingAgent.personality === "Practical Realist" ? "Ground ideas in reality, focus on what actually works, and point out implementation challenges." : ""}
- ${startingAgent.personality === "Social Connector" ? "Build on others' ideas, facilitate discussion, but don't hesitate to call out poor reasoning." : ""}

**Your Personality:** ${startingAgent.personality}
**Your Description:** ${startingAgent.description}

**Output:**
Just your natural opening contribution to start the discussion. Be professional, authentic, and substantive.`;

    const response = await callWithRetry(
      ai,
      async (model) =>
        ai.models.generateContent({
          model,
          contents: systemInstruction,
          config: {
            temperature: 0.8,
          },
        }),
      { preferredModel: "gemini-2.5-flash", perAttemptTimeoutMs: 8000 },
    );

    const content = response.text.trim();
    console.log("✅ Initial group discussion response generated");
    return {
      content,
      agentName: startingAgent.name,
      agentPersonality: startingAgent.personality,
    };
  } else {
    // Response to user's contribution - another agent responds
    const respondingAgent = activeAgents[roundNumber % activeAgents.length];

    // Format message history for context
    const historyText = messageHistory
      ? messageHistory
        .slice(-6) // Last 6 messages for context
        .map(
          (msg) =>
            `${msg.type === "user" ? "User" : msg.agentName}: ${msg.content}`,
        )
        .join("\n")
      : "";

    const systemInstruction = `You are ${respondingAgent.name}, a professional participant in a group discussion. You have the personality of a "${respondingAgent.personality}" - ${respondingAgent.description}.

**Discussion Topic:** ${topic}
${userContribution ? `**User's Latest Contribution:** ${userContribution}` : "**Context:** Continue the group discussion naturally"}

**Recent Discussion Context:**
${historyText}

**Your Task:**
${userContribution
        ? "Respond with 1-2 sentences. Build on good points or offer helpful alternatives to weak ones."
        : "Continue the discussion with 1-2 sentences. Be collaborative and constructive."
      }

**Collaborative Style:**
- Maximum 2 sentences
- Be supportive and constructive
- Build on ideas: "That's interesting, and we could also..."
- Offer alternatives: "Another way to look at it might be..."
- Ask helpful questions
- Sound like a supportive colleague

**Your Style:**
${respondingAgent.personality === "Analytical Thinker" ? "Share relevant data. Ask clarifying questions to help everyone understand better." : ""}
${respondingAgent.personality === "Creative Visionary" ? "Suggest creative alternatives. Build on others' ideas with new possibilities." : ""}
${respondingAgent.personality === "Practical Realist" ? "Share implementation insights. Help ground ideas in reality constructively." : ""}
${respondingAgent.personality === "Social Connector" ? "Connect different viewpoints. Help facilitate productive collaboration." : ""}

**Your Personality:** ${respondingAgent.personality}
**Your Description:** ${respondingAgent.description}

**Output:**
Just 1-2 sentences. Be collaborative and helpful.`;

    const response = await callWithRetry(
      ai,
      async (model) =>
        ai.models.generateContent({
          model,
          contents: systemInstruction,
          config: {
            temperature: 0.8,
          },
        }),
      { preferredModel: "gemini-2.5-flash", perAttemptTimeoutMs: 8000 },
    );

    const content = response.text.trim();
    console.log("✅ Group discussion response generated");
    return {
      content,
      agentName: respondingAgent.name,
      agentPersonality: respondingAgent.personality,
    };
  }
}

/**
 * Scores an individual debate message with strict evidence requirements and realistic scoring.
 * Each message is evaluated independently to catch weak responses that get hidden in overall scoring.
 */
export async function scoreIndividualDebateMessage(
  ai: GoogleGenAI,
  topic: string,
  userMessage: string,
  opponentMessage: string,
  messageNumber: number,
): Promise<{
  messageNumber: number;
  messageContent: string;
  scores: {
    logicReasoning: number;
    evidenceQuality: number;
    toneLanguage: number;
    opponentEngagement: number;
    argumentStructure: number;
  };
  overallPerformance: number;
  critique: string;
}> {
  console.log("🎯 scoreIndividualDebateMessage called with:", {
    topic,
    userMessageLength: userMessage.length,
    messageNumber,
  });

  const systemInstruction = `You are a BRUTALLY HONEST debate coach evaluating ONE individual message. You've seen thousands of debates and you're tired of inflated scores. Score this SINGLE response with REALISTIC standards.

**MANDATORY RELEVANCE & ACCURACY CHECK:**
Before scoring, you MUST verify if the 'USER'S RESPONSE' actually addresses the 'Topic' and responds to the 'OPPONENT'S PREVIOUS ARGUMENT' (if any).
1. If the response is irrelevant, garbage, nonsense, or completely unrelated to the debate topic:
   - YOU MUST AWARD ZERO (0) for ALL individual scores and the overallPerformance.
   - The 'critique' MUST explicitly state that the response is irrelevant.
2. If the response is extremely shallow (e.g., "I don't know," "Maybe," or less than 5 words):
   - AWARD a maximum overallPerformance of 10.

**DEBATE CONTEXT:**
Topic: ${topic}
Message Number: ${messageNumber}

**OPPONENT'S PREVIOUS ARGUMENT:**
${opponentMessage}

**USER'S RESPONSE TO EVALUATE:**
"${userMessage}"

**INDIVIDUAL CATEGORY SCORING (0-20 points each) - SCORE EACH INDEPENDENTLY:**

**Logic & Reasoning (0-20) - EVALUATE ACTUAL LOGICAL QUALITY:**
- 0-2: Complete nonsense, random words, no logic at all
- 3-5: Makes no sense, contradictions, illogical statements
- 6-8: Basic logic with MAJOR holes, weak reasoning, flawed arguments
- 9-11: Decent logic but has gaps, some sound reasoning, minor flaws
- 12-14: Strong logic, mostly sound reasoning, coherent arguments
- 15-17: Excellent logic, bulletproof reasoning, anticipates counter-arguments
- 18-20: Flawless logic, masterful reasoning, anticipates all objections

**Evidence Quality (0-20) - EVALUATE ACTUAL EVIDENCE STRENGTH:**
- 0-2: No evidence, random claims, irrelevant, just opinions
- 3-5: Vague claims, no support, just assertions
- 6-8: General reasoning but NO specific support (CAP AT 8)
- 9-11: One decent example or logical chain, some support
- 12-14: Multiple specific examples OR one data point, good support
- 15-17: Multiple data points, credible sources, strong evidence
- 18-20: Multiple authoritative sources, compelling data, bulletproof evidence

**Tone & Language (0-20) - EVALUATE ACTUAL COMMUNICATION QUALITY:**
- 0-1: Hate speech, extremely offensive, vulgar profanity
- 2-3: Inappropriate, rude, unprofessional language
- 4-6: Basic tone, simple language, mostly appropriate
- 7-9: Professional tone, articulate, clear
- 10-14: Sophisticated tone, eloquent delivery
- 15-17: Masterful tone, compelling delivery
- 18-20: Exceptional tone, persuasive mastery

**BRUTAL TONE SCORING RULES:**
- Hate speech ("I hate [group]") = 0-1 points MAXIMUM
- Vulgar profanity (f-word, explicit) = 0-2 points MAXIMUM
- Rude/inappropriate = 2-3 points MAXIMUM
- 1-3 word responses = 0-3 points MAXIMUM regardless of content
- Professional debate language = 7+ points

**Opponent Engagement (0-20) - EVALUATE ACTUAL ENGAGEMENT:**
- 0-2: Ignores opponent completely, talks past them
- 3-5: Basic engagement, some acknowledgment
- 6-8: Good engagement, addresses some points
- 9-11: Strong engagement, addresses most points
- 12-14: Exceptional engagement, dismantles arguments
- 15-17: Masterful engagement, destroys opponent's position
- 18-20: Championship-level engagement, annihilates all arguments

**Argument Structure (0-20) - EVALUATE ACTUAL STRUCTURE:**
- 0-2: No structure, random, incomprehensible
- 3-5: Disorganized, rambling, unclear, no structure
- 6-8: Basic structure, some organization
- 9-11: Clear structure, well-organized
- 12-14: Strong structure, logical flow
- 15-17: Exceptional structure, masterful organization
- 18-20: Perfect structure, flawless organization

**OVERALL PERFORMANCE SCORING (0-100) - SEPARATE FROM CATEGORY SCORES:**
Evaluate the message's overall effectiveness as a debate response:
- 0-20: Completely ineffective, irrelevant, or nonsensical
- 21-40: Weak response with major flaws, minimal impact
- 41-60: Decent response with some strengths but clear weaknesses
- 61-80: Strong response that effectively advances the argument
- 81-100: Exceptional response that dominates the debate

**CRITICAL SCORING RULES:**
- Score each category (Logic, Evidence, Tone, Engagement, Structure) INDEPENDENTLY
- Do NOT average the category scores to get overall performance
- Overall performance should reflect the message's total impact and effectiveness
- Category scores show specific strengths/weaknesses
- Overall performance shows overall debate effectiveness
- Give realistic, differentiated scores that reflect actual performance

3. **Tone & Language (0-20):**
   - 0-4: Inappropriate tone, basic language, unclear
   - 5-8: Adequate tone, simple language, mostly clear
   - 9-12: Professional tone, articulate, clear
   - 13-16: Sophisticated tone, eloquent delivery
   - 17-20: Masterful tone, compelling delivery

4. **Opponent Engagement (0-20):**
   - 0-4: Ignores opponent completely, talks past them
   - 5-8: Basic engagement, some acknowledgment
   - 9-12: Good engagement, addresses some points
   - 13-16: Strong engagement, addresses most points
   - 17-20: Exceptional engagement, dismantles arguments

5. **Argument Structure (0-20):**
   - 0-4: Disorganized, rambling, unclear, no structure
   - 5-8: Basic structure, some organization
   - 9-12: Clear structure, well-organized
   - 13-16: Strong structure, logical flow
   - 17-20: Exceptional structure, masterful organization

**ACCURATE SCORING RULES:**
- 1-2 word nonsense/irrelevant = 0-8 TOTAL
- Short but coherent (e.g., "That's a false equivalence") = 12-25 TOTAL
- NO specific data/examples = Evidence Quality CAPS at 8 points max
- 13+ Evidence Quality requires: real data, studies, historical examples, or detailed reasoning chains
- Most individual messages score 10-40 points - that's REALITY
- Only exceptional single responses get 50+ points

**CRITICAL: EVALUATE CATEGORIES INDEPENDENTLY:**
- Good logic WITHOUT evidence = Logic gets 13-16 points, Evidence gets 5-8 points
- Good evidence WITHOUT logic = Evidence gets 13-16 points, Logic gets 5-8 points
- Strong logic + weak evidence = Logic 15, Evidence 6, Tone 12, Engagement 10, Structure 11 = 54 total
- Weak logic + strong evidence = Logic 6, Evidence 15, Tone 12, Engagement 10, Structure 11 = 54 total
- BOTH logic AND evidence strong = Logic 16, Evidence 16, Tone 14, Engagement 15, Structure 15 = 76 total

**CRITICAL: GIVE DIFFERENT SCORES FOR EACH CATEGORY - NO SAME NUMBERS:**
- Logic & Reasoning: Could be 8/20 (weak logic)
- Evidence Quality: Could be 15/20 (strong evidence)
- Tone & Language: Could be 12/20 (decent tone)
- Opponent Engagement: Could be 6/20 (poor engagement)
- Argument Structure: Could be 10/20 (basic structure)
- TOTAL: 51/100 (different scores show different strengths/weaknesses)

**NEVER GIVE SAME SCORES LIKE 10/20, 10/20, 10/20, 10/20, 10/20 = 50/100**
**ALWAYS GIVE DIFFERENT SCORES LIKE 8/20, 15/20, 12/20, 6/20, 10/20 = 51/100**

**SCORE BASED ON ACTUAL PERFORMANCE - NO EXAMPLES TO COPY:**
- Read their actual message and analyze the quality
- Score each category based on how well they actually performed
- Give different scores that reflect their actual strengths and weaknesses
- NO copying examples - analyze their unique response

**BRUTALLY ACCURATE ANALYSIS REQUIREMENTS - BE REAL, NOT ROBOTIC:**
- Quote their exact words as proof of the score
- Identify specific problems with THIS message using their actual words
- Be direct and honest about THIS response - what they ACTUALLY said
- Don't sugarcoat - be brutally honest about real performance
- Don't inflate scores to be nice - users want accuracy, not fake praise

**CRITICAL SCORING RULES - NO EXCEPTIONS:**
- **1-3 word responses = 0-8 TOTAL points maximum (all categories combined)**
- **Hate speech = 0-1 Tone points, 0-3 total points maximum**
- **"I hate [anything]" = 0-1 Tone, 0-2 Logic, 0-1 Evidence, 0-2 Engagement, 0-2 Structure**
- **Vulgar profanity = 0-2 Tone points maximum**
- **Empty responses = 0 points in all categories**
- **Single sentences without reasoning = maximum 15 total points**

**CONTENT-BASED SCORING - EVALUATE ACTUAL MEANING:**

**MEANINGFUL SHORT RESPONSES CAN SCORE WELL:**
- "That's a false equivalence" = Logic: 12, Tone: 8, Engagement: 10 (good logic, short but meaningful)
- "Where's your evidence?" = Logic: 8, Engagement: 12, Tone: 9 (challenges opponent effectively)
- "You contradicted yourself" = Logic: 11, Engagement: 10, Tone: 8 (points out logical flaw)

**MEANINGLESS RESPONSES GET LOW SCORES:**
- "I hate feminism" = Tone: 0, Logic: 0, Evidence: 0, Engagement: 0, Structure: 1 = 1 total
- "That's stupid" = Tone: 3, Logic: 2, Evidence: 0, Engagement: 2, Structure: 2 = 9 total
- "Whatever" = All categories: 0-1 points = 2 total

**SCORE BASED ON ACTUAL CONTENT QUALITY:**
- Does it make a logical point? → Logic score
- Does it engage with opponent's argument? → Engagement score  
- Is the tone appropriate for debate? → Tone score
- Does it provide support/reasoning? → Evidence score
- Is it organized/clear? → Structure score

**LENGTH DOESN'T MATTER - MEANING DOES:**
- Short but insightful = High scores
- Long but meaningless = Low scores
- Hate speech = Always 0-1 points regardless of length
- Logical fallacy identification = High logic score even if short
- **CRITICAL: Read their actual message content and score based on what they actually said**
- **CRITICAL: Don't use hardcoded keywords - analyze their actual performance**
- **CRITICAL: Each score must reflect their actual response quality, not generic templates**
- **CRITICAL: If their logic is excellent, give them 18-20 points - don't cap at 14**
- **CRITICAL: If their evidence is strong, give them 16-20 points - don't cap at 14**
- **CRITICAL: Score their ACTUAL quality, not some artificial limit**
- **CRITICAL: If their logic is sound, give them credit for it even if evidence is weak**
- **CRITICAL: If their evidence is good, give them credit for it even if logic is weak**
- **CRITICAL: Evaluate each category based on its own criteria, not other categories**
- **CRITICAL: Don't penalize Logic just because Evidence is weak**
- **CRITICAL: Don't penalize Evidence just because Logic is weak**
- **CRITICAL: ALWAYS GIVE DIFFERENT SCORES - NEVER SAME NUMBERS**
- **CRITICAL: If someone has Logic 8, Evidence 15, Tone 12, Engagement 6, Structure 10 = 51 total**
- **CRITICAL: Show their actual strengths and weaknesses with different numbers**
- **CRITICAL: Logic 18, Evidence 3, Tone 16, Engagement 5, Structure 17 = DIFFERENT SCORES**
- **CRITICAL: Each category measures DIFFERENT skills - score them DIFFERENTLY**
- **CRITICAL: If someone has good logic but bad evidence, give Logic 18, Evidence 3**
- **CRITICAL: If someone has good tone but poor engagement, give Tone 16, Engagement 5**
- **CRITICAL: Analyze each category based on ACTUAL performance in that category**
- **CRITICAL: If logic is sound but evidence is weak = Logic 13, Evidence 6 (not Logic 8, Evidence 8)**
- **CRITICAL: If tone is good but engagement is poor = Tone 12, Engagement 6 (not Tone 8, Engagement 8)**
- **CRITICAL: Give realistic scores that reflect actual performance**
- **CRITICAL: BE BRUTALLY HONEST - Most people are terrible at debating**
- **CRITICAL: Don't give inflated scores - 2-word responses get 0-5 total**
- **CRITICAL: Only detailed, thoughtful arguments get 50+ points**

**PURE PERFORMANCE ANALYSIS - NO RULES, NO KEYWORDS, NO HARDCODING:**
- Read their message and analyze the QUALITY of their actual response
- Score based on how well they actually performed, not what words they used
- Each category gets a score based on their actual performance in that area
- NO maximum caps, NO minimum requirements, NO keyword matching
- If their logic is excellent, give them 18-20 points regardless of evidence
- If their evidence is strong, give them 16-20 points regardless of logic
- Score their ACTUAL performance, not some template or rule

**CRITICAL: EACH CATEGORY IS COMPLETELY DIFFERENT - SCORE THEM INDEPENDENTLY:**
- Logic & Reasoning: How well did they think and reason? (Could be 3/20 or 18/20)
- Evidence Quality: How well did they support their argument? (Could be 2/20 or 19/20)
- Tone & Language: How well did they communicate? (Could be 5/20 or 17/20)
- Opponent Engagement: How well did they engage with the opponent? (Could be 4/20 or 16/20)
- Argument Structure: How well did they organize their response? (Could be 6/20 or 18/20)

**NEVER GIVE SIMILAR SCORES - EACH CATEGORY IS DIFFERENT:**
- Someone can have excellent logic (18/20) but terrible evidence (3/20)
- Someone can have great tone (16/20) but poor engagement (5/20)
- Someone can have strong structure (17/20) but weak logic (7/20)
- Each category reflects a DIFFERENT skill - score them DIFFERENTLY

**EVIDENCE QUALITY - HOW WELL DID THEY SUPPORT THEIR ARGUMENT:**
- Did they actually support their points well? Score based on their actual support quality
- Did they provide good reasoning? Score based on their actual reasoning quality
- Did they make their case effectively? Score based on their actual effectiveness
- NO rules about "must have studies" - score their actual evidence quality

**LOGIC & REASONING - HOW WELL DID THEY THINK:**
- Is their actual thinking sound? Score based on their actual thinking quality
- Do they make sense? Score based on their actual coherence
- Are their points logical? Score based on their actual logic quality
- NO rules about "must address opponent" - score their actual reasoning

**TONE & LANGUAGE - HOW WELL DID THEY COMMUNICATE:**
- How effective was their communication? Score based on their actual effectiveness
- Did they express themselves well? Score based on their actual expression
- Were they clear and persuasive? Score based on their actual clarity and persuasion
- NO rules about "must be confident" - score their actual communication

**OPPONENT ENGAGEMENT - HOW WELL DID THEY ENGAGE:**
- Did they engage effectively? Score based on their actual engagement quality
- Did they respond well? Score based on their actual response quality
- Did they stay focused? Score based on their actual focus quality
- NO rules about "must challenge" - score their actual engagement

**ARGUMENT STRUCTURE - HOW WELL DID THEY ORGANIZE:**
- Did they organize well? Score based on their actual organization quality
- Did they structure effectively? Score based on their actual structure quality
- Did they present clearly? Score based on their actual presentation quality
- NO rules about "must have conclusion" - score their actual organization

**Output Instructions:**
Your entire output MUST be a single, valid JSON object without any markdown or extra text.`;

  const response = await callWithRetry(
    ai,
    async (model) =>
      ai.models.generateContent({
        model,
        contents: systemInstruction,
        config: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              messageNumber: {
                type: Type.INTEGER,
                description: "The message number being evaluated.",
              },
              messageContent: {
                type: Type.STRING,
                description: "The exact message content.",
              },
              scores: {
                type: Type.OBJECT,
                description:
                  "Individual scores for each of the 5 categories (0-20 each).",
                properties: {
                  logicReasoning: {
                    type: Type.INTEGER,
                    description: "Logic & Reasoning score (0-20).",
                  },
                  evidenceQuality: {
                    type: Type.INTEGER,
                    description: "Evidence Quality score (0-20).",
                  },
                  toneLanguage: {
                    type: Type.INTEGER,
                    description: "Tone & Language score (0-20).",
                  },
                  opponentEngagement: {
                    type: Type.INTEGER,
                    description: "Opponent Engagement score (0-20).",
                  },
                  argumentStructure: {
                    type: Type.INTEGER,
                    description: "Argument Structure score (0-20).",
                  },
                },
                required: [
                  "logicReasoning",
                  "evidenceQuality",
                  "toneLanguage",
                  "opponentEngagement",
                  "argumentStructure",
                ],
              },
              overallPerformance: {
                type: Type.INTEGER,
                description:
                  "Overall performance score out of 100 for this individual message - separate from category scores.",
              },
              critique: {
                type: Type.STRING,
                description:
                  "BRIEF critique of this specific message - MAX 2 sentences.",
              },
            },
            required: [
              "messageNumber",
              "messageContent",
              "scores",
              "overallPerformance",
              "critique",
            ],
          },
        },
      }),
    { preferredModel: "gemini-2.5-flash", perAttemptTimeoutMs: 10000 },
  );

  const result = JSON.parse(response.text);
  console.log("✅ Individual message scored:", result.overallPerformance);
  return result;
}

/**
 * Analyzes performance patterns across individual message scores.
 */
function analyzePerformancePatterns(
  messageScores: Array<{ messageNumber: number; overallPerformance: number }>,
): string {
  if (messageScores.length === 0) return "No messages to analyze";

  const scores = messageScores.map((msg) => msg.overallPerformance);
  const avgScore =
    scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const scoreRange = maxScore - minScore;

  // Detect patterns
  const patterns = [];

  if (scoreRange > 30) {
    patterns.push(
      `High variance: ${minScore}-${maxScore} range shows inconsistent performance`,
    );
  } else if (scoreRange < 10) {
    patterns.push(
      `Consistent performance: ${minScore}-${maxScore} range shows stable quality`,
    );
  }

  if (scores[0] < avgScore - 10) {
    patterns.push(
      `Weak opener (${scores[0]}) but improves to avg ${Math.round(avgScore)}`,
    );
  } else if (scores[0] > avgScore + 10) {
    patterns.push(
      `Strong opener (${scores[0]}) but declines to avg ${Math.round(avgScore)}`,
    );
  }

  if (scores.length > 2) {
    const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
    const secondHalf = scores.slice(Math.floor(scores.length / 2));
    const firstAvg =
      firstHalf.reduce((sum, score) => sum + score, 0) / firstHalf.length;
    const secondAvg =
      secondHalf.reduce((sum, score) => sum + score, 0) / secondHalf.length;

    if (secondAvg > firstAvg + 10) {
      patterns.push(
        `Improves over time: ${Math.round(firstAvg)} → ${Math.round(secondAvg)}`,
      );
    } else if (firstAvg > secondAvg + 10) {
      patterns.push(
        `Declines over time: ${Math.round(firstAvg)} → ${Math.round(secondAvg)}`,
      );
    }
  }

  if (avgScore < 25) {
    patterns.push(`Overall weak performance (avg ${Math.round(avgScore)})`);
  } else if (avgScore > 60) {
    patterns.push(`Strong overall performance (avg ${Math.round(avgScore)})`);
  }

  return patterns.length > 0
    ? patterns.join("; ")
    : `Average performance: ${Math.round(avgScore)}`;
}

/**
 * Enhanced debate evaluation function that analyzes performance using per-message scoring.
 * Each user message is scored individually, then averaged for realistic overall assessment.
 */
export async function getEnhancedDebateEvaluation(
  ai: GoogleGenAI,
  debateTopic: string,
  debateHistory: Array<{
    type: string;
    content: string;
    agentName?: string;
    agentPersonality?: string;
    timestamp: Date;
  }>,
  userParticipationCount: number,
): Promise<any> {
  console.log("🎯 getEnhancedDebateEvaluation called with:", {
    debateTopic,
    debateLength: debateHistory.length,
    userParticipationCount,
  });

  // Extract user messages and their context
  const userMessages = debateHistory.filter((msg) => msg.type === "user");
  const messageScores = [];

  // Score each user message individually
  for (let i = 0; i < userMessages.length; i++) {
    const userMsg = userMessages[i];
    const opponentMsg =
      i > 0
        ? debateHistory[debateHistory.indexOf(userMsg) - 1]?.content || ""
        : "";

    const messageScore = await scoreIndividualDebateMessage(
      ai,
      debateTopic,
      userMsg.content,
      opponentMsg,
      i + 1,
    );
    messageScores.push(messageScore);
  }

  // Calculate average scores across all messages for individual categories
  const avgScores = {
    logicReasoning: Math.round(
      messageScores.reduce((sum, msg) => sum + msg.scores.logicReasoning, 0) /
      messageScores.length,
    ),
    evidenceQuality: Math.round(
      messageScores.reduce((sum, msg) => sum + msg.scores.evidenceQuality, 0) /
      messageScores.length,
    ),
    toneLanguage: Math.round(
      messageScores.reduce((sum, msg) => sum + msg.scores.toneLanguage, 0) /
      messageScores.length,
    ),
    opponentEngagement: Math.round(
      messageScores.reduce(
        (sum, msg) => sum + msg.scores.opponentEngagement,
        0,
      ) / messageScores.length,
    ),
    argumentStructure: Math.round(
      messageScores.reduce(
        (sum, msg) => sum + msg.scores.argumentStructure,
        0,
      ) / messageScores.length,
    ),
  };

  // Calculate overall performance score as weighted average of categories
  const categoryTotal = Object.values(avgScores).reduce((sum, score) => sum + score, 0);
  const overallScore = Math.round((categoryTotal / 100) * 100); // Convert from 0-100 to 0-100 scale

  // Analyze performance patterns
  const performancePatterns = analyzePerformancePatterns(messageScores);

  // Format debate history for context
  const debateText = debateHistory
    .map(
      (msg) =>
        `${msg.type === "user" ? "USER" : "AI_OPPONENT"}: ${msg.content}`,
    )
    .join("\n\n");

  const systemInstruction = `You are a BRUTALLY HONEST debate coach analyzing per-message performance. Each user message has been scored individually with realistic standards. Now provide overall analysis and patterns.

**DEBATE CONTEXT:**
Topic: ${debateTopic}
User Participation Count: ${userParticipationCount}
Overall Score: ${overallScore}/100

**PER-MESSAGE SCORING RESULTS:**
${messageScores.map((msg) => `Message ${msg.messageNumber}: "${msg.messageContent}" - Overall Performance: ${msg.overallPerformance}/100`).join("\n")}

**ANALYZE THEIR ACTUAL PERFORMANCE - NO EXAMPLES TO COPY:**
- Read their actual messages and analyze the quality
- Category scores show specific strengths/weaknesses in each area
- Overall performance shows total debate effectiveness
- NO copying examples - analyze their unique responses

**AVERAGE CATEGORY SCORES (INDIVIDUAL PERFORMANCE):**
- Logic & Reasoning: ${avgScores.logicReasoning}/20
- Evidence Quality: ${avgScores.evidenceQuality}/20
- Tone & Language: ${avgScores.toneLanguage}/20
- Opponent Engagement: ${avgScores.opponentEngagement}/20
- Argument Structure: ${avgScores.argumentStructure}/20

**OVERALL PERFORMANCE SCORE:**
- Overall Performance: ${overallScore}/100 (calculated separately from category averages)

**PERFORMANCE PATTERNS DETECTED:**
${performancePatterns}

**REALISTIC SCORE INTERPRETATION:**
- 0-8: Nonsense, irrelevant, or empty responses
- 8-15: Minimal logic, no evidence, weak reasoning
- 15-25: Basic arguments, weak reasoning, no data
- 25-40: Decent logic, some examples (typical)
- 40-55: Strong logic, good evidence (good debater)
- 55-70: Excellent logic, compelling data (elite)
- 70-100: Championship-level performance (rare)

**BRUTALLY ACCURATE ANALYSIS REQUIREMENTS - BE REAL, NOT ROBOTIC:**
- Reference specific message scores and patterns
- Quote exact user words as evidence for scores
- Identify where they struggled vs excelled with specific examples
- Show improvement opportunities tied to actual debate moments
- Be brutally honest about performance - analyze what they DID, not what they COULD do
- **CRITICAL: Read their actual message content and score based on what they actually said**
- **CRITICAL: Don't use hardcoded keywords - analyze their actual performance**
- **CRITICAL: Each score must reflect their actual response quality, not generic templates**
- **CRITICAL: If their logic is excellent, give them 18-20 points - don't cap at 14**
- **CRITICAL: If their evidence is strong, give them 16-20 points - don't cap at 14**
- **CRITICAL: Score their ACTUAL quality, not some artificial limit**
- **CRITICAL: Recognize that Logic and Evidence are independent categories**
- **CRITICAL: If someone has good logic but weak evidence, acknowledge the strong logic**
- **CRITICAL: If someone has good evidence but weak logic, acknowledge the strong evidence**
- **CRITICAL: Don't penalize one category because another is weak**
- **CRITICAL: ALWAYS GIVE DIFFERENT SCORES FOR EACH CATEGORY**
- **CRITICAL: NEVER GIVE SAME SCORES LIKE 10/20, 10/20, 10/20, 10/20, 10/20**
- **CRITICAL: SHOW ACTUAL STRENGTHS AND WEAKNESSES WITH DIFFERENT NUMBERS**
- **CRITICAL: Logic 18, Evidence 3, Tone 16, Engagement 5, Structure 17 = DIFFERENT SCORES**
- **CRITICAL: Each category measures DIFFERENT skills - score them DIFFERENTLY**
- **CRITICAL: If someone has good logic but bad evidence, give Logic 18, Evidence 3**
- **CRITICAL: If someone has good tone but poor engagement, give Tone 16, Engagement 5**
- **CRITICAL: BE BRUTALLY HONEST - Most people are terrible at debating**
- **CRITICAL: Don't give inflated scores - 2-word responses get 0-5 total**
- **CRITICAL: Only detailed, thoughtful arguments get 50+ points**
- **CRITICAL: Give realistic scores that reflect actual performance**

**PURE PERFORMANCE ANALYSIS - NO RULES, NO KEYWORDS, NO HARDCODING:**
- Read their message and analyze the QUALITY of their actual response
- Score based on how well they actually performed, not what words they used
- Each category gets a score based on their actual performance in that area
- NO maximum caps, NO minimum requirements, NO keyword matching
- If their logic is excellent, give them 18-20 points regardless of evidence
- If their evidence is strong, give them 16-20 points regardless of logic
- Score their ACTUAL performance, not some template or rule

**CRITICAL: EACH CATEGORY IS COMPLETELY DIFFERENT - SCORE THEM INDEPENDENTLY:**
- Logic & Reasoning: How well did they think and reason? (Could be 3/20 or 18/20)
- Evidence Quality: How well did they support their argument? (Could be 2/20 or 19/20)
- Tone & Language: How well did they communicate? (Could be 5/20 or 17/20)
- Opponent Engagement: How well did they engage with the opponent? (Could be 4/20 or 16/20)
- Argument Structure: How well did they organize their response? (Could be 6/20 or 18/20)

**NEVER GIVE SIMILAR SCORES - EACH CATEGORY IS DIFFERENT:**
- Someone can have excellent logic (18/20) but terrible evidence (3/20)
- Someone can have great tone (16/20) but poor engagement (5/20)
- Someone can have strong structure (17/20) but weak logic (7/20)
- Each category reflects a DIFFERENT skill - score them DIFFERENTLY

**EVIDENCE QUALITY - HOW WELL DID THEY SUPPORT THEIR ARGUMENT:**
- Did they actually support their points well? Score based on their actual support quality
- Did they provide good reasoning? Score based on their actual reasoning quality
- Did they make their case effectively? Score based on their actual effectiveness
- NO rules about "must have studies" - score their actual evidence quality

**LOGIC & REASONING - HOW WELL DID THEY THINK:**
- Is their actual thinking sound? Score based on their actual thinking quality
- Do they make sense? Score based on their actual coherence
- Are their points logical? Score based on their actual logic quality
- NO rules about "must address opponent" - score their actual reasoning

**TONE & LANGUAGE - HOW WELL DID THEY COMMUNICATE:**
- How effective was their communication? Score based on their actual effectiveness
- Did they express themselves well? Score based on their actual expression
- Were they clear and persuasive? Score based on their actual clarity and persuasion
- NO rules about "must be confident" - score their actual communication

**OPPONENT ENGAGEMENT - HOW WELL DID THEY ENGAGE:**
- Did they engage effectively? Score based on their actual engagement quality
- Did they respond well? Score based on their actual response quality
- Did they stay focused? Score based on their actual focus quality
- NO rules about "must challenge" - score their actual engagement

**ARGUMENT STRUCTURE - HOW WELL DID THEY ORGANIZE:**
- Did they organize well? Score based on their actual organization quality
- Did they structure effectively? Score based on their actual structure quality
- Did they present clearly? Score based on their actual presentation quality
- NO rules about "must have conclusion" - score their actual organization

**STOP BEING ROBOTIC - BE REAL:**
- Don't give "benefit of the doubt" scores
- Don't inflate scores to be nice
- Don't use generic feedback templates
- DO quote their exact words and explain why they got that score
- DO compare their performance to real debate standards
- DO give actionable feedback based on what they actually said

**RESPONSE STYLE - BE BRUTALLY HONEST:**
- MAXIMUM 1-2 sentences per response field
- If no real strengths exist, say "No significant strengths demonstrated"
- If performance is terrible, say so directly
- Don't make up fake positives like "consistent typing"
- Be direct and actionable - cut to the point immediately
- Use powerful, engaging language that motivates improvement

**Output Instructions:**
Your entire output MUST be a single, valid JSON object without any markdown or extra text.`;

  const response = await callWithRetry(
    ai,
    async (model) =>
      ai.models.generateContent({
        model,
        contents: systemInstruction,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              role: {
                type: Type.STRING,
                description: "The coaching role used (Enhanced Debate Evaluation).",
              },
              overall_score: {
                type: Type.INTEGER,
                description:
                  "Overall debate score out of 100 based on world-class standards.",
              },
              category_scores: {
                type: Type.OBJECT,
                description:
                  "Individual scores for each of the 5 categories (0-20 each).",
                properties: {
                  logicReasoning: {
                    type: Type.INTEGER,
                    description: "Logic & Reasoning score (0-20).",
                  },
                  evidenceQuality: {
                    type: Type.INTEGER,
                    description: "Evidence Quality score (0-20).",
                  },
                  toneLanguage: {
                    type: Type.INTEGER,
                    description: "Tone & Language score (0-20).",
                  },
                  opponentEngagement: {
                    type: Type.INTEGER,
                    description: "Opponent Engagement score (0-20).",
                  },
                  argumentStructure: {
                    type: Type.INTEGER,
                    description: "Argument Structure score (0-20).",
                  },
                },
                required: [
                  "logicReasoning",
                  "evidenceQuality",
                  "toneLanguage",
                  "opponentEngagement",
                  "argumentStructure",
                ],
              },
              messageBreakdown: {
                type: Type.ARRAY,
                description:
                  "Per-message scoring breakdown showing individual response analysis.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    messageNumber: {
                      type: Type.INTEGER,
                      description: "Message number in the debate.",
                    },
                    messageContent: {
                      type: Type.STRING,
                      description: "The exact message content.",
                    },
                    scores: {
                      type: Type.OBJECT,
                      description:
                        "Individual scores for this message (0-20 each).",
                      properties: {
                        logicReasoning: {
                          type: Type.INTEGER,
                          description: "Logic & Reasoning score (0-20).",
                        },
                        evidenceQuality: {
                          type: Type.INTEGER,
                          description: "Evidence Quality score (0-20).",
                        },
                        toneLanguage: {
                          type: Type.INTEGER,
                          description: "Tone & Language score (0-20).",
                        },
                        opponentEngagement: {
                          type: Type.INTEGER,
                          description: "Opponent Engagement score (0-20).",
                        },
                        argumentStructure: {
                          type: Type.INTEGER,
                          description: "Argument Structure score (0-20).",
                        },
                      },
                      required: [
                        "logicReasoning",
                        "evidenceQuality",
                        "toneLanguage",
                        "opponentEngagement",
                        "argumentStructure",
                      ],
                    },
                    totalScore: {
                      type: Type.INTEGER,
                      description:
                        "Total score for this individual message (0-100).",
                    },
                    critique: {
                      type: Type.STRING,
                      description: "Brief critique of this specific message.",
                    },
                  },
                  required: [
                    "messageNumber",
                    "messageContent",
                    "scores",
                    "totalScore",
                    "critique",
                  ],
                },
              },
              feedback: {
                type: Type.STRING,
                description:
                  "BRIEF feedback analyzing debate performance - MAX 2 sentences.",
              },
              tips: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  "3-5 SHORT improvement tips - each tip MAX 1 sentence.",
              },
              // Legacy fields for backward compatibility
              score: {
                type: Type.INTEGER,
                description: "Legacy overall score (same as overall_score).",
              },
              whatYouDidWell: {
                type: Type.STRING,
                description: "BRIEF strengths - MAX 1 sentence.",
              },
              areasForImprovement: {
                type: Type.STRING,
                description: "BRIEF improvement areas - MAX 1 sentence.",
              },
              personalizedTip: {
                type: Type.STRING,
                description: "SHORT personalized tip - MAX 1 sentence.",
              },
              spokenResponse: {
                type: Type.STRING,
                description: "BRIEF spoken summary - MAX 1 sentence.",
              },
              communicationBehavior: {
                type: Type.OBJECT,
                description:
                  "Communication profile analysis based on debate performance.",
                properties: {
                  profile: {
                    type: Type.STRING,
                    description: "BRIEF debate profile - MAX 3 words.",
                  },
                  strength: {
                    type: Type.STRING,
                    description: "BRIEF key strength - MAX 1 sentence.",
                  },
                  growthArea: {
                    type: Type.STRING,
                    description: "BRIEF growth area - MAX 1 sentence.",
                  },
                },
                required: ["profile", "strength", "growthArea"],
              },
              debateAnalysis: {
                type: Type.OBJECT,
                description:
                  "Detailed analysis of the debate performance against world-class standards.",
                properties: {
                  strongestArgument: {
                    type: Type.STRING,
                    description: "BRIEF strongest argument - MAX 1 sentence.",
                  },
                  weakestArgument: {
                    type: Type.STRING,
                    description: "BRIEF weakest argument - MAX 1 sentence.",
                  },
                  bestRebuttal: {
                    type: Type.STRING,
                    description: "BRIEF best rebuttal - MAX 1 sentence.",
                  },
                  missedOpportunities: {
                    type: Type.STRING,
                    description: "BRIEF missed opportunities - MAX 1 sentence.",
                  },
                  improvementOverTime: {
                    type: Type.STRING,
                    description: "BRIEF improvement over time - MAX 1 sentence.",
                  },
                  logicalConsistency: {
                    type: Type.STRING,
                    description: "BRIEF logical consistency - MAX 1 sentence.",
                  },
                  evidenceEffectiveness: {
                    type: Type.STRING,
                    description: "BRIEF evidence effectiveness - MAX 1 sentence.",
                  },
                  rhetoricalSophistication: {
                    type: Type.STRING,
                    description:
                      "BRIEF rhetorical sophistication - MAX 1 sentence.",
                  },
                  logicalFallacies: {
                    type: Type.STRING,
                    description: "BRIEF logical fallacies - MAX 1 sentence.",
                  },
                  argumentativePatterns: {
                    type: Type.STRING,
                    description: "BRIEF argumentative patterns - MAX 1 sentence.",
                  },
                  emotionalIntelligence: {
                    type: Type.STRING,
                    description: "BRIEF emotional intelligence - MAX 1 sentence.",
                  },
                  crossExaminationSkills: {
                    type: Type.STRING,
                    description: "BRIEF cross-examination skills - MAX 1 sentence.",
                  },
                  argumentativeStamina: {
                    type: Type.STRING,
                    description: "BRIEF argumentative stamina - MAX 1 sentence.",
                  },
                  timeManagement: {
                    type: Type.STRING,
                    description: "BRIEF time management - MAX 1 sentence.",
                  },
                  adaptability: {
                    type: Type.STRING,
                    description: "BRIEF adaptability - MAX 1 sentence.",
                  },
                  closingImpact: {
                    type: Type.STRING,
                    description: "BRIEF closing impact - MAX 1 sentence.",
                  },
                },
                required: [
                  "strongestArgument",
                  "weakestArgument",
                  "bestRebuttal",
                  "missedOpportunities",
                  "improvementOverTime",
                  "logicalConsistency",
                  "evidenceEffectiveness",
                  "rhetoricalSophistication",
                  "logicalFallacies",
                  "argumentativePatterns",
                  "emotionalIntelligence",
                  "crossExaminationSkills",
                  "argumentativeStamina",
                  "timeManagement",
                  "adaptability",
                  "closingImpact",
                ],
              },
              worldClassComparison: {
                type: Type.OBJECT,
                description:
                  "Comparison to world-class debate standards and recommendations.",
                properties: {
                  currentLevel: {
                    type: Type.STRING,
                    description: "BRIEF skill level - MAX 1 sentence.",
                  },
                  championshipGap: {
                    type: Type.STRING,
                    description: "BRIEF championship gap - MAX 1 sentence.",
                  },
                  nextMilestone: {
                    type: Type.STRING,
                    description: "BRIEF next milestone - MAX 1 sentence.",
                  },
                  trainingFocus: {
                    type: Type.STRING,
                    description: "BRIEF training focus - MAX 1 sentence.",
                  },
                },
                required: [
                  "currentLevel",
                  "championshipGap",
                  "nextMilestone",
                  "trainingFocus",
                ],
              },
              performanceInsights: {
                type: Type.OBJECT,
                description:
                  "Advanced performance insights and strategic analysis.",
                properties: {
                  debateStyle: {
                    type: Type.STRING,
                    description: "BRIEF debate style - MAX 1 sentence.",
                  },
                  strengthAreas: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "3 SHORT strength areas - each MAX 3 words.",
                  },
                  improvementAreas: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "3 SHORT improvement areas - each MAX 3 words.",
                  },
                  strategicMoves: {
                    type: Type.STRING,
                    description: "BRIEF strategic moves - MAX 1 sentence.",
                  },
                  tacticalErrors: {
                    type: Type.STRING,
                    description: "BRIEF tactical errors - MAX 1 sentence.",
                  },
                  opponentExploitation: {
                    type: Type.STRING,
                    description: "BRIEF opponent exploitation - MAX 1 sentence.",
                  },
                  pressureHandling: {
                    type: Type.STRING,
                    description: "BRIEF pressure handling - MAX 1 sentence.",
                  },
                  comebackAbility: {
                    type: Type.STRING,
                    description: "BRIEF comeback ability - MAX 1 sentence.",
                  },
                },
                required: [
                  "debateStyle",
                  "strengthAreas",
                  "improvementAreas",
                  "strategicMoves",
                  "tacticalErrors",
                  "opponentExploitation",
                  "pressureHandling",
                  "comebackAbility",
                ],
              },
            },
            required: [
              "role",
              "overall_score",
              "category_scores",
              "messageBreakdown",
              "feedback",
              "tips",
              "score",
              "whatYouDidWell",
              "areasForImprovement",
              "personalizedTip",
              "spokenResponse",
              "communicationBehavior",
              "debateAnalysis",
              "worldClassComparison",
              "performanceInsights",
            ],
          },
        },
      }),
    { preferredModel: "gemini-2.5-flash", perAttemptTimeoutMs: 15000 },
  );

  const result = JSON.parse(response.text);

  // Add the calculated scores and message breakdown to the result
  result.overall_score = overallScore;
  result.category_scores = avgScores;
  result.messageBreakdown = messageScores;

  console.log(
    "✅ Enhanced debate evaluation generated with per-message scoring",
  );
  return result;
}

/**
 * Evaluates group discussion performance by analyzing the entire discussion history.
 * Returns structured feedback on group discussion skills with accurate, meaningful scoring.
 */
export async function getGroupDiscussionEvaluation(
  ai: GoogleGenAI,
  discussionTopic: string,
  discussionHistory: Array<{
    type: string;
    content: string;
    agentName?: string;
    agentPersonality?: string;
    timestamp: Date;
  }>,
  activeAgents: Array<{
    name: string;
    personality: string;
    description: string;
    avatar: string;
    color: string;
  }>,
  userParticipationCount: number,
): Promise<any> {
  console.log("🎯 getGroupDiscussionEvaluation called with:", {
    discussionTopic,
    discussionLength: discussionHistory.length,
    activeAgentsCount: activeAgents.length,
    userParticipationCount,
  });

  // Format discussion history for analysis
  const discussionText = discussionHistory
    .map(
      (msg) =>
        `${msg.type === "user" ? "USER" : msg.agentName} (${msg.agentPersonality || "Agent"}): ${msg.content}`,
    )
    .join("\n\n");

  const agentsText = activeAgents
    .map(
      (agent) => `${agent.name} (${agent.personality}): ${agent.description}`,
    )
    .join("\n");

  const systemInstruction = `You are an elite group discussion facilitator and communication expert with 20+ years of experience evaluating group dynamics and individual participation. You will analyze the ENTIRE group discussion and provide brutally accurate, meaningful scoring that reflects real group discussion performance.

**MANDATORY RELEVANCE & CONTEXT CHECK:**
Before scoring, you MUST verify if the USER'S contributions actually address the 'Topic' and relate to the 'FULL DISCUSSION HISTORY'.
1. If the user's contributions are irrelevant, garbage, nonsense, or completely unrelated to the topic:
   - YOU MUST AWARD ZERO (0) for ALL category scores and the overall_score.
   - The 'feedback' MUST explicitly state that the user's contributions are irrelevant.
2. If the user's total contribution is extremely shallow (e.g., only "Yes," "I agree," "Ok"):
   - AWARD a maximum overall_score of 10.

**DISCUSSION CONTEXT:**
Topic: ${discussionTopic}
User Participation Count: ${userParticipationCount}

**ACTIVE AI AGENTS:**
${agentsText}

**FULL DISCUSSION HISTORY:**
${discussionText}

**PROFESSIONAL GROUP DISCUSSION EVALUATION CATEGORIES (0-20 points each):**

1. **Participation & Engagement (0-20):**
   - 0: No participation or completely irrelevant
   - 1-3: One word, no context, irrelevant to topic
   - 4-7: Minimal participation, barely contributes
   - 8-12: Basic participation, some contributions
   - 13-16: Active participation, meaningful professional contributions
   - 17-20: Exceptional participation, drives discussion with expertise

2. **Communication Clarity (0-20):**
   - 0: Incomprehensible or no communication
   - 1-3: Unclear, confusing, irrelevant
   - 4-7: Basic clarity but weak professional expression
   - 8-12: Clear enough to understand
   - 13-16: Clear and professionally expressed
   - 17-20: Crystal clear, expertly articulated

3. **Leadership & Initiative (0-20):**
   - 0: No initiative whatsoever
   - 1-3: Completely passive, no leadership
   - 4-7: Minimal initiative
   - 8-12: Some initiative shown
   - 13-16: Good professional leadership when needed
   - 17-20: Strong executive leadership throughout

4. **Active Listening & Response Quality (0-20):**
   - 0: Completely ignores others
   - 1-3: No acknowledgment of others' points
   - 4-7: Minimal listening, poor responses
   - 8-12: Basic listening skills
   - 13-16: Good listening, builds on ideas professionally
   - 17-20: Exceptional listening, synthesizes and challenges appropriately

5. **Professional Collaboration (0-20):**
   - 0: Disruptive or no collaboration
   - 1-3: Dismissive, doesn't collaborate professionally
   - 4-7: Minimal professional collaboration
   - 8-12: Basic professional teamwork
   - 13-16: Good professional collaboration, challenges constructively
   - 17-20: Excellent professional synergy, elevates discussion quality

6. **Critical Thinking & Analysis (0-20):**
   - 0: No thinking demonstrated
   - 1-3: Superficial, no analysis
   - 4-7: Very basic thinking
   - 8-12: Some analysis shown
   - 13-16: Good critical thinking, challenges weak points
   - 17-20: Exceptional insights, calls out logical flaws professionally

**CRITICAL: OVERALL SCORE IS COMPLETELY INDEPENDENT**
- Category scores (0-20 each) evaluate specific discussion skills
- Overall score (0-100) evaluates COMPLETE DISCUSSION PERFORMANCE
- DO NOT add category scores together
- DO NOT average category scores
- DO NOT use category scores to calculate overall score
- Evaluate overall score separately based on total discussion impact

**OVERALL SCORE (0-100) - BRUTALLY ACCURATE:**

**SCORE BASED ON ACTUAL PERFORMANCE:**
- 0-5: No contribution, irrelevant word, or disruptive
- 6-15: One word with minimal relevance, no real contribution
- 16-30: Minimal participation, very poor skills
- 31-50: Basic participation, some skills shown
- 51-70: Good participation, solid skills
- 71-85: Strong participation, excellent skills
- 86-100: Exceptional leadership and insight

**CRITICAL: BE BRUTALLY HONEST ABOUT PROFESSIONAL PERFORMANCE**
- Irrelevant word = 0-2 points maximum
- One relevant word = 3-8 points maximum
- One sentence with no depth = 10-20 points
- Multiple shallow comments = 20-35 points
- One insightful professional comment = 50-65 points
- Multiple insightful professional contributions = 65-80 points
- Professional discussion leadership = 80-95 points
- NO MERCY for poor professional performance
- NO INFLATION of scores for effort
- ACCURATE reflection of actual professional contribution
- EXTRA CREDIT for handling challenging AI agents well
- DEDUCT POINTS for failing to engage with tough questions

**CRITICAL: BRUTALLY ACCURATE SCORING**

**EVALUATE ACTUAL PROFESSIONAL CONTRIBUTION VALUE:**
1. **Relevance** - Is it related to the professional discussion topic?
2. **Substance** - Does it add professional value or insight?
3. **Professional Skills** - Does it show professional group discussion skills?
4. **Impact** - Does it advance the professional discussion meaningfully?
5. **Challenge Response** - How well did they handle tough questions from AI agents?
6. **Professional Discourse** - Did they maintain professional standards while being direct?

**STRICT SCORING RULES:**
- Irrelevant word (no relation to topic) = 0-2 points total
- Relevant word but no substance = 3-8 points total
- One sentence, no depth = 10-20 points total
- Multiple shallow comments = 20-35 points total
- One insightful comment = 50-65 points total
- Multiple insightful contributions = 65-80 points total
- Discussion leadership = 80-95 points total

**BE BRUTALLY HONEST:**
- If contribution is worthless, score it 0-5
- If contribution is irrelevant, score it 0-2
- If contribution shows no skills, score it accordingly
- NO MERCY for poor performance
- NO BENEFIT OF THE DOUBT
- ACCURATE scoring only

**Output Instructions:**
Your entire output MUST be a single, valid JSON object without any markdown or extra text.`;

  const response = await callWithRetry(
    ai,
    async (model) =>
      ai.models.generateContent({
        model,
        contents: systemInstruction,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              role: {
                type: Type.STRING,
                description: "The coaching role used (Group Discussion).",
              },
              overall_score: {
                type: Type.INTEGER,
                description:
                  "Overall group discussion score out of 100 - INDEPENDENT evaluation of complete discussion performance, NOT calculated from category scores.",
              },
              category_scores: {
                type: Type.OBJECT,
                description:
                  "Individual scores for each of the 6 categories (0-20 each).",
                properties: {
                  participation: {
                    type: Type.INTEGER,
                    description: "Participation & Engagement score (0-20).",
                  },
                  communication: {
                    type: Type.INTEGER,
                    description: "Communication Clarity score (0-20).",
                  },
                  leadership: {
                    type: Type.INTEGER,
                    description: "Leadership & Initiative score (0-20).",
                  },
                  listening: {
                    type: Type.INTEGER,
                    description: "Active Listening score (0-20).",
                  },
                  collaboration: {
                    type: Type.INTEGER,
                    description: "Collaboration Skills score (0-20).",
                  },
                  criticalThinking: {
                    type: Type.INTEGER,
                    description: "Critical Thinking score (0-20).",
                  },
                },
                required: [
                  "participation",
                  "communication",
                  "leadership",
                  "listening",
                  "collaboration",
                  "criticalThinking",
                ],
              },
              feedback: {
                type: Type.STRING,
                description:
                  "Comprehensive feedback analyzing professional group discussion performance, noting how well they engaged with challenging AI agents and handled professional discourse.",
              },
              tips: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  "5-7 specific improvement tips for professional group discussions, focusing on how to better engage with challenging participants and strengthen arguments.",
              },
              // Legacy fields for backward compatibility
              score: {
                type: Type.INTEGER,
                description: "Legacy overall score (same as overall_score).",
              },
              whatYouDidWell: {
                type: Type.STRING,
                description:
                  "Specific professional strengths demonstrated when engaging with challenging AI participants.",
              },
              areasForImprovement: {
                type: Type.STRING,
                description:
                  "Specific areas for improvement in professional discussions, especially when facing tough questions or challenges.",
              },
              personalizedTip: {
                type: Type.STRING,
                description: "SHORT personalized tip - MAX 1 sentence.",
              },
              spokenResponse: {
                type: Type.STRING,
                description: "BRIEF spoken summary - MAX 1 sentence.",
              },
              communicationBehavior: {
                type: Type.OBJECT,
                description:
                  "Communication profile analysis based on group discussion performance.",
                properties: {
                  profile: {
                    type: Type.STRING,
                    description: "Group discussion style profile (2-4 words).",
                  },
                  strength: {
                    type: Type.STRING,
                    description:
                      "Key strength demonstrated in the group discussion.",
                  },
                  growthArea: {
                    type: Type.STRING,
                    description: "BRIEF growth area - MAX 1 sentence.",
                  },
                },
                required: ["profile", "strength", "growthArea"],
              },
              exampleRewrite: {
                type: Type.OBJECT,
                description:
                  "Example improvement of a specific contribution from the discussion.",
                properties: {
                  original: {
                    type: Type.STRING,
                    description: "Original contribution from the discussion.",
                  },
                  improved: {
                    type: Type.STRING,
                    description: "Improved version of the contribution.",
                  },
                  reasoning: {
                    type: Type.STRING,
                    description: "Reasoning for the improvement.",
                  },
                },
                required: ["original", "improved", "reasoning"],
              },
              groupDiscussionAnalysis: {
                type: Type.OBJECT,
                description:
                  "Detailed analysis of professional group discussion performance.",
                properties: {
                  strongestContribution: {
                    type: Type.STRING,
                    description:
                      "The user's strongest professional contribution to the discussion.",
                  },
                  weakestContribution: {
                    type: Type.STRING,
                    description:
                      "The user's weakest contribution, especially when challenged by AI agents.",
                  },
                  bestInteraction: {
                    type: Type.STRING,
                    description:
                      "The user's best professional interaction with challenging AI participants.",
                  },
                  missedOpportunities: {
                    type: Type.STRING,
                    description:
                      "Key opportunities missed to strengthen arguments or challenge weak points.",
                  },
                  groupDynamics: {
                    type: Type.STRING,
                    description: "How the user handled professional discourse and challenging feedback.",
                  },
                },
                required: [
                  "strongestContribution",
                  "weakestContribution",
                  "bestInteraction",
                  "missedOpportunities",
                  "groupDynamics",
                ],
              },
            },
            required: [
              "role",
              "overall_score",
              "category_scores",
              "feedback",
              "tips",
              "score",
              "whatYouDidWell",
              "areasForImprovement",
              "personalizedTip",
              "spokenResponse",
              "communicationBehavior",
              "exampleRewrite",
              "groupDiscussionAnalysis",
            ],
          },
        },
      }),
    { preferredModel: "gemini-2.5-flash", perAttemptTimeoutMs: 12000 },
  );

  const result = JSON.parse(response.text);

  // CRITICAL: Validate and correct overall score based on category scores
  const categoryScores = result.category_scores;
  const categoryTotal = Object.values(categoryScores).reduce((sum: number, score: any) => sum + Number(score), 0) as number;
  const categoryAverage = Math.round((categoryTotal as number) / 6); // 6 categories

  // Calculate realistic overall score based on category performance
  // Overall score should reflect actual performance, not be inflated
  const calculatedOverall = Math.round((categoryTotal / 120) * 100);

  // If AI gave inflated score, correct it to match actual performance
  if (result.overall_score > calculatedOverall + 10) {
    console.warn(`⚠️ Correcting inflated overall score: ${result.overall_score} → ${calculatedOverall}`);
    result.overall_score = calculatedOverall;
    result.score = calculatedOverall;
  }

  // If all categories are low (avg < 8), overall should be very low
  if (categoryAverage < 8 && result.overall_score > 30) {
    const correctedScore = Math.min(30, calculatedOverall);
    console.warn(`⚠️ Correcting score for poor performance: ${result.overall_score} → ${correctedScore}`);
    result.overall_score = correctedScore;
    result.score = correctedScore;
  }

  // If all categories are very low (avg < 4), overall should be 0-10
  if (categoryAverage < 4 && result.overall_score > 10) {
    const correctedScore = Math.min(10, calculatedOverall);
    console.warn(`⚠️ Correcting score for terrible performance: ${result.overall_score} → ${correctedScore}`);
    result.overall_score = correctedScore;
    result.score = correctedScore;
  }

  // If category total is less than 20 (out of 120), cap at 15 overall
  if ((categoryTotal as number) < 20 && result.overall_score > 15) {
    console.warn(`⚠️ Correcting score for minimal contribution: ${result.overall_score} → 15`);
    result.overall_score = 15;
    result.score = 15;
  }

  console.log("✅ Group discussion evaluation generated with validated scoring", {
    categoryAverage,
    categoryTotal,
    calculatedOverall,
    finalOverall: result.overall_score
  });
  return result;
}

/**
 * Gets coaching feedback by comparing the AI caption with the user's explanation.
 * Returns structured feedback with role-based personalities and 6-category scoring.
 */
export async function getCoachingFeedback(
  ai: GoogleGenAI,
  aiCaption: string,
  userExplanation: string,
  mode: CoachMode,
  strategy: string | null,
): Promise<Feedback> {
  console.log("🎯 getCoachingFeedback called with:", {
    hasAi: !!ai,
    aiType: typeof ai,
    mode,
    strategyLength: strategy?.length || 0,
    aiCaptionLength: aiCaption.length,
    userExplanationLength: userExplanation.length,
  });

  if (!ai) {
    throw new Error(
      "AI client is not initialized. Please check your API key in .env file.",
    );
  }
  const strategyInstruction = strategy
    ? `**User's Strategic Goal:**
    The user was given the following strategy to guide their explanation: "${strategy}".
    In your evaluation, pay special attention to how well they executed this specific strategy. Was their attempt successful, clumsy, or did they ignore it completely? Weave this observation directly into your analysis and scoring.`
    : "";

  const rolePersonalities = {
    [CoachMode.Teacher]: {
      tone: "structured, constructive, supportive",
      approach: "methodical analysis with clear learning objectives",
      style: "patient, encouraging, educational",
    },
    [CoachMode.Debater]: {
      tone: "analytical, challenging, logical",
      approach: "critical thinking with pointed questions",
      style: "sharp, questioning, intellectually rigorous",
    },
    [CoachMode.Storyteller]: {
      tone: "creative, expressive, narrative-driven",
      approach: "imaginative analysis focusing on storytelling elements",
      style: "artistic, inspiring, metaphor-rich",
    },
  };

  const personality = rolePersonalities[mode];

  const systemInstruction = `You are a HARSH, REALISTIC communication coach who evaluates image description skills with brutal accuracy. You are NOT encouraging - you are brutally honest about actual performance.

**EVALUATION METHODOLOGY - ANALYZE ACTUAL PERFORMANCE:**

**STEP 1: ANALYZE THE USER'S ACTUAL RESPONSE**
- Count the actual words and sentences
- Assess the actual detail level provided
- Evaluate the actual accuracy against the image
- Check the actual structure and organization
- Examine the actual vocabulary used
- Determine the actual completeness of description

**STEP 2: COMPARE AGAINST THE AI CAPTION**
- The AI caption shows what a GOOD description looks like
- Compare the user's response to this standard
- Identify what they missed, got wrong, or did poorly
- Note what they did well (if anything)

**STEP 3: SCORE BASED ON ACTUAL ANALYSIS**
- Don't use predetermined ranges
- Score based on what they ACTUALLY provided
- If they said "buildings" and the image shows a complex cityscape with specific architectural details, that's terrible performance
- If they described specific elements accurately, give credit for that
- If they missed major elements, deduct accordingly

**SCORING PRINCIPLES:**
- 0-20 per category based on ACTUAL performance
- Overall score = sum of all categories (0-120) converted to 0-100 scale
- Be brutally honest about what they actually achieved
- Don't give points for effort - only for actual quality

**MANDATORY RELEVANCE & ACCURACY CHECK:**
Before scoring, you MUST verify if the 'User's Explanation' actually describes or relates to the 'Image Description (Ground Truth)'.
1. If the explanation is irrelevant, garbage, nonsense, or completely unrelated to the image:
   - YOU MUST AWARD ZERO (0) for ALL individual category scores and the overall_score.
   - The 'feedback' MUST explicitly state that the explanation is irrelevant to the image.
2. If the explanation is a single sentence or extremely shallow (e.g., less than 5 words):
   - AWARD a maximum overall_score of 5.

**Your Role: ${mode}**
You embody the ${personality.tone} personality of a ${mode}. Your approach is ${personality.approach} with a ${personality.style} style.

**ANALYTIC EVALUATION PROCESS:**

**STEP 1: COMPARE USER RESPONSE TO AI CAPTION**
- The AI caption: "${aiCaption}"
- The user's response: "${userExplanation}"
- Analyze the gap between what they provided vs. what they could have provided. Is it relevant? Is it accurate?

**STEP 2: EVALUATE EACH CATEGORY BASED ON ACTUAL PERFORMANCE**

1. **Clarity (0-20):**
   - Does their response make sense to someone who hasn't seen the image?
   - Are their sentences coherent and well-formed?
   - Score based on actual clarity, not word count

2. **Detail Level (0-20):**
   - How much specific information did they actually provide?
   - Did they mention specific visual elements, colors, textures, architectural details?
   - Score based on actual detail provided, not effort

3. **Accuracy (0-20):**
   - How accurately do they describe what's actually visible in the image?
   - Did they correctly identify objects, colors, spatial relationships?
   - Score based on factual accuracy against the image

4. **Structure (0-20):**
   - Is their description logically organized?
   - Do they follow a clear progression (foreground to background, left to right, etc.)?
   - Score based on actual organization, not length

5. **Vocabulary (0-20):**
   - What level of descriptive language did they actually use?
   - Did they use precise, specific terms or generic words?
   - Score based on actual vocabulary quality

6. **Completeness (0-20):**
   - How much of the image did they actually cover?
   - Did they miss major visual elements that the AI caption mentions?
   - Score based on actual coverage, not word count

**STEP 3: CALCULATE OVERALL SCORE**
- Sum all 6 category scores (0-120 total)
- Convert to 0-100 scale: (sum / 120) * 100
- Round to nearest integer

**BE BRUTALLY HONEST:**
- Score based on what they ACTUALLY achieved
- Don't give points for effort - only for actual quality
- If they said "buildings" and missed everything else, that's terrible performance

**Input:**
- **The Ground Truth (AI Caption):** ${aiCaption}
- **The User's Explanation:** ${userExplanation}

**Output Instructions:**
Your entire output MUST be a single, valid JSON object without any markdown or extra text.`;

  console.log("🤖 Sending request to Gemini API...");
  const response = await callWithRetry(
    ai,
    async (model) => {
      const apiBase =
        (typeof window !== "undefined" && (window as any).__AI_PROXY__) || "";
      if (apiBase) {
        const r = await fetch(`${apiBase}/api/ai/generate-content`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            contents: [{ role: "user", parts: [{ text: systemInstruction }] }],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  role: {
                    type: Type.STRING,
                    description:
                      "The coaching role used (Teacher, Debater, or Storyteller).",
                  },
                  overall_score: {
                    type: Type.INTEGER,
                    description:
                      "Overall score out of 100. BE BRUTAL: 1-2 words = 0-2 points, 3-5 words = 2-5 points, 1 sentence = 5-10 points, detailed paragraph = 25-50 points.",
                  },
                  category_scores: {
                    type: Type.OBJECT,
                    description:
                      "Individual scores for each of the 6 categories (0-20 each).",
                    properties: {
                      clarity: {
                        type: Type.INTEGER,
                        description: "Clarity score (0-20).",
                      },
                      detail: {
                        type: Type.INTEGER,
                        description: "Detail level score (0-20).",
                      },
                      accuracy: {
                        type: Type.INTEGER,
                        description: "Accuracy score (0-20).",
                      },
                      structure: {
                        type: Type.INTEGER,
                        description: "Structure score (0-20).",
                      },
                      vocabulary: {
                        type: Type.INTEGER,
                        description: "Vocabulary score (0-20).",
                      },
                      completeness: {
                        type: Type.INTEGER,
                        description: "Completeness score (0-20).",
                      },
                    },
                    required: [
                      "clarity",
                      "detail",
                      "accuracy",
                      "structure",
                      "vocabulary",
                      "completeness",
                    ],
                  },
                  feedback: {
                    type: Type.STRING,
                    description:
                      "Role-specific feedback message tailored to the coaching personality.",
                  },
                  tips: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description:
                      "3-5 personalized improvement tips as an array of strings.",
                  },
                  // Legacy fields for backward compatibility
                  score: {
                    type: Type.INTEGER,
                    description:
                      "Legacy overall score (same as overall_score).",
                  },
                  whatYouDidWell: {
                    type: Type.STRING,
                    description: "Legacy field for what they did well.",
                  },
                  areasForImprovement: {
                    type: Type.STRING,
                    description: "Legacy field for areas of improvement.",
                  },
                  personalizedTip: {
                    type: Type.STRING,
                    description: "Legacy field for personalized tip.",
                  },
                  spokenResponse: {
                    type: Type.STRING,
                    description: "Legacy field for spoken response.",
                  },
                  communicationBehavior: {
                    type: Type.OBJECT,
                    description: "Legacy communication profile analysis.",
                    properties: {
                      profile: {
                        type: Type.STRING,
                        description: "Communication style profile.",
                      },
                      strength: {
                        type: Type.STRING,
                        description: "Communication strength.",
                      },
                      growthArea: {
                        type: Type.STRING,
                        description: "Primary growth area.",
                      },
                    },
                    required: ["profile", "strength", "growthArea"],
                  },
                  exampleRewrite: {
                    type: Type.OBJECT,
                    description: "Legacy impact rewrite feature.",
                    properties: {
                      original: {
                        type: Type.STRING,
                        description: "Original sentence.",
                      },
                      improved: {
                        type: Type.STRING,
                        description: "Improved sentence.",
                      },
                      reasoning: {
                        type: Type.STRING,
                        description: "Reasoning for improvement.",
                      },
                    },
                    required: ["original", "improved", "reasoning"],
                  },
                },
                required: [
                  "role",
                  "overall_score",
                  "category_scores",
                  "feedback",
                  "tips",
                  "score",
                  "whatYouDidWell",
                  "areasForImprovement",
                  "personalizedTip",
                  "spokenResponse",
                  "communicationBehavior",
                  "exampleRewrite",
                ],
              },
            },
          }),
        });
        if (!r.ok) throw new Error(`Proxy error ${r.status}`);
        const data = await r.json();
        return { text: data.text } as any;
      }
      return ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: systemInstruction }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              role: {
                type: Type.STRING,
                description:
                  "The coaching role (Teacher, Debater, or Storyteller).",
              },
              overall_score: {
                type: Type.INTEGER,
                description:
                  "Overall score out of 100. BE BRUTAL: 1-2 words = 0-2 points, 3-5 words = 2-5 points, 1 sentence = 5-10 points, detailed paragraph = 25-50 points.",
              },
              category_scores: {
                type: Type.OBJECT,
                description:
                  "Individual scores for each of the 6 categories (0-20 each).",
                properties: {
                  clarity: {
                    type: Type.INTEGER,
                    description: "Clarity score (0-20).",
                  },
                  detail: {
                    type: Type.INTEGER,
                    description: "Detail level score (0-20).",
                  },
                  accuracy: {
                    type: Type.INTEGER,
                    description: "Accuracy score (0-20).",
                  },
                  structure: {
                    type: Type.INTEGER,
                    description: "Structure score (0-20).",
                  },
                  vocabulary: {
                    type: Type.INTEGER,
                    description: "Vocabulary score (0-20).",
                  },
                  completeness: {
                    type: Type.INTEGER,
                    description: "Completeness score (0-20).",
                  },
                },
                required: [
                  "clarity",
                  "detail",
                  "accuracy",
                  "structure",
                  "vocabulary",
                  "completeness",
                ],
              },
              feedback: {
                type: Type.STRING,
                description:
                  "Role-specific feedback message tailored to the coaching personality.",
              },
              tips: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  "3-5 personalized improvement tips as an array of strings.",
              },
              score: {
                type: Type.INTEGER,
                description: "Legacy overall score (same as overall_score).",
              },
              whatYouDidWell: {
                type: Type.STRING,
                description: "What they did well.",
              },
              areasForImprovement: {
                type: Type.STRING,
                description: "Areas for improvement.",
              },
              personalizedTip: {
                type: Type.STRING,
                description: "Personalized tip.",
              },
              spokenResponse: {
                type: Type.STRING,
                description: "Spoken response.",
              },
              communicationBehavior: {
                type: Type.OBJECT,
                description: "Communication profile analysis - REQUIRED FIELD.",
                properties: {
                  profile: {
                    type: Type.STRING,
                    description:
                      'Communication style profile (e.g., "Concise Communicator", "Detail-Oriented", "Storyteller").',
                  },
                  strength: {
                    type: Type.STRING,
                    description: "Primary communication strength.",
                  },
                  growthArea: {
                    type: Type.STRING,
                    description: "Main area for improvement.",
                  },
                },
                required: ["profile", "strength", "growthArea"],
              },
              exampleRewrite: {
                type: Type.OBJECT,
                description: "Example improvement - REQUIRED FIELD.",
                properties: {
                  original: {
                    type: Type.STRING,
                    description: "The user's original explanation.",
                  },
                  improved: {
                    type: Type.STRING,
                    description: "An improved version of their explanation.",
                  },
                  reasoning: {
                    type: Type.STRING,
                    description: "Why the improved version is better.",
                  },
                },
                required: ["original", "improved", "reasoning"],
              },
            },
            required: [
              "role",
              "overall_score",
              "category_scores",
              "feedback",
              "tips",
              "score",
              "whatYouDidWell",
              "areasForImprovement",
              "personalizedTip",
              "spokenResponse",
              "communicationBehavior",
              "exampleRewrite",
            ],
          } as any,
        },
      });
    },
    { preferredModel: "gemini-1.5-flash", perAttemptTimeoutMs: 8000 },
  );

  try {
    console.log("📥 Raw Gemini response received");
    const jsonText = response.text.trim();
    console.log("📝 Response text:", jsonText.substring(0, 500) + "...");
    const parsedFeedback = JSON.parse(jsonText);
    console.log("✅ Parsed feedback successfully:", {
      role: parsedFeedback.role,
      overall_score: parsedFeedback.overall_score,
      hasCategoryScores: !!parsedFeedback.category_scores,
      hasCommunicationBehavior: !!parsedFeedback.communicationBehavior,
      hasExampleRewrite: !!parsedFeedback.exampleRewrite,
      tipsCount: parsedFeedback.tips?.length || 0,
      categoryScores: parsedFeedback.category_scores,
    });

    // Ensure all required fields are present
    if (!parsedFeedback.category_scores) {
      console.warn("⚠️ Missing category_scores, creating default");
      parsedFeedback.category_scores = {
        clarity: 0,
        detail: 0,
        accuracy: 0,
        structure: 0,
        vocabulary: 0,
        completeness: 0,
      };
    }

    if (!parsedFeedback.communicationBehavior) {
      console.warn("⚠️ Missing communicationBehavior, creating default");
      parsedFeedback.communicationBehavior = {
        profile: "Developing Communicator",
        strength: "Basic communication skills present",
        growthArea:
          "Need to develop more detailed and structured communication",
      };
    }

    if (!parsedFeedback.exampleRewrite) {
      console.warn("⚠️ Missing exampleRewrite, creating default");
      parsedFeedback.exampleRewrite = {
        original: userExplanation,
        improved:
          "This could be improved with more specific details about the architectural elements, lighting, and overall composition of the scene.",
        reasoning:
          "Adding specific details helps create a more vivid and engaging description.",
      };
    }

    return parsedFeedback;
  } catch (e) {
    console.error("Failed to parse JSON feedback:", response.text);
    console.error("Parse error:", e);
    throw new Error("The AI returned an invalid response. Please try again.");
  }
}

/**
 * Enhanced teacher evaluation function with detailed analysis and scoring.
 * Provides comprehensive feedback similar to the debate evaluation.
 */
export async function getEnhancedTeacherEvaluation(
  ai: GoogleGenAI,
  teachingTopic: string,
  userTeaching: string,
): Promise<any> {
  console.log("🎯 getEnhancedTeacherEvaluation called with:", {
    teachingTopic,
    teachingLength: userTeaching.length,
  });

  const systemInstruction = `You are a BRUTALLY HONEST teaching coach and educational auditor. Your mission is to provide RIGOROUS, ACCURATE, and MEANINGFUL evaluation of teaching performance.

**MANDATORY RELEVANCE CHECK:**
Before scoring, you MUST verify if the 'User Teaching' is actually an attempt to teach the provided 'Topic'.
1. If the input is irrelevant, garbage, nonsense, or completely unrelated to the topic:
   - YOU MUST AWARD ZERO (0) for ALL category scores and the overall_score.
   - The 'feedback' MUST explicitly state that the content is irrelevant/invalid.
2. If the input is a brief greeting or a single sentence that doesn't attempt to teach:
   - AWARD a maximum overall_score of 5.

**EVALUATION CRITERIA:**
- Judge whether the explanation sounds like an actual teacher: objectives, scaffolding, examples, and checks for understanding.
- Reward: Clear structure, simplified complex concepts, and engaging delivery.
- Penalize: Casual chat, superficial opinions, factual inaccuracies, or missing steps.
- Be EXTREMELY BRIEF in your written responses (MAX 1-2 sentences).

**TEACHING CONTEXT:**
Topic: ${teachingTopic}
User Teaching: ${userTeaching}

**TEACHING EVALUATION CATEGORIES (0-20 points each):**

1. **Clarity & Explanation (0-20):**
   - 0-5: Confusing, unclear, hard to understand
   - 6-10: Basic clarity with some confusion
   - 11-15: Clear explanation, easy to follow
   - 16-20: Crystal clear, perfectly explained

2. **Structure & Organization (0-20):**
   - 0-5: Disorganized, no clear flow
   - 6-10: Basic structure, some organization
   - 11-15: Well-organized, logical flow
   - 16-20: Excellent structure, perfect organization

3. **Engagement & Interest (0-20):**
   - 0-5: Boring, unengaging, monotone
   - 6-10: Some engagement, basic interest
   - 11-15: Engaging, holds attention
   - 16-20: Highly engaging, captivating

4. **Educational Value (0-20):**
   - 0-5: No learning value, superficial
   - 6-10: Basic educational content
   - 11-15: Good educational value
   - 16-20: Excellent educational content

5. **Accessibility & Adaptability (0-20):**
   - 0-5: Too complex, not accessible
   - 6-10: Some accessibility issues
   - 11-15: Good accessibility
   - 16-20: Perfectly adapted to audience

6. **Completeness & Depth (0-20):**
   - 0-5: Incomplete, superficial coverage
   - 6-10: Basic coverage, some depth
   - 11-15: Good coverage and depth
   - 16-20: Comprehensive, thorough coverage

**CRITICAL: OVERALL SCORE IS COMPLETELY INDEPENDENT**
- Category scores (0-20 each) evaluate specific teaching skills
- Overall score (0-100) evaluates COMPLETE TEACHING EFFECTIVENESS
- DO NOT add category scores together
- DO NOT average category scores
- DO NOT use category scores to calculate overall score
- Evaluate overall score separately based on total teaching impact

**OVERALL SCORE (0-100) - INDEPENDENT EVALUATION:**
Judge complete teaching performance based on total effectiveness:
- 0-20: Terrible teaching, no learning value
- 21-40: Weak teaching with major issues
- 41-60: Decent teaching with some strengths
- 61-80: Strong teaching, effective educator
- 81-100: Exceptional teaching, master educator

**SCORING RULES:**
- Score each category independently based on actual performance
- Score overall independently based on complete teaching impact
- Be accurate and honest - most teachers score 30-60 overall
- Only truly exceptional teaching gets 70+ overall

**BRUTALLY ACCURATE ANALYSIS REQUIREMENTS:**
- Reference specific parts of their teaching
- Quote exact words as evidence for scores
- Identify where they struggled vs excelled
- Be brutally honest about performance
- Score based on ACTUAL teaching quality, not potential
- Explicitly note any factual inaccuracies or missing steps
- If tone is not teacher-like, deduct across Clarity/Structure/Engagement

**RESPONSE STYLE - BE EXTREMELY BRIEF:**
- MAXIMUM 1-2 sentences per response field
- Use bullet points and very short phrases
- NO paragraphs - only short, punchy statements
- Be direct and actionable

**Output Instructions:**
Your entire output MUST be a single, valid JSON object without any markdown or extra text.`;

  const response = await callWithRetry(
    ai,
    async (model) =>
      ai.models.generateContent({
        model,
        contents: systemInstruction,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              role: {
                type: Type.STRING,
                description:
                  "The coaching role used (Enhanced Teacher Evaluation).",
              },
              overall_score: {
                type: Type.INTEGER,
                description: "Overall teaching score out of 100 - INDEPENDENT evaluation of complete teaching effectiveness, NOT calculated from category scores.",
              },
              category_scores: {
                type: Type.OBJECT,
                description:
                  "Individual scores for each of the 6 categories (0-20 each).",
                properties: {
                  clarity: {
                    type: Type.INTEGER,
                    description: "Clarity & Explanation score (0-20).",
                  },
                  structure: {
                    type: Type.INTEGER,
                    description: "Structure & Organization score (0-20).",
                  },
                  engagement: {
                    type: Type.INTEGER,
                    description: "Engagement & Interest score (0-20).",
                  },
                  educationalValue: {
                    type: Type.INTEGER,
                    description: "Educational Value score (0-20).",
                  },
                  accessibility: {
                    type: Type.INTEGER,
                    description: "Accessibility & Adaptability score (0-20).",
                  },
                  completeness: {
                    type: Type.INTEGER,
                    description: "Completeness & Depth score (0-20).",
                  },
                },
                required: [
                  "clarity",
                  "structure",
                  "engagement",
                  "educationalValue",
                  "accessibility",
                  "completeness",
                ],
              },
              feedback: {
                type: Type.STRING,
                description:
                  "BRIEF feedback analyzing teaching performance - MAX 2 sentences.",
              },
              tips: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  "3-5 SHORT improvement tips - each tip MAX 1 sentence.",
              },
              whatYouDidWell: {
                type: Type.STRING,
                description: "BRIEF strengths - MAX 1 sentence.",
              },
              areasForImprovement: {
                type: Type.STRING,
                description: "BRIEF improvement areas - MAX 1 sentence.",
              },
              teachingAnalysis: {
                type: Type.OBJECT,
                description: "Detailed analysis of the teaching performance.",
                properties: {
                  strongestMoment: {
                    type: Type.STRING,
                    description:
                      "BRIEF strongest teaching moment - MAX 1 sentence.",
                  },
                  weakestMoment: {
                    type: Type.STRING,
                    description: "BRIEF weakest teaching moment - MAX 1 sentence.",
                  },
                  bestExplanation: {
                    type: Type.STRING,
                    description:
                      "BRIEF best explanation technique - MAX 1 sentence.",
                  },
                  missedOpportunities: {
                    type: Type.STRING,
                    description: "BRIEF missed opportunities - MAX 1 sentence.",
                  },
                  audienceAdaptation: {
                    type: Type.STRING,
                    description: "BRIEF audience adaptation - MAX 1 sentence.",
                  },
                },
                required: [
                  "strongestMoment",
                  "weakestMoment",
                  "bestExplanation",
                  "missedOpportunities",
                  "audienceAdaptation",
                ],
              },
              communicationBehavior: {
                type: Type.OBJECT,
                description:
                  "Communication profile analysis based on teaching performance.",
                properties: {
                  profile: {
                    type: Type.STRING,
                    description: "BRIEF teaching profile - MAX 3 words.",
                  },
                  strength: {
                    type: Type.STRING,
                    description: "BRIEF key strength - MAX 1 sentence.",
                  },
                  growthArea: {
                    type: Type.STRING,
                    description: "BRIEF growth area - MAX 1 sentence.",
                  },
                },
                required: ["profile", "strength", "growthArea"],
              },
              exampleRewrite: {
                type: Type.OBJECT,
                description:
                  "Example teaching improvement with before/after comparison.",
                properties: {
                  original: {
                    type: Type.STRING,
                    description:
                      "BRIEF original teaching excerpt - MAX 2 sentences.",
                  },
                  improved: {
                    type: Type.STRING,
                    description:
                      "BRIEF improved teaching version - MAX 2 sentences.",
                  },
                  reasoning: {
                    type: Type.STRING,
                    description:
                      "BRIEF explanation of improvement - MAX 1 sentence.",
                  },
                },
                required: ["original", "improved", "reasoning"],
              },
            },
            required: [
              "role",
              "overall_score",
              "category_scores",
              "feedback",
              "tips",
              "whatYouDidWell",
              "areasForImprovement",
              "teachingAnalysis",
              "communicationBehavior",
              "exampleRewrite",
            ],
          },
        },
      }),
    { preferredModel: "gemini-2.5-flash", perAttemptTimeoutMs: 12000 },
  );

  const result = JSON.parse(response.text);
  console.log("✅ Enhanced teacher evaluation generated");
  return result;
}

/**
 * Enhanced storyteller evaluation function with detailed analysis and scoring.
 * Provides comprehensive feedback similar to the debate evaluation.
 */
export async function getEnhancedStorytellerEvaluation(
  ai: GoogleGenAI,
  storyPrompt: string,
  userStory: string,
): Promise<any> {
  console.log("🎯 getEnhancedStorytellerEvaluation called with:", {
    storyPrompt,
    storyLength: userStory.length,
  });

  const systemInstruction = `You are a professional narrative auditor and literary critic. Your task is to provide RIGOROUS and ACCURATE evaluation of storytelling performance using a strict 0-20 category scoring system.

**MANDATORY RELEVANCE & QUALITY CHECK:**
Before scoring, you MUST verify if the 'User Story' is a meaningful narrative response to the 'Prompt'.
1. If the input is irrelevant, garbage, nonsense, or completely unrelated to the story prompt:
   - YOU MUST AWARD ZERO (0) for ALL category scores and the overall_score.
   - The 'feedback' MUST explicitly state that the content is irrelevant/invalid.
2. If the input is a single sentence or extremely low-effort:
   - AWARD a maximum overall_score of 5.

**STRICT SCORING RULES:**
1. SCORING ANCHORS:
   - 0–5: Fundamentally broken, incoherent, irrelevant, or severely flawed
   - 6–10: Weak execution, shallow depth, basic competence only
   - 11-16: Solid, readable, but safe or limited
   - 17-20: Rare, exceptional, emotionally or structurally outstanding
2. Scores of 18–20 are EXTREMELY RARE. Reserve them only for award-level writing. 
3. Creativity & Originality: Familiar tropes or derivative plots MUST reduce this score significantly.
4. Emotional Impact: Judge based on emotional escalation and resonance, not just tone.
5. STORY COMPLETENESS: Penalize heavily (max 40 overall) if the story is unfinished or feels like a brief summary.

**STORYTELLING CONTEXT:**
Prompt: ${storyPrompt}
User Story: ${userStory}

**STORYTELLING EVALUATION CRITERIA (0-20 points each):**

1. **Narrative Structure (0-20):**
   - 0-3: No structure, random sentences
   - 4-7: Minimal structure, confusing flow
   - 8-11: Basic structure, some organization
   - 12-15: Good structure, clear progression
   - 16-20: Excellent structure, perfect flow

2. **Character Development (0-20):**
   - 0-3: No characters or completely flat
   - 4-7: Mentioned characters, no development
   - 8-11: Basic character development
   - 12-15: Good character depth
   - 16-20: Rich, complex characters

3. **Descriptive Language (0-20):**
   - 0-3: No descriptions, bland language
   - 4-7: Minimal descriptions, basic language
   - 8-11: Some descriptive language
   - 12-15: Good descriptive quality
   - 16-20: Vivid, captivating descriptions

4. **Emotional Impact (0-20):**
   - 0-3: No emotional content whatsoever
   - 4-7: Minimal emotional elements
   - 8-11: Some emotional connection
   - 12-15: Good emotional engagement
   - 16-20: Powerful emotional impact

5. **Creativity & Originality (0-20):**
   - 0-3: Completely generic or copied
   - 4-7: Very basic, cliché content
   - 8-11: Some creative elements
   - 12-15: Good creativity
   - 16-20: Highly original, innovative

6. **Engagement & Pacing (0-20):**
   - 0-3: Extremely boring, no pacing
   - 4-7: Dull, poor pacing
   - 8-11: Basic engagement
   - 12-15: Good pacing and engagement
   - 16-20: Captivating, perfect pacing

**REALISTIC SCORE INTERPRETATION:**
- 0-25: Poor storytelling (needs major improvement)
- 25-40: Basic storytelling (typical beginner)
- 40-55: Good storytelling (competent storyteller)
- 55-70: Excellent storytelling (skilled writer)
- 70-100: Master-level storytelling (rare)

**BRUTALLY ACCURATE ANALYSIS REQUIREMENTS:**
- Reference specific parts of their story
- Quote exact words as evidence for scores
- Identify where they struggled vs excelled
- Be brutally honest about performance
- Score based on ACTUAL storytelling quality, not potential

**RESPONSE STYLE - BE EXTREMELY BRIEF:**
- MAXIMUM 1-2 sentences per response field
- Use bullet points and very short phrases
- NO paragraphs - only short, punchy statements
- Be direct and actionable

**Output Instructions:**
Your entire output MUST be a single, valid JSON object without any markdown or extra text.`;

  const response = await callWithRetry(
    ai,
    async (model) =>
      ai.models.generateContent({
        model,
        contents: systemInstruction,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              role: {
                type: Type.STRING,
                description:
                  "The coaching role used (Enhanced Storyteller Evaluation).",
              },
              overall_score: {
                type: Type.INTEGER,
                description: "Overall storytelling score out of 100.",
              },
              category_scores: {
                type: Type.OBJECT,
                description:
                  "Individual scores for each of the 6 categories (0-20 each).",
                properties: {
                  narrativeStructure: {
                    type: Type.INTEGER,
                    description: "Narrative Structure score (0-20).",
                  },
                  characterDevelopment: {
                    type: Type.INTEGER,
                    description: "Character Development score (0-20).",
                  },
                  descriptiveLanguage: {
                    type: Type.INTEGER,
                    description: "Descriptive Language score (0-20).",
                  },
                  emotionalImpact: {
                    type: Type.INTEGER,
                    description: "Emotional Impact score (0-20).",
                  },
                  creativity: {
                    type: Type.INTEGER,
                    description: "Creativity & Originality score (0-20).",
                  },
                  engagement: {
                    type: Type.INTEGER,
                    description: "Engagement & Pacing score (0-20).",
                  },
                },
                required: [
                  "narrativeStructure",
                  "characterDevelopment",
                  "descriptiveLanguage",
                  "emotionalImpact",
                  "creativity",
                  "engagement",
                ],
              },
              feedback: {
                type: Type.STRING,
                description:
                  "BRIEF feedback analyzing storytelling performance - MAX 2 sentences.",
              },
              tips: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  "3-5 SHORT improvement tips - each tip MAX 1 sentence.",
              },
              whatYouDidWell: {
                type: Type.STRING,
                description: "BRIEF strengths - MAX 1 sentence.",
              },
              areasForImprovement: {
                type: Type.STRING,
                description: "BRIEF improvement areas - MAX 1 sentence.",
              },
              storytellingAnalysis: {
                type: Type.OBJECT,
                description: "Detailed analysis of the storytelling performance.",
                properties: {
                  strongestMoment: {
                    type: Type.STRING,
                    description:
                      "BRIEF strongest storytelling moment - MAX 1 sentence.",
                  },
                  weakestMoment: {
                    type: Type.STRING,
                    description:
                      "BRIEF weakest storytelling moment - MAX 1 sentence.",
                  },
                  bestTechnique: {
                    type: Type.STRING,
                    description:
                      "BRIEF best storytelling technique - MAX 1 sentence.",
                  },
                  missedOpportunities: {
                    type: Type.STRING,
                    description: "BRIEF missed opportunities - MAX 1 sentence.",
                  },
                  emotionalConnection: {
                    type: Type.STRING,
                    description: "BRIEF emotional connection - MAX 1 sentence.",
                  },
                },
                required: [
                  "strongestMoment",
                  "weakestMoment",
                  "bestTechnique",
                  "missedOpportunities",
                  "emotionalConnection",
                ],
              },
              communicationBehavior: {
                type: Type.OBJECT,
                description:
                  "Communication profile analysis based on storytelling performance.",
                properties: {
                  profile: {
                    type: Type.STRING,
                    description: "BRIEF storytelling profile - MAX 3 words.",
                  },
                  strength: {
                    type: Type.STRING,
                    description: "BRIEF key strength - MAX 1 sentence.",
                  },
                  growthArea: {
                    type: Type.STRING,
                    description: "BRIEF growth area - MAX 1 sentence.",
                  },
                },
                required: ["profile", "strength", "growthArea"],
              },
              exampleRewrite: {
                type: Type.OBJECT,
                description:
                  "Example storytelling improvement with before/after comparison.",
                properties: {
                  original: {
                    type: Type.STRING,
                    description: "BRIEF original story excerpt - MAX 2 sentences.",
                  },
                  improved: {
                    type: Type.STRING,
                    description: "BRIEF improved story version - MAX 2 sentences.",
                  },
                  reasoning: {
                    type: Type.STRING,
                    description:
                      "BRIEF explanation of improvement - MAX 1 sentence.",
                  },
                },
                required: ["original", "improved", "reasoning"],
              },
            },
            required: [
              "role",
              "overall_score",
              "category_scores",
              "feedback",
              "tips",
              "whatYouDidWell",
              "areasForImprovement",
              "storytellingAnalysis",
              "communicationBehavior",
              "exampleRewrite",
            ],
          },
        },
      }),
    { preferredModel: "gemini-2.5-flash", perAttemptTimeoutMs: 12000 },
  );

  const result = JSON.parse(response.text);
  console.log("✅ Enhanced storyteller evaluation generated");
  return result;
}

/**
 * Converts a file to a GoogleGenerativeAI.Part object for processing
 */
export function fileToGenerativePart(file: UploadedFile): Part {
  return {
    inlineData: {
      mimeType: file.mimeType,
      data: file.content,
    },
  };
}

/**
 * Extracts text content from uploaded files using Gemini
 */
export async function extractTextFromFile(
  ai: GoogleGenAI,
  file: UploadedFile,
): Promise<string> {
  console.log("🎯 extractTextFromFile called with:", {
    fileName: file.name,
    fileType: file.type,
    mimeType: file.mimeType,
  });

  const filePart = fileToGenerativePart(file);

  let systemInstruction = "";

  if (file.mimeType.startsWith("image/")) {
    systemInstruction = `Extract all text content from this image. Include any visible text, labels, captions, or written content. If there are multiple sections or paragraphs, preserve the structure. If no text is visible, respond with "No text content found in image."`;
  } else if (file.mimeType === "application/pdf") {
    systemInstruction = `You are extracting information from a PDF. Do all of the following:

1) Extract all readable text verbatim, preserving logical structure (headings, paragraphs, lists) in Markdown.
2) Extract structured data:
   - Tables: Reconstruct each table in Markdown table format.
   - Key–value pairs: List as "key: value" lines.
   - Dates, amounts, entities (people/orgs/places): Summarize in a short bullet list.
3) Multi-page PDFs: Keep original order; clearly label sections by page when possible (e.g., "Page 1", "Page 2").
4) If the document contains images with visible text, include that text under an "Image text" subsection.
5) If no text is found, respond with "No extractable text found."`;
  } else {
    systemInstruction = `Extract all text content from this document. Preserve the original structure and formatting as much as possible.`;
  }

  try {
    console.log("📄 Sending file to Gemini for extraction...", {
      fileName: file.name,
      mimeType: file.mimeType,
      contentLength: file.content.length,
    });

    const response = await callWithRetry(
      ai,
      async (model) =>
        ai.models.generateContent({
          model,
          contents: { parts: [filePart, { text: systemInstruction }] },
          config: {
            temperature: 0.1,
          },
        }),
      { preferredModel: "gemini-1.5-flash", perAttemptTimeoutMs: 15000 },
    );

    const extractedText = response.text.trim();
    console.log("✅ Text extracted from file:", {
      fileName: file.name,
      textLength: extractedText.length,
      preview: extractedText.substring(0, 200),
    });
    return extractedText;
  } catch (error) {
    console.error("❌ Error extracting text from file:", error);
    throw new Error(
      `Failed to extract text from ${file.name}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Refines and organizes extracted content for teaching purposes
 */
export async function refineExtractedContentForTeaching(
  ai: GoogleGenAI,
  extractedText: string,
  originalFileName: string,
): Promise<string> {
  console.log("🎯 refineExtractedContentForTeaching called with:", {
    textLength: extractedText.length,
    fileName: originalFileName,
  });

  const systemInstruction = `You are an expert educational content organizer. Your task is to take extracted text content from a file and refine it into a clear, structured, and teachable format.

**Your Goal:**
Transform the extracted content into a well-organized teaching scenario that a person can effectively explain to others.

**What to do:**
1. **Identify the main concepts** - What are the core topics or ideas in this content?
2. **Structure the information** - Organize it into logical sections and flow
3. **Add educational context** - Provide background, examples, or connections if needed
4. **Make it teachable** - Format it so someone can explain it step-by-step
5. **Preserve important details** - Keep key information while making it accessible
6. **Keep it concise** - Aim for 2-4 paragraphs maximum, but ensure completeness

**Output Format:**
Create a structured teaching topic that includes:
- A clear title or main concept
- Key points organized logically
- Examples or context where helpful
- A format that's easy to teach from

**Source Information:**
- Original file: ${originalFileName}
- Content length: ${extractedText.length} characters

**Extracted Content:**
${extractedText}

**Your refined teaching topic:**`;

  try {
    const response = await callWithRetry(
      ai,
      async (model) =>
        ai.models.generateContent({
          model,
          contents: { parts: [{ text: systemInstruction }] },
          config: {
            temperature: 0.3,
          },
        }),
      { preferredModel: "gemini-2.5-flash", perAttemptTimeoutMs: 10000 },
    );

    const refinedContent = response.text.trim();
    console.log("✅ Content refined for teaching:", {
      fileName: originalFileName,
      refinedLength: refinedContent.length,
    });
    return refinedContent;
  } catch (error) {
    console.error("❌ Error refining content for teaching:", error);
    throw new Error(
      `Failed to refine content for teaching: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Processes multiple uploaded files and extracts/refines their content
 */
export async function processUploadedFilesForTeaching(
  ai: GoogleGenAI,
  files: UploadedFile[],
): Promise<{
  extractedText: string;
  refinedContent: string;
  processedFiles: UploadedFile[];
}> {
  console.log("🎯 processUploadedFilesForTeaching called with:", {
    fileCount: files.length,
    fileNames: files.map((f) => f.name),
  });

  const processedFiles: UploadedFile[] = [];
  let allExtractedText = "";

  // Process each file
  let lastError: Error | null = null;
  for (const file of files) {
    try {
      const extractedText = await extractTextFromFile(ai, file);
      const processedFile = { ...file, extractedText };
      processedFiles.push(processedFile);
      allExtractedText += `\n\n--- Content from ${file.name} ---\n${extractedText}`;
    } catch (error) {
      console.error(`❌ Failed to process file ${file.name}:`, error);
      lastError = error instanceof Error ? error : new Error(String(error));
      // Continue with other files even if one fails
    }
  }

  if (!allExtractedText.trim()) {
    // If we have a rate limit or server error, throw that instead of generic message
    if (lastError) {
      throw lastError;
    }
    throw new Error(
      "No content could be extracted from any of the uploaded files",
    );
  }

  // Refine the combined content for teaching
  const refinedContent = await refineExtractedContentForTeaching(
    ai,
    allExtractedText,
    files.map((f) => f.name).join(", "),
  );

  console.log("✅ All files processed for teaching:", {
    processedCount: processedFiles.length,
    totalTextLength: allExtractedText.length,
    refinedLength: refinedContent.length,
  });

  return {
    extractedText: allExtractedText,
    refinedContent,
    processedFiles,
  };
}
