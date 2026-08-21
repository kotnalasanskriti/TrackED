const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const responseSchema = {
    type: "OBJECT",
    properties: {
        recommended_domain: {
            type: "STRING",
        },
        match_score: {
            type: "NUMBER",
        },
        reason: {
            type: "STRING",
        },
        evidence: {
            type: "ARRAY",
            items: {
                type: "STRING",
            },
        },
        strengths: {
            type: "ARRAY",
            items: {
                type: "STRING",
            },
        },
        gaps: {
            type: "ARRAY",
            items: {
                type: "STRING",
            },
        },
        next_step: {
            type: "STRING",
        },
        alternative_domains: {
            type: "ARRAY",
            items: {
                type: "STRING",
            },
        },
    },
    required: [
        "recommended_domain",
        "match_score",
        "reason",
        "evidence",
        "strengths",
        "gaps",
        "next_step",
        "alternative_domains",
    ],
};

Deno.serve(async (req) => {
    // Handle browser preflight request
    if (req.method === "OPTIONS") {
        return new Response("ok", {
            headers: corsHeaders,
        });
    }

    try {
        // ==========================================
        // 1. GET GEMINI SECRET
        // ==========================================

        const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

        if (!geminiApiKey) {
            return new Response(
                JSON.stringify({
                    error: "GEMINI_API_KEY is not configured in Supabase Secrets.",
                }),
                {
                    status: 500,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }

        // ==========================================
        // 2. READ STUDENT DATA
        // ==========================================

        const student = await req.json();

        // ==========================================
        // 3. BUILD AI PROMPT
        // ==========================================

        const prompt = `
You are TrackED Intelligence.

TrackED is a digital student identity platform.
Your job is to analyze a student's complete journey and identify
the domains/career directions where their demonstrated profile
currently shows the strongest fit.

IMPORTANT RULES:

1. Analyze evidence, not assumptions.
2. Do NOT invent projects, internships, certifications,
   achievements, skills, companies or experience.
3. Do NOT treat a student's degree alone as enough evidence.
4. Consider their skills, projects, activities, achievements,
   internships, interests and academic information together.
5. Be honest when the profile is incomplete.
6. The recommendation is guidance, NOT a guaranteed career prediction.
7. Give actionable next steps.
8. Return ONLY the requested JSON structure.

The analysis should answer:

- What domain currently fits this student best?
- Why?
- What evidence supports that recommendation?
- What are their strongest signals?
- What is missing?
- What should they do next?
- What alternative domains could also fit?

STUDENT PROFILE:

${JSON.stringify(student, null, 2)}
`;

        // ==========================================
        // 4. CALL GEMINI
        // ==========================================

        const geminiResponse = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": geminiApiKey,
                },

                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    text: prompt,
                                },
                            ],
                        },
                    ],

                    generationConfig: {
                        temperature: 0.25,

                        response_mime_type: "application/json",

                        response_schema: responseSchema,
                    },
                }),
            },
        );

        // ==========================================
        // 5. READ GEMINI RESPONSE
        // ==========================================

        const geminiData = await geminiResponse.json();

        if (!geminiResponse.ok) {
            console.error("Gemini API error:", geminiData);

            return new Response(
                JSON.stringify({
                    error:
                        geminiData?.error?.message ||
                        "Gemini API request failed.",
                    details: geminiData,
                }),
                {
                    status: 502,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }

        const generatedText =
            geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!generatedText) {
            console.error("Gemini returned no text:", geminiData);

            return new Response(
                JSON.stringify({
                    error: "Gemini returned an empty response.",
                }),
                {
                    status: 502,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }

        // ==========================================
        // 6. PARSE AI JSON
        // ==========================================

        let analysis;

        try {
            analysis = JSON.parse(generatedText);
        } catch (parseError) {
            console.error(
                "Could not parse Gemini JSON:",
                generatedText,
            );

            return new Response(
                JSON.stringify({
                    error: "Gemini returned invalid JSON.",
                    raw: generatedText,
                }),
                {
                    status: 502,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }

        // ==========================================
        // 7. RETURN RESULT TO TRACKED
        // ==========================================

        return new Response(
            JSON.stringify(analysis),
            {
                status: 200,

                headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json",
                },
            },
        );
    } catch (error) {
        console.error("analyze-student error:", error);

        return new Response(
            JSON.stringify({
                error:
                    error instanceof Error
                        ? error.message
                        : "Unexpected server error.",
            }),
            {
                status: 500,

                headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json",
                },
            },
        );
    }
});