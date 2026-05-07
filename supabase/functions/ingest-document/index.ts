import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface IngestRequest {
  document_id: string;
  tenant_id: string;
  file_path: string;
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

    const { document_id, tenant_id, file_path }: IngestRequest = await req.json();

    // Update document status to processing
    await supabase
      .from("documents")
      .update({ status: "processing", metadata: { file_path } })
      .eq("id", document_id);

    // Fetch file from storage
    const { data: fileData, error: fileError } = await supabase.storage
      .from("documents")
      .download(file_path);

    if (fileError || !fileData) {
      throw new Error(`Failed to download file: ${fileError?.message}`);
    }

    const content = await fileData.text();

    // Chunk text (simple 500-char chunks with overlap)
    const chunks = chunkText(content, 500, 50);

    // Generate embeddings for each chunk
    const embeddings = await generateEmbeddings(openaiApiKey, chunks);

    // Store chunks and embeddings
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Insert chunk
      const { data: chunkRecord, error: chunkError } = await supabase
        .from("document_chunks")
        .insert({
          document_id,
          tenant_id,
          chunk_index: i,
          content_raw: chunk,
          content_clean: chunk.trim(),
          metadata: { char_count: chunk.length },
        })
        .select()
        .single();

      if (chunkError) {
        console.error(`Error inserting chunk ${i}:`, chunkError);
        continue;
      }

      // Insert embeddings
      const embedding = await createEmbedding(openaiApiKey, chunk);

      await supabase.from("chunk_embeddings").insert({
        chunk_id: chunkRecord.id,
        tenant_id,
        embedding_content: embedding,
        model_name: Deno.env.get("EMBEDDING_MODEL") || "text-embedding-3-small",
      });
    }

    // Update document status to completed
    await supabase
      .from("documents")
      .update({ status: "completed", metadata: { chunks_count: chunks.length } })
      .eq("id", document_id);

    return new Response(
      JSON.stringify({ success: true, chunks_count: chunks.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Ingest error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + chunkSize;

    // Try to break at sentence or paragraph
    if (end < text.length) {
      const breakPoint = text.lastIndexOf("\n\n", end);
      if (breakPoint > start + chunkSize / 2) {
        end = breakPoint + 2;
      } else {
        const spaceBreak = text.lastIndexOf(" ", end);
        if (spaceBreak > start + chunkSize / 2) {
          end = spaceBreak + 1;
        }
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
  }

  return chunks;
}

async function generateEmbeddings(apiKey: string, texts: string[]): Promise<number[][]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: texts,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data.map((d: { embedding: number[] }) => d.embedding);
}

async function createEmbedding(apiKey: string, text: string): Promise<number[]> {
  const embeddings = await generateEmbeddings(apiKey, [text]);
  return embeddings[0];
}