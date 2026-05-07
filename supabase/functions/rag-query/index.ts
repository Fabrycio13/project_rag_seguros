import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface QueryRequest {
  tenant_id: string;
  query: string;
  top_k?: number;
  filters?: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { tenant_id, query, top_k = 5, filters = {} }: QueryRequest = await req.json();
    const startTime = Date.now();

    // Generate query embedding
    const queryEmbedding = await createEmbedding(openaiApiKey, query);

    // Search for similar chunks
    const { data: chunks, error } = await supabase.rpc("match_embeddings", {
      query_embedding: queryEmbedding,
      match_threshold: 0.5,
      match_count: top_k,
    });

    if (error) {
      throw new Error(`Search failed: ${error.message}`);
    }

    const context = chunks
      ?.map((c: { content_clean: string; metadata: Record<string, unknown> }) =>
        `[${c.metadata?.source || 'unknown'}] ${c.content_clean}`
      )
      .join("\n\n");

    // Generate LLM response
    const llmResponse = await generateRagResponse(
      openaiApiKey,
      query,
      context || "No relevant context found."
    );

    const latencyMs = Date.now() - startTime;

    // Log query
    const correlationId = crypto.randomUUID();
    await supabase.from("query_logs").insert({
      tenant_id,
      correlation_id: correlationId,
      question: query,
      filters,
      top_k,
      contexts_returned: chunks?.length || 0,
      latency_ms: latencyMs,
    });

    return new Response(
      JSON.stringify({
        answer: llmResponse,
        sources: chunks || [],
        correlation_id: correlationId,
        latency_ms: latencyMs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Query error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function createEmbedding(apiKey: string, text: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

async function generateRagResponse(
  apiKey: string,
  question: string,
  context: string
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant answering questions based ONLY on the provided context. If the answer is not in the context, say 'I don't have enough information to answer that question.'",
        },
        {
          role: "user",
          content: `Context:\n${context}\n\nQuestion: ${question}`,
        },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}