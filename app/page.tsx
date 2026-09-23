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
type MatterFileTab = "overview" | "tasks" | "notes" | "documents" | "billing" | "activity";
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
  amount_paid?: number;
  service_description?: string;
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
  matter_no: string;
  title: string;
  deadline_date: string;
  notes: string | null;
  is_completed: boolean;
  created_by?: string | null;
  created_by_email?: string | null;
  created_at?: string;
  completed_at?: string | null;
};

type MatterNote = {
  id: number;
  matter_id: number;
  matter_no: string;
  note: string;
  created_by: string;
  created_by_email?: string | null;
  created_at: string;
};

type MatterDocument = {
  id: number;
  matter_id: number;
  matter_no: string;
  document_name: string;
  file_name: string;
  file_path: string;
  file_type?: string | null;
  file_size?: number | null;
  category?: string | null;
  uploaded_by?: string | null;
  uploaded_by_email?: string | null;
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
  const [accessVerified, setAccessVerified] = useState(false);
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
  const [matterFileTab, setMatterFileTab] = useState<MatterFileTab>("overview");
  const [isEditingMatter, setIsEditingMatter] = useState(false);

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
    amount_paid: "",
    service_description: "Legal service / professional fee",
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

  const [matterNotes, setMatterNotes] = useState<MatterNote[]>([]);
  const [noteText, setNoteText] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);

  const [matterDocuments, setMatterDocuments] = useState<MatterDocument[]>([]);
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentCategory, setDocumentCategory] = useState("Client Correspondence");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);

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
        return "bg-[#d4af37]/12 text-[#f2d675] border border-[#d4af37]/30";
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
          .from("tumul_matter_deadlines")
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


  const verifyStaffAccess = async (nextSession: any) => {
    const loginEmail = nextSession?.user?.email?.trim().toLowerCase();

    if (!loginEmail) {
      setAccessVerified(false);
      return false;
    }

    const { data, error } = await supabase
      .from("staff_users")
      .select("id, full_name, email, role, is_active, created_at, created_by")
      .eq("email", loginEmail)
      .maybeSingle();

    if (error) {
      console.error("Unable to verify staff access:", error.message);
      setAccessVerified(false);
      setAuthMessage("Unable to verify your staff access. Please contact the administrator.");
      await supabase.auth.signOut();
      return false;
    }

    if (!data) {
      setAccessVerified(false);
      setAuthMessage(
        "Access denied. Your login is valid, but this email is not an authorised Tumul Legal staff account."
      );
      await supabase.auth.signOut();
      return false;
    }

    if (data.is_active === false) {
      setAccessVerified(false);
      setAuthMessage("Your Tumul Legal staff account has been deactivated. Please contact the administrator.");
      await supabase.auth.signOut();
      return false;
    }

    setStaffUsers([data as StaffUser]);
    setAccessVerified(true);
    return true;
  };


  const loadDeadlines = async () => {
    const { data, error } = await supabase
      .from("tumul_matter_deadlines")
      .select("*")
      .order("deadline_date", { ascending: true });

    if (!error) {
      setDeadlines((data as MatterDeadline[]) || []);
    }
  };

  const loadDeadlinesForMatter = async (matterId: number) => {
    const { data, error } = await supabase
      .from("tumul_matter_deadlines")
      .select("*")
      .eq("matter_id", matterId)
      .order("deadline_date", { ascending: true });

    if (!error) {
      setMatterDeadlines((data as MatterDeadline[]) || []);
    }
  };

  const loadNotesForMatter = async (matterId: number) => {
    const { data, error } = await supabase
      .from("tumul_matter_notes")
      .select("*")
      .eq("matter_id", matterId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Unable to load matter notes:", error.message);
      setMatterNotes([]);
      return;
    }

    setMatterNotes((data as MatterNote[]) || []);
  };

  const loadDocumentsForMatter = async (matterId: number) => {
    const { data, error } = await supabase
      .from("tumul_matter_documents")
      .select("*")
      .eq("matter_id", matterId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Unable to load matter documents:", error.message);
      setMatterDocuments([]);
      return;
    }

    setMatterDocuments((data as MatterDocument[]) || []);
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
    const clearProtectedData = () => {
      setMatters([]);
      setClients([]);
      setInvoices([]);
      setStaffUsers([]);
      setDeadlines([]);
      setMatterDeadlines([]);
      setMatterNotes([]);
      setMatterDocuments([]);
    };

    const authoriseAndLoad = async (nextSession: any) => {
      setLoading(true);
      setAccessVerified(false);

      const allowed = await verifyStaffAccess(nextSession);

      if (!allowed) {
        clearProtectedData();
        setLoading(false);
        return;
      }

      await loadAllData();
      setLoading(false);
    };

    const getSession = async () => {
      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession();

      setSession(initialSession);

      if (initialSession) {
        await authoriseAndLoad(initialSession);
      } else {
        setAccessVerified(false);
        setLoading(false);
      }
    };

    void getSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: string, nextSession: any) => {
      setSession(nextSession);

      // Do not await database calls directly inside onAuthStateChange.
      window.setTimeout(() => {
        if (nextSession) {
          void authoriseAndLoad(nextSession);
        } else {
          setAccessVerified(false);
          clearProtectedData();
          setLoading(false);
        }
      }, 0);
    });

    return () => subscription.unsubscribe();
  }, []);

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

  const getCalculatedInvoiceStatus = (amount: number, amountPaid: number): InvoiceStatus => {
    const invoiceAmount = Number(amount || 0);
    const paidAmount = Number(amountPaid || 0);
    if (invoiceAmount > 0 && paidAmount >= invoiceAmount) return "Paid";
    if (paidAmount > 0 && paidAmount < invoiceAmount) return "Part Paid";
    return "Unpaid";
  };

  const getInvoiceBalance = (invoice: Invoice) =>
    Math.max(Number(invoice.amount || 0) - Number(invoice.amount_paid || 0), 0);

  const totalMatters = matters.length;
  const openMatters = matters.filter((m) => m.status !== "Closed").length;
  const totalClients = clients.length;
  const totalInvoiceValue = invoices.reduce(
    (sum, invoice) => sum + Number(invoice.amount || 0),
    0
  );
  const outstandingValue = invoices.reduce(
    (sum, invoice) => sum + getInvoiceBalance(invoice),
    0
  );
  const collectedValue = invoices.reduce(
    (sum, invoice) => sum + Number(invoice.amount_paid || 0),
    0
  );
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
    setMatterFileTab("overview");
    setIsEditingMatter(false);
    setDeadlineForm({
      title: "",
      deadline_date: "",
      notes: "",
    });
    await Promise.all([
      loadDeadlinesForMatter(matter.id),
      loadNotesForMatter(matter.id),
      loadDocumentsForMatter(matter.id),
    ]);
  };

  const closeMatterFile = () => {
    setSelectedMatter(null);
    setIsMatterPanelOpen(false);
    setMatterFileTab("overview");
    setIsEditingMatter(false);
    setMatterDeadlines([]);
    setMatterNotes([]);
    setMatterDocuments([]);
    setNoteText("");
    setDocumentTitle("");
    setDocumentCategory("Client Correspondence");
    setDocumentFile(null);
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

    const cleanTitle = deadlineForm.title.trim();
    const cleanDate = deadlineForm.deadline_date;
    const cleanNotes = deadlineForm.notes.trim();

    if (!cleanTitle || !cleanDate) {
      alert("Please enter deadline title and date.");
      return;
    }

    if (isSavingDeadline) return;

    setIsSavingDeadline(true);

    try {
      const payload = {
        matter_id: selectedMatter.id,
        matter_no: selectedMatter.matter_no,
        title: cleanTitle,
        deadline_date: cleanDate,
        notes: cleanNotes || null,
        is_completed: false,
        created_by: currentUserProfile.name || null,
        created_by_email: currentUserProfile.email || null,
        completed_at: null,
      };

      console.log("Saving deadline:", payload);

      // Insert first. Avoid chaining .select().single() onto the write request.
      // We reload the matter deadlines after Supabase confirms the insert.
      const { error } = await supabase
        .from("tumul_matter_deadlines")
        .insert(payload);

      if (error) {
        console.error("Deadline save error:", error);
        alert(`Unable to save deadline: ${error.message}`);
        return;
      }

      setDeadlineForm({
        title: "",
        deadline_date: "",
        notes: "",
      });

      logActivity(
        `Added deadline "${cleanTitle}" to ${selectedMatter.matter_no}`,
        "Deadlines"
      );

      // Refresh both the case-file list and dashboard counters.
      await Promise.all([
        loadDeadlines(),
        loadDeadlinesForMatter(selectedMatter.id),
      ]);

      alert("Task / deadline saved successfully.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error while saving deadline.";
      console.error("Deadline save failed:", error);
      alert(`Unable to save deadline: ${message}`);
    } finally {
      setIsSavingDeadline(false);
    }
  };

  const handleToggleDeadlineComplete = async (deadline: MatterDeadline) => {
    if (!canEditMatterDetails) {
      alert("You do not have permission to update deadlines.");
      return;
    }

    const { error } = await supabase
      .from("tumul_matter_deadlines")
      .update({
        is_completed: !deadline.is_completed,
        completed_at: deadline.is_completed ? null : new Date().toISOString(),
      })
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
      .from("tumul_matter_deadlines")
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

  const handleAddMatterNote = async () => {
    if (!selectedMatter) {
      alert("Open a matter first.");
      return;
    }

    if (!canEditMatterDetails) {
      alert("You do not have permission to add case notes.");
      return;
    }

    const cleanNote = noteText.trim();
    if (!cleanNote) {
      alert("Please enter a case note.");
      return;
    }

    setIsSavingNote(true);

    const { error } = await supabase.from("tumul_matter_notes").insert({
      matter_id: selectedMatter.id,
      matter_no: selectedMatter.matter_no,
      note: cleanNote,
      created_by: currentUserProfile.name,
      created_by_email: currentUserProfile.email || null,
    });

    setIsSavingNote(false);

    if (error) {
      alert(error.message);
      return;
    }

    logActivity(`Added case note to ${selectedMatter.matter_no}`, "Case Notes");
    setNoteText("");
    await loadNotesForMatter(selectedMatter.id);
  };

  const handleDeleteMatterNote = async (note: MatterNote) => {
    if (currentUserProfile.role !== "Super Admin") {
      alert("Only Super Admin can delete case notes.");
      return;
    }

    const confirmed = window.confirm(
      "Delete this case note?\n\nThis action cannot be undone."
    );
    if (!confirmed) return;

    const { error } = await supabase
      .from("tumul_matter_notes")
      .delete()
      .eq("id", note.id);

    if (error) {
      alert(error.message);
      return;
    }

    logActivity(`Deleted case note from ${note.matter_no}`, "Case Notes");
    if (selectedMatter) await loadNotesForMatter(selectedMatter.id);
  };

  const formatFileSize = (bytes?: number | null) => {
    const value = Number(bytes || 0);
    if (!value) return "0 KB";
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleUploadMatterDocument = async () => {
    if (!selectedMatter) {
      alert("Open a matter first.");
      return;
    }

    if (!canEditMatterDetails) {
      alert("You do not have permission to upload case documents.");
      return;
    }

    const cleanTitle = documentTitle.trim();
    if (!cleanTitle) {
      alert("Please enter a document title.");
      return;
    }

    if (!documentFile) {
      alert("Please choose a file to upload.");
      return;
    }

    if (isUploadingDocument) return;
    setIsUploadingDocument(true);

    let uploadedPath = "";

    try {
      const safeName = documentFile.name
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/-+/g, "-");
      uploadedPath = `${selectedMatter.matter_no}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("matter-documents")
        .upload(uploadedPath, documentFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: documentFile.type || undefined,
        });

      if (uploadError) throw uploadError;

      const { error: recordError } = await supabase
        .from("tumul_matter_documents")
        .insert({
          matter_id: selectedMatter.id,
          matter_no: selectedMatter.matter_no,
          document_name: cleanTitle,
          file_name: documentFile.name,
          file_path: uploadedPath,
          file_type: documentFile.type || null,
          file_size: documentFile.size,
          category: documentCategory,
          uploaded_by: currentUserProfile.name || null,
          uploaded_by_email: currentUserProfile.email || null,
        });

      if (recordError) {
        await supabase.storage.from("matter-documents").remove([uploadedPath]);
        throw recordError;
      }

      logActivity(
        `Uploaded document "${cleanTitle}" to ${selectedMatter.matter_no}`,
        "Documents"
      );

      setDocumentTitle("");
      setDocumentCategory("Client Correspondence");
      setDocumentFile(null);

      const fileInput = document.getElementById(
        "matter-document-file"
      ) as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";

      await loadDocumentsForMatter(selectedMatter.id);
      alert("Document uploaded successfully.");
    } catch (error: any) {
      console.error("Document upload failed:", error);
      alert(`Unable to upload document: ${error?.message || "Unknown error"}`);
    } finally {
      setIsUploadingDocument(false);
    }
  };

  const handleOpenMatterDocument = async (documentItem: MatterDocument) => {
    const { data, error } = await supabase.storage
      .from("matter-documents")
      .createSignedUrl(documentItem.file_path, 60 * 10);

    if (error || !data?.signedUrl) {
      alert(`Unable to open document: ${error?.message || "Could not create secure link."}`);
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const handleDownloadMatterDocument = async (documentItem: MatterDocument) => {
    const { data, error } = await supabase.storage
      .from("matter-documents")
      .download(documentItem.file_path);

    if (error || !data) {
      alert(`Unable to download document: ${error?.message || "File not found."}`);
      return;
    }

    const url = URL.createObjectURL(data);
    const link = document.createElement("a");
    link.href = url;
    link.download = documentItem.file_name || documentItem.document_name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDeleteMatterDocument = async (documentItem: MatterDocument) => {
    if (currentUserProfile.role !== "Super Admin") {
      alert("Only Super Admin can delete case documents.");
      return;
    }

    const confirmed = window.confirm(
      `Delete "${documentItem.document_name}"?\n\nThis will remove both the stored file and its case record.`
    );
    if (!confirmed) return;

    const { error: storageError } = await supabase.storage
      .from("matter-documents")
      .remove([documentItem.file_path]);

    if (storageError) {
      alert(`Unable to delete stored file: ${storageError.message}`);
      return;
    }

    const { error: recordError } = await supabase
      .from("tumul_matter_documents")
      .delete()
      .eq("id", documentItem.id);

    if (recordError) {
      alert(`Stored file was removed, but the document record could not be deleted: ${recordError.message}`);
      return;
    }

    logActivity(
      `Deleted document "${documentItem.document_name}" from ${documentItem.matter_no}`,
      "Documents"
    );

    if (selectedMatter) await loadDocumentsForMatter(selectedMatter.id);
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

    const invoiceAmount = Number(invoiceForm.amount || 0);
    const paidAmount = Number(invoiceForm.amount_paid || 0);
    const calculatedStatus = getCalculatedInvoiceStatus(invoiceAmount, paidAmount);

    const { error } = await supabase.from("invoices").insert({
      invoice_no: invoiceForm.invoice_no,
      client_name: invoiceForm.client_name,
      matter_no: invoiceForm.matter_no,
      amount: invoiceAmount,
      amount_paid: paidAmount,
      service_description:
        invoiceForm.service_description || "Legal service / professional fee",
      status: calculatedStatus,
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
      amount_paid: "",
      service_description: "Legal service / professional fee",
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

  const getOfficialDocumentMeta = (tab: Tab) => {
    switch (tab) {
      case "dashboard":
        return { classification: "Internal Management Document", title: "OPERATIONS DASHBOARD" };
      case "docket":
        return { classification: "Confidential Legal Records", title: "CASE DOCKET REGISTER" };
      case "clients":
        return { classification: "Confidential Client Records", title: "CLIENT REGISTER" };
      case "billing":
        return { classification: "Financial Document", title: "BILLING REGISTER" };
      case "reports":
        return { classification: "Internal Management Report", title: "LEGAL OPERATIONS REPORT" };
      case "users":
        return { classification: "Restricted Internal Document", title: "USER & ROLE REGISTER" };
      case "activity":
        return { classification: "Restricted Audit Record", title: "ACTIVITY LOG" };
      default:
        return { classification: "Official Tumul Legal Document", title: "TUMUL LEGAL RECORD" };
    }
  };

  const officialPrintMeta = getOfficialDocumentMeta(printSection || activeTab);

  const handlePrint = async (sectionName: string) => {
    if (!permissions.printData) {
      alert("You do not have permission to print.");
      return;
    }

    const targetTab = sectionToTab(sectionName);
    setPrintSection(targetTab);
    document.body.classList.add("printing-active");
    logActivity(`Printed ${sectionName}`, sectionName);

    await wait(400);
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

    await wait(400);
    window.print();
  };

  const handlePrintCaseFile = () => {
    if (!selectedMatter) return;
    if (!permissions.printData) {
      alert("You do not have permission to print case files.");
      return;
    }

    const escapeHtml = (value: unknown) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const matterInvoices = invoices.filter(
      (invoice) => invoice.matter_no === selectedMatter.matter_no
    );
    const matterActivities = activityLog.filter((item) =>
      item.action.includes(selectedMatter.matter_no)
    );

    const deadlineRows = matterDeadlines.length
      ? matterDeadlines
          .map((deadline) => {
            const state = getDeadlineState(deadline);
            return `
              <tr>
                <td>${escapeHtml(deadline.title)}</td>
                <td>${escapeHtml(normalizeDateOnly(deadline.deadline_date))}</td>
                <td>${escapeHtml(state)}</td>
                <td>${escapeHtml(deadline.notes || "—")}</td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="4" class="empty">No deadlines recorded for this matter.</td></tr>`;

    const noteRows = matterNotes.length
      ? matterNotes
          .map(
            (note) => `
              <div class="summary" style="margin-bottom:10px;">
                <div style="font-size:10px;color:#64748b;margin-bottom:6px;">
                  <strong>${escapeHtml(note.created_by)}</strong> •
                  ${escapeHtml(new Date(note.created_at).toLocaleString("en-PG"))}
                </div>
                ${escapeHtml(note.note)}
              </div>
            `
          )
          .join("")
      : `<div class="notice">No case notes recorded for this matter.</div>`;

    const invoiceRows =
      permissions.seeFinancials && matterInvoices.length
        ? matterInvoices
            .map((invoice) => {
              const amount = Number(invoice.amount || 0);
              const paid = Number(invoice.amount_paid || 0);
              const balance = Math.max(amount - paid, 0);
              return `
                <tr>
                  <td>${escapeHtml(invoice.invoice_no)}</td>
                  <td>${escapeHtml(invoice.status)}</td>
                  <td class="right">${escapeHtml(currency(amount))}</td>
                  <td class="right">${escapeHtml(currency(paid))}</td>
                  <td class="right">${escapeHtml(currency(balance))}</td>
                </tr>
              `;
            })
            .join("")
        : permissions.seeFinancials
          ? `<tr><td colspan="5" class="empty">No invoices linked to this matter.</td></tr>`
          : `<tr><td colspan="5" class="empty">Billing information is hidden for this user role.</td></tr>`;

    const activityRows = matterActivities.length
      ? matterActivities
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(item.time)}</td>
                <td>${escapeHtml(item.action)}</td>
                <td>${escapeHtml(item.actor)}</td>
                <td>${escapeHtml(item.role)}</td>
              </tr>
            `
          )
          .join("")
      : `<tr><td colspan="4" class="empty">No matching activity recorded in this browser.</td></tr>`;

    const generatedAt = new Date().toLocaleString("en-PG");
    const caseFileHtml = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Tumul Legal Case File - ${escapeHtml(selectedMatter.matter_no)}</title>
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; background: #e5e7eb; font-family: Arial, Helvetica, sans-serif; color: #111827; }
            .toolbar { position: sticky; top: 0; display: flex; justify-content: flex-end; gap: 10px; padding: 14px 24px; background: #e5e7eb; }
            .toolbar button { border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px 18px; cursor: pointer; font-weight: 700; background: white; }
            .toolbar .print { background: #d4af37; border-color: #d4af37; color: #071d18; }
            .page { width: 210mm; min-height: 297mm; margin: 0 auto 24px; background: white; padding: 18mm 16mm; }
            .header { display: flex; justify-content: space-between; gap: 30px; padding-bottom: 18px; border-bottom: 3px solid #0b2b24; }
            .brand { display: flex; align-items: center; gap: 18px; }
            .brand img { width: 105px; height: auto; object-fit: contain; }
            .brand h1 { margin: 0; color: #0b2b24; font-size: 27px; letter-spacing: .02em; }
            .brand p { margin: 5px 0 0; color: #9a7614; font-size: 12px; font-weight: 700; }
            .firm { text-align: right; font-size: 11px; line-height: 1.55; color: #475569; }
            .title { margin: 26px 0 18px; }
            .eyebrow { color: #9a7614; font-size: 11px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }
            .title h2 { margin: 7px 0 4px; font-size: 30px; color: #0f172a; }
            .subtitle { color: #64748b; font-size: 13px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 18px 0; }
            .card { border: 1px solid #d8dee6; border-radius: 10px; padding: 13px 15px; }
            .label { color: #64748b; text-transform: uppercase; letter-spacing: .12em; font-size: 9px; font-weight: 800; margin-bottom: 6px; }
            .value { font-size: 13px; font-weight: 700; white-space: pre-wrap; overflow-wrap: anywhere; }
            .section { margin-top: 24px; break-inside: avoid; }
            .section h3 { margin: 0 0 10px; padding-bottom: 7px; border-bottom: 2px solid #d4af37; color: #0b2b24; font-size: 17px; }
            .summary { border: 1px solid #d8dee6; border-radius: 10px; padding: 14px; font-size: 12px; line-height: 1.6; white-space: pre-wrap; }
            table { width: 100%; border-collapse: collapse; font-size: 10px; }
            th { background: #0b2b24; color: white; text-align: left; padding: 9px 8px; }
            td { border: 1px solid #d8dee6; padding: 8px; vertical-align: top; }
            .right { text-align: right; }
            .empty { color: #64748b; text-align: center; padding: 16px; }
            .notice { border: 1px dashed #cbd5e1; border-radius: 10px; padding: 12px; color: #64748b; font-size: 11px; line-height: 1.5; }
            .footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #d8dee6; color: #64748b; font-size: 9px; display: flex; justify-content: space-between; gap: 20px; }
            @media print {
              body { background: white; }
              .toolbar { display: none; }
              .page { width: auto; min-height: auto; margin: 0; padding: 12mm; }
              @page { size: A4; margin: 8mm; }
            }
          </style>
        </head>
        <body>
          <div class="toolbar">
            <button onclick="window.close()">Close</button>
            <button class="print" onclick="window.print()">Print / Save PDF</button>
          </div>

          <main class="page">
            <header class="header">
              <div class="brand">
                <img src="/tumul-logo.png" alt="Tumul Legal" />
                <div>
                  <h1>TUMUL LEGAL</h1>
                  <p>Excellence, Experience, Integrity</p>
                </div>
              </div>
              <div class="firm">
                <strong>P.O. Box 5856</strong><br/>
                Boroko, National Capital District<br/>
                Papua New Guinea<br/><br/>
                Level 2, Suite 3, Waigani Haus<br/>
                Section 31, Allotment 5<br/>
                Mokoraha Road, Waigani, NCD<br/>
                Phone: +675 78993998<br/>
                Email: mek@tumullegal.com
              </div>
            </header>

            <section class="title">
              <div class="eyebrow">Confidential Legal Matter</div>
              <h2>CASE FILE — ${escapeHtml(selectedMatter.matter_no)}</h2>
              <div class="subtitle">${escapeHtml(selectedMatter.case_type || "Legal Matter")}</div>
            </section>

            <section class="grid">
              <div class="card"><div class="label">Client</div><div class="value">${escapeHtml(selectedMatter.client_name || "Not set")}</div></div>
              <div class="card"><div class="label">Assigned Lawyer</div><div class="value">${escapeHtml(selectedMatter.assigned_lawyer || "Not assigned")}</div></div>
              <div class="card"><div class="label">Status</div><div class="value">${escapeHtml(selectedMatter.status)}</div></div>
              <div class="card"><div class="label">Priority</div><div class="value">${escapeHtml(selectedMatter.priority)}</div></div>
              <div class="card"><div class="label">Court Date</div><div class="value">${escapeHtml(selectedMatter.court_date ? normalizeDateOnly(selectedMatter.court_date) : "Not scheduled")}</div></div>
              <div class="card"><div class="label">Estimated Cost</div><div class="value">${escapeHtml(currency(Number(selectedMatter.cost_estimate || 0)))}</div></div>
            </section>

            <section class="section">
              <h3>Next Legal Action</h3>
              <div class="summary">${escapeHtml(selectedMatter.next_step || "No next legal action recorded.")}</div>
            </section>

            <section class="section">
              <h3>Case Summary</h3>
              <div class="summary">${escapeHtml(selectedMatter.summary || "No case summary recorded.")}</div>
            </section>

            <section class="section">
              <h3>Tasks & Deadlines</h3>
              <table>
                <thead><tr><th>Deadline</th><th>Due Date</th><th>Status</th><th>Notes</th></tr></thead>
                <tbody>${deadlineRows}</tbody>
              </table>
            </section>

            <section class="section">
              <h3>Notes & History</h3>
              ${noteRows}
            </section>

            <section class="section">
              <h3>Documents</h3>
              <div class="notice">Uploaded legal documents are not yet attached to the printable case report. Documents will remain individually controlled until secure document storage is added.</div>
            </section>

            <section class="section">
              <h3>Billing</h3>
              <table>
                <thead><tr><th>Invoice</th><th>Status</th><th class="right">Amount</th><th class="right">Paid</th><th class="right">Balance</th></tr></thead>
                <tbody>${invoiceRows}</tbody>
              </table>
            </section>

            <section class="section">
              <h3>Activity History</h3>
              <table>
                <thead><tr><th>Date / Time</th><th>Action</th><th>User</th><th>Role</th></tr></thead>
                <tbody>${activityRows}</tbody>
              </table>
            </section>

            <footer class="footer">
              <span>Generated by Tumul Legal Management System</span>
            <span>Printed by: ${escapeHtml(currentUserProfile.name || currentEmail || "Authorized User")} • ${escapeHtml(generatedAt)}</span>
            </footer>
          </main>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank", "width=1000,height=1100");
    if (!printWindow) {
      alert("Popup blocked. Please allow popups and try again.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(caseFileHtml);
    printWindow.document.close();
    printWindow.focus();
    logActivity(`Opened case file ${selectedMatter.matter_no} for printing`, "Case Docket");
  };

  const handlePrintInvoice = (invoice: Invoice) => {
    if (!permissions.printData) {
      alert("You do not have permission to print invoices.");
      return;
    }

    const escapeHtml = (value: unknown) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const invoiceDate = invoice.issued_date || new Date().toISOString().slice(0, 10);
    const dueDate = invoice.due_date || "Not set";
    const amount = Number(invoice.amount || 0);
    const amountPaid = Number(invoice.amount_paid || 0);
    const balance = Math.max(amount - amountPaid, 0);
    const calculatedStatus = getCalculatedInvoiceStatus(amount, amountPaid);
    const description = invoice.service_description || "Legal service / professional fee";
    const generatedAt = new Date().toLocaleString("en-PG");

    const invoiceHtml = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Tumul Legal Invoice - ${escapeHtml(invoice.invoice_no)}</title>
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; background: #e5e7eb; font-family: Arial, Helvetica, sans-serif; color: #111827; }
            .toolbar { position: sticky; top: 0; display: flex; justify-content: flex-end; gap: 10px; padding: 14px 24px; background: #e5e7eb; }
            .toolbar button { border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px 18px; cursor: pointer; font-weight: 700; background: white; }
            .toolbar .print { background: #d4af37; border-color: #d4af37; color: #071d18; }
            .page { width: 210mm; min-height: 297mm; margin: 0 auto 24px; background: white; padding: 18mm 16mm; }
            .header { display: flex; justify-content: space-between; gap: 30px; padding-bottom: 18px; border-bottom: 3px solid #0b2b24; }
            .brand { display: flex; align-items: center; gap: 18px; }
            .brand img { width: 105px; height: auto; object-fit: contain; }
            .brand h1 { margin: 0; color: #0b2b24; font-size: 27px; letter-spacing: .02em; }
            .brand p { margin: 5px 0 0; color: #9a7614; font-size: 12px; font-weight: 700; }
            .firm { text-align: right; font-size: 11px; line-height: 1.55; color: #475569; }
            .title { margin: 26px 0 18px; display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
            .eyebrow { color: #9a7614; font-size: 11px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }
            .title h2 { margin: 7px 0 4px; font-size: 30px; color: #0f172a; }
            .subtitle { color: #64748b; font-size: 13px; }
            .status-box { border: 1px solid #d8dee6; border-radius: 10px; padding: 12px 14px; min-width: 205px; font-size: 11px; line-height: 1.7; }
            .status { font-weight: 800; color: ${calculatedStatus === "Paid" ? "#047857" : calculatedStatus === "Part Paid" ? "#0369a1" : "#b45309"}; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 18px 0; }
            .card { border: 1px solid #d8dee6; border-radius: 10px; padding: 13px 15px; }
            .label { color: #64748b; text-transform: uppercase; letter-spacing: .12em; font-size: 9px; font-weight: 800; margin-bottom: 6px; }
            .value { font-size: 13px; font-weight: 700; white-space: pre-wrap; overflow-wrap: anywhere; }
            .section { margin-top: 24px; break-inside: avoid; }
            .section h3 { margin: 0 0 10px; padding-bottom: 7px; border-bottom: 2px solid #d4af37; color: #0b2b24; font-size: 17px; }
            table { width: 100%; border-collapse: collapse; font-size: 10px; }
            th { background: #0b2b24; color: white; text-align: left; padding: 9px 8px; }
            td { border: 1px solid #d8dee6; padding: 10px 8px; vertical-align: top; }
            .right { text-align: right; }
            .totals { margin: 14px 0 0 auto; width: 48%; border: 1px solid #d8dee6; border-radius: 10px; padding: 10px 14px; }
            .total-row { display: flex; justify-content: space-between; gap: 20px; padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
            .total-row:last-child { border-bottom: 0; color: #0b2b24; font-size: 14px; font-weight: 900; }
            .notice { border: 1px solid #d8dee6; border-radius: 10px; padding: 12px; color: #475569; font-size: 11px; line-height: 1.55; }
            .footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #d8dee6; color: #64748b; font-size: 9px; display: flex; justify-content: space-between; gap: 20px; }
            @media print {
              body { background: white; }
              .toolbar { display: none; }
              .page { width: auto; min-height: auto; margin: 0; padding: 12mm; }
              @page { size: A4; margin: 8mm; }
            }
          </style>
        </head>
        <body>
          <div class="toolbar">
            <button onclick="window.close()">Close</button>
            <button class="print" onclick="window.print()">Print / Save PDF</button>
          </div>

          <main class="page">
            <header class="header">
              <div class="brand">
                <img src="/tumul-logo.png" alt="Tumul Legal" />
                <div>
                  <h1>TUMUL LEGAL</h1>
                  <p>Excellence, Experience, Integrity</p>
                </div>
              </div>
              <div class="firm">
                <strong>P.O. Box 5856</strong><br/>
                Boroko, National Capital District<br/>
                Papua New Guinea<br/><br/>
                Level 2, Suite 3, Waigani Haus<br/>
                Section 31, Allotment 5<br/>
                Mokoraha Road, Waigani, NCD<br/>
                Phone: +675 78993998<br/>
                Email: mek@tumullegal.com
              </div>
            </header>

            <section class="title">
              <div>
                <div class="eyebrow">Financial Document</div>
                <h2>INVOICE — ${escapeHtml(invoice.invoice_no || "N/A")}</h2>
                <div class="subtitle">Professional Legal Services</div>
              </div>
              <div class="status-box">
                <strong>Issued:</strong> ${escapeHtml(invoiceDate)}<br/>
                <strong>Due:</strong> ${escapeHtml(dueDate)}<br/>
                <strong>Status:</strong> <span class="status">${escapeHtml(calculatedStatus)}</span>
              </div>
            </section>

            <section class="grid">
              <div class="card"><div class="label">Bill To</div><div class="value">${escapeHtml(invoice.client_name || "Client Name")}</div></div>
              <div class="card"><div class="label">Matter</div><div class="value">${escapeHtml(invoice.matter_no || "Matter Number")}</div></div>
            </section>

            <section class="section">
              <h3>Professional Fees</h3>
              <table>
                <thead><tr><th>Description</th><th class="right">Amount</th></tr></thead>
                <tbody><tr><td>${escapeHtml(description)}</td><td class="right"><strong>${escapeHtml(currency(amount))}</strong></td></tr></tbody>
              </table>
              <div class="totals">
                <div class="total-row"><span>Invoice Total</span><strong>${escapeHtml(currency(amount))}</strong></div>
                <div class="total-row"><span>Amount Paid</span><strong>${escapeHtml(currency(amountPaid))}</strong></div>
                <div class="total-row"><span>Balance Due</span><span>${escapeHtml(currency(balance))}</span></div>
              </div>
            </section>

            <section class="section">
              <h3>Document Note</h3>
              <div class="notice">Thank you for choosing Tumul Legal. This invoice is an official financial document generated from the Tumul Legal Management System.</div>
            </section>

            <footer class="footer">
              <span>Tumul Legal • Financial Document • Generated by Tumul Legal Management System</span>
              <span>Printed by: ${escapeHtml(currentUserProfile.name || currentEmail || "Authorized User")} • ${escapeHtml(generatedAt)}</span>
            </footer>
          </main>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank", "width=1000,height=1100");
    if (!printWindow) {
      alert("Popup blocked. Please allow popups and try again.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(invoiceHtml);
    printWindow.document.close();
    printWindow.focus();
    logActivity(`Opened invoice ${invoice.invoice_no} for printing`, "Billing");
  };

  const handleUpdateInvoicePayment = async (invoice: Invoice) => {
    if (!permissions.addInvoice) {
      alert("You do not have permission to update invoice payments.");
      return;
    }
    const invoiceAmount = Number(invoice.amount || 0);
    const currentPaid = Number(invoice.amount_paid || 0);
    const enteredAmount = window.prompt(
      `Enter total amount paid for ${invoice.invoice_no}.\nInvoice total: ${currency(invoiceAmount)}\nCurrent paid: ${currency(currentPaid)}`,
      String(currentPaid)
    );
    if (enteredAmount === null) return;
    const paidAmount = Number(enteredAmount);
    if (Number.isNaN(paidAmount) || paidAmount < 0) {
      alert("Please enter a valid payment amount.");
      return;
    }
    if (paidAmount > invoiceAmount) {
      alert("Amount paid cannot be greater than the invoice amount.");
      return;
    }
    const updatedStatus = getCalculatedInvoiceStatus(invoiceAmount, paidAmount);
    const { error } = await supabase
      .from("invoices")
      .update({ amount_paid: paidAmount, status: updatedStatus })
      .eq("id", invoice.id);
    if (error) {
      alert(error.message);
      return;
    }
    logActivity(
      `Updated payment for ${invoice.invoice_no}: ${currency(paidAmount)} paid, status ${updatedStatus}`,
      "Billing"
    );
    await loadAllData();
  };

  const handleDeleteInvoice = async (invoice: Invoice) => {
    if (currentUserProfile.role !== "Super Admin") {
      alert("Only Super Admin can delete invoices.");
      return;
    }

    const confirmed = window.confirm(
      `Delete invoice ${invoice.invoice_no}?\n\nThis action cannot be undone.`
    );
    if (!confirmed) return;

    const { error } = await supabase
      .from("invoices")
      .delete()
      .eq("id", invoice.id);

    if (error) {
      alert(error.message);
      return;
    }

    logActivity(`Deleted invoice ${invoice.invoice_no}`, "Billing");
    await loadAllData();
    alert(`Invoice ${invoice.invoice_no} deleted successfully.`);
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
        return "bg-[#d4af37]/12 text-[#f2d675] border border-[#d4af37]/30";
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
        return "bg-[#d4af37]/15 text-[#f6e7a8] border border-[#d4af37]/35";
      case "Lawyer":
        return "bg-emerald-400/12 text-emerald-200 border border-emerald-400/25";
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
    "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-400 outline-none transition focus:border-[#d4af37]/70 focus:bg-white/10";
  const sectionTitle = "text-lg font-semibold text-white";
  const muted = "text-sm text-slate-400";
  const buttonClass =
    "rounded-2xl px-4 py-3 text-sm font-semibold transition";
  const secondaryButton =
    `${buttonClass} border border-white/10 bg-white/5 text-white hover:bg-white/10`;
  const primaryButton =
    `${buttonClass} bg-gradient-to-r from-[#d4af37] to-[#f2d675] text-slate-950`;

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
            ? "bg-gradient-to-r from-[#d4af37] to-[#f2d675] text-slate-950 shadow-lg"
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

  if (loading || (session && !accessVerified)) {
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
                <div className="rounded-2xl border border-[#d4af37]/25 bg-[#d4af37]/10 px-4 py-3 text-sm text-[#f6e7a8]">
                  {authMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-gradient-to-r from-[#d4af37] to-[#f2d675] px-4 py-3 font-semibold text-slate-950 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading
                  ? "Please wait..."
                  : true
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(212,175,55,0.10),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(16,74,61,0.28),_transparent_26%),linear-gradient(160deg,#03130f_0%,#071d18_42%,#0b211c_100%)] text-white">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="w-full border-b border-white/10 bg-[#041712]/90 px-4 py-5 backdrop-blur-xl lg:w-80 lg:border-b-0 lg:border-r">
          <div className="mb-6 px-2">
            <img
              src="/tumul-logo.png"
              alt="Tumul Legal Logo"
              className="mb-4 h-16 w-auto max-w-[220px] object-contain object-left"
            />
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#d4af37]">
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
                  <span className="text-sm font-bold text-[#f2d675]">
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
          <div className="official-print-header">
            <div className="official-print-brand">
              <div className="official-print-brand-left">
                <img src="/tumul-logo.png" alt="Tumul Legal" />
                <div>
                  <h1>TUMUL LEGAL</h1>
                  <p>Excellence, Experience, Integrity</p>
                </div>
              </div>
              <div className="official-print-firm">
                <strong>P.O. Box 5856</strong><br />
                Boroko, National Capital District, Papua New Guinea<br />
                Level 2, Suite 3, Waigani Haus, Mokoraha Road, Waigani, NCD<br />
                Phone: +675 78993998 • Email: mek@tumullegal.com
              </div>
            </div>
            <div className="official-print-title">
              <div className="official-print-eyebrow">{officialPrintMeta.classification}</div>
              <h2>{officialPrintMeta.title}</h2>
              <p>Generated from the Tumul Legal Management System</p>
            </div>
          </div>
          <div className={`${glassCard} mb-6 overflow-hidden no-print`}>
            <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-medium text-[#d4af37]">
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
                                <p className="text-sm font-semibold text-[#f6e7a8]">{deadline.matter_no}</p>
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
                                <div className="font-semibold text-[#f2d675] hover:text-[#f6e7a8]">
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
                                  className="rounded-2xl px-4 py-2 text-xs font-semibold transition border border-[#d4af37]/35 bg-[#d4af37]/10 text-[#f6e7a8] hover:bg-[#d4af37]/20"
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
                    <div className="mb-5 flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#d4af37]">Digital Case File</p>
                        <h3 className="mt-2 text-2xl font-bold text-white">
                          {selectedMatter.matter_no} — {selectedMatter.case_type || "Legal Matter"}
                        </h3>
                        <p className="mt-2 text-sm text-slate-400">
                          {selectedMatter.client_name} • Assigned to {selectedMatter.assigned_lawyer || "Not assigned"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(selectedMatter.status)}`}>{selectedMatter.status}</span>
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getPriorityClass(selectedMatter.priority)}`}>{selectedMatter.priority}</span>
                        {permissions.printData && (
                          <button onClick={handlePrintCaseFile} className={primaryButton}>
                            Print Case File
                          </button>
                        )}
                        <button onClick={closeMatterFile} className={secondaryButton}>Close</button>
                      </div>
                    </div>

                    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                      {([
                        ["overview", "Overview"], ["tasks", "Tasks & Deadlines"], ["notes", "Notes & History"],
                        ["documents", "Documents"], ["billing", "Billing"], ["activity", "Activity"]
                      ] as [MatterFileTab, string][]).map(([id, label]) => (
                        <button key={id} onClick={() => setMatterFileTab(id)} className={matterFileTab === id ? primaryButton : secondaryButton}>{label}</button>
                      ))}
                    </div>

                    {matterFileTab === "overview" && (
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs uppercase tracking-wider text-slate-400">Client</p><p className="mt-2 font-semibold text-white">{selectedMatter.client_name || "Not set"}</p></div>
                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs uppercase tracking-wider text-slate-400">Assigned Lawyer</p><p className="mt-2 font-semibold text-white">{selectedMatter.assigned_lawyer || "Not assigned"}</p></div>
                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs uppercase tracking-wider text-slate-400">Next Court Date</p><p className="mt-2 font-semibold text-white">{selectedMatter.court_date ? normalizeDateOnly(selectedMatter.court_date) : "Not scheduled"}</p></div>
                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs uppercase tracking-wider text-slate-400">Estimated Cost</p><p className="mt-2 font-semibold text-white">{currency(Number(selectedMatter.cost_estimate || 0))}</p></div>
                        </div>

                        <div className="rounded-2xl border border-[#d4af37]/25 bg-[#d4af37]/5 p-5">
                          <p className="text-xs uppercase tracking-[0.18em] text-[#f2d675]">Next Legal Action</p>
                          <p className="mt-2 text-lg font-semibold text-white">{selectedMatter.next_step || "No next legal action recorded."}</p>
                        </div>

                        <div className="flex justify-end">
                          {canEditMatterDetails && !isEditingMatter && <button onClick={() => setIsEditingMatter(true)} className={primaryButton}>Edit Matter Details</button>}
                        </div>

                        {isEditingMatter ? (
                          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                            <div><label className="mb-2 block text-sm text-slate-300">Matter Number</label><input value={selectedMatter.matter_no} onChange={(e) => updateSelectedMatterField("matter_no", e.target.value)} className={inputClass}/></div>
                            <div><label className="mb-2 block text-sm text-slate-300">Client Name</label><input value={selectedMatter.client_name} onChange={(e) => updateSelectedMatterField("client_name", e.target.value)} className={inputClass}/></div>
                            <div><label className="mb-2 block text-sm text-slate-300">Case Type</label><input value={selectedMatter.case_type} onChange={(e) => updateSelectedMatterField("case_type", e.target.value)} className={inputClass}/></div>
                            <div><label className="mb-2 block text-sm text-slate-300">Assigned Lawyer</label><input value={selectedMatter.assigned_lawyer} onChange={(e) => updateSelectedMatterField("assigned_lawyer", e.target.value)} className={inputClass}/></div>
                            <div><label className="mb-2 block text-sm text-slate-300">Status</label><select value={selectedMatter.status} onChange={(e) => updateSelectedMatterField("status", e.target.value as MatterStatus)} className={inputClass}>{["Open","In Progress","Pending Filing","In Court","Awaiting Client","Closed"].map(x=><option key={x} className="bg-slate-900">{x}</option>)}</select></div>
                            <div><label className="mb-2 block text-sm text-slate-300">Priority</label><select value={selectedMatter.priority} onChange={(e) => updateSelectedMatterField("priority", e.target.value as Priority)} className={inputClass}>{["High","Medium","Low"].map(x=><option key={x} className="bg-slate-900">{x}</option>)}</select></div>
                            <div><label className="mb-2 block text-sm text-slate-300">Court Date</label><input type="date" value={selectedMatter.court_date || ""} onChange={(e) => updateSelectedMatterField("court_date", e.target.value)} className={inputClass}/></div>
                            <div><label className="mb-2 block text-sm text-slate-300">Estimated Cost</label><input type="number" value={selectedMatter.cost_estimate || 0} onChange={(e) => updateSelectedMatterField("cost_estimate", Number(e.target.value || 0))} className={inputClass}/></div>
                            <div className="xl:col-span-2"><label className="mb-2 block text-sm text-slate-300">Next Legal Action</label><input value={selectedMatter.next_step || ""} onChange={(e) => updateSelectedMatterField("next_step", e.target.value)} placeholder="e.g. Prepare affidavit for filing" className={inputClass}/></div>
                            <div className="xl:col-span-2"><label className="mb-2 block text-sm text-slate-300">Case Summary</label><textarea value={selectedMatter.summary || ""} onChange={(e) => updateSelectedMatterField("summary", e.target.value)} className={`${inputClass} min-h-[160px] resize-y`}/></div>
                            <div className="xl:col-span-2 flex justify-end gap-3"><button onClick={() => setIsEditingMatter(false)} className={secondaryButton}>Cancel</button><button onClick={async () => { await handleSaveMatterDetails(); setIsEditingMatter(false); }} disabled={isSavingMatter} className={primaryButton}>{isSavingMatter ? "Saving..." : "Save Changes"}</button></div>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-white/10 bg-white/5 p-5"><h4 className="font-semibold text-white">Case Summary</h4><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">{selectedMatter.summary || "No case summary recorded."}</p></div>
                        )}
                      </div>
                    )}

                    {matterFileTab === "tasks" && (
                      <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h4 className="text-lg font-semibold text-white">Tasks & Deadlines</h4><p className="text-sm text-slate-400">Track court appearances, filings, client follow-ups and other critical dates.</p></div><div className="text-sm text-slate-400">Total: {matterDeadlines.length}</div></div>
                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.2fr_180px_1fr_auto]"><input value={deadlineForm.title} onChange={(e)=>setDeadlineForm({...deadlineForm,title:e.target.value})} placeholder="Task / deadline title" className={inputClass} disabled={!canEditMatterDetails}/><input type="date" value={deadlineForm.deadline_date} onChange={(e)=>setDeadlineForm({...deadlineForm,deadline_date:e.target.value})} className={inputClass} disabled={!canEditMatterDetails}/><input value={deadlineForm.notes} onChange={(e)=>setDeadlineForm({...deadlineForm,notes:e.target.value})} placeholder="Notes or assigned person (optional)" className={inputClass} disabled={!canEditMatterDetails}/><button onClick={handleAddDeadline} disabled={!canEditMatterDetails || isSavingDeadline} className={canEditMatterDetails ? primaryButton : secondaryButton}>{isSavingDeadline ? "Saving..." : "Add Task"}</button></div>
                        <div className="mt-5 space-y-3">{matterDeadlines.length===0 && <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-400">No tasks or deadlines added for this matter yet.</div>}{matterDeadlines.map((deadline)=>{const deadlineState=getDeadlineState(deadline);return <div key={deadline.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="text-base font-semibold text-white">{deadline.title}</p><span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getDeadlineBadgeClass(deadlineState)}`}>{deadlineState}</span></div><p className="mt-2 text-sm text-slate-300">Due: {normalizeDateOnly(deadline.deadline_date)}</p><p className="mt-1 text-sm text-slate-400">{deadline.notes || "No notes"}</p></div><div className="flex flex-wrap gap-2"><button onClick={()=>handleToggleDeadlineComplete(deadline)} className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-xs font-semibold text-emerald-200">{deadline.is_completed ? "Re-open" : "Mark Complete"}</button><button onClick={()=>handleDeleteDeadline(deadline)} className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-xs font-semibold text-rose-200">Remove</button></div></div></div>})}</div>
                      </div>
                    )}

                    {matterFileTab === "notes" && (
                      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h4 className="text-lg font-semibold text-white">Notes & History</h4>
                            <p className="text-sm text-slate-400">Record timestamped legal notes and matter history.</p>
                          </div>
                          <div className="text-sm text-slate-400">Total: {matterNotes.length}</div>
                        </div>

                        {canEditMatterDetails && (
                          <div className="rounded-2xl border border-[#d4af37]/20 bg-[#d4af37]/5 p-4">
                            <label className="mb-2 block text-sm font-semibold text-slate-200">Add Case Note</label>
                            <textarea
                              value={noteText}
                              onChange={(e) => setNoteText(e.target.value)}
                              placeholder="Enter client conference notes, legal updates, instructions received, filing history or other matter information..."
                              className={`${inputClass} min-h-[140px] resize-y`}
                            />
                            <div className="mt-3 flex items-center justify-between gap-3">
                              <p className="text-xs text-slate-400">
                                Saved as {currentUserProfile.name} with the current date and time.
                              </p>
                              <button onClick={handleAddMatterNote} disabled={isSavingNote || !noteText.trim()} className={primaryButton}>
                                {isSavingNote ? "Saving..." : "Save Note"}
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="mt-5 space-y-3">
                          {matterNotes.length === 0 && (
                            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-400">
                              No case notes have been recorded for this matter yet.
                            </div>
                          )}
                          {matterNotes.map((note) => (
                            <div key={note.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-semibold text-white">{note.created_by}</p>
                                    <span className="text-xs text-slate-500">{new Date(note.created_at).toLocaleString("en-PG")}</span>
                                  </div>
                                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">{note.note}</p>
                                </div>
                                {currentUserProfile.role === "Super Admin" && (
                                  <button onClick={() => handleDeleteMatterNote(note)} className="shrink-0 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-400/20">
                                    Delete
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {matterFileTab === "documents" && (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                        <div className="mb-4">
                          <h3 className="text-lg font-semibold text-white">Case Documents</h3>
                          <p className="mt-1 text-sm text-slate-400">
                            Securely upload and manage files linked to this legal matter.
                          </p>
                        </div>

                        {canEditMatterDetails && (
                          <div className="rounded-2xl border border-[#d4af37]/25 bg-[#d4af37]/[0.04] p-4">
                            <div className="mb-3 text-sm font-semibold text-white">
                              Upload Case Document
                            </div>
                            <div className="grid gap-3 lg:grid-cols-2">
                              <input
                                value={documentTitle}
                                onChange={(e) => setDocumentTitle(e.target.value)}
                                placeholder="Document title"
                                className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                              />
                              <select
                                value={documentCategory}
                                onChange={(e) => setDocumentCategory(e.target.value)}
                                className="rounded-xl border border-white/10 bg-[#17352e] px-4 py-3 text-sm text-white outline-none"
                              >
                                <option>Client Correspondence</option>
                                <option>Contract</option>
                                <option>Court Document</option>
                                <option>Evidence</option>
                                <option>Legal Draft</option>
                                <option>Other</option>
                              </select>
                            </div>

                            <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center">
                              <input
                                id="matter-document-file"
                                type="file"
                                onChange={(e) => setDocumentFile(e.target.files?.[0] || null)}
                                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-[#d4af37] file:px-3 file:py-2 file:font-semibold file:text-[#071d18]"
                              />
                              <button
                                type="button"
                                onClick={handleUploadMatterDocument}
                                disabled={isUploadingDocument}
                                className="rounded-xl bg-[#e7c449] px-5 py-3 text-sm font-bold text-[#071d18] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isUploadingDocument ? "Uploading..." : "Upload Document"}
                              </button>
                            </div>
                            <p className="mt-2 text-xs text-slate-500">
                              Files are stored in the private matter-documents storage bucket and linked to {selectedMatter?.matter_no}.
                            </p>
                          </div>
                        )}

                        <div className="mt-5 flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-white">Stored Documents</div>
                            <div className="text-xs text-slate-500">
                              Files attached to this matter
                            </div>
                          </div>
                          <div className="text-sm text-slate-400">Total: {matterDocuments.length}</div>
                        </div>

                        <div className="mt-3 space-y-3">
                          {matterDocuments.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-slate-500">
                              No documents uploaded for this matter yet.
                            </div>
                          ) : (
                            matterDocuments.map((documentItem) => (
                              <div
                                key={documentItem.id}
                                className="rounded-2xl border border-white/10 bg-[#102720] p-4"
                              >
                                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="font-semibold text-white">
                                        {documentItem.document_name}
                                      </div>
                                      <span className="rounded-full border border-[#d4af37]/30 bg-[#d4af37]/10 px-2 py-1 text-[10px] font-semibold text-[#f2d675]">
                                        {documentItem.category || "General"}
                                      </span>
                                    </div>
                                    <div className="mt-2 break-all text-xs text-slate-400">
                                      {documentItem.file_name} • {formatFileSize(documentItem.file_size)}
                                    </div>
                                    <div className="mt-1 text-xs text-slate-500">
                                      Uploaded by {documentItem.uploaded_by || "Unknown User"}
                                      {documentItem.created_at
                                        ? ` • ${new Date(documentItem.created_at).toLocaleString("en-PG")}`
                                        : ""}
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenMatterDocument(documentItem)}
                                      className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-xs font-semibold text-emerald-200"
                                    >
                                      View
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDownloadMatterDocument(documentItem)}
                                      className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white"
                                    >
                                      Download
                                    </button>
                                    {currentUserProfile.role === "Super Admin" && (
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteMatterDocument(documentItem)}
                                        className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-xs font-semibold text-rose-200"
                                      >
                                        Delete
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {matterFileTab === "billing" && <div className="rounded-3xl border border-white/10 bg-white/5 p-6"><div className="mb-4 flex items-center justify-between"><div><h4 className="text-lg font-semibold text-white">Matter Billing</h4><p className="text-sm text-slate-400">Invoices connected to {selectedMatter.matter_no}.</p></div></div><div className="space-y-3">{invoices.filter(i=>i.matter_no===selectedMatter.matter_no).map(i=><div key={i.id} className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-slate-950/40 p-4 md:flex-row md:items-center md:justify-between"><div><p className="font-semibold text-white">{i.invoice_no}</p><p className="text-sm text-slate-400">{i.service_description || "Legal service / professional fee"}</p></div><div className="text-left md:text-right"><p className="font-semibold text-white">{currency(Number(i.amount||0))}</p><span className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(i.status)}`}>{i.status}</span></div></div>)}{!invoices.some(i=>i.matter_no===selectedMatter.matter_no) && <p className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-slate-400">No invoices are linked to this matter.</p>}</div></div>}
                    {matterFileTab === "activity" && <div className="rounded-3xl border border-white/10 bg-white/5 p-6"><h4 className="text-lg font-semibold text-white">Matter Activity</h4><p className="mt-1 text-sm text-slate-400">Recent recorded actions that reference {selectedMatter.matter_no}.</p><div className="mt-4 space-y-3">{activityLog.filter(a=>a.action.includes(selectedMatter.matter_no)).map(a=><div key={a.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"><p className="text-sm font-semibold text-white">{a.action}</p><p className="mt-1 text-xs text-slate-400">{a.actor} • {a.role} • {a.time}</p></div>)}{!activityLog.some(a=>a.action.includes(selectedMatter.matter_no)) && <p className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-slate-400">No matching activity recorded in this browser yet.</p>}</div></div>}
                    {matterFileTab === "documents" ? null : null}

                    <div className="mt-6 flex justify-end border-t border-white/10 pt-5"><button onClick={closeMatterFile} className={secondaryButton}>Close File</button></div>
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
                        <span className="rounded-full border border-[#d4af37]/35 bg-[#d4af37]/10 px-3 py-1 text-xs font-semibold text-[#f6e7a8]">
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
                  <input
                    type="number"
                    value={invoiceForm.amount_paid}
                    onChange={(e) =>
                      setInvoiceForm({
                        ...invoiceForm,
                        amount_paid: e.target.value,
                      })
                    }
                    placeholder="Amount Paid (optional)"
                    className={inputClass}
                    disabled={!permissions.addInvoice}
                  />
                  <textarea
                    value={invoiceForm.service_description}
                    onChange={(e) =>
                      setInvoiceForm({
                        ...invoiceForm,
                        service_description: e.target.value,
                      })
                    }
                    placeholder="Service Description"
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
                    <h4 className="mt-2 text-2xl font-bold text-[#f2d675]">
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
                        <th className="px-3 py-3">Paid</th>
                        <th className="px-3 py-3">Balance</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3 no-print">Action</th>
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
                          <td className="px-3 py-4 font-semibold text-emerald-300">
                            {currency(Number(invoice.amount_paid || 0))}
                          </td>
                          <td className="px-3 py-4 font-semibold text-[#f2d675]">
                            {currency(getInvoiceBalance(invoice))}
                          </td>
                          <td className="px-3 py-4">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
                                getCalculatedInvoiceStatus(
                                  Number(invoice.amount || 0),
                                  Number(invoice.amount_paid || 0)
                                )
                              )}`}
                            >
                              {getCalculatedInvoiceStatus(
                                Number(invoice.amount || 0),
                                Number(invoice.amount_paid || 0)
                              )}
                            </span>
                          </td>
                          <td className="px-3 py-4 no-print">
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => handleUpdateInvoicePayment(invoice)}
                                className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/20"
                              >
                                Update Payment
                              </button>
                              <button
                                onClick={() => handlePrintInvoice(invoice)}
                                className="rounded-2xl border border-[#d4af37]/35 bg-[#d4af37]/10 px-4 py-2 text-xs font-semibold text-[#f6e7a8] transition hover:bg-[#d4af37]/20"
                              >
                                Print / Save PDF
                              </button>
                              {currentUserProfile.role === "Super Admin" && (
                                <button
                                  onClick={() => handleDeleteInvoice(invoice)}
                                  className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/20"
                                >
                                  Delete
                                </button>
                              )}
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
                      <h4 className="mt-2 text-2xl font-bold text-[#f2d675]">
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

                <div className="mt-5 rounded-2xl border border-[#d4af37]/25 bg-[#d4af37]/10 p-4 text-sm text-[#fff1b8]">
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
          <div className="official-print-footer">
            <span>Tumul Legal • Official System Document</span>
            <span>Printed by: {currentUserProfile.name || currentEmail || "Authorized User"} • {new Date().toLocaleString("en-PG")}</span>
          </div>
          </div>

          <style jsx global>{`
            :root {
              --tumul-green: #0b2b24;
              --tumul-green-deep: #041712;
              --tumul-gold: #d4af37;
              --tumul-gold-light: #f2d675;
            }

            /* Tumul Legal brand polish */
            ::selection {
              background: rgba(212, 175, 55, 0.32);
              color: #ffffff;
            }

            input:focus, textarea:focus, select:focus {
              box-shadow: 0 0 0 1px rgba(212, 175, 55, 0.16);
            }

            .official-print-header,
            .official-print-footer {
              display: none;
            }

            @media print {
              @page {
                size: A4 portrait;
                margin: 12mm;
              }

              html, body {
                background: #ffffff !important;
              }

              body.printing-active .official-print-header,
              body.printing-active .official-print-header *,
              body.printing-active .official-print-footer,
              body.printing-active .official-print-footer * {
                visibility: visible !important;
              }

              body.printing-active .official-print-header {
                display: block !important;
                margin-bottom: 8mm !important;
                color: #111827 !important;
              }

              body.printing-active .official-print-brand {
                display: flex !important;
                justify-content: space-between !important;
                gap: 8mm !important;
                padding-bottom: 5mm !important;
                border-bottom: 3px solid #0b2b24 !important;
              }

              body.printing-active .official-print-brand-left {
                display: flex !important;
                align-items: center !important;
                gap: 5mm !important;
              }

              body.printing-active .official-print-brand-left img {
                width: 28mm !important;
                height: auto !important;
              }

              body.printing-active .official-print-brand-left h1 {
                margin: 0 !important;
                color: #0b2b24 !important;
                font-size: 20pt !important;
              }

              body.printing-active .official-print-brand-left p {
                margin: 2mm 0 0 !important;
                color: #9a7614 !important;
                font-size: 9pt !important;
                font-weight: 700 !important;
              }

              body.printing-active .official-print-firm {
                text-align: right !important;
                color: #475569 !important;
                font-size: 7.5pt !important;
                line-height: 1.45 !important;
              }

              body.printing-active .official-print-title {
                margin: 7mm 0 6mm !important;
              }

              body.printing-active .official-print-eyebrow {
                color: #9a7614 !important;
                font-size: 7.5pt !important;
                font-weight: 800 !important;
                letter-spacing: .16em !important;
                text-transform: uppercase !important;
              }

              body.printing-active .official-print-title h2 {
                margin: 2mm 0 1mm !important;
                color: #0f172a !important;
                font-size: 20pt !important;
              }

              body.printing-active .official-print-title p {
                margin: 0 !important;
                color: #64748b !important;
                font-size: 8pt !important;
              }

              body.printing-active .official-print-footer {
                display: flex !important;
                justify-content: space-between !important;
                gap: 8mm !important;
                margin-top: 8mm !important;
                padding-top: 3mm !important;
                border-top: 1px solid #d8dee6 !important;
                color: #64748b !important;
                font-size: 7pt !important;
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
              body.printing-active #print-root .text-[#f2d675],
              body.printing-active #print-root .text-[#f6e7a8],
              body.printing-active #print-root .text-emerald-200,
              body.printing-active #print-root .text-rose-200,
              body.printing-active #print-root .text-amber-200,
              body.printing-active #print-root .text-violet-200,
              body.printing-active #print-root .text-blue-200 {
                color: #111827 !important;
              }

              /* Official A4 document cleanup */
              body.printing-active #print-root {
                font-size: 9pt !important;
                overflow: visible !important;
              }

              body.printing-active #print-root > * {
                max-width: 100% !important;
              }

              body.printing-active #print-root .overflow-x-auto,
              body.printing-active #print-root .overflow-auto,
              body.printing-active #print-root .overflow-hidden {
                overflow: visible !important;
                max-width: 100% !important;
              }

              body.printing-active #print-root table {
                table-layout: fixed !important;
                width: 100% !important;
                font-size: 7.4pt !important;
                page-break-inside: auto !important;
              }

              body.printing-active #print-root thead {
                display: table-header-group !important;
              }

              body.printing-active #print-root tfoot {
                display: table-footer-group !important;
              }

              body.printing-active #print-root tr {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }

              body.printing-active #print-root th,
              body.printing-active #print-root td {
                padding: 2.2mm 1.6mm !important;
                white-space: normal !important;
                overflow-wrap: anywhere !important;
                word-break: normal !important;
                vertical-align: top !important;
              }

              body.printing-active #print-root .rounded-3xl,
              body.printing-active #print-root .rounded-2xl {
                border: 1px solid #d1d5db !important;
                border-radius: 3mm !important;
                box-shadow: none !important;
              }

              /* Keep compact cards together, but allow long lists/reports to flow naturally. */
              body.printing-active #print-root .grid > .rounded-3xl,
              body.printing-active #print-root .grid > .rounded-2xl {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }

              body.printing-active #print-root .space-y-3 > *,
              body.printing-active #print-root .space-y-4 > * {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }

              /* Remove screen-only scrolling controls from official paper/PDF output. */
              body.printing-active #print-root ::-webkit-scrollbar {
                display: none !important;
                width: 0 !important;
                height: 0 !important;
              }

              /* Registers need denser typography to fit cleanly on portrait A4. */
              body.printing-active #print-root[data-print-section="docket"] table,
              body.printing-active #print-root[data-print-section="billing"] table {
                font-size: 6.8pt !important;
              }

              body.printing-active #print-root[data-print-section="docket"] th,
              body.printing-active #print-root[data-print-section="docket"] td,
              body.printing-active #print-root[data-print-section="billing"] th,
              body.printing-active #print-root[data-print-section="billing"] td {
                padding: 1.8mm 1.1mm !important;
              }

              /* Keep short register labels readable instead of breaking inside words. */
              body.printing-active #print-root[data-print-section="docket"] th:nth-child(5),
              body.printing-active #print-root[data-print-section="docket"] td:nth-child(5),
              body.printing-active #print-root[data-print-section="docket"] th:nth-child(6),
              body.printing-active #print-root[data-print-section="docket"] td:nth-child(6),
              body.printing-active #print-root[data-print-section="billing"] th:nth-child(9),
              body.printing-active #print-root[data-print-section="billing"] td:nth-child(9) {
                white-space: nowrap !important;
                overflow-wrap: normal !important;
                word-break: keep-all !important;
              }

              /* Give status/priority enough room while keeping the registers on portrait A4. */
              body.printing-active #print-root[data-print-section="docket"] th:nth-child(1),
              body.printing-active #print-root[data-print-section="docket"] td:nth-child(1) { width: 10% !important; }
              body.printing-active #print-root[data-print-section="docket"] th:nth-child(2),
              body.printing-active #print-root[data-print-section="docket"] td:nth-child(2) { width: 11% !important; }
              body.printing-active #print-root[data-print-section="docket"] th:nth-child(3),
              body.printing-active #print-root[data-print-section="docket"] td:nth-child(3) { width: 11% !important; }
              body.printing-active #print-root[data-print-section="docket"] th:nth-child(4),
              body.printing-active #print-root[data-print-section="docket"] td:nth-child(4) { width: 11% !important; }
              body.printing-active #print-root[data-print-section="docket"] th:nth-child(5),
              body.printing-active #print-root[data-print-section="docket"] td:nth-child(5) { width: 12% !important; }
              body.printing-active #print-root[data-print-section="docket"] th:nth-child(6),
              body.printing-active #print-root[data-print-section="docket"] td:nth-child(6) { width: 10% !important; }
              body.printing-active #print-root[data-print-section="docket"] th:nth-child(7),
              body.printing-active #print-root[data-print-section="docket"] td:nth-child(7) { width: 11% !important; }
              body.printing-active #print-root[data-print-section="docket"] th:nth-child(8),
              body.printing-active #print-root[data-print-section="docket"] td:nth-child(8) { width: 10% !important; }
              body.printing-active #print-root[data-print-section="docket"] th:nth-child(9),
              body.printing-active #print-root[data-print-section="docket"] td:nth-child(9) { width: 14% !important; }

              body.printing-active #print-root[data-print-section="billing"] th:nth-child(1),
              body.printing-active #print-root[data-print-section="billing"] td:nth-child(1) { width: 9% !important; }
              body.printing-active #print-root[data-print-section="billing"] th:nth-child(2),
              body.printing-active #print-root[data-print-section="billing"] td:nth-child(2) { width: 11% !important; }
              body.printing-active #print-root[data-print-section="billing"] th:nth-child(3),
              body.printing-active #print-root[data-print-section="billing"] td:nth-child(3) { width: 10% !important; }
              body.printing-active #print-root[data-print-section="billing"] th:nth-child(4),
              body.printing-active #print-root[data-print-section="billing"] td:nth-child(4),
              body.printing-active #print-root[data-print-section="billing"] th:nth-child(5),
              body.printing-active #print-root[data-print-section="billing"] td:nth-child(5) { width: 11% !important; }
              body.printing-active #print-root[data-print-section="billing"] th:nth-child(6),
              body.printing-active #print-root[data-print-section="billing"] td:nth-child(6),
              body.printing-active #print-root[data-print-section="billing"] th:nth-child(7),
              body.printing-active #print-root[data-print-section="billing"] td:nth-child(7),
              body.printing-active #print-root[data-print-section="billing"] th:nth-child(8),
              body.printing-active #print-root[data-print-section="billing"] td:nth-child(8) { width: 12% !important; }
              body.printing-active #print-root[data-print-section="billing"] th:nth-child(9),
              body.printing-active #print-root[data-print-section="billing"] td:nth-child(9) { width: 12% !important; }

              body.printing-active #print-root[data-print-section="docket"] td:nth-child(5) span,
              body.printing-active #print-root[data-print-section="docket"] td:nth-child(6) span,
              body.printing-active #print-root[data-print-section="billing"] td:nth-child(9) span {
                display: inline-block !important;
                white-space: nowrap !important;
                padding-left: 1.5mm !important;
                padding-right: 1.5mm !important;
              }

              /* Prevent an official footer from being stranded on a page by itself. */
              body.printing-active .official-print-footer {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }

              /* Compact management reports so headings stay with their content. */
              body.printing-active #print-root h1,
              body.printing-active #print-root h2,
              body.printing-active #print-root h3 {
                break-after: avoid !important;
                page-break-after: avoid !important;
              }

              body.printing-active #print-root[data-print-section="dashboard"] .grid,
              body.printing-active #print-root[data-print-section="reports"] .grid {
                gap: 3mm !important;
              }

              body.printing-active #print-root[data-print-section="activity"] .space-y-3,
              body.printing-active #print-root[data-print-section="activity"] .space-y-4 {
                gap: 2mm !important;
              }
            }
          `}</style>
        </main>
      </div>
    </div>
  );
}
