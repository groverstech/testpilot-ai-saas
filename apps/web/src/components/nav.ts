import {
  BarChart3,
  Bot,
  Bug,
  CreditCard,
  FileText,
  FlaskConical,
  FolderKanban,
  GitBranch,
  History,
  Images,
  LayoutDashboard,
  ListChecks,
  Plug,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/repositories", label: "Repositories", icon: GitBranch },
    ],
  },
  {
    label: "Testing",
    items: [
      { href: "/test-runs", label: "Test Runs", icon: FlaskConical },
      { href: "/test-cases", label: "Test Cases", icon: ListChecks },
      { href: "/agents", label: "AI Agents", icon: Bot },
      { href: "/visual-qa", label: "Visual QA", icon: Images },
      { href: "/bugs", label: "Bug Reports", icon: Bug },
      { href: "/history", label: "Test History", icon: History },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/reports", label: "Reports", icon: FileText },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/integrations", label: "Integrations", icon: Plug },
      { href: "/team", label: "Team Members", icon: Users },
      { href: "/billing", label: "Billing", icon: CreditCard },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];
