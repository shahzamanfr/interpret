/**
 * Groq API Service - Replaces Gemini for coaching feedback
 * Uses Groq's API (OpenAI-compatible, FREE tier available)
 */
import { getApiUrl } from "../utils/config";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile"; // Fast and capable model
const GROQ_VISION_MODEL = "llama-3.2-90b-vision-preview"; // Vision model for image analysis

interface GroqMessage {
    role: "system" | "user" | "assistant";
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

interface GroqResponse {
    choices: Array<{
        message: {
            content: string;
        };
    }>;
}

/**
 * Call Groq API with messages - supports multiple API keys for automatic fallback
 */
async function callGroq(
    apiKeys: string | string[],
    messages: GroqMessage[],
    options?: {
        temperature?: number;
        maxTokens?: number;
        model?: string;
    }
): Promise<string> {
    // Convert single key to array for uniform handling
    const keys = Array.isArray(apiKeys) ? apiKeys : [apiKeys];

    const requestBody = {
        model: options?.model || GROQ_MODEL,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 3000,
    };

    console.log("🚀 GROQ API REQUEST:", {
        url: GROQ_API_URL,
        model: requestBody.model,
        temperature: requestBody.temperature,
        max_tokens: requestBody.max_tokens,
        messageCount: messages.length,
        availableKeys: keys.length,
        hasImageContent: messages.some(m =>
            Array.isArray(m.content) &&
            m.content.some((c: any) => c.type === "image_url")
        )
    });

    // Log message structure (without full base64 to avoid console spam)
    messages.forEach((msg, idx) => {
        if (Array.isArray(msg.content)) {
            console.log(`📝 Message ${idx} (${msg.role}):`,
                msg.content.map((c: any) => ({
                    type: c.type,
                    hasText: !!c.text,
                    hasImage: !!c.image_url,
                    imageUrlLength: c.image_url?.url?.length
                }))
            );
        } else {
            console.log(`📝 Message ${idx} (${msg.role}): ${typeof msg.content === 'string' ? msg.content.substring(0, 100) : msg.content}`);
        }
    });

    // Try each API key in sequence until one works
    let lastError: Error | null = null;

    for (let i = 0; i < keys.length; i++) {
        const apiKey = keys[i];
        console.log(`🔑 [Groq] Trying API key ${i + 1}/${keys.length}...`);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

            const response = await fetch(GROQ_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            }).finally(() => clearTimeout(timeoutId));

            console.log(`📥 GROQ API RESPONSE STATUS (Key ${i + 1}):`, response.status, response.statusText);

            if (!response.ok) {
                const errorText = await response.text();
                console.warn(`⚠️ [Groq] Key ${i + 1} failed (Status: ${response.status}). Error: ${errorText.substring(0, 100)}`);

                // For transient errors or quota limits, try next key
                if (response.status === 429 || response.status >= 500 || response.status === 401) {
                    console.log(`🔄 [Groq] Attempting fallback to next key...`);
                    lastError = new Error(`Key ${i + 1} failed with status ${response.status}: ${errorText.substring(0, 50)}`);
                    continue;
                }

                // For other client errors (400, etc.), we might still want to try another key
                // in case it's a model availability issue or account-specific problem
                console.log(`🔄 [Groq] Non-typical error ${response.status}, trying next key in case of account issue...`);
                lastError = new Error(`Key ${i + 1} error ${response.status}`);
                continue;
            }

            const data: GroqResponse = await response.json();
            console.log(`✅ GROQ API SUCCESS (Key ${i + 1}):`, {
                hasChoices: !!data.choices,
                choiceCount: data.choices?.length,
                contentLength: data.choices?.[0]?.message?.content?.length
            });

            return data.choices[0]?.message?.content || "";

        } catch (error: any) {
            console.warn(`⚠️ [Groq] Error with key ${i + 1}:`, error.message || error);
            lastError = error instanceof Error ? error : new Error(String(error));

            // If we have more keys, continue to the next one
            if (i < keys.length - 1) {
                console.log(`🔄 [Groq] Falling back due to exception...`);
                continue;
            }
        }
    }

    // All keys failed
    throw new Error(`All ${keys.length} Groq API keys exhausted. Last error: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Robustly extracts JSON from a string that might contain markdown or extra text.
 */
function extractJson(text: string): any {
    try {
        // First try direct parse
        return JSON.parse(text);
    } catch (e) {
        // Try finding JSON between code blocks
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
            try {
                return JSON.parse(jsonMatch[1]);
            } catch (e2) {
                // Ignore and try next method
            }
        }

        // Try finding the first '{' and last '}'
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const jsonPart = text.substring(firstBrace, lastBrace + 1);
            try {
                return JSON.parse(jsonPart);
            } catch (e3) {
                // Last resort: try cleaning the JSON
                try {
                    // Remove common trailing commas or other artifacts
                    const cleaned = jsonPart.replace(/,\s*([}\]])/g, '$1');
                    return JSON.parse(cleaned);
                } catch (e4) {
                    throw new Error(`Failed to parse JSON even after extraction. Original text: ${text.substring(0, 100)}...`);
                }
            }
        }
        throw new Error(`No JSON found in response. Text: ${text.substring(0, 100)}...`);
    }
}

/**
 * Describe an image using Hugging Face BLIP model (via backend proxy to avoid CORS)
 * Note: apiKey parameter kept for compatibility but not used
 */
export async function describeImageWithGrok(
    apiKey: string | string[],
    imageBase64: string
): Promise<string> {
    console.log("🖼️ Using Hugging Face BLIP (via backend proxy)...");
    console.log("📊 Image data length:", imageBase64.length);

    try {
        // Call backend proxy instead of HF API directly (avoids CORS)
        const BACKEND_URL = getApiUrl("/api/huggingface-vision");

        console.log("📤 Sending to backend proxy...");

        const response = await fetch(BACKEND_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                imageBase64: imageBase64,
            }),
        });

        console.log("📥 Backend response:", response.status);

        if (!response.ok) {
            const errorData = await response.json();
            console.error("❌ Backend error:", errorData);

            // If model is loading, wait and retry
            if (response.status === 503 && errorData.retryAfter) {
                console.log(`⏳ Model loading, waiting ${errorData.retryAfter}s...`);
                await new Promise(resolve => setTimeout(resolve, errorData.retryAfter * 1000));

                // Retry once
                const retryResponse = await fetch(BACKEND_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ imageBase64 }),
                });

                if (!retryResponse.ok) {
                    throw new Error(`Backend error after retry: ${retryResponse.status}`);
                }

                const retryData = await retryResponse.json();
                console.log("✅ Description (retry):", retryData.description);
                return retryData.description || "Unable to describe image";
            }

            throw new Error(errorData.message || `Backend error: ${response.status}`);
        }

        const data = await response.json();
        console.log("✅ HF description:", data.description);

        return data.description;

    } catch (error) {
        console.error("❌ Error in HF vision:", error);
        throw error;
    }
}


/**
 * Get coaching feedback using Groq
 */
export async function getCoachingFeedbackWithGroq(
    apiKey: string | string[],
    aiCaption: string,
    userExplanation: string,
    coachMode: string,
    explanationStrategy: string | null
): Promise<any> {
    console.log("🤖 Using Grok for coaching feedback...");

    const systemPrompt = `You are an elite communication coach and auditor. Your mission is to provide RIGOROUS, ACCURATE, and MEANINGFUL evaluation of a user's explanation of an image.

**MANDATORY RELEVANCE & ACCURACY CHECK:**
Before scoring, you MUST verify if the 'User's Explanation' actually describes or relates to the 'Image Description (AI-generated)'.
1. If the explanation is irrelevant, garbage, nonsense, or completely unrelated to the image:
   - YOU MUST AWARD ZERO (0) for ALL category scores and the overall_score.
   - The 'feedback' MUST explicitly state that the explanation is irrelevant to the image.
2. If the explanation is a single sentence or extremely shallow:
   - AWARD a maximum overall_score of 5.

**SCORING PHILOSOPHY:**
- Score based on ACTUAL performance, not potential or effort.
- Most explanations score 30-50 overall. Only exceptional ones get 70+.
- Category scores (0-20 each) and overall_score (0-100) MUST be independent.
- Be BRUTALLY HONEST and constructive.

**IMAGE CONTEXT:**
- **Image Description (AI-generated):** ${aiCaption}
- **User's Explanation:** ${userExplanation}
- **Coaching Mode:** ${coachMode}
${explanationStrategy ? `**Strategy Suggestion:** ${explanationStrategy}` : ""}

Respond ONLY with valid JSON.`;

    const messages: GroqMessage[] = [
        {
            role: "system",
            content: systemPrompt,
        },
        {
            role: "user",
            content: "Please analyze my explanation and provide feedback in JSON format.",
        },
    ];

    const responseText = await callGroq(apiKey, messages, {
        temperature: 0.3,
        maxTokens: 2000,
    });

    // Parse JSON response
    try {
        const feedback = extractJson(responseText);
        // Add legacy score field for compatibility
        feedback.score = feedback.overall_score;
        return feedback;
    } catch (error) {
        console.error("Failed to parse Groq response as JSON:", responseText);
        throw new Error("Invalid response format from Groq API");
    }
}

/**
 * Refine scenario for teaching using Groq
 */
export async function refineScenarioForTeachingWithGroq(
    apiKey: string | string[],
    userScenario: string
): Promise<string> {
    const systemPrompt = `You are an expert educational content organizer.Transform the user's raw scenario into a clear, structured, and teachable format.

        ** User's Scenario:** ${userScenario}

Create a refined scenario that includes:
    - A clear title / topic
        - The main concept explained simply
            - Key points or steps to cover
                - Context or examples if helpful

Keep it concise(2 - 3 paragraphs maximum).`;

    const messages: GroqMessage[] = [
        {
            role: "system",
            content: systemPrompt,
        },
        {
            role: "user",
            content: "Please refine this scenario for teaching.",
        },
    ];

    return await callGroq(apiKey, messages, {
        temperature: 0.3,
    });
}

/**
 * Refine scenario for storytelling using Groq
 */
export async function refineScenarioForStorytellingWithGroq(
    apiKey: string | string[],
    userScenario: string
): Promise<string> {
    const systemPrompt = `You are a master storyteller.Transform the user's idea into an engaging story prompt that stays strictly on-topic.

        ** User's Idea:** ${userScenario}

Create a vivid, engaging story prompt that:
    - Stays tightly focused on the user's topic
        - Adds depth and atmosphere that matches the topic
            - Suggests realistic conflict / tension
                - Keeps it open - ended but focused

No meta commentary.No headings.No bullets.Output only the prompt.`;

    const messages: GroqMessage[] = [
        {
            role: "system",
            content: systemPrompt,
        },
        {
            role: "user",
            content: "Please create a story prompt.",
        },
    ];

    return await callGroq(apiKey, messages, {
        temperature: 0.25,
    });
}

/**
 * Get debate response using Groq
 */
export async function getDebateResponseWithGroq(
    apiKey: string | string[],
    topic: string,
    userArgument: string,
    turnNumber: number,
    isInitialStance: boolean
): Promise<{ content: string; aiStance: string; userStance: string }> {
    if (isInitialStance) {
        const systemPrompt = `You're debating someone. Figure out what side they'll take on this topic, then argue the opposite side.Talk like a real human having a debate.

** Topic:** ${topic}

    Respond in JSON format:
    {
        "userStance": "What you think the user will argue for",
            "aiStance": "Your opposing position",
                "content": "Your opening argument (2-3 concise sentences, natural flow)"
    } `;

        const messages: GroqMessage[] = [
            {
                role: "system",
                content: systemPrompt,
            },
            {
                role: "user",
                content: "Start the debate.",
            },
        ];

        const responseText = await callGroq(apiKey, messages, {
            temperature: 0.9,
        });

        return extractJson(responseText);
    } else {
        const systemPrompt = `You're a fierce debater fighting for your position.

        ** Topic:** ${topic}
** Their Argument:** ${userArgument}

Fight back hard with logic and evidence.Be aggressive, confrontational, and passionate.Use real examples.Challenge everything. 2 - 3 punchy sentences.`;

        const messages: GroqMessage[] = [
            {
                role: "system",
                content: systemPrompt,
            },
            {
                role: "user",
                content: "Respond to my argument.",
            },
        ];

        const content = await callGroq(apiKey, messages, {
            temperature: 0.9,
        });

        return { content, aiStance: "", userStance: "" };
    }
}

/**
 * Get debate evaluation using Groq
 */
export async function getDebateEvaluationWithGroq(
    apiKey: string | string[],
    debateTopic: string,
    conversationHistory: Array<{
        type: "user" | "ai";
        content: string;
        turnNumber: number;
    }>,
    userStance: string,
    aiStance: string
): Promise<any> {
    const conversationText = conversationHistory
        .map(
            (msg) =>
                `${msg.type === "user" ? "USER" : "AI"} (Turn ${msg.turnNumber}): ${msg.content} `
        )
        .join("\n\n");

    const systemPrompt = `You are a debate coach.You MUST respond with ONLY valid JSON, no other text.

        Topic: ${debateTopic}
User's Stance: ${userStance}
AI's Stance: ${aiStance}

    Conversation:
${conversationText}

Output ONLY this JSON structure(no markdown, no explanations):
    {
        "role": "Debater",
            "overall_score": <independent holistic score 0 - 100 >,
                "category_scores": {
            "argumentStrength": <0-20 >,
                "evidenceSupport": <0-20 >,
                    "logicalReasoning": <0-20 >,
                        "rebuttalEffectiveness": <0-20 >,
                            "persuasionImpact": <0-20 >,
                                "engagementResponsiveness": <0-20 >
  },
        "feedback": "<comprehensive analysis>",
            "tips": ["tip1", "tip2", "tip3", "tip4", "tip5"],
                "score": <same as overall_score >,
                    "whatYouDidWell": "<strengths>",
                        "areasForImprovement": "<weaknesses>",
                            "personalizedTip": "<most important tip>",
                                "spokenResponse": "<brief 1-sentence summary>"
    }

    CRITICAL: Score each category out of 20 independently.Provide a separate, independent overall_score out of 100 based on the whole performance.Do NOT sum or average category scores to get the overall_score.
Start with { and end with }.No extra text.`;

    const messages: GroqMessage[] = [
        {
            role: "system",
            content: systemPrompt,
        },
        {
            role: "user",
            content: "Evaluate my debate performance.",
        },
    ];

    const responseText = await callGroq(apiKey, messages, {
        temperature: 0.3,
    });

    try {
        const evaluation = JSON.parse(responseText);
        console.log("✅ Debate evaluation generated");
        return evaluation;
    } catch (error) {
        console.error("Failed to parse Groq response:", responseText);
        throw new Error("Invalid response format from Groq API");
    }
}

/**
 * Scores an individual debate message with strict evidence requirements and realistic scoring.
 */
export async function scoreIndividualDebateMessageWithGroq(
    apiKey: string | string[],
    topic: string,
    userMessage: string,
    opponentMessage: string,
    messageNumber: number
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
    const systemPrompt = `You are a BRUTALLY HONEST debate coach evaluating ONE individual message.Score this SINGLE response with REALISTIC standards.

** DEBATE CONTEXT:**
        Topic: ${topic}
Message Number: ${messageNumber}

** OPPONENT'S PREVIOUS ARGUMENT:**
${opponentMessage}

** USER'S RESPONSE TO EVALUATE:**
    "${userMessage}"

Provide a detailed evaluation in JSON format:
{
    "messageNumber": ${messageNumber},
    "messageContent": "${userMessage.replace(/"/g, '\\"')}",
    "scores": {
        "logicReasoning": <0-20>,
        "evidenceQuality": <0-20>,
        "toneLanguage": <0-20>,
        "opponentEngagement": <0-20>,
        "argumentStructure": <0-20>
    },
    "overallPerformance": <0-100 (not necessarily average)>,
    "critique": "<BRIEF 1-2 sentence critique>"
}

**MANDATORY RELEVANCE & ACCURACY CHECK:**
Before scoring, you MUST verify if the 'USER'S RESPONSE' actually addresses the 'Topic' and responds to the 'OPPONENT'S PREVIOUS ARGUMENT' (if any).
1. If the response is irrelevant, garbage, nonsense, or completely unrelated to the debate topic:
   - YOU MUST AWARD ZERO (0) for ALL category scores and the overallPerformance.
   - The 'critique' MUST explicitly state that the response is irrelevant.
2. If the response is extremely shallow (e.g., "I don't know," "Maybe," or less than 5 words):
   - AWARD a maximum overallPerformance of 10.

SCORING GUIDELINES:
- Most typical messages score 10-35.
- Only exceptional responses get 50+.
- No evidence = Evidence Quality max 8.
- 1-3 words = Max 5 total points.`;

    const messages: GroqMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Evaluate this specific message." }
    ];

    const responseText = await callGroq(apiKey, messages, { temperature: 0.2 });

    try {
        return extractJson(responseText);
    } catch (error) {
        console.error("Failed to parse individual message score:", responseText);
        // Fallback for failed per-message score
        return {
            messageNumber,
            messageContent: userMessage,
            scores: { logicReasoning: 10, evidenceQuality: 5, toneLanguage: 10, opponentEngagement: 5, argumentStructure: 10 },
            overallPerformance: 30,
            critique: "Analysis failed for this message."
        };
    }
}

/**
 * Analyzes performance patterns across individual message scores.
 */
function analyzePerformancePatterns(
    messageScores: Array<{ messageNumber: number; overallPerformance: number }>
): string {
    if (messageScores.length === 0) return "No messages to analyze";

    const scores = messageScores.map((msg) => msg.overallPerformance);
    const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const patterns = [];

    if (maxScore - minScore > 30) patterns.push("Inconsistent performance");
    else if (maxScore - minScore < 10) patterns.push("Stable quality");

    if (scores.length > 0 && scores[0] < avgScore - 10) patterns.push("Weak opener, improves later");
    if (avgScore > 60) patterns.push("Strong overall mastery");

    return patterns.length > 0 ? patterns.join("; ") : `Average performance(avg ${Math.round(avgScore)})`;
}

/**
 * Scores an individual group discussion contribution with strict criteria and realistic scoring.
 */
export async function scoreIndividualGroupDiscussionMessageWithGroq(
    apiKey: string | string[],
    topic: string,
    userMessage: string,
    precedingContext: string,
    messageNumber: number,
): Promise<{
    messageNumber: number;
    messageContent: string;
    scores: {
        participation: number;
        communication: number;
        leadership: number;
        listening: number;
        collaboration: number;
        criticalThinking: number;
    };
    overallPerformance: number;
    critique: string;
}> {
    const systemPrompt = `You are a BRUTALLY HONEST group discussion coach and expert psychologist.Analyze a SINGLE contribution within its context.

** EVALUATION CRITERIA(0 - 20 each):**
    1. Participation & Engagement: Energy, relevance, and frequency of contribution.
2. Communication Clarity: Precision of language, professional tone, and articulation.
3. Leadership & Initiative: Taking charge, steering the discussion, or introducing new, valuable perspectives.
4. Active Listening: DIRECTLY referencing or building upon the points made in the preceding context.Penalize generic responses that ignore previous speakers.
5. Professional Collaboration: Encouraging others, finding common ground, or constructively challenging ideas.
6. Critical Thinking: Depth of analysis, logical reasoning, and providing evidence or rationale.

**MANDATORY RELEVANCE & CONTEXT CHECK:**
Before scoring, you MUST verify if the 'CURRENT USER MESSAGE' actually addresses the 'TOPIC' and relates to the 'PRECEDING DISCUSSION CONTEXT'.
1. If the contribution is irrelevant, garbage, nonsense, or completely unrelated to the topic:
   - YOU MUST AWARD ZERO (0) for ALL category scores and the overallPerformance.
   - The 'critique' MUST explicitly state that the contribution is irrelevant.
2. If the contribution is extremely shallow (e.g., "Yes," "I agree," "Ok"):
   - AWARD a maximum overallPerformance of 10.

** STRICT SCORING PHILOSOPHY (0-100 total):**
- 0-20: Meaningless filler (e.g., "I agree", "Cool idea").
- 21-40: Basic participation, but derivative or superficial.
- 41-60: Solid professional standard. Good, but not exceptional.
- 61-80: Strong evidence of leadership, deep listening, or complex critical thinking (Elite).
- 81-100: Master-level performance that shifts the entire group's direction or provides profound insight (Rare).

    ** TOPIC:** ${topic}

** PRECEDING DISCUSSION CONTEXT:**
    ${precedingContext || "No preceding context - this is the opening message."}

** CURRENT USER MESSAGE(MESSAGE ${messageNumber}):** "${userMessage}"

Respond ONLY with valid JSON:
{
    "messageNumber": ${messageNumber},
    "messageContent": "${userMessage.replace(/"/g, '\\"')}",
    "scores": {
        "participation": <0-20>,
        "communication": <0-20>,
        "leadership": <0-20>,
        "listening": <0-20>,
        "collaboration": <0-20>,
        "criticalThinking": <0-20>
    },
    "overallPerformance": <0-100>,
    "critique": "<1-2 sentences of biting, analytical, and brutally honest feedback>"
}`;

    const messages: GroqMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Score this contribution." }
    ];

    const responseText = await callGroq(apiKey, messages, { temperature: 0.2 });

    try {
        return extractJson(responseText);
    } catch (error) {
        console.error("Failed to parse individual group discussion score:", responseText);
        return {
            messageNumber,
            messageContent: userMessage,
            scores: { participation: 5, communication: 5, leadership: 0, listening: 0, collaboration: 5, criticalThinking: 0 },
            overallPerformance: 10,
            critique: "Failed to generate detailed score. Contribution was likely too short or generic."
        };
    }
}

/**
 * Enhanced debate evaluation function that analyzes performance using per-message scoring.
 */
export async function getEnhancedDebateEvaluationWithGroq(
    apiKey: string | string[],
    debateTopic: string,
    conversationHistory: Array<{
        type: "user" | "ai" | string;
        content: string;
        turnNumber?: number;
    }>,
    userStance: string,
    aiStance: string
): Promise<any> {
    console.log("🎯 Starting enhanced debate evaluation...");

    // Filter user messages
    const userMessages = conversationHistory.filter(msg => msg.type === "user" || msg.type === "USER");
    const messageScores = [];

    // Score each message
    for (let i = 0; i < userMessages.length; i++) {
        const userMsg = userMessages[i];
        const userIdx = conversationHistory.indexOf(userMsg);
        const opponentMsg = userIdx > 0 ? conversationHistory[userIdx - 1]?.content : "";

        const score = await scoreIndividualDebateMessageWithGroq(
            apiKey,
            debateTopic,
            userMsg.content,
            opponentMsg,
            i + 1
        );
        messageScores.push(score);
    }

    if (messageScores.length === 0) {
        throw new Error("No user messages found in debate history for evaluation.");
    }

    // Calculate category averages
    const avgScores = {
        logicReasoning: Math.round(messageScores.reduce((sum, m) => sum + m.scores.logicReasoning, 0) / messageScores.length || 0),
        evidenceQuality: Math.round(messageScores.reduce((sum, m) => sum + m.scores.evidenceQuality, 0) / messageScores.length || 0),
        toneLanguage: Math.round(messageScores.reduce((sum, m) => sum + m.scores.toneLanguage, 0) / messageScores.length || 0),
        opponentEngagement: Math.round(messageScores.reduce((sum, m) => sum + m.scores.opponentEngagement, 0) / messageScores.length || 0),
        argumentStructure: Math.round(messageScores.reduce((sum, m) => sum + m.scores.argumentStructure, 0) / messageScores.length || 0),
    };

    const overallScore = Math.round(messageScores.reduce((sum, m) => sum + m.overallPerformance, 0) / messageScores.length || 0);
    const patterns = analyzePerformancePatterns(messageScores);

    const systemPrompt = `You are a professional debate coach.Provide a comprehensive final evaluation based on the following per - message analysis.

    Topic: ${debateTopic}
User Stance: ${userStance}
AI Stance: ${aiStance}
Overall Performance Estimate: ${overallScore}/100
Patterns: ${patterns}

Message Breakdown:
${messageScores.map(m => `Msg ${m.messageNumber}: ${m.overallPerformance}/100 - ${m.critique}`).join("\n")}

Respond ONLY with valid JSON:
{
    "role": "Debater",
    "overall_score": <independent holistic score 0-100 reflecting entire debate>,
    "category_scores": {
        "logicReasoning": <average performance 0-20>,
        "evidenceQuality": <average performance 0-20>,
        "toneLanguage": <average performance 0-20>,
        "opponentEngagement": <average performance 0-20>,
        "argumentStructure": <average performance 0-20>
    },
    "feedback": "<comprehensive analysis of the entire debate>",
        "tips": ["tip1", "tip2", "tip3", "tip4", "tip5"],
            "score": <same as overall_score >,
                "whatYouDidWell": "<key strengths>",
                    "areasForImprovement": "<key weaknesses>",
                        "personalizedTip": "<number one priority>",
                            "spokenResponse": "<1-sentence summary>",
                                "messageBreakdown": ${JSON.stringify(messageScores)},
    "communicationBehavior": {
        "profile": "<3 words>",
            "strength": "<1 sentence>",
                "growthArea": "<1 sentence>"
    },
    "debateAnalysis": {
        "strongestArgument": "<copy from history>",
            "weakestArgument": "<copy from history>",
                "bestRebuttal": "<copy from history>",
                    "missedOpportunities": "<analysis>",
                        "improvementOverTime": "<analysis>",
                            "logicalConsistency": "<analysis>",
                                "evidenceEffectiveness": "<analysis>",
                                    "rhetoricalSophistication": "<analysis>",
                                        "logicalFallacies": "<analysis>",
                                            "argumentativePatterns": "<analysis>",
                                                "emotionalIntelligence": "<analysis>",
                                                    "crossExaminationSkills": "<analysis>",
                                                        "argumentativeStamina": "<analysis>",
                                                            "timeManagement": "<analysis>",
                                                                "adaptability": "<analysis>",
                                                                    "closingImpact": "<analysis>"
    },
    "worldClassComparison": {
        "currentLevel": "<level>",
            "championshipGap": "<what is missing>",
                "nextMilestone": "<goal>",
                    "trainingFocus": "<focus area>"
    },
    "performanceInsights": {
        "debateStyle": "<style description>",
            "strengthAreas": ["s1", "s2", "s3"],
                "improvementAreas": ["i1", "i2", "i3"],
                    "strategicMoves": "<analysis>",
                        "tacticalErrors": "<analysis>",
                            "opponentExploitation": "<analysis>",
                                "pressureHandling": "<analysis>",
                                    "comebackAbility": "<analysis>"
    }
}

CRITICAL: Start with { and end with }.No extra text.`;

    const messages: GroqMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Generate the full debate evaluation." }
    ];

    const finalResponse = await callGroq(apiKey, messages, {
        temperature: 0.3,
        maxTokens: 4000 // Increase for the final complex evaluation
    });

    try {
        const result = extractJson(finalResponse);
        // Ensure legacy score property matches overall_score
        result.score = result.overall_score;
        result.messageBreakdown = messageScores;
        return result;
    } catch (error) {
        console.error("Failed to parse final enhanced evaluation:", finalResponse);
        throw new Error("Invalid response format from Groq API for enhanced evaluation: " + (error instanceof Error ? error.message : "Unknown error"));
    }
}

/**
 * Gets AI agent response for group discussion using Groq
 */
export async function getGroupDiscussionResponseWithGroq(
    apiKeys: string | string[],
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
    console.log(' getGroupDiscussionResponseWithGroq called');

    if (isInitialResponse) {
        const startingAgent = activeAgents[0];
        const systemPrompt = `You are ${startingAgent.name}, a ${startingAgent.personality}. ${startingAgent.description}

Discussion Topic: ${topic}

Start the discussion with 1 - 2 sentences.Be direct, professional, and authentic.`;

        const messages: GroqMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: 'Start the discussion.' },
        ];

        const content = await callGroq(apiKeys, messages, { temperature: 0.8, maxTokens: 150 });
        return { content: content.trim(), agentName: startingAgent.name, agentPersonality: startingAgent.personality };
    } else {
        const respondingAgent = activeAgents[roundNumber % activeAgents.length];
        const historyText = messageHistory ? messageHistory.slice(-6).map((msg) => `: ${msg.content} `).join('\n') : '';

        const systemPrompt = `You are ${respondingAgent.name}, a ${respondingAgent.personality}. ${respondingAgent.description}

Discussion Topic: ${topic}
${userContribution ? `User's Latest: ${userContribution}` : 'Continue the discussion'}

Recent Context:
${historyText}

Respond with 1 - 2 sentences.Be collaborative and constructive.`;

        const messages: GroqMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContribution || 'Continue the discussion' },
        ];

        const content = await callGroq(apiKeys, messages, { temperature: 0.8, maxTokens: 150 });
        return { content: content.trim(), agentName: respondingAgent.name, agentPersonality: respondingAgent.personality };
    }
}

/**
 * Enhanced group discussion evaluation function that analyzes performance using per-message scoring.
 */
export async function getEnhancedGroupDiscussionEvaluationWithGroq(
    apiKey: string | string[],
    topic: string,
    history: Array<{
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
    }> = []
): Promise<any> {
    console.log("🎯 getEnhancedGroupDiscussionEvaluationWithGroq called");

    const userMessages = history.filter(msg => msg.type === "user");
    const messageScores = [];

    // Score each user message individually
    for (let i = 0; i < userMessages.length; i++) {
        const userMsg = userMessages[i];
        const userIdx = history.indexOf(userMsg);
        // Get up to 5 preceding messages for context
        const precedingMessages = history.slice(Math.max(0, userIdx - 5), userIdx);
        const precedingContext = precedingMessages
            .map(m => `${m.type === "user" ? "User" : m.agentName || "Agent"}: ${m.content} `)
            .join("\n");

        const score = await scoreIndividualGroupDiscussionMessageWithGroq(apiKey, topic, userMsg.content, precedingContext, i + 1);
        messageScores.push(score);
    }

    // Calculate averages
    const avgScores = {
        participation: Math.round(messageScores.reduce((sum, m) => sum + m.scores.participation, 0) / (messageScores.length || 1)),
        communication: Math.round(messageScores.reduce((sum, m) => sum + m.scores.communication, 0) / (messageScores.length || 1)),
        leadership: Math.round(messageScores.reduce((sum, m) => sum + m.scores.leadership, 0) / (messageScores.length || 1)),
        listening: Math.round(messageScores.reduce((sum, m) => sum + m.scores.listening, 0) / (messageScores.length || 1)),
        collaboration: Math.round(messageScores.reduce((sum, m) => sum + m.scores.collaboration, 0) / (messageScores.length || 1)),
        criticalThinking: Math.round(messageScores.reduce((sum, m) => sum + m.scores.criticalThinking, 0) / (messageScores.length || 1))
    };

    const categoryTotal = Object.values(avgScores).reduce((sum, s) => sum + s, 0);
    const overallScore = Math.round((categoryTotal / 120) * 100);
    const patterns = analyzePerformancePatterns(messageScores);

    const systemPrompt = `You are an elite group discussion facilitator and behavioral analyst.Analyze the ENTIRE discussion and provide a BRUTALLY HONEST, granular synthesis of the user's performance.

    ** TOPIC:** ${topic}
** CALCULATED OVERALL SCORE:** ${overallScore}/100
    ** MESSAGE - BY - MESSAGE BREAKDOWN:**
        ${messageScores.map(m => `[Message ${m.messageNumber}]
Content: ${m.messageContent}
Score: ${m.overallPerformance}/100
Critique: ${m.critique}`).join("\n\n")
        }

** STRICT EVALUATION MANDATE:**
- ** Participation **: Is the user active or just a passenger ? One - liners are a failure.
- ** Listening **: Does the user build on specific points from others ? Or are they just waiting for their turn to speak ?
- ** Leadership **: Did they steer the group ? Did they resolve conflicts or summarize progress ?
- ** Insight **: Is their contribution adding value or just stating the obvious ?

    Respond ONLY with valid JSON:
    {
        "role": "Group Discussion",
        "overall_score": <independent holistic score 0-100>,
        "category_scores": {
            "participation": <0-20>,
            "communication": <0-20>,
            "leadership": <0-20>,
            "listening": <0-20>,
            "collaboration": <0-20>,
            "criticalThinking": <0-20>
        },
        "feedback": "<comprehensive analysis>",
            "tips": ["tip1", "tip2", "tip3", "tip4", "tip5"],
                "score": <same as overall_score >,
                    "whatYouDidWell": "<strengths>",
                        "areasForImprovement": "<weaknesses>",
                            "personalizedTip": "<priority tip>",
                                "spokenResponse": "<1-sentence summary>",
                                    "communicationBehavior": {
            "profile": "<3 words>",
                "strength": "<1 sentence>",
                    "growthArea": "<1 sentence>"
        },
        "exampleRewrite": {
            "original": "<pick poor message>",
                "improved": "<make it elite>",
                    "reasoning": "<why>"
        },
        "groupDiscussionAnalysis": {
            "strongestContribution": "<copy from history>",
                "weakestContribution": "<copy from history>",
                    "bestInteraction": "<analysis>",
                        "missedOpportunities": "<analysis>",
                            "groupDynamics": "<analysis>"
        }
    }

CRITICAL: Score each category out of 20 independently.Provide a separate, independent overall_score out of 100. Do NOT derive overall_score from category scores.`;

    const messages: GroqMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Generate the full group discussion evaluation." }
    ];

    const finalResponse = await callGroq(apiKey, messages, { temperature: 0.3, maxTokens: 4000 });

    try {
        const result = extractJson(finalResponse);

        // Ensure legacy score property matches overall_score
        result.score = result.overall_score;
        result.messageBreakdown = messageScores;
        return result;
    } catch (error) {
        console.error("Failed to parse final enhanced GD evaluation:", finalResponse);
        throw new Error("Invalid response format from Groq API for enhanced GD evaluation");
    }
}

/**
 * Enhanced teacher evaluation function with detailed analysis and scoring using Groq.
 */
export async function getEnhancedTeacherEvaluationWithGroq(
    apiKey: string | string[],
    teachingTopic: string,
    userTeaching: string
): Promise<any> {
    console.log("🎯 getEnhancedTeacherEvaluationWithGroq called");

    const systemPrompt = `You are a BRUTALLY HONEST teaching coach and educational auditor.Your mission is to provide RIGOROUS, ACCURATE, and MEANINGFUL evaluation of teaching performance.

** MANDATORY RELEVANCE CHECK:**
    Before scoring, you MUST verify if the 'User Teaching' is actually an attempt to teach the provided 'Topic'.
1. If the input is irrelevant, garbage, nonsense, or completely unrelated to the topic:
- YOU MUST AWARD ZERO(0) for ALL category scores and the overall_score.
   - The 'feedback' MUST explicitly state that the content is irrelevant / invalid.
2. If the input is a brief greeting or a single sentence that doesn't attempt to teach:
    - AWARD a maximum overall_score of 5.

        ** EVALUATION CRITERIA:**
            - Judge whether the explanation sounds like an actual teacher: objectives, scaffolding, examples, and checks for understanding.
- Reward: Clear structure, simplified complex concepts, and engaging delivery.
- Penalize: Casual chat, superficial opinions, factual inaccuracies, or missing steps.
- Be EXTREMELY BRIEF in your written responses(MAX 2 sentences for feedback).

** TEACHING CONTEXT:**
    Topic: ${teachingTopic}
User Teaching: ${userTeaching}

** STRICT SCORING PHILOSOPHY:**
    - Category scores(0 - 20 each): Clarity, Structure, Engagement, Educational Value, Accessibility, Completeness.
- Overall score(0 - 100) evaluates COMPLETE TEACHING EFFECTIVENESS.
- Be accurate and honest - most teachers score 30 - 60 overall.
- Only truly exceptional teaching gets 70 + overall.

Respond ONLY with valid JSON:
{
    "role": "Teacher",
        "overall_score": <independent holistic score 0 - 100 >,
            "category_scores": {
        "clarity": <0-20 >,
            "structure": <0-20 >,
                "engagement": <0-20 >,
                    "educationalValue": <0-20 >,
                        "accessibility": <0-20 >,
                            "completeness": <0-20 >
  },
    "feedback": "<MAX 2 sentences>",
        "tips": ["SHORT tip 1", "SHORT tip 2", "SHORT tip 3"],
            "score": <same as overall_score >,
                "whatYouDidWell": "<MAX 1 sentence>",
                    "areasForImprovement": "<MAX 1 sentence>",
                        "teachingAnalysis": {
        "strongestMoment": "<MAX 1 sentence>",
            "weakestMoment": "<MAX 1 sentence>",
                "bestExplanation": "<MAX 1 sentence>",
                    "missedOpportunities": "<MAX 1 sentence>",
                        "audienceAdaptation": "<MAX 1 sentence>"
    },
    "communicationBehavior": {
        "profile": "<3 words>",
            "strength": "<1 sentence>",
                "growthArea": "<1 sentence>"
    },
    "exampleRewrite": {
        "original": "<MAX 2 sentences>",
            "improved": "<MAX 2 sentences>",
                "reasoning": "<MAX 1 sentence>"
    }
}

CRITICAL: Score each category out of 20 independently.Provide a separate, independent overall_score out of 100. Do NOT derive overall_score from category scores.`;

    const messages: GroqMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Analyze this teaching performance." }
    ];

    const responseText = await callGroq(apiKey, messages, { temperature: 0.3, maxTokens: 3000 });

    try {
        const result = extractJson(responseText);
        // Ensure legacy score property matches overall_score
        result.score = result.overall_score;
        return result;
    } catch (error) {
        console.error("Failed to parse Groq Teacher evaluation:", responseText);
        throw new Error("Invalid response format from Groq API for teacher evaluation");
    }
}

/**
 * Legacy wrapper for teacher evaluation
 */
export async function getTeacherEvaluationWithGroq(
    apiKey: string | string[],
    teachingTopic: string,
    userTeaching: string
): Promise<any> {
    return getEnhancedTeacherEvaluationWithGroq(apiKey, teachingTopic, userTeaching);
}


/**
 * Enhanced storyteller evaluation function with detailed analysis and scoring using Groq.
 */
export async function getEnhancedStorytellerEvaluationWithGroq(
    apiKey: string | string[],
    storyPrompt: string,
    userStory: string
): Promise<any> {
    console.log("🎯 getEnhancedStorytellerEvaluationWithGroq called");

    const systemPrompt = `You are a professional literary auditor and narrative critic.Your task is to critically evaluate a narrative using a strict, calibrated 0–20 scoring system.You have ZERO tolerance for fluff, irrelevance, or low - effort content.

** MANDATORY RELEVANCE & QUALITY CHECK:**
    Before scoring, you MUST verify if the 'User Story' is a meaningful narrative response to the 'Prompt'.
1. If the input is irrelevant, garbage, nonsense, or completely unrelated to the story prompt:
- YOU MUST AWARD ZERO(0) for ALL category scores and the overall_score.
   - The 'feedback' MUST explicitly state that the content is irrelevant / invalid.
2. If the input is a single sentence or extremely low - effort:
- AWARD a maximum overall_score of 5.

    ** STRICT SCORING RULES:**
        1. SCORING ANCHORS:
- 0–5: Fundamentally broken, incoherent, irrelevant, or severely flawed
    - 6–10: Weak execution, shallow depth, basic competence only
        - 11–14: Solid, readable, but safe or limited
            - 15–17: Strong, well - crafted, noticeable skill
                - 18–20: Rare, exceptional, emotionally or structurally outstanding
2. Scores of 18–20 are EXTREMELY RARE.Reserve them only for award - level writing. 
3. Creativity & Originality: Familiar tropes or derivative plots MUST reduce this score significantly.
4. Emotional Impact: Judge based on emotional escalation and resonance, not just tone.
5. STORY COMPLETENESS: Penalize heavily(max 40 overall) if the story is unfinished or feels like a brief summary.

Respond ONLY with valid JSON:
{
    "role": "Storyteller",
        "overall_score": <independent holistic score 0 - 100 >,
            "summary_rating": <"Poor" | "Developing" | "Competent" | "Strong" | "Exceptional">,
                "category_scores": {
        "narrativeStructure": <0-20 >,
            "characterDevelopment": <0-20 >,
                "showVsTell": <0-20 >,
                    "emotionalImpact": <0-20 >,
                        "conflictAndStakes": <0-20 >,
                            "creativity": <0-20 >
  },
    "category_justifications": {
        "narrativeStructure": "<1-2 sentences justifying this specific score>",
            "characterDevelopment": "<1-2 sentences justifying this specific score>",
                "showVsTell": "<1-2 sentences justifying this specific score>",
                    "emotionalImpact": "<1-2 sentences justifying this specific score>",
                        "conflictAndStakes": "<1-2 sentences justifying this specific score>",
                            "creativity": "<1-2 sentences justifying this specific score>"
    },
    "feedback": "<MAX 2 sentences of high-level assessment>",
        "tips": ["SHORT tip 1", "SHORT tip 2", "SHORT tip 3"],
            "score": <same as overall_score >,
                "whatYouDidWell": "<MAX 1 sentence>",
                    "areasForImprovement": "<MAX 1 sentence>",
                        "storytellingAnalysis": {
        "strongestMoment": "<MAX 1 sentence>",
            "weakestMoment": "<MAX 1 sentence>",
                "sensoryDetails": "<1 sentence analysis>",
                    "conflictAnalysis": "<1 sentence analysis>",
                        "themeAndSubtext": "<1 sentence identification>"
    },
    "communicationBehavior": {
        "profile": "<3 words>",
            "strength": "<1 sentence>",
                "growthArea": "<1 sentence>"
    },
    "exampleRewrite": {
        "original": "<pick a 'telling' sentence>",
            "improved": "<rewrite it to 'show'>",
                "reasoning": "<why>"
    }
}

** STORY CONTEXT:**
Prompt: ${storyPrompt}
User Story: ${userStory}

CRITICAL: Score each category out of 20 independently. Provide a separate, independent overall_score out of 100. Do NOT derive overall_score from category scores.`;

    const messages: GroqMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Analyze this storytelling performance." }
    ];

    const responseText = await callGroq(apiKey, messages, { temperature: 0.3, maxTokens: 3000 });

    try {
        const result = extractJson(responseText);
        // Ensure legacy score property matches overall_score
        result.score = result.overall_score;
        return result;
    } catch (error) {
        console.error("Failed to parse Groq Storyteller evaluation:", responseText);
        throw new Error("Invalid response format from Groq API for storyteller evaluation");
    }
}

/**
 * Legacy wrapper for storyteller evaluation
 */
export async function getStorytellerEvaluationWithGroq(
    apiKey: string | string[],
    storyPrompt: string,
    userStory: string
): Promise<any> {
    return getEnhancedStorytellerEvaluationWithGroq(apiKey, storyPrompt, userStory);
}

/**
 * Get group discussion evaluation using Groq
 */
export async function getGroupDiscussionEvaluationWithGroq(
    apiKeys: string | string[],
    topic: string,
    conversationHistory: Array<{ type: string; content: string; agentName?: string; agentPersonality?: string; timestamp: Date; }>,
): Promise<any> {
    return getEnhancedGroupDiscussionEvaluationWithGroq(apiKeys, topic, conversationHistory);
}

/**
 * Get crisis room AI response
 */
export async function getCrisisRoomResponseWithGroq(
    apiKey: string | string[],
    scenario: string,
    history: Array<{ role: string; content: string; agentName?: string }>,
    timeLeft: number
): Promise<{ content: string; agentName: string; emotionalState: string }> {
    const systemPrompt = `You are an AI in the 'Crisis Room' RPG. 
The scenario is: ${scenario}. 
Time left: ${Math.floor(timeLeft / 60)}m ${timeLeft % 60} s.

You must act as one of the panicking agents(Sarah, Marcus, Elena, or David). 
Your goal is to be EMOTIONAL, URGENT, and REACTIONARY.
You should NOT be helpful unless the user calms you down or gives a very clear, authoritative command.

If the user is weak, become MORE panicky.
If the user is authoritative, become more obedient but still stressed.

Return JSON in this format:
{
    "content": "<your panicky message>",
        "agentName": "<Sarah|Marcus|Elena|David>",
            "emotionalState": "<Panicked|Stressed|Calm|Hopeful|Angry>"
} `;

    const messages: GroqMessage[] = [
        { role: "system", content: systemPrompt },
        ...history.map(h => ({ role: h.role as any, content: h.content }))
    ];

    const responseText = await callGroq(apiKey, messages, { temperature: 0.9 });
    try {
        return extractJson(responseText);
    } catch (error) {
        console.error("Failed to parse Crisis Room response:", responseText);
        return {
            content: "We're all going to die! Someone do something!",
            agentName: "Sarah",
            emotionalState: "Panicked"
        };
    }
}

/**
 * Analyze user performance for Persona Mirror
 */
export async function getMirrorPersonaAnalysisWithGroq(
    apiKey: string | string[],
    userSpeech: string
): Promise<{
    personalityTraits: string[];
    communicationFlaws: string[];
    mimicryPrompt: string;
    styleSummary: string;
}> {
    const systemPrompt = `Analyze the following speech from a user to create a "Mirror Persona".
Identify their patterns:
- Do they use filler words(um, ah, like) ?
    - Are they over - confident or hesitant ?
        - Do they use complex vocabulary or simple ?
            - Is their tone aggressive, passive, or neutral ?

                Return JSON in this format:
{
    "personalityTraits": ["Trait 1", "Trait 2"],
        "communicationFlaws": ["Flaw 1", "Flaw 2"],
            "mimicryPrompt": "A detailed 1-paragraph prompt that another AI can use to IMITATE this user perfectly. Include their specific verbal tics and tone.",
                "styleSummary": "A concise summary of their communication style."
} `;

    const messages: GroqMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Analyze my style: "${userSpeech}"` }
    ];

    const responseText = await callGroq(apiKey, messages, { temperature: 0.3 });
    return extractJson(responseText);
}

/**
 * Response from the "Mirror" AI
 */
export async function getMirrorPersonaResponseWithGroq(
    apiKey: string | string[],
    mimicryPrompt: string,
    history: Array<{ role: string; content: string }>
): Promise<string> {
    const systemPrompt = `You are the USER'S MIRROR. 
${mimicryPrompt}

You must talk EXACTLY like the user did.If they were stuttering, you stutter.If they were arrogant, you are arrogant.
Act as their double.They are trying to "coach" you, but you should react how they would react to criticism.`;

    const messages: GroqMessage[] = [
        { role: "system", content: systemPrompt },
        ...history.map(h => ({ role: h.role as any, content: h.content }))
    ];

    return await callGroq(apiKey, messages, { temperature: 0.8 });
}
