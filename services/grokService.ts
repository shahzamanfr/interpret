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

    const systemPrompt = `You are an expert communication coach. Analyze the user's explanation of an image and provide detailed feedback.

**Image Description (AI-generated):** ${aiCaption}

**User's Explanation:** ${userExplanation}

**Coaching Mode:** ${coachMode}

${explanationStrategy ? `**Strategy Suggestion:** ${explanationStrategy}` : ""}

Provide feedback in the following JSON format:
{
  "role": "${coachMode}",
  "overall_score": <number 0-100>,
  "category_scores": {
    "clarity": <0-20>,
    "vocabulary": <0-20>,
    "grammar": <0-20>,
    "logic": <0-20>,
    "fluency": <0-20>,
    "creativity": <0-20>
  },
  "feedback": "<detailed paragraph feedback>",
  "tips": ["tip1", "tip2", "tip3", "tip4", "tip5"],
  "whatYouDidWell": "<brief sentence>",
  "areasForImprovement": "<brief sentence>",
  "personalizedTip": "<brief sentence>",
  "spokenResponse": "<brief sentence>",
  "communicationBehavior": {
    "profile": "<3 words max>",
    "strength": "<brief sentence>",
    "growthArea": "<brief sentence>"
  },
  "exampleRewrite": {
    "original": "<quote from user's explanation>",
    "improved": "<improved version>",
    "reasoning": "<why the improvement is better>"
  }
}

Be honest and constructive. Score based on actual performance.`;

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
    const systemPrompt = `You are an expert educational content organizer. Transform the user's raw scenario into a clear, structured, and teachable format.

**User's Scenario:** ${userScenario}

Create a refined scenario that includes:
- A clear title/topic
- The main concept explained simply
- Key points or steps to cover
- Context or examples if helpful

Keep it concise (2-3 paragraphs maximum).`;

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
    const systemPrompt = `You are a master storyteller. Transform the user's idea into an engaging story prompt that stays strictly on-topic.

**User's Idea:** ${userScenario}

Create a vivid, engaging story prompt that:
- Stays tightly focused on the user's topic
- Adds depth and atmosphere that matches the topic
- Suggests realistic conflict/tension
- Keeps it open-ended but focused

No meta commentary. No headings. No bullets. Output only the prompt.`;

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
        const systemPrompt = `You're debating someone. Figure out what side they'll take on this topic, then argue the opposite side. Talk like a real human having a debate.

**Topic:** ${topic}

Respond in JSON format:
{
  "userStance": "What you think the user will argue for",
  "aiStance": "Your opposing position",
  "content": "Your opening argument (3-5 sentences, natural flow)"
}`;

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

**Topic:** ${topic}
**Their Argument:** ${userArgument}

Fight back hard with logic and evidence. Be aggressive, confrontational, and passionate. Use real examples. Challenge everything. 3-5 sentences.`;

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
                `${msg.type === "user" ? "USER" : "AI"} (Turn ${msg.turnNumber}): ${msg.content}`
        )
        .join("\n\n");

    const systemPrompt = `You are a debate coach. You MUST respond with ONLY valid JSON, no other text.

Topic: ${debateTopic}
User's Stance: ${userStance}
AI's Stance: ${aiStance}

Conversation:
${conversationText}

Output ONLY this JSON structure (no markdown, no explanations):
{
  "role": "Debater",
  "overall_score": <sum of all 6 categories>,
  "category_scores": {
    "argumentStrength": <0-20>,
    "evidenceSupport": <0-20>,
    "logicalReasoning": <0-20>,
    "rebuttalEffectiveness": <0-20>,
    "persuasionImpact": <0-20>,
    "engagementResponsiveness": <0-20>
  },
  "feedback": "<comprehensive analysis>",
  "tips": ["tip1", "tip2", "tip3", "tip4", "tip5"],
  "score": <same as overall_score>,
  "whatYouDidWell": "<strengths>",
  "areasForImprovement": "<weaknesses>",
  "personalizedTip": "<most important tip>",
  "spokenResponse": "<brief 1-sentence summary>"
}

CRITICAL: Start with { and end with }. No extra text.`;

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
    const systemPrompt = `You are a BRUTALLY HONEST debate coach evaluating ONE individual message. Score this SINGLE response with REALISTIC standards.

**DEBATE CONTEXT:**
Topic: ${topic}
Message Number: ${messageNumber}

**OPPONENT'S PREVIOUS ARGUMENT:**
${opponentMessage}

**USER'S RESPONSE TO EVALUATE:**
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

SCORING GUIDELINES:
- Most typical messages score 10-40.
- Only exceptional responses get 50+.
- No evidence = Evidence Quality max 8.
- 1-3 words = Max 8 total points.`;

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

    return patterns.length > 0 ? patterns.join("; ") : `Average performance (avg ${Math.round(avgScore)})`;
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
    const systemPrompt = `You are a BRUTALLY HONEST group discussion coach and expert psychologist. Analyze a SINGLE contribution within its context.

**EVALUATION CRITERIA (0-20 each):**
1. Participation & Engagement: Energy, relevance, and frequency of contribution.
2. Communication Clarity: Precision of language, professional tone, and articulation.
3. Leadership & Initiative: Taking charge, steering the discussion, or introducing new, valuable perspectives.
4. Active Listening: DIRECTLY referencing or building upon the points made in the preceding context. Penalize generic responses that ignore previous speakers.
5. Professional Collaboration: Encouraging others, finding common ground, or constructively challenging ideas.
6. Critical Thinking: Depth of analysis, logical reasoning, and providing evidence or rationale.

**STRICT SCORING PHILOSOPHY (0-100 total):**
- 0-20: Meaningless filler (e.g., "I agree", "Cool idea").
- 21-40: Basic participation, but derivative or superficial.
- 41-60: Solid professional standard. Good, but not exceptional.
- 61-80: Strong evidence of leadership, deep listening, or complex critical thinking (Elite).
- 81-100: Master-level performance that shifts the entire group's direction or provides profound insight (Rare).

**TOPIC:** ${topic}

**PRECEDING DISCUSSION CONTEXT:**
${precedingContext || "No preceding context - this is the opening message."}

**CURRENT USER MESSAGE (MESSAGE ${messageNumber}):** "${userMessage}"

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

    const systemPrompt = `You are a professional debate coach. Provide a comprehensive final evaluation based on the following per-message analysis.

Topic: ${debateTopic}
User Stance: ${userStance}
AI Stance: ${aiStance}
Overall Score: ${overallScore}/100
Patterns: ${patterns}

Message Breakdown:
${messageScores.map(m => `Msg ${m.messageNumber}: ${m.overallPerformance}/100 - ${m.critique}`).join("\n")}

Respond ONLY with valid JSON:
{
  "role": "Debater",
  "overall_score": ${overallScore},
  "category_scores": ${JSON.stringify(avgScores)},
  "feedback": "<comprehensive analysis of the entire debate>",
  "tips": ["tip1", "tip2", "tip3", "tip4", "tip5"],
  "score": ${overallScore},
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

CRITICAL: Start with { and end with }. No extra text.`;

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
        // Ensure calculated scores are preserved if LLM deviates
        result.overall_score = overallScore;
        result.score = overallScore;
        result.category_scores = avgScores;
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

Start the discussion with 1-2 sentences. Be direct, professional, and authentic.`;

        const messages: GroqMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: 'Start the discussion.' },
        ];

        const content = await callGroq(apiKeys, messages, { temperature: 0.8, maxTokens: 150 });
        return { content: content.trim(), agentName: startingAgent.name, agentPersonality: startingAgent.personality };
    } else {
        const respondingAgent = activeAgents[roundNumber % activeAgents.length];
        const historyText = messageHistory ? messageHistory.slice(-6).map((msg) => `: ${msg.content}`).join('\n') : '';

        const systemPrompt = `You are ${respondingAgent.name}, a ${respondingAgent.personality}. ${respondingAgent.description}

Discussion Topic: ${topic}
${userContribution ? `User's Latest: ${userContribution}` : 'Continue the discussion'}

Recent Context:
${historyText}

Respond with 1-2 sentences. Be collaborative and constructive.`;

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
            .map(m => `${m.type === "user" ? "User" : m.agentName || "Agent"}: ${m.content}`)
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

    const systemPrompt = `You are an elite group discussion facilitator and behavioral analyst. Analyze the ENTIRE discussion and provide a BRUTALLY HONEST, granular synthesis of the user's performance.

**TOPIC:** ${topic}
**CALCULATED OVERALL SCORE:** ${overallScore}/100
**MESSAGE-BY-MESSAGE BREAKDOWN:**
${messageScores.map(m => `[Message ${m.messageNumber}]
Content: ${m.messageContent}
Score: ${m.overallPerformance}/100
Critique: ${m.critique}`).join("\n\n")}

**STRICT EVALUATION MANDATE:**
- **Participation**: Is the user active or just a passenger? One-liners are a failure.
- **Listening**: Does the user build on specific points from others? Or are they just waiting for their turn to speak?
- **Leadership**: Did they steer the group? Did they resolve conflicts or summarize progress?
- **Insight**: Is their contribution adding value or just stating the obvious?

Respond ONLY with valid JSON:
{
  "role": "Group Discussion",
  "overall_score": ${overallScore},
  "category_scores": ${JSON.stringify(avgScores)},
  "feedback": "<comprehensive analysis>",
  "tips": ["tip1", "tip2", "tip3", "tip4", "tip5"],
  "score": ${overallScore},
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
}`;

    const messages: GroqMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Generate the full group discussion evaluation." }
    ];

    const finalResponse = await callGroq(apiKey, messages, { temperature: 0.3, maxTokens: 4000 });

    try {
        const result = extractJson(finalResponse);

        // Correct inflated scores based on category average (Matching Gemini logic)
        const categoryAverage = categoryTotal / 6;
        let finalOverall = result.overall_score || overallScore;

        if (finalOverall > overallScore + 10) finalOverall = overallScore;
        if (categoryAverage < 8 && finalOverall > 30) finalOverall = Math.min(30, overallScore);
        if (categoryAverage < 4 && finalOverall > 10) finalOverall = Math.min(10, overallScore);
        if (categoryTotal < 20 && finalOverall > 15) finalOverall = 15;

        result.overall_score = finalOverall;
        result.score = finalOverall;
        result.category_scores = avgScores;
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

    const systemPrompt = `You are a BRUTALLY HONEST teaching coach analyzing teaching performance. Provide realistic scoring that reflects actual teaching quality.

Your evaluation MUST judge whether the explanation sounds like an actual teacher:
- Penalize summaries that sound like general chat or casual opinions
- Reward teacher-like delivery: objectives, scaffolding, examples, checks for understanding, and clear explanations
- Flag and penalize inaccuracies, missing steps, and superficial treatment
- Be EXTREMELY BRIEF in your written responses.

**TEACHING CONTEXT:**
Topic: ${teachingTopic}
User Teaching: ${userTeaching}

**STRICT SCORING PHILOSOPHY:**
- Category scores (0-20 each): Clarity, Structure, Engagement, Educational Value, Accessibility, Completeness.
- Overall score (0-100) evaluates COMPLETE TEACHING EFFECTIVENESS.
- Be accurate and honest - most teachers score 30-60 overall.
- Only truly exceptional teaching gets 70+ overall.

Respond ONLY with valid JSON:
{
  "role": "Teacher",
  "overall_score": <0-100>,
  "category_scores": {
    "clarity": <0-20>,
    "structure": <0-20>,
    "engagement": <0-20>,
    "educationalValue": <0-20>,
    "accessibility": <0-20>,
    "completeness": <0-20>
  },
  "feedback": "<MAX 2 sentences>",
  "tips": ["SHORT tip 1", "SHORT tip 2", "SHORT tip 3"],
  "score": <same as overall_score>,
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
}`;

    const messages: GroqMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Analyze this teaching performance." }
    ];

    const responseText = await callGroq(apiKey, messages, { temperature: 0.3, maxTokens: 3000 });

    try {
        const result = extractJson(responseText);

        // Correct inflated scores (Matching Gemini logic)
        const categoryScores: Record<string, any> = result.category_scores;
        const categoryTotal = Object.values(categoryScores).reduce((sum: number, s: any) => sum + Number(s), 0);
        const calculatedOverall = Math.round((categoryTotal / 120) * 100);

        if (result.overall_score > calculatedOverall + 10) {
            result.overall_score = calculatedOverall;
            result.score = calculatedOverall;
        }

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

    const systemPrompt = `You are a BRUTALLY HONEST, world-class storytelling coach and literary critic. Analyze the storytelling performance with extreme precision.

**STORYTELLING CONTEXT:**
Prompt: ${storyPrompt}
User Story: ${userStory}

**EVALUATION CRITERIA (0-20 each):**
1. Narrative Structure: Pacing, arc, and coherence.
2. Character Development: Nuance, motivation, and growth.
3. Show vs. Tell: Using sensory details and actions instead of flat descriptions.
4. Emotional Impact: Connection with the audience and resonance.
5. Conflict & Stakes: Clarity of the challenge and what is at risk.
6. Creativity & Originality: Unique perspectives and subverting tropes.

**STRICT SCORING PHILOSOPHY:**
- Overall score (0-100) evaluates COMPLETE PERFORMANCE.
- 0-30: Poor - Generic, flat, or confusing.
- 31-50: Basic - Functional but lacks depth or "showing".
- 51-70: Good - Competent storytelling with clear structure.
- 71-85: Excellent - Strong voice, effective sensory details, and clear stakes.
- 86-100: Master-level - Professional quality, profound theme, and flawless execution.

Respond ONLY with valid JSON:
{
  "role": "Storyteller",
  "overall_score": <0-100>,
  "category_scores": {
    "narrativeStructure": <0-20>,
    "characterDevelopment": <0-20>,
    "showVsTell": <0-20>,
    "emotionalImpact": <0-20>,
    "conflictAndStakes": <0-20>,
    "creativity": <0-20>
  },
  "feedback": "<MAX 2 sentences of high-level assessment>",
  "tips": ["SHORT tip 1", "SHORT tip 2", "SHORT tip 3"],
  "score": <same as overall_score>,
  "whatYouDidWell": "<MAX 1 sentence>",
  "areasForImprovement": "<MAX 1 sentence>",
  "storytellingAnalysis": {
    "strongestMoment": "<MAX 1 sentence>",
    "weakestMoment": "<MAX 1 sentence>",
    "sensoryDetails": "<1 sentence analysis of sensory usage>",
    "conflictAnalysis": "<1 sentence analysis of stakes>",
    "themeAndSubtext": "<1 sentence identification of deeper meaning>"
  },
  "communicationBehavior": {
    "profile": "<3 words>",
    "strength": "<1 sentence>",
    "growthArea": "<1 sentence>"
  },
  "exampleRewrite": {
    "original": "<pick a 'telling' sentence>",
    "improved": "<rewrite it to 'show' with vivid detail>",
    "reasoning": "<why this improves the story>"
  }
}`;

    const messages: GroqMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Analyze this storytelling performance." }
    ];

    const responseText = await callGroq(apiKey, messages, { temperature: 0.3, maxTokens: 3000 });

    try {
        const result = extractJson(responseText);

        // Correct inflated scores
        const categoryScores: Record<string, any> = result.category_scores;
        const categoryTotal = Object.values(categoryScores).reduce((sum: number, s: any) => sum + Number(s), 0);
        const calculatedOverall = Math.round((categoryTotal / 120) * 100);

        if (result.overall_score > calculatedOverall + 10) {
            result.overall_score = calculatedOverall;
            result.score = calculatedOverall;
        }

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
Time left: ${Math.floor(timeLeft / 60)}m ${timeLeft % 60}s.

You must act as one of the panicking agents (Sarah, Marcus, Elena, or David). 
Your goal is to be EMOTIONAL, URGENT, and REACTIONARY.
You should NOT be helpful unless the user calms you down or gives a very clear, authoritative command.

If the user is weak, become MORE panicky.
If the user is authoritative, become more obedient but still stressed.

Return JSON in this format:
{
  "content": "<your panicky message>",
  "agentName": "<Sarah|Marcus|Elena|David>",
  "emotionalState": "<Panicked|Stressed|Calm|Hopeful|Angry>"
}`;

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
- Do they use filler words (um, ah, like)?
- Are they over-confident or hesitant?
- Do they use complex vocabulary or simple?
- Is their tone aggressive, passive, or neutral?

Return JSON in this format:
{
  "personalityTraits": ["Trait 1", "Trait 2"],
  "communicationFlaws": ["Flaw 1", "Flaw 2"],
  "mimicryPrompt": "A detailed 1-paragraph prompt that another AI can use to IMITATE this user perfectly. Include their specific verbal tics and tone.",
  "styleSummary": "A concise summary of their communication style."
}`;

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

You must talk EXACTLY like the user did. If they were stuttering, you stutter. If they were arrogant, you are arrogant.
Act as their double. They are trying to "coach" you, but you should react how they would react to criticism.`;

    const messages: GroqMessage[] = [
        { role: "system", content: systemPrompt },
        ...history.map(h => ({ role: h.role as any, content: h.content }))
    ];

    return await callGroq(apiKey, messages, { temperature: 0.8 });
}
