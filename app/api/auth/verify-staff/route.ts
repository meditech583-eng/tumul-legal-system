import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      console.error("Missing required Supabase environment variables.");
      return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

    if (!token) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: userError } = await authClient.auth.getUser(token);

    if (userError || !user?.email) {
      return NextResponse.json({ error: "Invalid or expired login session." }, { status: 401 });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const loginEmail = user.email.trim().toLowerCase();

    const { data: staff, error: staffError } = await adminClient
      .from("staff_users")
      .select("id, full_name, email, role, is_active, created_at, created_by")
      .ilike("email", loginEmail)
      .maybeSingle();

    if (staffError) {
      console.error("Staff verification query failed:", staffError.message);
      return NextResponse.json({ error: "Unable to verify staff access." }, { status: 500 });
    }

    if (!staff) {
      return NextResponse.json(
        { error: "Access denied. Your login is valid, but this email is not an authorised Tumul Legal staff account." },
        { status: 403 }
      );
    }

    if (staff.is_active === false) {
      return NextResponse.json(
        { error: "Your Tumul Legal staff account has been deactivated. Please contact the administrator." },
        { status: 403 }
      );
    }

    return NextResponse.json({ staff }, { status: 200 });
  } catch (error) {
    console.error("verify-staff route failed:", error);
    return NextResponse.json({ error: "Unable to verify staff access." }, { status: 500 });
  }
}
