import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> } | any
) {
  try {
    const { id: documentId } = await params;
    const tenantId = process.env.DEFAULT_TENANT_ID;
    const body = await req.json();
    const is_active = body.is_active;

    if (!tenantId) {
      return NextResponse.json({ error: "DEFAULT_TENANT_ID not configured" }, { status: 500 });
    }

    const { data: doc, error: fetchError } = await supabase
      .from("documents")
      .select("metadata")
      .eq("id", documentId)
      .eq("tenant_id", tenantId)
      .single();

    if (fetchError || !doc) {
      return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
    }

    const newMetadata = { ...doc.metadata, is_active };

    const { error: updateError } = await supabase
      .from("documents")
      .update({ metadata: newMetadata })
      .eq("id", documentId)
      .eq("tenant_id", tenantId);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ success: true, is_active });

  } catch (error: any) {
    console.error("Toggle document error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
