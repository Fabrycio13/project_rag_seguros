import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, getUserTenantId } from "@/lib/supabase-server";
import OpenAI, { toFile } from "openai";
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
  const supabase = createAdminClient();
  try {
    const body = await req.json();
    console.log("Telegram Body:", JSON.stringify(body));
    
    const chatId = body.message.chat.id.toString();
    let userMessage = body.message.text;

    // --- AUDIO SUPPORT (WHISPER) ---
    const voice = body.message.voice || body.message.audio;
    if (!userMessage && voice) {
      console.log("Audio/Voice message detected:", voice.file_id);
      try {
        const fileId = voice.file_id;
        
        // 1. Get file path from Telegram
        const fileRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
        const fileData = await fileRes.json();
        
        if (fileData.ok) {
          const filePath = fileData.result.file_path;
          const downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
          console.log("Downloading audio from:", downloadUrl);
          
          // 2. Download the audio file
          const audioRes = await fetch(downloadUrl);
          if (!audioRes.ok) throw new Error("Failed to download audio from Telegram");
          
          const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
          
          // 3. Transcribe with OpenAI Whisper
          // Using a buffer with a filename for compatibility
          const transcription = await openai.audio.transcriptions.create({
            file: await toFile(audioBuffer, "voice.ogg", { type: "audio/ogg" }),
            model: "whisper-1",
          });
          
          userMessage = transcription.text;
          console.log(`Transcribed text: "${userMessage}"`);
        } else {
          console.error("Telegram getFile failed:", fileData);
        }
      } catch (err: any) {
        console.error("Audio transcription failed:", err);
        await sendTelegramMessage(chatId, "❌ Desculpe, tive um problema ao processar seu áudio.");
        return NextResponse.json({ ok: true });
      }
    }

    if (!userMessage) {
      return NextResponse.json({ ok: true }); // Ignore non-text/non-audio messages
    }
    const tenantId = process.env.DEFAULT_TENANT_ID;

    if (!TELEGRAM_BOT_TOKEN) {
      console.error("TELEGRAM_BOT_TOKEN missing in .env");
      return NextResponse.json({ error: "Config missing" }, { status: 500 });
    }

    // Security: Check if chatId is allowed (DISABLED - Bot is now public)
    /*
    const allowedIds = (process.env.ALLOWED_TELEGRAM_CHAT_IDS || "").split(",");
    if (allowedIds.length > 0 && !allowedIds.includes(chatId)) {
      console.log(`Access restricted for chatId: ${chatId}`);
      await sendTelegramMessage(chatId, "⚠️ Acesso restrito. Entre em contato com o administrador.");
      return NextResponse.json({ ok: true });
    }
    */

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
    const { data: chunks, error: matchError } = await supabase.rpc("match_embeddings", {
      query_embedding: queryEmbedding,
      match_threshold: 0.3,
      match_count: 5,
      p_tenant_id: tenantId,
    });

    if (matchError) {
      console.error("Telegram RPC Error:", matchError);
    }

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
