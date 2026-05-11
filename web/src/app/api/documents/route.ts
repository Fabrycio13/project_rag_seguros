import { NextResponse } from "next/server";
import { createAdminClient, getUserTenantId } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    console.log("Documents GET triggered");
    const tenantId = await getUserTenantId();
    console.log("Resolved tenantId:", tenantId);
    
    if (!tenantId) {
      console.log("No tenantId found, returning 403");
      return NextResponse.json({ error: "Tenant não encontrado para este usuário." }, { status: 403 });
    }

    const supabase = createAdminClient();
    console.log("Admin client initialized, fetching docs...");
    
    const { data: documents, error } = await supabase
      .from("documents")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    console.log("Documents found:", documents?.length || 0);

    if (error) {
      throw error;
    }

    return NextResponse.json({ documents });
  } catch (error: any) {
    console.error("List documents error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
