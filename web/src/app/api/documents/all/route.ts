import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function DELETE(req: NextRequest) {
  try {
    const tenantId = process.env.DEFAULT_TENANT_ID;
    if (!tenantId) {
      return NextResponse.json({ error: "DEFAULT_TENANT_ID not configured" }, { status: 500 });
    }

    // 1. Get all documents to find their storage paths
    const { data: docs, error: fetchError } = await supabase
      .from("documents")
      .select("source_uri")
      .eq("tenant_id", tenantId);

    if (fetchError) {
      return NextResponse.json({ error: "Erro ao buscar documentos." }, { status: 500 });
    }

    // 2. Delete all from storage bucket
    if (docs && docs.length > 0) {
      const paths = docs.map(d => d.source_uri).filter(Boolean) as string[];
      if (paths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from("documents")
          .remove(paths);
          
        if (storageError) {
          console.warn("Failed to delete some files from storage:", storageError.message);
        }
      }
    }

    // 3. Delete from DB
    const { error: deleteError } = await supabase
      .from("documents")
      .delete()
      .eq("tenant_id", tenantId);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Delete all documents error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
