import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> } | any
) {
  try {
    const { id: documentId } = await params;
    const tenantId = process.env.DEFAULT_TENANT_ID;

    if (!tenantId) {
      return NextResponse.json({ error: "DEFAULT_TENANT_ID not configured" }, { status: 500 });
    }

    // 1. Get document to find the storage path
    const { data: doc, error: fetchError } = await supabase
      .from("documents")
      .select("source_uri")
      .eq("id", documentId)
      .eq("tenant_id", tenantId)
      .single();

    if (fetchError || !doc) {
      return NextResponse.json({ error: "Documento não encontrado ou sem permissão." }, { status: 404 });
    }

    // 2. Delete from storage bucket
    if (doc.source_uri) {
      const { error: storageError } = await supabase.storage
        .from("documents")
        .remove([doc.source_uri]);
        
      if (storageError) {
        console.warn(`Failed to delete file ${doc.source_uri} from storage:`, storageError.message);
      }
    }

    // 3. Delete from DB (cascade handles chunks and embeddings)
    const { error: deleteError } = await supabase
      .from("documents")
      .delete()
      .eq("id", documentId)
      .eq("tenant_id", tenantId);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Delete document error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
