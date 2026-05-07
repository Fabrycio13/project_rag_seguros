import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import OpenAI from "openai";
import { chunkTextSmart, cleanChunkText } from "@/lib/chunking";

const pdfParse = require("pdf-parse");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> } | any
) {
  try {
    const { id: documentId } = await params;
    const tenantId = process.env.DEFAULT_TENANT_ID;

    if (!tenantId) return NextResponse.json({ error: "DEFAULT_TENANT_ID not configured" }, { status: 500 });

    // 1. Fetch document record
    const { data: docRecord, error: fetchError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .eq("tenant_id", tenantId)
      .single();

    if (fetchError || !docRecord) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
    if (!docRecord.source_uri) return NextResponse.json({ error: "Arquivo original não encontrado no registro." }, { status: 400 });

    // 2. Download from bucket
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("documents")
      .download(docRecord.source_uri);

    if (downloadError || !fileData) throw new Error("Falha ao baixar o arquivo do bucket para reprocessamento.");

    const buffer = Buffer.from(await fileData.arrayBuffer());
    let text = "";

    // 3. Extract Text
    if (docRecord.source_uri.endsWith(".pdf") || docRecord.metadata?.type === "application/pdf") {
      const pdfData = await pdfParse(buffer);
      text = pdfData.text;
    } else {
      text = buffer.toString("utf-8");
    }

    if (!text || text.trim().length === 0) throw new Error("Texto vazio após extração.");

    // 4. Delete old chunks (cascade handles embeddings)
    await supabase.from("document_chunks").delete().eq("document_id", documentId);

    // 5. Update status to processing
    await supabase.from("documents").update({ status: "processing" }).eq("id", documentId);

    // 6. Chunk and Embed
    const chunks = chunkTextSmart(text, 1000, 200);

    for (let i = 0; i < chunks.length; i++) {
      const rawChunk = chunks[i];
      const cleanChunk = cleanChunkText(rawChunk);

      // Insert chunk
      const { data: chunkRecord, error: chunkError } = await supabase
        .from("document_chunks")
        .insert({
          document_id: docRecord.id,
          tenant_id: tenantId,
          chunk_index: i,
          content_raw: rawChunk,
          content_clean: cleanChunk,
          metadata: { char_count: rawChunk.length },
        }).select().single();

      if (chunkError) continue;

      // Insert embeddings
      try {
        const contentEmb = await openai.embeddings.create({ model: "text-embedding-3-small", input: cleanChunk });
        
        await supabase.from("chunk_embeddings").insert({
          chunk_id: chunkRecord.id,
          tenant_id: tenantId,
          embedding_content: contentEmb.data[0].embedding,
          model_name: "text-embedding-3-small",
        });
      } catch (e) {}
    }

    // 7. Mark as completed
    await supabase.from("documents").update({ status: "completed" }).eq("id", documentId);

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Reprocess error:", error);
    // Mark as failed
    await supabase.from("documents").update({ 
      status: "failed", 
      metadata: { error: error.message } 
    }).eq("id", params.id);
    
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
