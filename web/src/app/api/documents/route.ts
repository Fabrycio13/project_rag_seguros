import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const tenantId = process.env.DEFAULT_TENANT_ID;
    
    if (!tenantId) {
      return NextResponse.json({ error: "DEFAULT_TENANT_ID not configured" }, { status: 500 });
    }

    const { data: documents, error } = await supabase
      .from("documents")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ documents });
  } catch (error: any) {
    console.error("List documents error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
