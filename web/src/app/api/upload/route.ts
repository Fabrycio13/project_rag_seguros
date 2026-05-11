import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, getUserTenantId } from "@/lib/supabase-server";
import OpenAI from "openai";
import { chunkTextSmart, cleanChunkText } from "@/lib/chunking";

// Polyfills to prevent pdf-parse from crashing during Next.js server module evaluation
if (typeof global !== "undefined") {
  if (!global.DOMMatrix) global.DOMMatrix = class {} as any;
  if (!global.Path2D) global.Path2D = class {} as any;
  if (!global.ImageData) global.ImageData = class {} as any;
}

const pdfParse = require("pdf-parse");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getUserTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: "Tenant não encontrado para este usuário." }, { status: 403 });
    }

    const supabase = createAdminClient();
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const description = formData.get("description") as string || "";

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!tenantId) return NextResponse.json({ error: "DEFAULT_TENANT_ID not configured" }, { status: 500 });
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes("sk-...")) {
      return NextResponse.json({ error: "OpenAI API Key não configurada no .env" }, { status: 500 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text = "";

    // Extract text based on file type
    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      const pdfData = await pdfParse(buffer);
      text = pdfData.text;
    } else if (file.type === "text/plain" || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
      text = buffer.toString("utf-8");
    } else {
      return NextResponse.json({ error: "Formato de arquivo não suportado." }, { status: 400 });
    }

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "Não foi possível extrair texto do arquivo." }, { status: 400 });
    }

    // 1. Upload to storage
    const filePath = `${tenantId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(filePath, buffer, { contentType: file.type });

    if (uploadError) {
      throw new Error(`Upload storage failed: ${uploadError.message}`);
    }

    // 2. Insert Document record
    const { data: docRecord, error: docError } = await supabase
      .from("documents")
      .insert({
        tenant_id: tenantId,
        source_type: "web",
        source_uri: filePath,
        title: file.name,
        status: "processing",
        metadata: { size: file.size, type: file.type, description }
      })
      .select()
      .single();

    if (docError) {
      throw new Error(`DB Document insert failed: ${docError.message}`);
    }

    // 3. Chunk text
    const chunks = chunkTextSmart(text, 1000, 200);

    // 4. Generate embeddings and insert chunks
    for (let i = 0; i < chunks.length; i++) {
      const rawChunk = chunks[i];
      // Clean the chunk for the AI (fixes hyphenation and paragraphs)
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
        })
        .select()
        .single();

      if (chunkError) {
        console.error(`Error inserting chunk ${i}:`, chunkError);
        continue;
      }

      // Generate embedding for content
      try {
        const contentEmbRes = await openai.embeddings.create({ model: "text-embedding-3-small", input: cleanChunk });
        
        await supabase.from("chunk_embeddings").insert({
          chunk_id: chunkRecord.id,
          tenant_id: tenantId,
          embedding_content: contentEmbRes.data[0].embedding,
          model_name: "text-embedding-3-small",
        });
      } catch (embErr) {
        console.error(`Error embedding chunk ${i}:`, embErr);
      }
    }

    // 5. Mark as completed
    await supabase
      .from("documents")
      .update({ 
        status: "completed", 
        metadata: { ...docRecord.metadata, chunks_count: chunks.length } 
      })
      .eq("id", docRecord.id);

    return NextResponse.json({ success: true, document: docRecord });

  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: error.message || "Erro desconhecido durante o upload." }, { status: 500 });
  }
}
