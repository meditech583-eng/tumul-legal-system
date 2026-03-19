"use client";

import { branding } from "./config/branding";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase/client";

type Tab =
  | "dashboard"
  | "docket"
  | "clients"
  | "billing"
  | "reports";

type MatterStatus =
  | "Open"
  | "In Progress"
  | "Pending Filing"
  | "In Court"
  | "Awaiting Client"
  | "Closed";

type Priority = "High" | "Medium" | "Low";

type Matter = {
  id: number;
  matter_no: string;
  client_name: string;
  case_type: string;
  status: MatterStatus;
  next_step: string;
  assigned_lawyer: string;
  court_date: string;
  cost_estimate: number;
  priority: Priority;
};

type Client = {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  matter_count: number;
  last_contact: string;
  source: string;
};

type Invoice = {
  id: number;
  invoice_no: string;
  client_name: string;
  matter_no: string;
  amount: number;
  status: "Paid" | "Unpaid" | "Part Paid";
  due_date: string;
  issued_date: string;
};

type AuthMode = "login" | "signup";

const currency = (value: number) =>
  new Intl.NumberFormat("en-PG", {
    style: "currency",
    currency: "PGK",
    maximumFractionDigits: 2,
  }).format(value || 0);

export default function TumulLegalV3() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");

  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  const [matters, setMatters] = useState<Matter[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const [matterSearch, setMatterSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");

  const [matterForm, setMatterForm] = useState({
    matter_no: "",
    client_name: "",
    case_type: "",
    status: "Open" as MatterStatus,
    next_step: "",
    assigned_lawyer: "",
    court_date: "",
    cost_estimate: "",
    priority: "Medium" as Priority,
  });

  const [clientForm, setClientForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    source: "Referral",
  });

  const [invoiceForm, setInvoiceForm] = useState({
    invoice_no: "",
    client_name: "",
    matter_no: "",
    amount: "",
    status: "Unpaid" as "Paid" | "Unpaid" | "Part Paid",
    due_date: "",
    issued_date: "",
  });

  useEffect(() => {
    const getSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setSession(session);
      setLoading(false);

      if (session) {
        await loadAllData();
      }
    };

    getSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_: unknown, session: any) => {
      setSession(session);
      setLoading(false);

      if (session) {
        await loadAllData();
      } else {
        setMatters([]);
        setClients([]);
        setInvoices([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadAllData = async () => {
    setLoading(true);

    const [mattersRes, clientsRes, invoicesRes] = await Promise.all([
      supabase.from("matters").select("*").order("id", { ascending: false }),
      supabase.from("clients").select("*").order("id", { ascending: false }),
      supabase.from("invoices").select("*").order("id", { ascending: false }),
    ]);

    if (!mattersRes.error) setMatters((mattersRes.data as Matter[]) || []);
    if (!clientsRes.error) setClients((clientsRes.data as Client[]) || []);
    if (!invoicesRes.error) setInvoices((invoicesRes.data as Invoice[]) || []);

    setLoading(false);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthMessage("");
    setLoading(true);

    if (authMode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setAuthMessage(error.message);
        setLoading(false);
        return;
      }

      setAuthMessage("Login successful.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setAuthMessage(error.message);
      setLoading(false);
      return;
    }

    setAuthMessage(
      "Signup successful. Check your email if confirmation is required."
    );
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const filteredMatters = useMemo(() => {
    const query = matterSearch.toLowerCase();
    return matters.filter(
      (matter) =>
        matter.matter_no?.toLowerCase().includes(query) ||
        matter.client_name?.toLowerCase().includes(query) ||
        matter.case_type?.toLowerCase().includes(query) ||
        matter.assigned_lawyer?.toLowerCase().includes(query) ||
        matter.status?.toLowerCase().includes(query)
    );
  }, [matters, matterSearch]);

  const filteredClients = useMemo(() => {
    const query = clientSearch.toLowerCase();
    return clients.filter(
      (client) =>
        client.name?.toLowerCase().includes(query) ||
        client.phone?.toLowerCase().includes(query) ||
        client.email?.toLowerCase().includes(query) ||
        client.source?.toLowerCase().includes(query)
    );
  }, [clients, clientSearch]);

  const filteredInvoices = useMemo(() => {
    const query = invoiceSearch.toLowerCase();
    return invoices.filter(
      (invoice) =>
        invoice.invoice_no?.toLowerCase().includes(query) ||
        invoice.client_name?.toLowerCase().includes(query) ||
        invoice.matter_no?.toLowerCase().includes(query) ||
        invoice.status?.toLowerCase().includes(query)
    );
  }, [invoices, invoiceSearch]);

  const totalMatters = matters.length;
  const openMatters = matters.filter((m) => m.status !== "Closed").length;
  const totalClients = clients.length;
  const totalInvoiceValue = invoices.reduce(
    (sum, invoice) => sum + Number(invoice.amount || 0),
    0
  );
  const outstandingValue = invoices
    .filter((invoice) => invoice.status !== "Paid")
    .reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const collectedValue = invoices
    .filter((invoice) => invoice.status === "Paid")
    .reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const urgentMatters = matters.filter((m) => m.priority === "High").length;
  const upcomingCourtDates = matters.filter(
    (m) => m.court_date && m.status !== "Closed"
  ).length;

  const matterStatusSummary = useMemo(() => {
    return [
      "Open",
      "In Progress",
      "Pending Filing",
      "In Court",
      "Awaiting Client",
      "Closed",
    ].map((status) => ({
      status,
      count: matters.filter((matter) => matter.status === status).length,
    }));
  }, [matters]);

  const intakeSummary = useMemo(() => {
    return ["Referral", "Friend", "Family", "Colleague", "Website", "Walk In"].map(
      (source) => ({
        source,
        count: clients.filter((client) => client.source === source).length,
      })
    );
  }, [clients]);

  const handleAddMatter = async () => {
    if (
      !matterForm.matter_no ||
      !matterForm.client_name ||
      !matterForm.case_type ||
      !matterForm.assigned_lawyer
    ) {
      alert("Please fill in matter number, client name, case type and lawyer.");
      return;
    }

    const { error } = await supabase.from("matters").insert({
      matter_no: matterForm.matter_no,
      client_name: matterForm.client_name,
      case_type: matterForm.case_type,
      status: matterForm.status,
      next_step: matterForm.next_step,
      assigned_lawyer: matterForm.assigned_lawyer,
      court_date: matterForm.court_date || null,
      cost_estimate: Number(matterForm.cost_estimate || 0),
      priority: matterForm.priority,
    });

    if (error) {
      alert(error.message);
      return;
    }

    const existingClient = clients.find(
      (client) =>
        client.name.trim().toLowerCase() ===
        matterForm.client_name.trim().toLowerCase()
    );

    if (existingClient) {
      await supabase
        .from("clients")
        .update({
          matter_count: (existingClient.matter_count || 0) + 1,
          last_contact: new Date().toISOString().slice(0, 10),
        })
        .eq("id", existingClient.id);
    }

    setMatterForm({
      matter_no: "",
      client_name: "",
      case_type: "",
      status: "Open",
      next_step: "",
      assigned_lawyer: "",
      court_date: "",
      cost_estimate: "",
      priority: "Medium",
    });

    await loadAllData();
  };

  const handleAddClient = async () => {
    if (!clientForm.name || !clientForm.phone) {
      alert("Please fill in client name and phone.");
      return;
    }

    const { error } = await supabase.from("clients").insert({
      name: clientForm.name,
      phone: clientForm.phone,
      email: clientForm.email,
      address: clientForm.address,
      source: clientForm.source,
      matter_count: 0,
      last_contact: new Date().toISOString().slice(0, 10),
    });

    if (error) {
      alert(error.message);
      return;
    }

    setClientForm({
      name: "",
      phone: "",
      email: "",
      address: "",
      source: "Referral",
    });

    await loadAllData();
  };

  const handleAddInvoice = async () => {
    if (
      !invoiceForm.invoice_no ||
      !invoiceForm.client_name ||
      !invoiceForm.matter_no ||
      !invoiceForm.amount
    ) {
      alert("Please fill in invoice number, client, matter number and amount.");
      return;
    }

    const { error } = await supabase.from("invoices").insert({
      invoice_no: invoiceForm.invoice_no,
      client_name: invoiceForm.client_name,
      matter_no: invoiceForm.matter_no,
      amount: Number(invoiceForm.amount),
      status: invoiceForm.status,
      due_date: invoiceForm.due_date || null,
      issued_date:
        invoiceForm.issued_date || new Date().toISOString().slice(0, 10),
    });

    if (error) {
      alert(error.message);
      return;
    }

    setInvoiceForm({
      invoice_no: "",
      client_name: "",
      matter_no: "",
      amount: "",
      status: "Unpaid",
      due_date: "",
      issued_date: "",
    });

    await loadAllData();
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case "Open":
      case "Pending":
      case "Unpaid":
        return "bg-amber-400/15 text-amber-200 border border-amber-400/30";
      case "In Progress":
      case "In Court":
      case "Part Paid":
        return "bg-sky-400/15 text-sky-200 border border-sky-400/30";
      case "Paid":
      case "Closed":
      case "Done":
        return "bg-emerald-400/15 text-emerald-200 border border-emerald-400/30";
      case "Awaiting Client":
        return "bg-violet-400/15 text-violet-200 border border-violet-400/30";
      case "Pending Filing":
        return "bg-orange-400/15 text-orange-200 border border-orange-400/30";
      default:
        return "bg-white/10 text-slate-200 border border-white/10";
    }
  };

  const getPriorityClass = (priority: Priority) => {
    switch (priority) {
      case "High":
        return "bg-rose-400/15 text-rose-200 border border-rose-400/30";
      case "Medium":
        return "bg-orange-400/15 text-orange-200 border border-orange-400/30";
      case "Low":
        return "bg-slate-400/15 text-slate-200 border border-slate-400/30";
      default:
        return "bg-white/10 text-slate-200 border border-white/10";
    }
  };

  const glassCard =
    "rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_10px_40px_rgba(0,0,0,0.25)]";
  const inputClass =
    "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-400 outline-none transition focus:border-cyan-400/60 focus:bg-white/10";
  const sectionTitle = "text-lg font-semibold text-white";
  const muted = "text-sm text-slate-400";

  const NavButton = ({
    id,
    label,
    icon,
  }: {
    id: Tab;
    label: string;
    icon: string;
  }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
        activeTab === id
          ? "bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 shadow-lg"
          : "bg-white/5 text-slate-200 hover:bg-white/10"
      }`}
    >
      <span className="text-base">{icon}</span>
      <span>{label}</span>
    </button>
  );

  const StatCard = ({
    label,
    value,
    subtext,
  }: {
    label: string;
    value: string | number;
    subtext: string;
  }) => (
    <div className={`${glassCard} p-5`}>
      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <h3 className="mt-3 text-3xl font-bold text-white">{value}</h3>
      <p className="mt-2 text-sm text-slate-400">{subtext}</p>
    </div>
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Loading Tumul Legal V3...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,#0f274f_0%,#07152c_45%,#030b18_100%)] px-4 py-10 text-white">
        <div className="mx-auto max-w-md">
          <div className={`${glassCard} p-8`}>
            <div className="mb-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-400">
                {branding.platformName || "MTEC"}
              </p>

              <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
                MTEC – {branding.clientName || "Tumul Legal"}
              </h1>

              <p className="mt-2 text-base text-slate-300">
                Legal Management System
              </p>

              <p className="mt-3 text-sm text-slate-400">
                Secure access for authorized staff only
              </p>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-3 rounded-2xl bg-white/5 p-1">
              <button
                onClick={() => {
                  setAuthMode("login");
                  setAuthMessage("");
                }}
                className={`rounded-xl py-3 text-base font-semibold transition ${
                  authMode === "login"
                    ? "bg-cyan-400 text-slate-950 shadow-lg"
                    : "bg-transparent text-white hover:bg-white/10"
                }`}
              >
                Login
              </button>

              <button
                onClick={() => {
                  setAuthMode("signup");
                  setAuthMessage("");
                }}
                className={`rounded-xl py-3 text-base font-semibold transition ${
                  authMode === "signup"
                    ? "bg-cyan-400 text-slate-950 shadow-lg"
                    : "bg-transparent text-white hover:bg-white/10"
                }`}
              >
                Sign Up
              </button>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="Enter email address"
                  className={inputClass}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Password
                </label>
                <input
                  type="password"
                  placeholder="Enter password"
                  className={inputClass}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {authMessage && (
                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-200">
                  {authMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-3 font-semibold text-slate-950 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading
                  ? "Please wait..."
                  : authMode === "login"
                  ? "Login to System"
                  : "Create Account"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_25%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.14),_transparent_22%),linear-gradient(160deg,#020617_0%,#0f172a_42%,#111827_100%)] text-white">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="w-full border-b border-white/10 bg-slate-950/60 px-4 py-5 backdrop-blur-xl lg:w-80 lg:border-b-0 lg:border-r">
          <div className="mb-6 px-2">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300/80">
              {branding.platformName || "MTEC"}
            </p>
            <h1 className="mt-3 text-3xl font-bold text-white">
              {branding.clientName || "Tumul Legal"}
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Legal Management System
            </p>
          </div>

          <div className={`${glassCard} mb-6 p-3`}>
            <nav className="space-y-2">
              <NavButton id="dashboard" label="Dashboard" icon="◫" />
              <NavButton id="docket" label="Case Docket" icon="⚖" />
              <NavButton id="clients" label="Clients" icon="👥" />
              <NavButton id="billing" label="Billing" icon="🧾" />
              <NavButton id="reports" label="Reports" icon="📊" />
            </nav>
          </div>

          <div className={`${glassCard} p-5`}>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Firm Snapshot
            </p>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Active Matters</span>
                <span className="text-sm font-bold text-white">{openMatters}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Urgent Matters</span>
                <span className="text-sm font-bold text-white">
                  {urgentMatters}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Clients</span>
                <span className="text-sm font-bold text-white">
                  {totalClients}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Outstanding</span>
                <span className="text-sm font-bold text-cyan-300">
                  {currency(outstandingValue)}
                </span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="mt-6 w-full rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15"
            >
              Logout
            </button>
          </div>
        </aside>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className={`${glassCard} mb-6 overflow-hidden`}>
            <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-medium text-cyan-300/80">
                  Welcome to {branding.clientName || "Tumul Legal"}
                </p>
                <h2 className="mt-1 text-3xl font-bold text-white">
                  Legal Operations Control Panel
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-400">
                  Real database-backed legal management dashboard.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Matters
                  </p>
                  <p className="mt-2 text-xl font-bold text-white">
                    {totalMatters}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Court Dates
                  </p>
                  <p className="mt-2 text-xl font-bold text-white">
                    {upcomingCourtDates}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Clients
                  </p>
                  <p className="mt-2 text-xl font-bold text-white">
                    {totalClients}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Today
                  </p>
                  <p className="mt-2 text-sm font-bold text-white">
                    {new Date().toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {activeTab === "dashboard" && (
            <div className="space-y-6">
              <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Total Matters"
                  value={totalMatters}
                  subtext="All legal files in database"
                />
                <StatCard
                  label="Active Clients"
                  value={totalClients}
                  subtext="Client records saved online"
                />
                <StatCard
                  label="Outstanding Billing"
                  value={currency(outstandingValue)}
                  subtext="Unpaid and part paid invoices"
                />
                <StatCard
                  label="Collected Value"
                  value={currency(collectedValue)}
                  subtext="Invoices marked as paid"
                />
              </section>

              <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className={`${glassCard} p-5 xl:col-span-2`}>
                  <div className="mb-4">
                    <h3 className={sectionTitle}>Recent Matters</h3>
                    <p className={muted}>Saved legal docket records</p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10 text-left text-slate-400">
                          <th className="px-3 py-3">Matter</th>
                          <th className="px-3 py-3">Client</th>
                          <th className="px-3 py-3">Case Type</th>
                          <th className="px-3 py-3">Status</th>
                          <th className="px-3 py-3">Court Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matters.slice(0, 6).map((matter) => (
                          <tr
                            key={matter.id}
                            className="border-b border-white/5 text-slate-200"
                          >
                            <td className="px-3 py-4 font-semibold">
                              {matter.matter_no}
                            </td>
                            <td className="px-3 py-4">{matter.client_name}</td>
                            <td className="px-3 py-4">{matter.case_type}</td>
                            <td className="px-3 py-4">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
                                  matter.status
                                )}`}
                              >
                                {matter.status}
                              </span>
                            </td>
                            <td className="px-3 py-4">
                              {matter.court_date || "Not set"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className={`${glassCard} p-5`}>
                  <div className="mb-4">
                    <h3 className={sectionTitle}>Matter Status Summary</h3>
                    <p className={muted}>Live data from database</p>
                  </div>
                  <div className="space-y-3">
                    {matterStatusSummary.map((item) => (
                      <div
                        key={item.status}
                        className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                      >
                        <span className="text-sm text-slate-200">
                          {item.status}
                        </span>
                        <span className="text-base font-bold text-white">
                          {item.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === "docket" && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className={`${glassCard} p-5`}>
                <div className="mb-4">
                  <h3 className={sectionTitle}>Add New Matter</h3>
                  <p className={muted}>Save matter to database</p>
                </div>

                <div className="space-y-3">
                  <input
                    value={matterForm.matter_no}
                    onChange={(e) =>
                      setMatterForm({
                        ...matterForm,
                        matter_no: e.target.value,
                      })
                    }
                    placeholder="Matter Number"
                    className={inputClass}
                  />
                  <input
                    value={matterForm.client_name}
                    onChange={(e) =>
                      setMatterForm({
                        ...matterForm,
                        client_name: e.target.value,
                      })
                    }
                    placeholder="Client Name"
                    className={inputClass}
                  />
                  <input
                    value={matterForm.case_type}
                    onChange={(e) =>
                      setMatterForm({
                        ...matterForm,
                        case_type: e.target.value,
                      })
                    }
                    placeholder="Case Type"
                    className={inputClass}
                  />
                  <select
                    value={matterForm.status}
                    onChange={(e) =>
                      setMatterForm({
                        ...matterForm,
                        status: e.target.value as MatterStatus,
                      })
                    }
                    className={inputClass}
                  >
                    <option className="bg-slate-900">Open</option>
                    <option className="bg-slate-900">In Progress</option>
                    <option className="bg-slate-900">Pending Filing</option>
                    <option className="bg-slate-900">In Court</option>
                    <option className="bg-slate-900">Awaiting Client</option>
                    <option className="bg-slate-900">Closed</option>
                  </select>
                  <input
                    value={matterForm.next_step}
                    onChange={(e) =>
                      setMatterForm({
                        ...matterForm,
                        next_step: e.target.value,
                      })
                    }
                    placeholder="Next Legal Step"
                    className={inputClass}
                  />
                  <input
                    value={matterForm.assigned_lawyer}
                    onChange={(e) =>
                      setMatterForm({
                        ...matterForm,
                        assigned_lawyer: e.target.value,
                      })
                    }
                    placeholder="Assigned Lawyer"
                    className={inputClass}
                  />
                  <input
                    type="date"
                    value={matterForm.court_date}
                    onChange={(e) =>
                      setMatterForm({
                        ...matterForm,
                        court_date: e.target.value,
                      })
                    }
                    className={inputClass}
                  />
                  <input
                    type="number"
                    value={matterForm.cost_estimate}
                    onChange={(e) =>
                      setMatterForm({
                        ...matterForm,
                        cost_estimate: e.target.value,
                      })
                    }
                    placeholder="Estimated Legal Cost"
                    className={inputClass}
                  />
                  <select
                    value={matterForm.priority}
                    onChange={(e) =>
                      setMatterForm({
                        ...matterForm,
                        priority: e.target.value as Priority,
                      })
                    }
                    className={inputClass}
                  >
                    <option className="bg-slate-900">High</option>
                    <option className="bg-slate-900">Medium</option>
                    <option className="bg-slate-900">Low</option>
                  </select>
                  <button
                    onClick={handleAddMatter}
                    className="w-full rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-3 font-semibold text-slate-950"
                  >
                    Save Matter
                  </button>
                </div>
              </div>

              <div className={`${glassCard} p-5 xl:col-span-2`}>
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className={sectionTitle}>Digital Case Docket</h3>
                    <p className={muted}>Search legal matters</p>
                  </div>
                  <input
                    value={matterSearch}
                    onChange={(e) => setMatterSearch(e.target.value)}
                    placeholder="Search matter, client, lawyer, case type..."
                    className={`${inputClass} lg:max-w-md`}
                  />
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-slate-400">
                        <th className="px-3 py-3">Matter</th>
                        <th className="px-3 py-3">Client</th>
                        <th className="px-3 py-3">Case Type</th>
                        <th className="px-3 py-3">Lawyer</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3">Priority</th>
                        <th className="px-3 py-3">Court Date</th>
                        <th className="px-3 py-3">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMatters.map((matter) => (
                        <tr
                          key={matter.id}
                          className="border-b border-white/5 text-slate-200"
                        >
                          <td className="px-3 py-4">
                            <div className="font-semibold text-white">
                              {matter.matter_no}
                            </div>
                            <div className="mt-1 text-xs text-slate-400">
                              {matter.next_step || "No next step yet"}
                            </div>
                          </td>
                          <td className="px-3 py-4">{matter.client_name}</td>
                          <td className="px-3 py-4">{matter.case_type}</td>
                          <td className="px-3 py-4">
                            {matter.assigned_lawyer}
                          </td>
                          <td className="px-3 py-4">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
                                matter.status
                              )}`}
                            >
                              {matter.status}
                            </span>
                          </td>
                          <td className="px-3 py-4">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getPriorityClass(
                                matter.priority
                              )}`}
                            >
                              {matter.priority}
                            </span>
                          </td>
                          <td className="px-3 py-4">
                            {matter.court_date || "Not set"}
                          </td>
                          <td className="px-3 py-4 font-semibold text-white">
                            {currency(Number(matter.cost_estimate || 0))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === "clients" && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className={`${glassCard} p-5`}>
                <div className="mb-4">
                  <h3 className={sectionTitle}>Add New Client</h3>
                  <p className={muted}>Save client to database</p>
                </div>

                <div className="space-y-3">
                  <input
                    value={clientForm.name}
                    onChange={(e) =>
                      setClientForm({ ...clientForm, name: e.target.value })
                    }
                    placeholder="Full Name / Business Name"
                    className={inputClass}
                  />
                  <input
                    value={clientForm.phone}
                    onChange={(e) =>
                      setClientForm({ ...clientForm, phone: e.target.value })
                    }
                    placeholder="Phone Number"
                    className={inputClass}
                  />
                  <input
                    value={clientForm.email}
                    onChange={(e) =>
                      setClientForm({ ...clientForm, email: e.target.value })
                    }
                    placeholder="Email Address"
                    className={inputClass}
                  />
                  <input
                    value={clientForm.address}
                    onChange={(e) =>
                      setClientForm({ ...clientForm, address: e.target.value })
                    }
                    placeholder="Address"
                    className={inputClass}
                  />
                  <select
                    value={clientForm.source}
                    onChange={(e) =>
                      setClientForm({ ...clientForm, source: e.target.value })
                    }
                    className={inputClass}
                  >
                    <option className="bg-slate-900">Referral</option>
                    <option className="bg-slate-900">Friend</option>
                    <option className="bg-slate-900">Family</option>
                    <option className="bg-slate-900">Colleague</option>
                    <option className="bg-slate-900">Website</option>
                    <option className="bg-slate-900">Walk In</option>
                  </select>
                  <button
                    onClick={handleAddClient}
                    className="w-full rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-3 font-semibold text-slate-950"
                  >
                    Save Client
                  </button>
                </div>
              </div>

              <div className={`${glassCard} p-5 xl:col-span-2`}>
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className={sectionTitle}>Client Management</h3>
                    <p className={muted}>Saved client profiles</p>
                  </div>
                  <input
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="Search client, phone, email..."
                    className={`${inputClass} lg:max-w-md`}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {filteredClients.map((client) => (
                    <div
                      key={client.id}
                      className="rounded-3xl border border-white/10 bg-white/5 p-5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-lg font-bold text-white">
                            {client.name}
                          </h4>
                          <p className="mt-1 text-sm text-slate-400">
                            {client.phone}
                          </p>
                          <p className="text-sm text-slate-400">
                            {client.email}
                          </p>
                        </div>
                        <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-200">
                          {client.source}
                        </span>
                      </div>

                      <div className="mt-4 space-y-2 text-sm text-slate-300">
                        <p>
                          <span className="font-semibold text-white">
                            Address:
                          </span>{" "}
                          {client.address || "Not set"}
                        </p>
                        <p>
                          <span className="font-semibold text-white">
                            Matters:
                          </span>{" "}
                          {client.matter_count}
                        </p>
                        <p>
                          <span className="font-semibold text-white">
                            Last Contact:
                          </span>{" "}
                          {client.last_contact}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "billing" && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className={`${glassCard} p-5`}>
                <div className="mb-4">
                  <h3 className={sectionTitle}>Create Invoice</h3>
                  <p className={muted}>Save invoice to database</p>
                </div>

                <div className="space-y-3">
                  <input
                    value={invoiceForm.invoice_no}
                    onChange={(e) =>
                      setInvoiceForm({
                        ...invoiceForm,
                        invoice_no: e.target.value,
                      })
                    }
                    placeholder="Invoice Number"
                    className={inputClass}
                  />
                  <input
                    value={invoiceForm.client_name}
                    onChange={(e) =>
                      setInvoiceForm({
                        ...invoiceForm,
                        client_name: e.target.value,
                      })
                    }
                    placeholder="Client Name"
                    className={inputClass}
                  />
                  <input
                    value={invoiceForm.matter_no}
                    onChange={(e) =>
                      setInvoiceForm({
                        ...invoiceForm,
                        matter_no: e.target.value,
                      })
                    }
                    placeholder="Matter Number"
                    className={inputClass}
                  />
                  <input
                    type="number"
                    value={invoiceForm.amount}
                    onChange={(e) =>
                      setInvoiceForm({
                        ...invoiceForm,
                        amount: e.target.value,
                      })
                    }
                    placeholder="Amount"
                    className={inputClass}
                  />
                  <select
                    value={invoiceForm.status}
                    onChange={(e) =>
                      setInvoiceForm({
                        ...invoiceForm,
                        status: e.target.value as
                          | "Paid"
                          | "Unpaid"
                          | "Part Paid",
                      })
                    }
                    className={inputClass}
                  >
                    <option className="bg-slate-900">Unpaid</option>
                    <option className="bg-slate-900">Part Paid</option>
                    <option className="bg-slate-900">Paid</option>
                  </select>
                  <input
                    type="date"
                    value={invoiceForm.issued_date}
                    onChange={(e) =>
                      setInvoiceForm({
                        ...invoiceForm,
                        issued_date: e.target.value,
                      })
                    }
                    className={inputClass}
                  />
                  <input
                    type="date"
                    value={invoiceForm.due_date}
                    onChange={(e) =>
                      setInvoiceForm({
                        ...invoiceForm,
                        due_date: e.target.value,
                      })
                    }
                    className={inputClass}
                  />
                  <button
                    onClick={handleAddInvoice}
                    className="w-full rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-3 font-semibold text-slate-950"
                  >
                    Save Invoice
                  </button>
                </div>
              </div>

              <div className={`${glassCard} p-5 xl:col-span-2`}>
                <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className={sectionTitle}>Invoice & Billing Tracker</h3>
                    <p className={muted}>Saved financial records</p>
                  </div>
                  <input
                    value={invoiceSearch}
                    onChange={(e) => setInvoiceSearch(e.target.value)}
                    placeholder="Search invoice, client, matter..."
                    className={`${inputClass} lg:max-w-md`}
                  />
                </div>

                <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm text-slate-400">Total Billing</p>
                    <h4 className="mt-2 text-2xl font-bold text-white">
                      {currency(totalInvoiceValue)}
                    </h4>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm text-slate-400">Outstanding</p>
                    <h4 className="mt-2 text-2xl font-bold text-cyan-300">
                      {currency(outstandingValue)}
                    </h4>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm text-slate-400">Paid Invoices</p>
                    <h4 className="mt-2 text-2xl font-bold text-white">
                      {
                        invoices.filter((invoice) => invoice.status === "Paid")
                          .length
                      }
                    </h4>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-slate-400">
                        <th className="px-3 py-3">Invoice No</th>
                        <th className="px-3 py-3">Client</th>
                        <th className="px-3 py-3">Matter</th>
                        <th className="px-3 py-3">Issued</th>
                        <th className="px-3 py-3">Due</th>
                        <th className="px-3 py-3">Amount</th>
                        <th className="px-3 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvoices.map((invoice) => (
                        <tr
                          key={invoice.id}
                          className="border-b border-white/5 text-slate-200"
                        >
                          <td className="px-3 py-4 font-semibold text-white">
                            {invoice.invoice_no}
                          </td>
                          <td className="px-3 py-4">{invoice.client_name}</td>
                          <td className="px-3 py-4">{invoice.matter_no}</td>
                          <td className="px-3 py-4">
                            {invoice.issued_date || "Not set"}
                          </td>
                          <td className="px-3 py-4">
                            {invoice.due_date || "Not set"}
                          </td>
                          <td className="px-3 py-4 font-semibold text-white">
                            {currency(Number(invoice.amount || 0))}
                          </td>
                          <td className="px-3 py-4">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
                                invoice.status
                              )}`}
                            >
                              {invoice.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === "reports" && (
            <div className="space-y-6">
              <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Open Matters"
                  value={openMatters}
                  subtext="Still active in workflow"
                />
                <StatCard
                  label="Closed Matters"
                  value={
                    matters.filter((matter) => matter.status === "Closed").length
                  }
                  subtext="Completed matters"
                />
                <StatCard
                  label="Unpaid Invoices"
                  value={
                    invoices.filter((invoice) => invoice.status === "Unpaid")
                      .length
                  }
                  subtext="Awaiting payment"
                />
                <StatCard
                  label="Part Paid"
                  value={
                    invoices.filter((invoice) => invoice.status === "Part Paid")
                      .length
                  }
                  subtext="Need follow-up"
                />
              </section>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className={`${glassCard} p-5`}>
                  <div className="mb-4">
                    <h3 className={sectionTitle}>Matter Status Report</h3>
                    <p className={muted}>Database reporting</p>
                  </div>
                  <div className="space-y-3">
                    {matterStatusSummary.map((item) => (
                      <div
                        key={item.status}
                        className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                      >
                        <span className="text-slate-200">{item.status}</span>
                        <span className="text-lg font-bold text-white">
                          {item.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={`${glassCard} p-5`}>
                  <div className="mb-4">
                    <h3 className={sectionTitle}>Client Intake Sources</h3>
                    <p className={muted}>Lead source distribution</p>
                  </div>
                  <div className="space-y-3">
                    {intakeSummary.map((item) => (
                      <div
                        key={item.source}
                        className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                      >
                        <span className="text-slate-200">{item.source}</span>
                        <span className="text-lg font-bold text-white">
                          {item.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className={`${glassCard} p-5`}>
                <div className="mb-4">
                  <h3 className={sectionTitle}>Financial Summary</h3>
                  <p className={muted}>Billing overview</p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                    <p className="text-sm text-slate-400">Total Invoiced</p>
                    <h4 className="mt-2 text-2xl font-bold text-white">
                      {currency(totalInvoiceValue)}
                    </h4>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                    <p className="text-sm text-slate-400">Outstanding Value</p>
                    <h4 className="mt-2 text-2xl font-bold text-cyan-300">
                      {currency(outstandingValue)}
                    </h4>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                    <p className="text-sm text-slate-400">Collected Value</p>
                    <h4 className="mt-2 text-2xl font-bold text-white">
                      {currency(collectedValue)}
                    </h4>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}