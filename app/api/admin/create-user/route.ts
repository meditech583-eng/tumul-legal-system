import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const allowedRoles = [
  "Super Admin",
  "Lawyer",
  "Secretary",
  "Billing",
  "Viewer",
] as const;

export async function POST(request: NextRequest) {
  try {
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration is incomplete." },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get("authorization");
    const accessToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";

    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    // This client is server-only. Never expose SUPABASE_SERVICE_ROLE_KEY
    // through a NEXT_PUBLIC_ environment variable or client component.
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify the caller's Supabase access token.
    const {
      data: { user: caller },
      error: callerError,
    } = await admin.auth.getUser(accessToken);

    if (callerError || !caller?.email) {
      return NextResponse.json(
        { error: "Your session is invalid or has expired." },
        { status: 401 }
      );
    }

    // Authorisation is checked server-side, not just in the browser UI.
    const { data: callerProfile, error: profileError } = await admin
      .from("staff_users")
      .select("email, role, is_active")
      .eq("email", caller.email.toLowerCase())
      .maybeSingle();

    if (
      profileError ||
      !callerProfile ||
      callerProfile.is_active === false ||
      callerProfile.role !== "Super Admin"
    ) {
      return NextResponse.json(
        { error: "Only an active Super Admin can create staff logins." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const full_name = String(body?.full_name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const role = String(body?.role || "").trim();
    const password = String(body?.password || "");

    if (!full_name || !email || !role || !password) {
      return NextResponse.json(
        { error: "Full name, email, role and password are required." },
        { status: 400 }
      );
    }

    if (!allowedRoles.includes(role as (typeof allowedRoles)[number])) {
      return NextResponse.json({ error: "Invalid user role." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Temporary password must be at least 8 characters." },
        { status: 400 }
      );
    }

    // Create the real Supabase Authentication account.
    const { data: createdAuth, error: authError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name,
          role,
        },
      });

    if (authError) {
      return NextResponse.json(
        { error: `Unable to create login: ${authError.message}` },
        { status: 400 }
      );
    }

    // The receptionist/secretary may already exist in staff_users from the
    // earlier version of the app. Update that row instead of creating a duplicate.
    const { data: existingStaff, error: existingError } = await admin
      .from("staff_users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingError) {
      await admin.auth.admin.deleteUser(createdAuth.user.id);
      return NextResponse.json(
        { error: `Unable to check staff profile: ${existingError.message}` },
        { status: 500 }
      );
    }

    let staffError = null;

    if (existingStaff?.id) {
      const { error } = await admin
        .from("staff_users")
        .update({
          full_name,
          role,
          is_active: true,
          created_by: caller.email.toLowerCase(),
        })
        .eq("id", existingStaff.id);

      staffError = error;
    } else {
      const { error } = await admin.from("staff_users").insert({
        full_name,
        email,
        role,
        is_active: true,
        created_by: caller.email.toLowerCase(),
      });

      staffError = error;
    }

    if (staffError) {
      // Roll back the Auth account so Auth and staff_users do not get out of sync.
      await admin.auth.admin.deleteUser(createdAuth.user.id);

      return NextResponse.json(
        { error: `Unable to save staff profile: ${staffError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: createdAuth.user.id,
        email,
        full_name,
        role,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
