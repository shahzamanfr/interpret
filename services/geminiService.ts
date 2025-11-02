import { GoogleGenAI, Type, Part } from "@google/genai";
import { CoachMode, Feedback, UploadedFile } from "../types";

// Centralized model candidates and retry helper to improve resiliency against transient 503s
const DEFAULT_MODEL_CANDIDATES = [
  // Prefer widely available, fast models first
  "gemini-1.5-flash",
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
  const retries = options?.retries ?? 2;
  const initialDelayMs = options?.initialDelayMs ?? 400;
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
        const isTimeout = message.includes("timeout");

        // Non-503/timeout: break inner loop and try next model immediately
        if (!is503 && !isTimeout) break;

        // 503 -> retry with backoff
        if (attempt === retries) break;
        await new Promise((res) => setTimeout(res, delay));
        delay *= 2;
        attempt += 1;
      }
    }
    // Try next model
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
      // Prefer backend proxy if available via env
      const apiBase =
        (typeof window !== "undefined" && (window as any).__AI_PROXY__) || "";
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
          { role: "user", parts: [imagePart, { text: systemInstruction }] },
        ],
        config: { temperature: 0.2 },
      });
    },
    { preferredModel: "gemini-1.5-flash", perAttemptTimeoutMs: 6000 },
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
            contents: [{ role: "user", parts: [imagePart, { text: prompt }] }],
          }),
        });
        if (!r.ok) throw new Error(`Proxy error ${r.status}`);
        const data = await r.json();
        return { text: data.text } as any;
      }
      return ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [imagePart, { text: prompt }] }],
      });
    },
    { preferredModel: "gemini-1.5-flash", perAttemptTimeoutMs: 7000 },
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
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: systemInstruction,
    config: {
      temperature: 0.3, // Lower temperature for more focused, structured output
    },
  });

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
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: systemInstruction,
    config: {
      temperature: 0.25, // Lowered to reduce randomness and stay on-topic
    },
  });

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
- "content": Your opening argument (4-6 sentences, natural flow)

Write 4-6 sentences. Mix sentence lengths. Sound human, not formulaic.`;

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
      { preferredModel: "gemini-1.5-flash", perAttemptTimeoutMs: 7000 },
    );

    const result = JSON.parse(response.text);
    console.log("✅ Initial debate stance generated");
    return result;
  } else {
    // Rebuttal to user's argument
    const systemInstruction = `You're debating someone and they just made an argument. Now respond like a real person would - push back on their points, but sound natural and human, not like a robot.

**Topic:** ${topic}
**Their Argument:** ${userArgument}

**How to respond naturally:**
- Start with a natural reaction - "Wait, what?", "Hold on", "Okay but", "I hear you, but"
- Point out the flaw in their thinking without being robotic
- Use everyday language and contractions - "you're", "that's", "doesn't", "can't"
- Mix question and statement styles
- Reference real things people know about
- Show some emotion but stay grounded - doubt, surprise, frustration, conviction
- No AI phrases like "Furthermore", "Additionally", "It is worth noting", "One must consider"
- Vary your sentence structure naturally
- Sound like someone who genuinely disagrees and has reasons why

**Examples of natural human responses:**
- "Wait, that doesn't add up though. If what you're saying is true, then why do we see the complete opposite happening in real life? Like, just look at..."
- "Okay but you're missing something huge here - the whole reason this is a problem is because..."
- "I mean, sure, that sounds nice on paper, but you're ignoring the fact that most people don't actually experience it that way. Studies show..."
- "Come on, you can't seriously believe that's the main issue. What about all the evidence that points to..."
- "Hold on - you just contradicted yourself. First you said X, now you're saying Y. Which one is it?"

**Response style:**
- Write 4-6 sentences with natural flow
- Mix short punchy statements with longer explanations
- Use real examples or data when it makes sense
- Sound like you're actually thinking through their argument, not reciting talking points
- Show you care about the topic

Respond naturally, like a real person having a real debate.`;

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

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: systemInstruction,
    config: {
      temperature: 0.3, // Lower temperature for more consistent, accurate evaluation
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
  });

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
  const systemInstruction = `You are an elite education professor with 20+ years of experience evaluating teaching effectiveness. You will analyze the user's teaching explanation with brutally accurate, meaningful scoring that reflects real teaching performance.

**TEACHING EVALUATION CRITERIA (0-20 points each):**

1. **Clarity & Explanation (0-20):**
   - 0-5: Confusing, unclear, or overly complex explanations
   - 6-10: Basic clarity with some confusion points
   - 11-15: Clear explanations with minor gaps
   - 16-20: Crystal clear, easy to understand, well-explained concepts

2. **Structure & Organization (0-20):**
   - 0-5: Disorganized, random, no logical flow
   - 6-10: Basic structure with some organization
   - 11-15: Well-organized with clear progression
   - 16-20: Excellent structure, logical flow, easy to follow

3. **Engagement & Interest (0-20):**
   - 0-5: Boring, dry, no engagement techniques
   - 6-10: Some interesting elements, basic engagement
   - 11-15: Engaging with good techniques
   - 16-20: Highly engaging, captivating, holds attention

4. **Educational Value (0-20):**
   - 0-5: Little to no learning value, superficial
   - 6-10: Basic educational content
   - 11-15: Good educational value, informative
   - 16-20: Exceptional learning value, comprehensive understanding

5. **Accessibility & Adaptability (0-20):**
   - 0-5: Too complex, not accessible to target audience
   - 6-10: Somewhat accessible, some complexity issues
   - 11-15: Good accessibility, appropriate level
   - 16-20: Perfectly accessible, adapts to audience level

6. **Completeness & Depth (0-20):**
   - 0-5: Incomplete, shallow coverage
   - 6-10: Basic coverage, some gaps
   - 11-15: Good coverage, adequate depth
   - 16-20: Comprehensive, thorough, complete coverage

**SCORING PHILOSOPHY:**
- Be RUTHLESS but FAIR - most teachers score 30-60 points total
- Only exceptional teaching gets 70+ points
- Reference SPECIFIC parts of their explanation
- Consider the complexity of the topic being taught
- Factor in how well they adapted to their audience

**ANALYSIS REQUIREMENTS:**
- Quote specific parts of their teaching
- Identify their strongest and weakest teaching moments
- Note how well they explained complex concepts
- Assess their use of teaching techniques (examples, analogies, structure)
- Evaluate their ability to make content accessible

**Input:**
- **The User's Teaching:** ${userText}

**Output Instructions:**
Your entire output MUST be a single, valid JSON object without any markdown or extra text.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
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
            description: "Overall teaching score out of 100.",
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
  });

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
  const systemInstruction = `You are an elite creative writing professor and published author with 20+ years of experience evaluating storytelling. You will analyze the user's story with brutally accurate, meaningful scoring that reflects real storytelling performance.

**STORYTELLING EVALUATION CRITERIA (0-20 points each):**

1. **Narrative Structure (0-20):**
   - 0-5: No clear structure, confusing plot, poor pacing
   - 6-10: Basic structure with some issues
   - 11-15: Good structure, clear progression
   - 16-20: Excellent structure, perfect pacing, compelling flow

2. **Character Development (0-20):**
   - 0-5: Flat, one-dimensional characters
   - 6-10: Basic character development
   - 11-15: Good character depth and development
   - 16-20: Rich, complex, compelling characters

3. **Descriptive Language (0-20):**
   - 0-5: Bland, generic descriptions
   - 6-10: Basic descriptive elements
   - 11-15: Good use of vivid language
   - 16-20: Exceptional, immersive descriptions

4. **Emotional Impact (0-20):**
   - 0-5: No emotional connection, flat
   - 6-10: Some emotional elements
   - 11-15: Good emotional engagement
   - 16-20: Powerful emotional impact, deeply moving

5. **Creativity & Originality (0-20):**
   - 0-5: Cliché, unoriginal, predictable
   - 6-10: Some creative elements
   - 11-15: Good creativity and originality
   - 16-20: Highly original, innovative, surprising

6. **Engagement & Pacing (0-20):**
   - 0-5: Boring, slow, hard to follow
   - 6-10: Some engaging moments
   - 11-15: Good engagement and pacing
   - 16-20: Captivating, perfect pacing, page-turner

**SCORING PHILOSOPHY:**
- Be RUTHLESS but FAIR - most storytellers score 30-60 points total
- Only exceptional storytelling gets 70+ points
- Reference SPECIFIC parts of their story
- Consider the complexity and ambition of their narrative
- Factor in their use of literary techniques

**ANALYSIS REQUIREMENTS:**
- Quote specific parts of their story
- Identify their strongest and weakest storytelling moments
- Note their use of literary devices (metaphors, dialogue, imagery)
- Assess their character development and world-building
- Evaluate their ability to create emotional connection

**Input:**
- **The User's Story:** ${userText}

**Output Instructions:**
Your entire output MUST be a single, valid JSON object without any markdown or extra text.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
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
  });

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

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
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
  });

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
    const systemInstruction = `You are ${startingAgent.name}, a human participant in a group discussion. You have the personality of a "${startingAgent.personality}" - ${startingAgent.description}.

**Discussion Topic:** ${topic}

**Your Task:**
Start the group discussion naturally as a real person would. Be human, conversational, and engaging.

**Human Discussion Style:**
- Talk like a real person, not a robot
- Use natural language and expressions
- Be conversational and engaging
- Use "I think" or "I believe" naturally
- Sound like you're actually talking to other people
- Can be passionate about your perspective
- Use contractions (don't, can't, won't)
- Be authentic to your personality type

**Your Personality:** ${startingAgent.personality}
**Your Description:** ${startingAgent.description}

**Output:**
Just your natural opening contribution to start the discussion. Be human, not AI.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: systemInstruction,
      config: {
        temperature: 0.8, // Higher temperature for more natural, varied responses
      },
    });

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

    const systemInstruction = `You are ${respondingAgent.name}, a human participant in a group discussion. You have the personality of a "${respondingAgent.personality}" - ${respondingAgent.description}.

**Discussion Topic:** ${topic}
${userContribution ? `**User's Latest Contribution:** ${userContribution}` : "**Context:** Continue the group discussion naturally"}

**Recent Discussion Context:**
${historyText}

**Your Task:**
${
  userContribution
    ? "Respond naturally to the user's contribution as a real person would. Build on their ideas, challenge them respectfully, or add new perspectives."
    : "Continue the group discussion naturally. You can build on what others have said, introduce new ideas, ask questions, or challenge existing points. Be spontaneous and engaging."
}

**Human Discussion Style:**
- Talk like a real person, not a robot
- Use natural language and expressions
- Be conversational and engaging
- Reference what others have said naturally
- Use "I think" or "I believe" naturally
- Sound like you're actually talking to other people
- Can be passionate about your perspective
- Use contractions (don't, can't, won't)
- Be authentic to your personality type
- Build on others' ideas or respectfully disagree
- Sometimes ask questions to keep the discussion flowing
- Occasionally challenge ideas to make it interesting

**Your Personality:** ${respondingAgent.personality}
**Your Description:** ${respondingAgent.description}

**Output:**
Just your natural response to the discussion. Be human, not AI.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: systemInstruction,
      config: {
        temperature: 0.8, // Higher temperature for more natural, varied responses
      },
    });

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
- 0-2: Incomprehensible, inappropriate, offensive
- 3-5: Inappropriate tone, basic language, unclear
- 6-8: Adequate tone, simple language, mostly clear
- 9-11: Professional tone, articulate, clear
- 12-14: Sophisticated tone, eloquent delivery
- 15-17: Masterful tone, compelling delivery
- 18-20: Exceptional tone, persuasive mastery

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

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: systemInstruction,
    config: {
      temperature: 0.2, // Lower temperature for consistent scoring
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
  });

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

  // Calculate overall performance score separately from category averages
  const overallScore = Math.round(
    messageScores.reduce((sum, msg) => sum + msg.overallPerformance, 0) /
      messageScores.length,
  );

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

**RESPONSE STYLE - BE EXTREMELY BRIEF:**
- MAXIMUM 1-2 sentences per response field
- Use bullet points and very short phrases
- NO paragraphs - only short, punchy statements
- Be direct and actionable - cut to the point immediately
- Use powerful, engaging language that motivates improvement
- Think Twitter/X style - concise and impactful

**Output Instructions:**
Your entire output MUST be a single, valid JSON object without any markdown or extra text.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
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
  });

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

**DISCUSSION CONTEXT:**
Topic: ${discussionTopic}
User Participation Count: ${userParticipationCount}

**ACTIVE AI AGENTS:**
${agentsText}

**FULL DISCUSSION HISTORY:**
${discussionText}

**COMPREHENSIVE GROUP DISCUSSION EVALUATION CRITERIA (0-20 points each):**

1. **Participation & Engagement (0-20):**
   - 0-5: Minimal participation, passive observer
   - 6-10: Basic participation, some contributions
   - 11-15: Good participation, regular contributions
   - 16-20: Excellent participation, highly engaged throughout

2. **Communication Clarity (0-20):**
   - 0-5: Unclear, confusing, hard to understand
   - 6-10: Basic clarity with some confusion
   - 11-15: Clear communication, easy to follow
   - 16-20: Crystal clear, articulate, well-expressed

3. **Leadership & Initiative (0-20):**
   - 0-5: No leadership, follows others' lead
   - 6-10: Some initiative, occasional leadership
   - 11-15: Good leadership, takes initiative
   - 16-20: Strong leadership, drives discussion forward

4. **Active Listening (0-20):**
   - 0-5: Doesn't listen, ignores others' points
   - 6-10: Basic listening, some acknowledgment
   - 11-15: Good listening, builds on others' ideas
   - 16-20: Excellent listening, references others' contributions

5. **Collaboration Skills (0-20):**
   - 0-5: Competitive, doesn't collaborate
   - 6-10: Some collaboration, works with others
   - 11-15: Good collaboration, team player
   - 16-20: Excellent collaboration, enhances group dynamics

6. **Critical Thinking (0-20):**
   - 0-5: Superficial thinking, no analysis
   - 6-10: Basic analysis, some depth
   - 11-15: Good critical thinking, thoughtful analysis
   - 16-20: Excellent critical thinking, deep insights

**SCORING PHILOSOPHY:**
- Be RUTHLESS but FAIR - most participants score 30-60 points total
- Only exceptional group discussion performance gets 70+ points
- Reference SPECIFIC contributions from the discussion
- Consider the user's role in group dynamics
- Factor in how well they engaged with different agent personalities
- Assess their ability to navigate group dynamics

**ANALYSIS REQUIREMENTS:**
- Quote specific contributions the user made
- Identify their strongest and weakest moments in the discussion
- Note how they responded to different agent personalities
- Assess their ability to build on others' ideas
- Evaluate their group discussion techniques (listening, building consensus, challenging ideas)
- Consider their overall impact on the discussion flow

**Output Instructions:**
Your entire output MUST be a single, valid JSON object without any markdown or extra text.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
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
              "Overall group discussion score out of 100 based on comprehensive analysis.",
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
              "Comprehensive feedback analyzing the entire group discussion performance with specific examples.",
          },
          tips: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description:
              "5-7 specific improvement tips based on actual performance in the group discussion.",
          },
          // Legacy fields for backward compatibility
          score: {
            type: Type.INTEGER,
            description: "Legacy overall score (same as overall_score).",
          },
          whatYouDidWell: {
            type: Type.STRING,
            description:
              "Specific strengths demonstrated in the group discussion with examples.",
          },
          areasForImprovement: {
            type: Type.STRING,
            description:
              "Specific areas that need improvement with examples from the discussion.",
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
              "Detailed analysis of the group discussion performance.",
            properties: {
              strongestContribution: {
                type: Type.STRING,
                description:
                  "The user's strongest contribution to the discussion.",
              },
              weakestContribution: {
                type: Type.STRING,
                description:
                  "The user's weakest contribution to the discussion.",
              },
              bestInteraction: {
                type: Type.STRING,
                description:
                  "The user's best interaction with other participants.",
              },
              missedOpportunities: {
                type: Type.STRING,
                description:
                  "Key opportunities the user missed in the discussion.",
              },
              groupDynamics: {
                type: Type.STRING,
                description: "How the user affected overall group dynamics.",
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
  });

  const result = JSON.parse(response.text);
  console.log("✅ Comprehensive group discussion evaluation generated");
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

**Your Role: ${mode}**
You embody the ${personality.tone} personality of a ${mode}. Your approach is ${personality.approach} with a ${personality.style} style.

**ANALYTICAL EVALUATION PROCESS:**

**STEP 1: COMPARE USER RESPONSE TO AI CAPTION**
- The AI caption: "${aiCaption}"
- The user's response: "${userExplanation}"
- Analyze the gap between what they provided vs. what they could have provided

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

  const systemInstruction = `You are a BRUTALLY HONEST teaching coach analyzing teaching performance. Provide realistic scoring that reflects actual teaching quality.

Your evaluation MUST judge whether the explanation sounds like an actual teacher:
- Penalize summaries that sound like general chat or casual opinions
- Reward teacher-like delivery: objectives, scaffolding, examples, checks for understanding, and clear explanations
- Flag and penalize inaccuracies, missing steps, and superficial treatment
- Prefer precise, audience-appropriate language and pacing

**TEACHING CONTEXT:**
Topic: ${teachingTopic}
User Teaching: ${userTeaching}

**TEACHING EVALUATION CRITERIA (0-20 points each):**

1. **Clarity & Explanation (0-20):**
   - 0-5: Confusing, unclear, hard to understand
   - 6-10: Basic clarity with some confusion
   - 11-15: Clear explanation, easy to follow
   - 16-20: Crystal clear, perfectly explained

2. **Structure & Organization (0-20):**
   - 0-5: Disorganized, no clear flow
   - 6-10: Basic structure, some organization
   - 11-15: Well-organized, logical flow
   - 16-20: Excellent structure, perfect organization (intro → steps → summary)

3. **Engagement & Interest (0-20):**
   - 0-5: Boring, unengaging, monotone
   - 6-10: Some engagement, basic interest
   - 11-15: Engaging, holds attention with relevant examples
   - 16-20: Highly engaging with analogies, questions, or interaction

4. **Educational Value (0-20):**
   - 0-5: No learning value, superficial
   - 6-10: Basic educational content
   - 11-15: Good educational value with correct concepts
   - 16-20: Excellent educational content; accurate, key misconceptions addressed

5. **Accessibility & Adaptability (0-20):**
   - 0-5: Too complex, not accessible
   - 6-10: Some accessibility issues
   - 11-15: Good accessibility; adjusts vocabulary
   - 16-20: Adapted to audience; scaffolding and pacing are evident

6. **Completeness & Depth (0-20):**
   - 0-5: Incomplete, superficial coverage
   - 6-10: Basic coverage, some depth
   - 11-15: Good coverage and depth
   - 16-20: Comprehensive; covers steps, edge cases, and checks for understanding

**REALISTIC SCORE INTERPRETATION:**
- 0-25: Poor teaching (needs major improvement)
- 25-40: Basic teaching (typical beginner)
- 40-55: Good teaching (competent teacher)
- 55-70: Excellent teaching (skilled educator)
- 70-100: Master-level teaching (rare)

**BRUTALLY ACCURATE ANALYSIS REQUIREMENTS:**
- Reference specific parts of their teaching
- Quote exact words as evidence for scores
- Identify where they struggled vs excelled
- Be brutally honest about performance
- Score based on ACTUAL teaching quality, not potential

Additionally:
- Explicitly note any factual inaccuracies or missing steps
- If tone is not teacher-like, deduct across Clarity/Structure/Engagement

**RESPONSE STYLE - BE EXTREMELY BRIEF:**
- MAXIMUM 1-2 sentences per response field
- Use bullet points and very short phrases
- NO paragraphs - only short, punchy statements
- Be direct and actionable

**Output Instructions:**
Your entire output MUST be a single, valid JSON object without any markdown or extra text.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
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
            description: "Overall teaching score out of 100.",
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
  });

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

  const systemInstruction = `You are a BRUTALLY HONEST storytelling coach analyzing storytelling performance. Provide realistic scoring that reflects actual storytelling quality.

**STORYTELLING CONTEXT:**
Story Prompt: ${storyPrompt}
User Story: ${userStory}

**STORYTELLING EVALUATION CRITERIA (0-20 points each):**

1. **Narrative Structure (0-20):**
   - 0-5: No clear structure, confusing flow
   - 6-10: Basic structure, some organization
   - 11-15: Good structure, clear progression
   - 16-20: Excellent structure, perfect flow

2. **Character Development (0-20):**
   - 0-5: Flat, one-dimensional characters
   - 6-10: Basic character development
   - 11-15: Good character depth
   - 16-20: Rich, complex characters

3. **Descriptive Language (0-20):**
   - 0-5: Bland, unengaging descriptions
   - 6-10: Basic descriptive language
   - 11-15: Good descriptive quality
   - 16-20: Vivid, captivating descriptions

4. **Emotional Impact (0-20):**
   - 0-5: No emotional connection
   - 6-10: Some emotional elements
   - 11-15: Good emotional engagement
   - 16-20: Powerful emotional impact

5. **Creativity & Originality (0-20):**
   - 0-5: Cliché, unoriginal
   - 6-10: Some creative elements
   - 11-15: Good creativity
   - 16-20: Highly original, innovative

6. **Engagement & Pacing (0-20):**
   - 0-5: Boring, poor pacing
   - 6-10: Basic engagement
   - 11-15: Good pacing and engagement
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

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
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
  });

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
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts: [filePart, { text: systemInstruction }] },
      config: {
        temperature: 0.1, // Low temperature for accurate text extraction
      },
    });

    const extractedText = response.text.trim();
    console.log("✅ Text extracted from file:", {
      fileName: file.name,
      textLength: extractedText.length,
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
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts: [{ text: systemInstruction }] },
      config: {
        temperature: 0.3, // Slightly higher for creative organization
      },
    });

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
  for (const file of files) {
    try {
      const extractedText = await extractTextFromFile(ai, file);
      const processedFile = { ...file, extractedText };
      processedFiles.push(processedFile);
      allExtractedText += `\n\n--- Content from ${file.name} ---\n${extractedText}`;
    } catch (error) {
      console.error(`❌ Failed to process file ${file.name}:`, error);
      // Continue with other files even if one fails
    }
  }

  if (!allExtractedText.trim()) {
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
