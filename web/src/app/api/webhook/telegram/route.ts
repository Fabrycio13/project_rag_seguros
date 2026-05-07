import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import OpenAI from "openai";
import { SYSTEM_PROMPT } from "@/lib/prompt";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Helper to send message back to Telegram
async function sendTelegramMessage(chatId: string | number, text: string) {
  if (!TELEGRAM_BOT_TOKEN) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: "Markdown"
    })
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Check if it's a valid Telegram message
    if (!body.message || !body.message.text) {
      return NextResponse.json({ ok: true }); // Telegram needs a 200 OK
    }

    const chatId = body.message.chat.id.toString();
    const userMessage = body.message.text;
    const tenantId = process.env.DEFAULT_TENANT_ID;

    if (!TELEGRAM_BOT_TOKEN) {
      console.error("TELEGRAM_BOT_TOKEN missing in .env");
      return NextResponse.json({ error: "Config missing" }, { status: 500 });
    }

    // 1. Fetch Session History from Supabase
    let history: any[] = [];
    const { data: session } = await supabase
      .from("chat_sessions")
      .select("history")
      .eq("platform", "telegram")
      .eq("chat_id", chatId)
      .single();

    if (session && session.history) {
      history = session.history;
    }

    // 2. Prepare RAG Search
    const lastUserMsg = history.filter((m: any) => m.role === 'user').pop();
    const searchQuery = lastUserMsg ? `${lastUserMsg.content} ${userMessage}` : userMessage;

    // Generate Embedding
    const embResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: searchQuery,
    });
    const queryEmbedding = embResponse.data[0].embedding;

    // Vector Search
    const { data: chunks } = await supabase.rpc("match_embeddings", {
      query_embedding: queryEmbedding,
      match_threshold: 0.5,
      match_count: 5,
    });

    // Build Context
    let contextText = "";
    if (chunks && chunks.length > 0) {
      contextText = chunks
        .map((c: any) => `[Documento: ${c.metadata?.source || c.document_id}]\n${c.content_clean}`)
        .join("\n\n---\n\n");
    }

    // 3. Format History for LLM
    const formattedHistory = history.map((msg: any) => ({
      role: msg.role === 'ai' ? 'assistant' : msg.role,
      content: msg.content
    }));

    // 4. Generate AI Response
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
          content: userMessage
        }
      ]
    });

    const aiResponse = chatResponse.choices[0].message.content || "Desculpe, não consegui processar sua resposta.";

    // 5. Update History in Supabase
    const newHistory = [
      ...history,
      { role: "user", content: userMessage },
      { role: "ai", content: aiResponse }
    ].slice(-10); // Keep only last 10 messages to prevent token explosion

    await supabase
      .from("chat_sessions")
      .upsert({
        platform: "telegram",
        chat_id: chatId,
        tenant_id: tenantId,
        history: newHistory,
        last_interaction_at: new Date().toISOString()
      }, { onConflict: "platform,chat_id" });

    // 6. Send Response back to Telegram
    await sendTelegramMessage(chatId, aiResponse);

    // Return 200 OK so Telegram knows we received it
    return NextResponse.json({ ok: true });

  } catch (error: any) {
    console.error("Telegram Webhook Error:", error);
    // Always return 200 to Telegram so it stops retrying the failing message
    return NextResponse.json({ ok: true, error: error.message });
  }
}
