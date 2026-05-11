import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, getUserTenantId } from "@/lib/supabase-server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> } | any
) {
  const supabase = createAdminClient();
  try {
    const { id: documentId } = await params;
    const tenantId = await getUserTenantId();
    const body = await req.json();
    const is_active = body.is_active;

    if (!tenantId) { return NextResponse.json({ error: "Tenant não encontrado" }, { status: 403 }); }

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
