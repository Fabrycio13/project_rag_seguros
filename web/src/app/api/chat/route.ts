import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import OpenAI from "openai";
import { SYSTEM_PROMPT } from "@/lib/prompt";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const { query, history = [] } = await req.json();
    const tenantId = process.env.DEFAULT_TENANT_ID;

    if (!query) return NextResponse.json({ error: "Missing query" }, { status: 400 });
    if (!tenantId) return NextResponse.json({ error: "DEFAULT_TENANT_ID not configured" }, { status: 500 });
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes("sk-...")) {
      return NextResponse.json({ error: "OpenAI API Key não configurada no .env" }, { status: 500 });
    }

    const startTime = Date.now();

    // Improve vector search by combining the last user message with the current query
    // e.g., Last: "e os planos?", Current: "de saude" -> Search: "e os planos? de saude"
    const lastUserMessage = history.filter((m: any) => m.role === 'user').pop();
    const searchQuery = lastUserMessage ? `${lastUserMessage.content} ${query}` : query;

    // 1. Generate Query Embedding
    const embResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: searchQuery,
    });
    const queryEmbedding = embResponse.data[0].embedding;

    // 2. Search for similar chunks via RPC
    const { data: chunks, error: matchError } = await supabase.rpc("match_embeddings", {
      query_embedding: queryEmbedding,
      match_threshold: 0.5,
      match_count: 5,
    });

    if (matchError) {
      throw new Error(`Busca vetorial falhou: ${matchError.message}`);
    }

    // Filter out inactive documents
    let activeChunks = [];
    if (chunks && chunks.length > 0) {
      const docIds = [...new Set(chunks.map((c: any) => c.document_id))];
      
      const { data: activeDocs } = await supabase
        .from("documents")
        .select("id, metadata")
        .in("id", docIds);

      if (activeDocs) {
        const activeDocIds = new Set(
          activeDocs
            .filter(d => d.metadata?.is_active !== false)
            .map(d => d.id)
        );
        activeChunks = chunks.filter((c: any) => activeDocIds.has(c.document_id));
      }
    }

    // Prepare context
    const contextText = activeChunks
      .map((c: any) => `[Documento: ${c.metadata?.source || c.document_id || 'Desconhecido'}]\n${c.content_clean}`)
      .join("\n\n---\n\n");

    // Even if context is empty, we must let the LLM handle greetings and out-of-scope messages 
    // according to the Lara prompt rules.

    // Prepare conversation history for the LLM
    const formattedHistory = history.map((msg: any) => ({
      role: msg.role === 'ai' ? 'assistant' : msg.role,
      content: msg.content
    }));

    // 3. Generate LLM Response
    const chatResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `${SYSTEM_PROMPT}\n\nResponda baseando-se EXCLUSIVAMENTE neste contexto fornecido:\n\n{CONTEXTO}\n${contextText}`
        },
        ...formattedHistory,
        {
          role: "user",
          content: query
        }
      ]
    });

    const answer = chatResponse.choices[0].message.content;
    const latencyMs = Date.now() - startTime;

    // Optional: Log query to query_logs
    const correlationId = crypto.randomUUID();
    await supabase.from("query_logs").insert({
      tenant_id: tenantId,
      correlation_id: correlationId,
      question: query,
      top_k: 5,
      contexts_returned: chunks?.length || 0,
      latency_ms: latencyMs,
    });

    return NextResponse.json({
      answer,
      sources: chunks,
    });

  } catch (error: any) {
    console.error("Chat error:", error);
    return NextResponse.json({ error: error.message || "Erro desconhecido durante o chat." }, { status: 500 });
  }
}
