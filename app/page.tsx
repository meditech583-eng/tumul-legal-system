"use client";

import { branding } from "./config/branding";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabase/client";

type Tab =
  | "dashboard"
  | "docket"
  | "clients"
  | "billing"
  | "reports"
  | "users"
  | "activity";

type MatterStatus =
  | "Open"
  | "In Progress"
  | "Pending Filing"
  | "In Court"
  | "Awaiting Client"
  | "Closed";
  

type Priority = "High" | "Medium" | "Low";
type InvoiceStatus = "Paid" | "Unpaid" | "Part Paid";
type AuthMode = "login" | "signup";
type UserRole =
  | "Super Admin"
  | "Lawyer"
  | "Secretary"
  | "Billing"
  | "Viewer";

type Matter = {
  id: number;
  matter_no: string;
  client_name: string;
  case_type: string;
  status: MatterStatus;
  next_step: string;
  summary: string;
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
  status: InvoiceStatus;
  due_date: string;
  issued_date: string;
};

type StaffUser = {
  id?: number;
  full_name: string;
  email: string;
  role: UserRole;
  is_active?: boolean;
  created_at?: string;
  created_by?: string;
};

type ActivityItem = {
  id: string;
  time: string;
  actor: string;
  role: UserRole;
  action: string;
  module: string;
};


type MatterDeadline = {
  id: number;
  matter_id: number;
  title: string;
  deadline_date: string;
  notes: string | null;
  is_completed: boolean;
  created_at?: string;
};

const currency = (value: number) =>
  new Intl.NumberFormat("en-PG", {
    style: "currency",
    currency: "PGK",
    maximumFractionDigits: 2,
  }).format(value || 0);

const getRolePermissions = (role: UserRole) => {
  switch (role) {
    case "Super Admin":
      return {
        dashboard: true,
        docket: true,
        clients: true,
        billing: true,
        reports: true,
        users: true,
        activity: true,
        addMatter: true,
        addClient: true,
        addInvoice: true,
        exportData: true,
        printData: true,
        seeFinancials: true,
      };
    case "Lawyer":
      return {
        dashboard: true,
        docket: true,
        clients: true,
        billing: false,
        reports: true,
        users: false,
        activity: true,
        addMatter: true,
        addClient: false,
        addInvoice: false,
        exportData: true,
        printData: true,
        seeFinancials: false,
      };
    case "Secretary":
      return {
        dashboard: true,
        docket: true,
        clients: true,
        billing: false,
        reports: false,
        users: false,
        activity: false,
        addMatter: true,
        addClient: true,
        addInvoice: false,
        exportData: true,
        printData: true,
        seeFinancials: false,
      };
    case "Billing":
      return {
        dashboard: true,
        docket: false,
        clients: true,
        billing: true,
        reports: true,
        users: false,
        activity: true,
        addMatter: false,
        addClient: false,
        addInvoice: true,
        exportData: true,
        printData: true,
        seeFinancials: true,
      };
    case "Viewer":
    default:
      return {
        dashboard: true,
        docket: false,
        clients: true,
        billing: false,
        reports: false,
        users: false,
        activity: false,
        addMatter: false,
        addClient: false,
        addInvoice: false,
        exportData: false,
        printData: true,
        seeFinancials: false,
      };
  }
};

const toCsv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return "";

  const headers = Object.keys(rows[0]);

  const escapeCell = (value: unknown) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;

  const csvRows = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => escapeCell(row[header])).join(",")
    ),
  ];

  return csvRows.join("\n");
};

const downloadCsv = (filename: string, rows: Record<string, unknown>[]) => {
  const csv = toCsv(rows);
  if (!csv) {
    alert("No data available to export.");
    return;
  }

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const sectionToTab = (sectionName: string): Tab => {
  const name = sectionName.toLowerCase();
  if (name.includes("docket") || name.includes("matter")) return "docket";
  if (name.includes("client")) return "clients";
  if (name.includes("bill") || name.includes("invoice")) return "billing";
  if (name.includes("report")) return "reports";
  if (name.includes("user")) return "users";
  if (name.includes("activity")) return "activity";
  return "dashboard";
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function TumulLegalV4() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");

  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [printSection, setPrintSection] = useState<Tab | null>(null);
  const printTimerRef = useRef<number | null>(null);

  const [matters, setMatters] = useState<Matter[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityItem[]>([]);

  const [matterSearch, setMatterSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");

  const [matterForm, setMatterForm] = useState({
    matter_no: "",
    client_name: "",
    case_type: "",
    status: "Open" as MatterStatus,
    next_step: "",
    summary: "",
    assigned_lawyer: "",
    court_date: "",
    cost_estimate: "",
    priority: "Medium" as Priority,
  });
  const [selectedMatter, setSelectedMatter] = useState<Matter | null>(null);
  const [isMatterPanelOpen, setIsMatterPanelOpen] = useState(false);
  const [isSavingMatter, setIsSavingMatter] = useState(false);

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
    status: "Unpaid" as InvoiceStatus,
    due_date: "",
    issued_date: "",
  });

  const [staffForm, setStaffForm] = useState({
    full_name: "",
    email: "",
    role: "Viewer" as UserRole,
  });


  const [deadlines, setDeadlines] = useState<MatterDeadline[]>([]);
  const [matterDeadlines, setMatterDeadlines] = useState<MatterDeadline[]>([]);
  const [deadlineForm, setDeadlineForm] = useState({
    title: "",
    deadline_date: "",
    notes: "",
  });
  const [isSavingDeadline, setIsSavingDeadline] = useState(false);

  useEffect(() => {
    const savedTab = localStorage.getItem("activeTab");
    if (savedTab) setActiveTab(savedTab as Tab);

    const savedActivity = localStorage.getItem("tumul_activity_log");
    if (savedActivity) {
      try {
        setActivityLog(JSON.parse(savedActivity));
      } catch {
        setActivityLog([]);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("activeTab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem("tumul_activity_log", JSON.stringify(activityLog));
  }, [activityLog]);

  const normalizeDateOnly = (value?: string | null) => {
    if (!value) return "";
    return value.slice(0, 10);
  };

  const getTodayDateOnly = () => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  };

  const getDeadlineState = (deadline: MatterDeadline) => {
    if (deadline.is_completed) return "Completed";

    const today = getTodayDateOnly();
    const diffMs =
      new Date(normalizeDateOnly(deadline.deadline_date)).getTime() -
      new Date(today).getTime();

    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return "Overdue";
    if (diffDays <= 3) return "Urgent";
    return "Upcoming";
  };

  const getDeadlineBadgeClass = (state: string) => {
    switch (state) {
      case "Overdue":
        return "bg-rose-400/15 text-rose-200 border border-rose-400/30";
      case "Urgent":
        return "bg-orange-400/15 text-orange-200 border border-orange-400/30";
      case "Completed":
        return "bg-emerald-400/15 text-emerald-200 border border-emerald-400/30";
      case "Upcoming":
      default:
        return "bg-sky-400/15 text-sky-200 border border-sky-400/30";
    }
  };

  const currentEmail = session?.user?.email?.toLowerCase?.() || "";

  const currentUserProfile = useMemo(() => {
    const matched = staffUsers.find(
      (staff) =>
        staff.email.toLowerCase() === currentEmail &&
        staff.is_active !== false
    );

    if (matched) {
      return {
        name: matched.full_name,
        email: matched.email,
        role: matched.role,
      };
    }

    return {
      name: session?.user?.email || "Unknown User",
      email: session?.user?.email || "",
      role: "Viewer" as UserRole,
    };
  }, [currentEmail, session, staffUsers]);

  const permissions = useMemo(
    () => getRolePermissions(currentUserProfile.role),
    [currentUserProfile.role]
  );

  const loadAllData = async () => {
    setLoading(true);

    const [mattersRes, clientsRes, invoicesRes, staffRes, deadlinesRes] =
      await Promise.all([
        supabase.from("matters").select("*").order("id", { ascending: false }),
        supabase.from("clients").select("*").order("id", { ascending: false }),
        supabase.from("invoices").select("*").order("id", { ascending: false }),
        supabase
          .from("staff_users")
          .select("*")
          .order("full_name", { ascending: true }),
        supabase
          .from("matter_deadlines")
          .select("*")
          .order("deadline_date", { ascending: true }),
      ]);

    if (!mattersRes.error) setMatters((mattersRes.data as Matter[]) || []);
    if (!clientsRes.error) setClients((clientsRes.data as Client[]) || []);
    if (!invoicesRes.error) setInvoices((invoicesRes.data as Invoice[]) || []);
    if (!staffRes.error) setStaffUsers((staffRes.data as StaffUser[]) || []);
    if (!deadlinesRes.error) {
      setDeadlines((deadlinesRes.data as MatterDeadline[]) || []);
    }

    setLoading(false);
  };

  const loadStaffUsers = async () => {
    const { data, error } = await supabase
      .from("staff_users")
      .select("*")
      .order("full_name", { ascending: true });

    if (!error) {
      setStaffUsers((data as StaffUser[]) || []);
    }
  };


  const loadDeadlines = async () => {
    const { data, error } = await supabase
      .from("matter_deadlines")
      .select("*")
      .order("deadline_date", { ascending: true });

    if (!error) {
      setDeadlines((data as MatterDeadline[]) || []);
    }
  };

  const loadDeadlinesForMatter = async (matterId: number) => {
    const { data, error } = await supabase
      .from("matter_deadlines")
      .select("*")
      .eq("matter_id", matterId)
      .order("deadline_date", { ascending: true });

    if (!error) {
      setMatterDeadlines((data as MatterDeadline[]) || []);
    }
  };

  const logActivity = (
    action: string,
    module: string,
    actorName?: string,
    actorRole?: UserRole
  ) => {
    const newEntry: ActivityItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      time: new Date().toLocaleString(),
      actor: actorName || currentUserProfile.name,
      role: actorRole || currentUserProfile.role,
      action,
      module,
    };

    setActivityLog((prev) => [newEntry, ...prev].slice(0, 200));
  };

  useEffect(() => {
    const getSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setSession(session);

      if (session) {
        await loadAllData();
      } else {
        setLoading(false);
      }
    };

    getSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event: string, nextSession: any) => {
      setSession(nextSession);

      if (nextSession) {
        await loadAllData();
      } else {
        setMatters([]);
        setClients([]);
        setInvoices([]);
        setStaffUsers([]);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user?.email || staffUsers.length === 0) return;

    const matched = staffUsers.find(
      (staff) => staff.email.toLowerCase() === session.user.email.toLowerCase()
    );

    if (matched && matched.is_active === false) {
      supabase.auth.signOut();
      alert("Your account has been deactivated. Please contact the administrator.");
    }
  }, [session, staffUsers]);

  useEffect(() => {
    if (!session) return;
    if (activeTab === "docket" && !permissions.docket) setActiveTab("dashboard");
    if (activeTab === "clients" && !permissions.clients) setActiveTab("dashboard");
    if (activeTab === "billing" && !permissions.billing) setActiveTab("dashboard");
    if (activeTab === "reports" && !permissions.reports) setActiveTab("dashboard");
    if (activeTab === "users" && !permissions.users) setActiveTab("dashboard");
    if (activeTab === "activity" && !permissions.activity) setActiveTab("dashboard");
  }, [activeTab, permissions, session]);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove("printing-active");
      setPrintSection(null);
    };

    window.addEventListener("afterprint", handleAfterPrint);

    return () => {
      window.removeEventListener("afterprint", handleAfterPrint);
      if (printTimerRef.current) window.clearTimeout(printTimerRef.current);
    };
  }, []);

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
    logActivity("Logged out of system", "Authentication");
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


  const overdueDeadlines = deadlines.filter(
    (deadline) => getDeadlineState(deadline) === "Overdue"
  ).length;

  const urgentDeadlines = deadlines.filter(
    (deadline) => getDeadlineState(deadline) === "Urgent"
  ).length;

  const upcomingDeadlineItems = deadlines
    .filter((deadline) => {
      const state = getDeadlineState(deadline);
      return state === "Overdue" || state === "Urgent" || state === "Upcoming";
    })
    .slice()
    .sort((a, b) =>
      normalizeDateOnly(a.deadline_date).localeCompare(normalizeDateOnly(b.deadline_date))
    )
    .slice(0, 5)
    .map((deadline) => {
      const matter = matters.find((item) => item.id === deadline.matter_id);
      return {
        ...deadline,
        state: getDeadlineState(deadline),
        matter_no: matter?.matter_no || `Matter #${deadline.matter_id}`,
        client_name: matter?.client_name || "Unknown Client",
      };
    });

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


  const canEditMatterDetails =
    currentUserProfile.role === "Super Admin" ||
    currentUserProfile.role === "Lawyer" ||
    currentUserProfile.role === "Secretary";

  const openMatterFile = async (matter: Matter) => {
    setSelectedMatter({
      ...matter,
      summary: matter.summary || "",
      next_step: matter.next_step || "",
      court_date: matter.court_date || "",
      cost_estimate: Number(matter.cost_estimate || 0),
    });
    setIsMatterPanelOpen(true);
    setDeadlineForm({
      title: "",
      deadline_date: "",
      notes: "",
    });
    await loadDeadlinesForMatter(matter.id);
  };

  const closeMatterFile = () => {
    setSelectedMatter(null);
    setIsMatterPanelOpen(false);
    setMatterDeadlines([]);
    setDeadlineForm({
      title: "",
      deadline_date: "",
      notes: "",
    });
  };

  function updateSelectedMatterField<K extends keyof Matter>(
    field: K,
    value: Matter[K]
  ) {
    setSelectedMatter((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  const handleSaveMatterDetails = async () => {
    if (!selectedMatter) return;

    if (!canEditMatterDetails) {
      alert("You do not have permission to edit case files.");
      return;
    }

    setIsSavingMatter(true);

    const payload = {
      matter_no: selectedMatter.matter_no,
      client_name: selectedMatter.client_name,
      case_type: selectedMatter.case_type,
      status: selectedMatter.status,
      next_step: selectedMatter.next_step,
      summary: selectedMatter.summary,
      assigned_lawyer: selectedMatter.assigned_lawyer,
      court_date: selectedMatter.court_date || null,
      cost_estimate: Number(selectedMatter.cost_estimate || 0),
      priority: selectedMatter.priority,
    };

    const { error } = await supabase
      .from("matters")
      .update(payload)
      .eq("id", selectedMatter.id);

    setIsSavingMatter(false);

    if (error) {
      alert(error.message);
      return;
    }

    setMatters((prev) =>
      prev.map((matter) =>
        matter.id === selectedMatter.id
          ? {
              ...matter,
              ...payload,
              court_date: selectedMatter.court_date || "",
            }
          : matter
      )
    );

    logActivity(`Updated matter file ${selectedMatter.matter_no}`, "Case Docket");
    alert("Case file updated successfully.");
  };


  const handleAddDeadline = async () => {
    if (!selectedMatter) {
      alert("Open a matter first.");
      return;
    }

    if (!canEditMatterDetails) {
      alert("You do not have permission to add deadlines.");
      return;
    }

    if (!deadlineForm.title || !deadlineForm.deadline_date) {
      alert("Please enter deadline title and date.");
      return;
    }

    setIsSavingDeadline(true);

    const payload = {
      matter_id: selectedMatter.id,
      title: deadlineForm.title,
      deadline_date: deadlineForm.deadline_date,
      notes: deadlineForm.notes || null,
      is_completed: false,
    };

    const { error } = await supabase.from("matter_deadlines").insert(payload);

    setIsSavingDeadline(false);

    if (error) {
      alert(error.message);
      return;
    }

    logActivity(
      `Added deadline "${deadlineForm.title}" to ${selectedMatter.matter_no}`,
      "Deadlines"
    );

    setDeadlineForm({
      title: "",
      deadline_date: "",
      notes: "",
    });

    await loadDeadlines();
    await loadDeadlinesForMatter(selectedMatter.id);
  };

  const handleToggleDeadlineComplete = async (deadline: MatterDeadline) => {
    if (!canEditMatterDetails) {
      alert("You do not have permission to update deadlines.");
      return;
    }

    const { error } = await supabase
      .from("matter_deadlines")
      .update({ is_completed: !deadline.is_completed })
      .eq("id", deadline.id);

    if (error) {
      alert(error.message);
      return;
    }

    logActivity(
      `${deadline.is_completed ? "Re-opened" : "Completed"} deadline "${deadline.title}"`,
      "Deadlines"
    );

    await loadDeadlines();
    if (selectedMatter) {
      await loadDeadlinesForMatter(selectedMatter.id);
    }
  };

  const handleDeleteDeadline = async (deadline: MatterDeadline) => {
    if (!canEditMatterDetails) {
      alert("You do not have permission to delete deadlines.");
      return;
    }

    const confirmed = window.confirm(`Delete deadline "${deadline.title}"?`);
    if (!confirmed) return;

    const { error } = await supabase
      .from("matter_deadlines")
      .delete()
      .eq("id", deadline.id);

    if (error) {
      alert(error.message);
      return;
    }

    logActivity(`Deleted deadline "${deadline.title}"`, "Deadlines");

    await loadDeadlines();
    if (selectedMatter) {
      await loadDeadlinesForMatter(selectedMatter.id);
    }
  };

  const handleAddMatter = async () => {
    if (!permissions.addMatter) {
      alert("You do not have permission to add matters.");
      return;
    }

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
      summary: matterForm.summary,
      assigned_lawyer: matterForm.assigned_lawyer,
      court_date: matterForm.court_date || null,
      cost_estimate: Number(matterForm.cost_estimate || 0),
      priority: matterForm.priority,
    });

    if (error) {
      alert(error.message);
      return;
    }

    logActivity(`Created matter ${matterForm.matter_no}`, "Case Docket");

    setMatterForm({
      matter_no: "",
      client_name: "",
      case_type: "",
      status: "Open",
      next_step: "",
      summary: "",
      assigned_lawyer: "",
      court_date: "",
      cost_estimate: "",
      priority: "Medium",
    });

    await loadAllData();
  };

  const handleAddClient = async () => {
    if (!permissions.addClient) {
      alert("You do not have permission to add clients.");
      return;
    }

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

    logActivity(`Created client ${clientForm.name}`, "Clients");

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
    if (!permissions.addInvoice) {
      alert("You do not have permission to create invoices.");
      return;
    }

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

    logActivity(`Created invoice ${invoiceForm.invoice_no}`, "Billing");

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

  const handleAddStaffUser = async () => {
    if (currentUserProfile.role !== "Super Admin") {
      alert("Only Super Admin can add users.");
      return;
    }

    if (!staffForm.full_name || !staffForm.email || !staffForm.role) {
      alert("Please fill in full name, email and role.");
      return;
    }

    const { error } = await supabase.from("staff_users").insert({
      full_name: staffForm.full_name,
      email: staffForm.email.toLowerCase(),
      role: staffForm.role,
      is_active: true,
      created_by: currentUserProfile.email,
    });

    if (error) {
      alert(error.message);
      return;
    }

    logActivity(`Added staff user ${staffForm.full_name}`, "Users");

    setStaffForm({
      full_name: "",
      email: "",
      role: "Viewer",
    });

    await loadStaffUsers();
  };

  const handleToggleStaffStatus = async (user: StaffUser) => {
    if (currentUserProfile.role !== "Super Admin") {
      alert("Only Super Admin can manage users.");
      return;
    }

    if (user.email.toLowerCase() === "mek@tumullegal.com") {
      alert("Super Admin account cannot be deactivated here.");
      return;
    }

    const { error } = await supabase
      .from("staff_users")
      .update({ is_active: !(user.is_active !== false) })
      .eq("email", user.email);

    if (error) {
      alert(error.message);
      return;
    }

    logActivity(
      `${user.is_active !== false ? "Deactivated" : "Activated"} user ${user.full_name}`,
      "Users"
    );

    await loadStaffUsers();
  };

  const handleDeleteStaffUser = async (user: StaffUser) => {
    if (currentUserProfile.role !== "Super Admin") {
      alert("Only Super Admin can delete users.");
      return;
    }

    if (user.email.toLowerCase() === "mek@tumullegal.com") {
      alert("Super Admin account cannot be deleted here.");
      return;
    }

    const confirmed = window.confirm(`Delete ${user.full_name}?`);
    if (!confirmed) return;

    const { error } = await supabase
      .from("staff_users")
      .delete()
      .eq("email", user.email);

    if (error) {
      alert(error.message);
      return;
    }

    logActivity(`Deleted user ${user.full_name}`, "Users");

    await loadStaffUsers();
  };

  const handleExportMatters = () => {
    if (!permissions.exportData) {
      alert("You do not have permission to export data.");
      return;
    }

    downloadCsv(
      "tumul-matters.csv",
      filteredMatters.map((matter) => ({
        matter_no: matter.matter_no,
        client_name: matter.client_name,
        case_type: matter.case_type,
        status: matter.status,
        next_step: matter.next_step,
        assigned_lawyer: matter.assigned_lawyer,
        court_date: matter.court_date,
        cost_estimate: matter.cost_estimate,
        priority: matter.priority,
        summary: matter.summary,
      }))
    );

    logActivity("Exported matter list to CSV", "Case Docket");
  };

  const handleExportClients = () => {
    if (!permissions.exportData) {
      alert("You do not have permission to export data.");
      return;
    }

    downloadCsv(
      "tumul-clients.csv",
      filteredClients.map((client) => ({
        name: client.name,
        phone: client.phone,
        email: client.email,
        address: client.address,
        matter_count: client.matter_count,
        last_contact: client.last_contact,
        source: client.source,
      }))
    );

    logActivity("Exported client list to CSV", "Clients");
  };

  const handleExportInvoices = () => {
    if (!permissions.exportData) {
      alert("You do not have permission to export data.");
      return;
    }

    downloadCsv(
      "tumul-invoices.csv",
      filteredInvoices.map((invoice) => ({
        invoice_no: invoice.invoice_no,
        client_name: invoice.client_name,
        matter_no: invoice.matter_no,
        amount: invoice.amount,
        status: invoice.status,
        issued_date: invoice.issued_date,
        due_date: invoice.due_date,
      }))
    );

    logActivity("Exported invoice list to CSV", "Billing");
  };

  const handleExportActivity = () => {
    if (!permissions.exportData) {
      alert("You do not have permission to export data.");
      return;
    }

    downloadCsv(
      "tumul-activity-log.csv",
      activityLog.map((item) => ({
        time: item.time,
        actor: item.actor,
        role: item.role,
        action: item.action,
        module: item.module,
      }))
    );

    logActivity("Exported activity log to CSV", "Activity");
  };

  const handlePrint = async (sectionName: string) => {
    if (!permissions.printData) {
      alert("You do not have permission to print.");
      return;
    }

    const targetTab = sectionToTab(sectionName);
    setPrintSection(targetTab);
    document.body.classList.add("printing-active");
    logActivity(`Printed ${sectionName}`, sectionName);

    await wait(250);
    window.print();
  };

  const handleExportPdf = async (sectionName: string) => {
    if (!permissions.printData) {
      alert("You do not have permission to export PDF.");
      return;
    }

    const targetTab = sectionToTab(sectionName);
    setPrintSection(targetTab);
    document.body.classList.add("printing-active");
    logActivity(`Exported ${sectionName} to PDF`, sectionName);

    await wait(250);
    window.print();
  };

  const handleDeleteMatter = async (matter: Matter) => {
    if (currentUserProfile.role !== "Super Admin" && currentUserProfile.role !== "Lawyer") {
      alert("Only Super Admin or Lawyer can delete matters.");
      return;
    }

    const confirmed = window.confirm(`Delete matter ${matter.matter_no}?`);
    if (!confirmed) return;

    const { error } = await supabase.from("matters").delete().eq("id", matter.id);

    if (error) {
      alert(error.message);
      return;
    }

    logActivity(`Deleted matter ${matter.matter_no}`, "Case Docket");
    await loadAllData();
  };

  const handleDeleteClient = async (client: Client) => {
    if (currentUserProfile.role !== "Super Admin" && currentUserProfile.role !== "Secretary") {
      alert("Only Super Admin or Secretary can delete clients.");
      return;
    }

    const confirmed = window.confirm(`Delete client ${client.name}?`);
    if (!confirmed) return;

    const { error } = await supabase.from("clients").delete().eq("id", client.id);

    if (error) {
      alert(error.message);
      return;
    }

    logActivity(`Deleted client ${client.name}`, "Clients");
    await loadAllData();
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case "Open":
      case "Unpaid":
        return "bg-amber-400/15 text-amber-200 border border-amber-400/30";
      case "In Progress":
      case "In Court":
      case "Part Paid":
        return "bg-sky-400/15 text-sky-200 border border-sky-400/30";
      case "Paid":
      case "Closed":
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
      default:
        return "bg-slate-400/15 text-slate-200 border border-slate-400/30";
    }
  };

  const getRoleClass = (role: UserRole) => {
    switch (role) {
      case "Super Admin":
        return "bg-cyan-400/15 text-cyan-200 border border-cyan-400/30";
      case "Lawyer":
        return "bg-blue-400/15 text-blue-200 border border-blue-400/30";
      case "Secretary":
        return "bg-violet-400/15 text-violet-200 border border-violet-400/30";
      case "Billing":
        return "bg-emerald-400/15 text-emerald-200 border border-emerald-400/30";
      case "Viewer":
      default:
        return "bg-slate-400/15 text-slate-200 border border-slate-400/30";
    }
  };

  const canAccessTab = (tab: Tab) => {
    switch (tab) {
      case "dashboard":
        return permissions.dashboard;
      case "docket":
        return permissions.docket;
      case "clients":
        return permissions.clients;
      case "billing":
        return permissions.billing;
      case "reports":
        return permissions.reports;
      case "users":
        return permissions.users;
      case "activity":
        return permissions.activity;
      default:
        return false;
    }
  };

  const glassCard =
    "rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_10px_40px_rgba(0,0,0,0.25)]";
  const inputClass =
    "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-400 outline-none transition focus:border-cyan-400/60 focus:bg-white/10";
  const sectionTitle = "text-lg font-semibold text-white";
  const muted = "text-sm text-slate-400";
  const buttonClass =
    "rounded-2xl px-4 py-3 text-sm font-semibold transition";
  const secondaryButton =
    `${buttonClass} border border-white/10 bg-white/5 text-white hover:bg-white/10`;
  const primaryButton =
    `${buttonClass} bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950`;

  const NavButton = ({
    id,
    label,
    icon,
  }: {
    id: Tab;
    label: string;
    icon: string;
  }) => {
    if (!canAccessTab(id)) return null;

    return (
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
  };

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
        Loading Tumul Legal V4...
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
                Secure role-based access for authorized staff
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

          <div className={`${glassCard} mb-6 p-4`}>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Logged In User
            </p>
            <div className="mt-3">
              <p className="text-base font-bold text-white">
                {currentUserProfile.name}
              </p>
              <p className="mt-1 text-sm text-slate-400">
                {currentUserProfile.email}
              </p>
              <span
                className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getRoleClass(
                  currentUserProfile.role
                )}`}
              >
                {currentUserProfile.role}
              </span>
            </div>
          </div>

          <div className={`${glassCard} mb-6 p-3 no-print`}>
            <nav className="space-y-2">
              <NavButton id="dashboard" label="Dashboard" icon="◫" />
              <NavButton id="docket" label="Case Docket" icon="⚖" />
              <NavButton id="clients" label="Clients" icon="👥" />
              <NavButton id="billing" label="Billing" icon="🧾" />
              <NavButton id="reports" label="Reports" icon="📊" />
              <NavButton id="users" label="Users & Roles" icon="🔐" />
              <NavButton id="activity" label="Activity Log" icon="📝" />
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
                <span className="text-sm text-slate-300">Urgent Deadlines</span>
                <span className="text-sm font-bold text-orange-300">
                  {urgentDeadlines}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Overdue Deadlines</span>
                <span className="text-sm font-bold text-rose-300">
                  {overdueDeadlines}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Clients</span>
                <span className="text-sm font-bold text-white">
                  {totalClients}
                </span>
              </div>
              {permissions.seeFinancials && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">Outstanding</span>
                  <span className="text-sm font-bold text-cyan-300">
                    {currency(outstandingValue)}
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={handleLogout}
              className="no-print mt-6 w-full rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15"
            >
              Logout
            </button>
          </div>
        </aside>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div id="print-root" data-print-section={printSection || activeTab}>
          <div className={`${glassCard} mb-6 overflow-hidden no-print`}>
            <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-medium text-cyan-300/80">
                  Welcome to {branding.clientName || "Tumul Legal"}
                </p>
                <h2 className="mt-1 text-3xl font-bold text-white">
                  Legal Operations Control Panel
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-400">
                  Role-based legal management dashboard with export, print and activity tracking.
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
                    Role
                  </p>
                  <p className="mt-2 text-sm font-bold text-white">
                    {currentUserProfile.role}
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
                  value={permissions.seeFinancials ? currency(outstandingValue) : "Restricted"}
                  subtext="Unpaid and part paid invoices"
                />
                <StatCard
                  label="Overdue Deadlines"
                  value={overdueDeadlines}
                  subtext="Deadlines that already passed"
                />
              </section>

              <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className={`${glassCard} p-5 xl:col-span-2`}>
                  <div className="no-print mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className={sectionTitle}>Recent Matters</h3>
                      <p className={muted}>Saved legal docket records</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handlePrint("Dashboard")}
                        className={secondaryButton}
                      >
                        Print
                      </button>
                      <button
                        onClick={() => handleExportPdf("Dashboard")}
                        className={secondaryButton}
                      >
                        Export PDF
                      </button>
                      {permissions.exportData && (
                        <button
                          onClick={handleExportMatters}
                          className={primaryButton}
                        >
                          Export Matters
                        </button>
                      )}
                    </div>
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

                <div className="space-y-6">
                  <div className={`${glassCard} p-5`}>
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <h3 className={sectionTitle}>Upcoming Deadlines</h3>
                        <p className={muted}>The dates a lawyer cannot afford to miss</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-right">
                        <p className="text-xs uppercase tracking-wide text-slate-400">Live Count</p>
                        <p className="mt-1 text-lg font-bold text-white">{upcomingDeadlineItems.length}</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {upcomingDeadlineItems.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-400">
                          No upcoming deadlines yet. Add deadlines inside a matter file.
                        </div>
                      )}

                      {upcomingDeadlineItems.map((deadline) => (
                        <button
                          key={deadline.id}
                          onClick={() => {
                            const linkedMatter = matters.find((item) => item.id === deadline.matter_id);
                            setActiveTab("docket");
                            if (linkedMatter) void openMatterFile(linkedMatter);
                          }}
                          className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-cyan-200">{deadline.matter_no}</p>
                                <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${getDeadlineBadgeClass(deadline.state)}`}>
                                  {deadline.state}
                                </span>
                              </div>
                              <p className="mt-2 text-base font-semibold text-white">{deadline.title}</p>
                              <p className="mt-1 text-sm text-slate-400">{deadline.client_name}</p>
                            </div>
                            <div className="text-sm text-slate-300 lg:text-right">
                              <p className="font-semibold text-white">{normalizeDateOnly(deadline.deadline_date)}</p>
                              <p className="mt-1 text-xs text-slate-400">Click to open matter file</p>
                            </div>
                          </div>
                        </button>
                      ))}
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
                </div>
              </section>
            </div>
          )}

          {activeTab === "docket" && permissions.docket && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
              <div className={`${glassCard} p-5 no-print`}>
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
                    disabled={!permissions.addMatter}
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
                    disabled={!permissions.addMatter}
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
                    disabled={!permissions.addMatter}
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
                    disabled={!permissions.addMatter}
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
                    disabled={!permissions.addMatter}
                  />
                  <textarea
                    value={matterForm.summary}
                    onChange={(e) =>
                      setMatterForm({
                        ...matterForm,
                        summary: e.target.value,
                      })
                    }
                    placeholder="Case Summary"
                    className={`${inputClass} min-h-[120px] resize-y`}
                    disabled={!permissions.addMatter}
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
                    disabled={!permissions.addMatter}
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
                    disabled={!permissions.addMatter}
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
                    disabled={!permissions.addMatter}
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
                    disabled={!permissions.addMatter}
                  >
                    <option className="bg-slate-900">High</option>
                    <option className="bg-slate-900">Medium</option>
                    <option className="bg-slate-900">Low</option>
                  </select>
                  <button
                    onClick={handleAddMatter}
                    disabled={!permissions.addMatter}
                    className={`w-full ${permissions.addMatter ? primaryButton : secondaryButton}`}
                  >
                    {permissions.addMatter ? "Save Matter" : "Read Only Access"}
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                <div className={`${glassCard} p-5`}>
                  <div className="no-print mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className={sectionTitle}>Digital Case Docket</h3>
                      <p className={muted}>Click a matter number to open the full case file.</p>
                    </div>
                    <div className="flex flex-col gap-3 lg:flex-row">
                      <input
                        value={matterSearch}
                        onChange={(e) => setMatterSearch(e.target.value)}
                        placeholder="Search matter, client, lawyer, case type..."
                        className={`${inputClass} lg:min-w-[300px]`}
                      />
                      <button
                        onClick={() => handlePrint("Case Docket")}
                        className={secondaryButton}
                      >
                        Print
                      </button>
                      <button
                        onClick={() => handleExportPdf("Case Docket")}
                        className={secondaryButton}
                      >
                        Export PDF
                      </button>
                      {permissions.exportData && (
                        <button
                          onClick={handleExportMatters}
                          className={primaryButton}
                        >
                          Export
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10 text-left text-slate-400">
                          <th className="px-3 py-3">Matter File</th>
                          <th className="px-3 py-3">Client</th>
                          <th className="px-3 py-3">Case Type</th>
                          <th className="px-3 py-3">Lawyer</th>
                          <th className="px-3 py-3">Status</th>
                          <th className="px-3 py-3">Priority</th>
                          <th className="px-3 py-3">Court Date</th>
                          <th className="px-3 py-3">Cost</th>
                          <th className="px-3 py-3">Summary</th>
                          <th className="px-3 py-3 no-print">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredMatters.map((matter) => (
                          <tr
                            key={matter.id}
                            className="border-b border-white/5 text-slate-200 hover:bg-white/[0.03]"
                          >
                            <td className="px-3 py-4">
                              <button
                                onClick={() => openMatterFile(matter)}
                                className="text-left"
                              >
                                <div className="font-semibold text-cyan-300 hover:text-cyan-200">
                                  {matter.matter_no}
                                </div>
                                <div className="mt-1 text-xs text-slate-400">
                                  {matter.next_step || "No next step yet"}
                                </div>
                              </button>
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
                            <td className="px-3 py-4 text-slate-300">
                              <button
                                onClick={() => openMatterFile(matter)}
                                className="max-w-[230px] text-left text-sm text-slate-300 hover:text-white"
                              >
                                {matter.summary
                                  ? `${matter.summary.slice(0, 60)}${matter.summary.length > 60 ? "..." : ""}`
                                  : "Open file to add summary"}
                              </button>
                            </td>
                            <td className="px-3 py-4 no-print">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => openMatterFile(matter)}
                                  className="rounded-2xl px-4 py-2 text-xs font-semibold transition border border-cyan-400/30 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20"
                                >
                                  Open
                                </button>
                                <button
                                  onClick={() => handleDeleteMatter(matter)}
                                  className="rounded-2xl px-4 py-2 text-xs font-semibold transition border border-rose-400/30 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {!filteredMatters.length && (
                          <tr>
                            <td
                              colSpan={10}
                              className="px-3 py-10 text-center text-slate-400"
                            >
                              No matters found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {isMatterPanelOpen && selectedMatter && (
                  <div className={`${glassCard} p-5`}>
                    <div className="mb-5 flex flex-col gap-3 border-b border-white/10 pb-5 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300/80">
                          Case File
                        </p>
                        <h3 className="mt-2 text-2xl font-bold text-white">
                          {selectedMatter.matter_no}
                        </h3>
                        <p className="mt-2 text-sm text-slate-400">
                          Full matter details, summary and next legal action.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
                            selectedMatter.status
                          )}`}
                        >
                          {selectedMatter.status}
                        </span>
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getPriorityClass(
                            selectedMatter.priority
                          )}`}
                        >
                          {selectedMatter.priority}
                        </span>
                        <button
                          onClick={closeMatterFile}
                          className={secondaryButton}
                        >
                          Close
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm text-slate-300">
                          Matter Number
                        </label>
                        <input
                          value={selectedMatter.matter_no}
                          onChange={(e) =>
                            updateSelectedMatterField("matter_no", e.target.value)
                          }
                          className={inputClass}
                          disabled={!canEditMatterDetails}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm text-slate-300">
                          Client Name
                        </label>
                        <input
                          value={selectedMatter.client_name}
                          onChange={(e) =>
                            updateSelectedMatterField("client_name", e.target.value)
                          }
                          className={inputClass}
                          disabled={!canEditMatterDetails}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm text-slate-300">
                          Case Type
                        </label>
                        <input
                          value={selectedMatter.case_type}
                          onChange={(e) =>
                            updateSelectedMatterField("case_type", e.target.value)
                          }
                          className={inputClass}
                          disabled={!canEditMatterDetails}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm text-slate-300">
                          Assigned Lawyer
                        </label>
                        <input
                          value={selectedMatter.assigned_lawyer}
                          onChange={(e) =>
                            updateSelectedMatterField("assigned_lawyer", e.target.value)
                          }
                          className={inputClass}
                          disabled={!canEditMatterDetails}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm text-slate-300">
                          Status
                        </label>
                        <select
                          value={selectedMatter.status}
                          onChange={(e) =>
                            updateSelectedMatterField("status", e.target.value as MatterStatus)
                          }
                          className={inputClass}
                          disabled={!canEditMatterDetails}
                        >
                          <option className="bg-slate-900">Open</option>
                          <option className="bg-slate-900">In Progress</option>
                          <option className="bg-slate-900">Pending Filing</option>
                          <option className="bg-slate-900">In Court</option>
                          <option className="bg-slate-900">Awaiting Client</option>
                          <option className="bg-slate-900">Closed</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-2 block text-sm text-slate-300">
                          Priority
                        </label>
                        <select
                          value={selectedMatter.priority}
                          onChange={(e) =>
                            updateSelectedMatterField("priority", e.target.value as Priority)
                          }
                          className={inputClass}
                          disabled={!canEditMatterDetails}
                        >
                          <option className="bg-slate-900">High</option>
                          <option className="bg-slate-900">Medium</option>
                          <option className="bg-slate-900">Low</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-2 block text-sm text-slate-300">
                          Court Date
                        </label>
                        <input
                          type="date"
                          value={selectedMatter.court_date || ""}
                          onChange={(e) =>
                            updateSelectedMatterField("court_date", e.target.value)
                          }
                          className={inputClass}
                          disabled={!canEditMatterDetails}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm text-slate-300">
                          Estimated Cost
                        </label>
                        <input
                          type="number"
                          value={selectedMatter.cost_estimate || 0}
                          onChange={(e) =>
                            updateSelectedMatterField(
                              "cost_estimate",
                              Number(e.target.value || 0)
                            )
                          }
                          className={inputClass}
                          disabled={!canEditMatterDetails}
                        />
                      </div>
                      <div className="xl:col-span-2">
                        <label className="mb-2 block text-sm text-slate-300">
                          Next Legal Step
                        </label>
                        <input
                          value={selectedMatter.next_step || ""}
                          onChange={(e) =>
                            updateSelectedMatterField("next_step", e.target.value)
                          }
                          className={inputClass}
                          disabled={!canEditMatterDetails}
                        />
                      </div>
                      <div className="xl:col-span-2">
                        <label className="mb-2 block text-sm text-slate-300">
                          Case Summary
                        </label>
                        <textarea
                          value={selectedMatter.summary || ""}
                          onChange={(e) =>
                            updateSelectedMatterField("summary", e.target.value)
                          }
                          className={`${inputClass} min-h-[180px] resize-y`}
                          disabled={!canEditMatterDetails}
                        />
                      </div>
                    </div>

                    <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5">
                      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h4 className="text-lg font-semibold text-white">
                            Matter Deadlines
                          </h4>
                          <p className="text-sm text-slate-400">
                            Track filings, hearings, submissions and urgent follow-up dates.
                          </p>
                        </div>
                        <div className="text-sm text-slate-400">
                          Total: {matterDeadlines.length}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.2fr_180px_1fr_auto]">
                        <input
                          value={deadlineForm.title}
                          onChange={(e) =>
                            setDeadlineForm({ ...deadlineForm, title: e.target.value })
                          }
                          placeholder="Deadline title"
                          className={inputClass}
                          disabled={!canEditMatterDetails}
                        />
                        <input
                          type="date"
                          value={deadlineForm.deadline_date}
                          onChange={(e) =>
                            setDeadlineForm({
                              ...deadlineForm,
                              deadline_date: e.target.value,
                            })
                          }
                          className={inputClass}
                          disabled={!canEditMatterDetails}
                        />
                        <input
                          value={deadlineForm.notes}
                          onChange={(e) =>
                            setDeadlineForm({ ...deadlineForm, notes: e.target.value })
                          }
                          placeholder="Notes (optional)"
                          className={inputClass}
                          disabled={!canEditMatterDetails}
                        />
                        <button
                          onClick={handleAddDeadline}
                          disabled={!canEditMatterDetails || isSavingDeadline}
                          className={canEditMatterDetails ? primaryButton : secondaryButton}
                        >
                          {isSavingDeadline ? "Saving..." : "Add Deadline"}
                        </button>
                      </div>

                      <div className="mt-5 space-y-3">
                        {matterDeadlines.length === 0 && (
                          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-400">
                            No deadlines added for this matter yet.
                          </div>
                        )}

                        {matterDeadlines.map((deadline) => {
                          const deadlineState = getDeadlineState(deadline);

                          return (
                            <div
                              key={deadline.id}
                              className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"
                            >
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-base font-semibold text-white">
                                      {deadline.title}
                                    </p>
                                    <span
                                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getDeadlineBadgeClass(
                                        deadlineState
                                      )}`}
                                    >
                                      {deadlineState}
                                    </span>
                                  </div>
                                  <p className="mt-2 text-sm text-slate-300">
                                    Due: {normalizeDateOnly(deadline.deadline_date)}
                                  </p>
                                  <p className="mt-1 text-sm text-slate-400">
                                    {deadline.notes || "No notes"}
                                  </p>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  <button
                                    onClick={() => handleToggleDeadlineComplete(deadline)}
                                    className="rounded-2xl px-4 py-2 text-xs font-semibold transition border border-emerald-400/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20"
                                  >
                                    {deadline.is_completed ? "Mark Open" : "Mark Complete"}
                                  </button>
                                  <button
                                    onClick={() => handleDeleteDeadline(deadline)}
                                    className="rounded-2xl px-4 py-2 text-xs font-semibold transition border border-rose-400/30 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
                      <button
                        onClick={closeMatterFile}
                        className={secondaryButton}
                      >
                        Close File
                      </button>
                      <button
                        onClick={handleSaveMatterDetails}
                        disabled={!canEditMatterDetails || isSavingMatter}
                        className={canEditMatterDetails ? primaryButton : secondaryButton}
                      >
                        {isSavingMatter ? "Saving..." : "Save Changes"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "clients" && permissions.clients && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className={`${glassCard} p-5 no-print`}>
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
                    disabled={!permissions.addClient}
                  />
                  <input
                    value={clientForm.phone}
                    onChange={(e) =>
                      setClientForm({ ...clientForm, phone: e.target.value })
                    }
                    placeholder="Phone Number"
                    className={inputClass}
                    disabled={!permissions.addClient}
                  />
                  <input
                    value={clientForm.email}
                    onChange={(e) =>
                      setClientForm({ ...clientForm, email: e.target.value })
                    }
                    placeholder="Email Address"
                    className={inputClass}
                    disabled={!permissions.addClient}
                  />
                  <input
                    value={clientForm.address}
                    onChange={(e) =>
                      setClientForm({ ...clientForm, address: e.target.value })
                    }
                    placeholder="Address"
                    className={inputClass}
                    disabled={!permissions.addClient}
                  />
                  <select
                    value={clientForm.source}
                    onChange={(e) =>
                      setClientForm({ ...clientForm, source: e.target.value })
                    }
                    className={inputClass}
                    disabled={!permissions.addClient}
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
                    disabled={!permissions.addClient}
                    className={`w-full ${permissions.addClient ? primaryButton : secondaryButton}`}
                  >
                    {permissions.addClient ? "Save Client" : "Read Only Access"}
                  </button>
                </div>
              </div>

              <div className={`${glassCard} p-5 xl:col-span-2`}>
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className={sectionTitle}>Client Management</h3>
                    <p className={muted}>Saved client profiles</p>
                  </div>
                  <div className="flex flex-col gap-3 lg:flex-row">
                    <input
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      placeholder="Search client, phone, email..."
                      className={`${inputClass} lg:min-w-[300px]`}
                    />
                    <button
                      onClick={() => handlePrint("Clients")}
                      className={secondaryButton}
                    >
                      Print
                    </button>
                    <button
                      onClick={() => handleExportPdf("Clients")}
                      className={secondaryButton}
                    >
                      Export PDF
                    </button>
                    {permissions.exportData && (
                      <button
                        onClick={handleExportClients}
                        className={primaryButton}
                      >
                        Export
                      </button>
                    )}
                  </div>
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

                      <div className="no-print mt-4 flex justify-end">
                        <button
                          onClick={() => handleDeleteClient(client)}
                          className="rounded-2xl px-4 py-2 text-xs font-semibold transition border border-rose-400/30 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20"
                        >
                          Delete Client
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "billing" && permissions.billing && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className={`${glassCard} p-5 no-print`}>
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
                    disabled={!permissions.addInvoice}
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
                    disabled={!permissions.addInvoice}
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
                    disabled={!permissions.addInvoice}
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
                    disabled={!permissions.addInvoice}
                  />
                  <select
                    value={invoiceForm.status}
                    onChange={(e) =>
                      setInvoiceForm({
                        ...invoiceForm,
                        status: e.target.value as InvoiceStatus,
                      })
                    }
                    className={inputClass}
                    disabled={!permissions.addInvoice}
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
                    disabled={!permissions.addInvoice}
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
                    disabled={!permissions.addInvoice}
                  />
                  <button
                    onClick={handleAddInvoice}
                    disabled={!permissions.addInvoice}
                    className={`w-full ${permissions.addInvoice ? primaryButton : secondaryButton}`}
                  >
                    {permissions.addInvoice ? "Save Invoice" : "Read Only Access"}
                  </button>
                </div>
              </div>

              <div className={`${glassCard} p-5 xl:col-span-2`}>
                <div className="no-print mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className={sectionTitle}>Invoice & Billing Tracker</h3>
                    <p className={muted}>Saved financial records</p>
                  </div>
                  <div className="flex flex-col gap-3 lg:flex-row">
                    <input
                      value={invoiceSearch}
                      onChange={(e) => setInvoiceSearch(e.target.value)}
                      placeholder="Search invoice, client, matter..."
                      className={`${inputClass} lg:min-w-[300px]`}
                    />
                    <button
                      onClick={() => handlePrint("Billing")}
                      className={secondaryButton}
                    >
                      Print
                    </button>
                    <button
                      onClick={() => handleExportPdf("Billing")}
                      className={secondaryButton}
                    >
                      Export PDF
                    </button>
                    {permissions.exportData && (
                      <button
                        onClick={handleExportInvoices}
                        className={primaryButton}
                      >
                        Export
                      </button>
                    )}
                  </div>
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

          {activeTab === "reports" && permissions.reports && (
            <div className="space-y-6">
              <div className="no-print flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  onClick={() => handlePrint("Reports")}
                  className={secondaryButton}
                >
                  Print Reports
                </button>
                <button
                  onClick={() => handleExportPdf("Reports")}
                  className={secondaryButton}
                >
                  Export PDF
                </button>
                {permissions.exportData && (
                  <button
                    onClick={() =>
                      downloadCsv("tumul-reports-summary.csv", [
                        {
                          total_matters: totalMatters,
                          open_matters: openMatters,
                          total_clients: totalClients,
                          total_invoiced: totalInvoiceValue,
                          outstanding_value: outstandingValue,
                          collected_value: collectedValue,
                          urgent_matters: urgentMatters,
                          upcoming_court_dates: upcomingCourtDates,
                        },
                      ])
                    }
                    className={primaryButton}
                  >
                    Export Reports
                  </button>
                )}
              </div>

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

              {permissions.seeFinancials && (
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
              )}

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 no-print">
                <div className={`${glassCard} p-5`}>
                  <div className="mb-4">
                    <h3 className={sectionTitle}>Delete Client Records</h3>
                    <p className={muted}>Quick remove option for saved clients.</p>
                  </div>
                  <div className="space-y-3 max-h-[360px] overflow-y-auto">
                    {filteredClients.length === 0 ? (
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-slate-400">
                        No clients found.
                      </div>
                    ) : (
                      filteredClients.slice(0, 10).map((client) => (
                        <div key={`report-client-${client.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          <div>
                            <p className="font-semibold text-white">{client.name}</p>
                            <p className="text-xs text-slate-400">{client.phone} • {client.email || "No email"}</p>
                          </div>
                          <button onClick={() => handleDeleteClient(client)} className="rounded-2xl px-4 py-2 text-xs font-semibold transition border border-rose-400/30 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20">
                            Delete
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className={`${glassCard} p-5`}>
                  <div className="mb-4">
                    <h3 className={sectionTitle}>Delete Matter Records</h3>
                    <p className={muted}>Quick remove option for docket records.</p>
                  </div>
                  <div className="space-y-3 max-h-[360px] overflow-y-auto">
                    {filteredMatters.length === 0 ? (
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-slate-400">
                        No matters found.
                      </div>
                    ) : (
                      filteredMatters.slice(0, 10).map((matter) => (
                        <div key={`report-matter-${matter.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          <div>
                            <p className="font-semibold text-white">{matter.matter_no}</p>
                            <p className="text-xs text-slate-400">{matter.client_name} • {matter.status}</p>
                          </div>
                          <button onClick={() => handleDeleteMatter(matter)} className="rounded-2xl px-4 py-2 text-xs font-semibold transition border border-rose-400/30 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20">
                            Delete
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "users" && permissions.users && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className={`${glassCard} p-5 no-print`}>
                <div className="mb-4">
                  <h3 className={sectionTitle}>Add Staff User</h3>
                  <p className={muted}>
                    Super Admin can add users and assign roles here.
                  </p>
                </div>

                <div className="space-y-3">
                  <input
                    value={staffForm.full_name}
                    onChange={(e) =>
                      setStaffForm({ ...staffForm, full_name: e.target.value })
                    }
                    placeholder="Full Name"
                    className={inputClass}
                  />
                  <input
                    value={staffForm.email}
                    onChange={(e) =>
                      setStaffForm({ ...staffForm, email: e.target.value })
                    }
                    placeholder="Email Address"
                    className={inputClass}
                  />
                  <select
                    value={staffForm.role}
                    onChange={(e) =>
                      setStaffForm({ ...staffForm, role: e.target.value as UserRole })
                    }
                    className={inputClass}
                  >
                    <option className="bg-slate-900">Super Admin</option>
                    <option className="bg-slate-900">Lawyer</option>
                    <option className="bg-slate-900">Secretary</option>
                    <option className="bg-slate-900">Billing</option>
                    <option className="bg-slate-900">Viewer</option>
                  </select>

                  <button onClick={handleAddStaffUser} className={`w-full ${primaryButton}`}>
                    Add User
                  </button>
                </div>

                <div className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-100">
                  Added users must sign up using the same email address to access the system.
                </div>
              </div>

              <div className={`${glassCard} p-5 xl:col-span-2`}>
                <div className="mb-4">
                  <h3 className={sectionTitle}>User Roles & Access</h3>
                  <p className={muted}>
                    Activate, deactivate or remove users here.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-slate-400">
                        <th className="px-3 py-3">Name</th>
                        <th className="px-3 py-3">Email</th>
                        <th className="px-3 py-3">Role</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffUsers.map((staff) => (
                        <tr
                          key={staff.email}
                          className="border-b border-white/5 text-slate-200"
                        >
                          <td className="px-3 py-4 font-semibold text-white">
                            {staff.full_name}
                          </td>
                          <td className="px-3 py-4">{staff.email}</td>
                          <td className="px-3 py-4">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getRoleClass(
                                staff.role
                              )}`}
                            >
                              {staff.role}
                            </span>
                          </td>
                          <td className="px-3 py-4">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                staff.is_active !== false
                                  ? "bg-emerald-400/15 text-emerald-200 border border-emerald-400/30"
                                  : "bg-rose-400/15 text-rose-200 border border-rose-400/30"
                              }`}
                            >
                              {staff.is_active !== false ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-3 py-4">
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => handleToggleStaffStatus(staff)}
                                className={secondaryButton}
                              >
                                {staff.is_active !== false ? "Deactivate" : "Activate"}
                              </button>
                              <button
                                onClick={() => handleDeleteStaffUser(staff)}
                                className="rounded-2xl px-4 py-3 text-sm font-semibold transition border border-rose-400/30 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20"
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === "activity" && permissions.activity && (
            <div className="space-y-6">
              <div className={`${glassCard} p-5`}>
                <div className="no-print mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className={sectionTitle}>Activity Log</h3>
                    <p className={muted}>
                      Tracks major actions done in the system.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handlePrint("Activity Log")}
                      className={secondaryButton}
                    >
                      Print
                    </button>
                    <button
                      onClick={() => handleExportPdf("Activity Log")}
                      className={secondaryButton}
                    >
                      Export PDF
                    </button>
                    {permissions.exportData && (
                      <button
                        onClick={handleExportActivity}
                        className={primaryButton}
                      >
                        Export Activity
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  {activityLog.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-slate-400">
                      No activity recorded yet.
                    </div>
                  ) : (
                    activityLog.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {item.action}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              {item.module}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-slate-300">
                              {item.actor}
                            </p>
                            <p className="text-xs text-slate-400">
                              {item.role} • {item.time}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
          </div>

          <style jsx global>{`
            @media print {
              @page {
                size: A4 portrait;
                margin: 12mm;
              }

              html, body {
                background: #ffffff !important;
              }

              body.printing-active * {
                visibility: hidden !important;
              }

              body.printing-active #print-root,
              body.printing-active #print-root * {
                visibility: visible !important;
              }

              body.printing-active aside,
              body.printing-active .no-print {
                display: none !important;
              }

              body.printing-active main {
                width: 100% !important;
                padding: 0 !important;
                margin: 0 !important;
              }

              body.printing-active #print-root {
                position: static !important;
                display: block !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                color: #111827 !important;
              }

              body.printing-active #print-root [class*="bg-"],
              body.printing-active #print-root [class*="from-"],
              body.printing-active #print-root [class*="to-"] {
                background: #ffffff !important;
                color: #111827 !important;
                box-shadow: none !important;
              }

              body.printing-active #print-root table {
                width: 100% !important;
                border-collapse: collapse !important;
              }

              body.printing-active #print-root th,
              body.printing-active #print-root td {
                color: #111827 !important;
                border-color: #d1d5db !important;
              }

              body.printing-active #print-root .text-white,
              body.printing-active #print-root .text-slate-400,
              body.printing-active #print-root .text-slate-300,
              body.printing-active #print-root .text-cyan-300,
              body.printing-active #print-root .text-cyan-200,
              body.printing-active #print-root .text-emerald-200,
              body.printing-active #print-root .text-rose-200,
              body.printing-active #print-root .text-amber-200,
              body.printing-active #print-root .text-violet-200,
              body.printing-active #print-root .text-blue-200 {
                color: #111827 !important;
              }

              body.printing-active #print-root .rounded-3xl,
              body.printing-active #print-root .rounded-2xl {
                border: 1px solid #d1d5db !important;
                break-inside: avoid;
                page-break-inside: avoid;
              }
            }
          `}</style>
        </main>
      </div>
    </div>
  );
}