import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react"

type Page = "home" | "ledger" | "chat" | "overview" | "transactions" | "reports" | "accounts" | "settings"

/* ---------- Theme (light / dark) ---------- */
type Theme = "light" | "dark"
const THEME_KEY = "keystone-theme"

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === "light" || saved === "dark") return saved
  } catch {
    /* storage can be blocked (private mode, iframes) */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

const ThemeContext = createContext<{
  theme: Theme
  setTheme: (theme: Theme) => void
}>({ theme: "light", setTheme: () => {} })

const useTheme = () => useContext(ThemeContext)

const icons: Record<string, ReactNode> = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  chat: (
    <>
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
      <path d="M8 9h8M8 13h5" />
    </>
  ),
  chart: (
    <>
      <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 6h15a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h13" />
      <path d="M16 11h5v4h-5a2 2 0 0 1 0-4Z" />
    </>
  ),
  receipt: (
    <>
      <path d="M5 3h14v19l-3-2-2 2-2-2-2 2-2-2-3 2Z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14M14 7l5 5-5 5" />
    </>
  ),
  sparkle: (
    <>
      <path d="m12 3 1.3 4.2a5 5 0 0 0 3.4 3.4L21 12l-4.3 1.4a5 5 0 0 0-3.4 3.4L12 21l-1.3-4.2a5 5 0 0 0-3.4-3.4L3 12l4.3-1.4a5 5 0 0 0 3.4-3.4Z" />
    </>
  ),
  send: (
    <>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  check: <path d="m5 12 4 4L19 6" />,
  upload: (
    <>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 15v4h16v-4" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {icons[name]}
    </svg>
  )
}

function Button({
  children,
  onClick,
  variant = "primary",
  className = "",
}: {
  children: ReactNode
  onClick?: () => void
  variant?: "primary" | "secondary" | "ghost"
  className?: string
}) {
  return (
    <button
      className={`button button-${variant} ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const next = theme === "dark" ? "light" : "dark"
  return (
    <button
      className="icon-button theme-toggle"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} />
    </button>
  )
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <div className="brand-mark">
        <span />
        <span />
        <span />
      </div>
      {!compact && <strong>Keystone</strong>}
    </div>
  )
}

function Landing({ navigate }: { navigate: (page: Page) => void }) {
  return (
    <main className="landing">
      <nav className="marketing-nav shell">
        <Brand />
        <div className="nav-links">
          <button>Product</button>
          <button>Solutions</button>
          <button>Customers</button>
          <button>Pricing</button>
        </div>
        <div className="nav-actions">
          <ThemeToggle />
          <Button variant="ghost" onClick={() => navigate("chat")}>
            Sign in
          </Button>
          <Button onClick={() => navigate("overview")}>
            Start for free <Icon name="arrow" size={16} />
          </Button>
        </div>
      </nav>

      <section className="hero shell">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="live-dot" /> Built for modern finance teams
          </div>
          <h1>
            Your finances.
            <br />
            <em>Finally clear.</em>
          </h1>
          <p>
            One intelligent workspace to understand cash flow, automate the
            busywork, and make every business decision with confidence.
          </p>
          <div className="hero-actions">
            <Button onClick={() => navigate("overview")}>
              Get started free <Icon name="arrow" size={17} />
            </Button>
            <Button variant="secondary" onClick={() => navigate("chat")}>
              <Icon name="sparkle" size={17} /> Ask Keystone AI
            </Button>
          </div>
          <div className="trust">
            <div className="avatars">
              <span>AL</span>
              <span>JN</span>
              <span>MS</span>
            </div>
            <p>
              <strong>4.9/5</strong> from 2,000+ growing businesses
            </p>
          </div>
        </div>
        <DashboardPreview />
      </section>

      <section className="logos shell">
        <p>TRUSTED BY FINANCE TEAMS AT</p>
        <div>
          <strong>Northstar</strong>
          <strong>APERTURE</strong>
          <strong>vertex</strong>
          <strong>MONUMENT</strong>
          <strong>Basecamp</strong>
        </div>
      </section>

      <section className="feature-section shell">
        <div className="section-heading">
          <div>
            <span className="kicker">ONE CONNECTED WORKSPACE</span>
            <h2>
              Everything you need to know,
              <br />
              before you need to know it.
            </h2>
          </div>
          <p>
            Keystone brings your accounts, transactions, and decisions
            together—with intelligence built into every layer.
          </p>
        </div>
        <div className="feature-grid">
          <article className="feature-card">
            <div className="feature-icon">
              <Icon name="sparkle" />
            </div>
            <h3>Answers, not dashboards</h3>
            <p>
              Ask a question in plain English and get an instant answer grounded
              in your real financial data.
            </p>
            <button onClick={() => navigate("chat")}>
              Explore AI assistant <Icon name="arrow" size={15} />
            </button>
          </article>
          <article className="feature-card featured">
            <div className="feature-icon">
              <Icon name="chart" />
            </div>
            <h3>Clarity at a glance</h3>
            <p>
              See the numbers that matter without digging through spreadsheets
              or switching between tools.
            </p>
            <div className="mini-bars">
              <span style={{ height: "43%" }} />
              <span style={{ height: "62%" }} />
              <span style={{ height: "51%" }} />
              <span style={{ height: "78%" }} />
              <span style={{ height: "68%" }} />
              <span style={{ height: "92%" }} />
            </div>
          </article>
          <article className="feature-card">
            <div className="feature-icon">
              <Icon name="receipt" />
            </div>
            <h3>Books that run themselves</h3>
            <p>
              Automate categorization, reconciliation, and reporting while
              staying in complete control.
            </p>
            <div className="task-list">
              <span>
                <Icon name="check" size={14} /> 38 transactions matched
              </span>
              <span>
                <Icon name="check" size={14} /> October books reconciled
              </span>
            </div>
          </article>
        </div>
      </section>
    </main>
  )
}

function DashboardPreview() {
  return (
    <div className="preview-wrap">
      <div className="float-card float-income">
        <span>Revenue this month</span>
        <strong>+18.4%</strong>
      </div>
      <div className="float-card float-sync">
        <span className="success-dot" /> All accounts synced
      </div>
      <div className="browser-card">
        <div className="browser-top">
          <span />
          <span />
          <span />
          <p>app.keystone.finance</p>
        </div>
        <div className="mock-app">
          <aside>
            <Brand compact />
            <div className="mock-nav">
              <i className="active" />
              <i />
              <i />
              <i />
            </div>
          </aside>
          <div className="mock-main">
            <div className="mock-heading">
              <div>
                <small>OVERVIEW</small>
                <h3>Good morning, Maya</h3>
              </div>
              <span className="avatar">MK</span>
            </div>
            <div className="mock-stats">
              <div>
                <small>Total balance</small>
                <strong>$248,690</strong>
                <em>+12.5%</em>
              </div>
              <div>
                <small>Monthly revenue</small>
                <strong>$82,450</strong>
                <em>+18.4%</em>
              </div>
              <div>
                <small>Net cash flow</small>
                <strong>$31,280</strong>
                <em>+8.2%</em>
              </div>
            </div>
            <div className="mock-panels">
              <div className="chart-panel">
                <small>CASH FLOW</small>
                <strong>
                  $114,200 <em>+14.2%</em>
                </strong>
                <svg viewBox="0 0 440 120" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" style={{ stopColor: "var(--chart-line)" }} stopOpacity=".28" />
                      <stop offset="1" style={{ stopColor: "var(--chart-line)" }} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0 94 C50 84,72 95,112 73 S184 77,218 51 S276 58,314 34 S388 48,440 15 L440 120 L0 120Z"
                    fill="url(#area)"
                  />
                  <path
                    d="M0 94 C50 84,72 95,112 73 S184 77,218 51 S276 58,314 34 S388 48,440 15"
                    fill="none"
                    stroke="var(--chart-stroke)"
                    strokeWidth="3"
                  />
                </svg>
              </div>
              <div className="activity-panel">
                <small>RECENT ACTIVITY</small>
                {[
                  ["Adobe", "−$62.99"],
                  ["Stripe", "+$4,280"],
                  ["AWS", "−$418.20"],
                ].map((x) => (
                  <div key={x[0]}>
                    <span>{x[0]}</span>
                    <strong>{x[1]}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const navItems: [string, string, Page][] = [
  ["chat", "Ledger", "ledger"],
  ["grid", "Overview", "overview"],
  ["sparkle", "Ask Keystone", "chat"],
  ["receipt", "Transactions", "transactions"],
  ["chart", "Reports", "reports"],
  ["wallet", "Accounts", "accounts"],
]

function AppShell({
  page,
  navigate,
  children,
}: {
  page: Page
  navigate: (page: Page) => void
  children: ReactNode
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="side-brand">
          <Brand />
          <button className="mobile-close" onClick={() => setMobileOpen(false)}>
            ×
          </button>
        </div>
        <nav>
          {navItems.map(([icon, label, target]) => (
            <button
              key={label}
              className={page === target ? "active" : ""}
              onClick={() => {
                navigate(target)
                setMobileOpen(false)
              }}
            >
              <Icon name={icon} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={page === "settings" ? "active" : ""}
            onClick={() => navigate("settings")}
          >
            <Icon name="settings" />
            Settings
          </button>
          <div className="user-card">
            <div className="avatar">OM</div>
            <div>
              <strong>Olivia Martin</strong>
              <span>Acme Inc.</span>
            </div>
            <span>•••</span>
          </div>
        </div>
      </aside>
      <section className="workspace">
        <header className="app-header">
          <button className="menu-button" onClick={() => setMobileOpen(true)}>
            <Icon name="menu" />
          </button>
          <div className="workspace-name">
            <span className="status-dot" /> Acme Inc. <small>BUSINESS</small>
          </div>
          <div>
            <ThemeToggle />
            <button className="icon-button">
              <Icon name="bell" />
            </button>
            <Button onClick={() => navigate("home")} variant="secondary">
              Exit demo
            </Button>
          </div>
        </header>
        {children}
      </section>
    </div>
  )
}

function Overview({ navigate }: { navigate: (page: Page) => void }) {
  return (
    <AppShell page="overview" navigate={navigate}>
      <main className="page-content">
        <div className="page-title">
          <div>
            <span className="kicker">WEDNESDAY, NOVEMBER 6</span>
            <h1>Good morning, Olivia.</h1>
            <p>Here’s what’s happening with your business today.</p>
          </div>
          <Button>
            <Icon name="upload" size={16} /> Export report
          </Button>
        </div>
        <div className="metrics">
          <Metric
            title="Total balance"
            amount="$248,690.24"
            change="+12.5%"
            detail="across 4 accounts"
          />
          <Metric
            title="Revenue"
            amount="$82,450.00"
            change="+18.4%"
            detail="vs. last month"
          />
          <Metric
            title="Expenses"
            amount="$41,730.82"
            change="-3.2%"
            detail="vs. last month"
            down
          />
          <Metric
            title="Net cash flow"
            amount="$40,719.18"
            change="+8.2%"
            detail="this month"
          />
        </div>
        <div className="overview-grid">
          <section className="panel cash-panel">
            <div className="panel-heading">
              <div>
                <h2>Cash flow</h2>
                <p>Income and expenses over time</p>
              </div>
              <select defaultValue="6">
                <option value="6">Last 6 months</option>
                <option value="12">Last 12 months</option>
              </select>
            </div>
            <div className="chart-legend">
              <span>
                <i className="green" />
                Income
              </span>
              <span>
                <i className="gray" />
                Expenses
              </span>
            </div>
            <div className="cash-chart">
              <div className="y-labels">
                <span>$100k</span>
                <span>$75k</span>
                <span>$50k</span>
                <span>$25k</span>
                <span>$0</span>
              </div>
              <div className="chart-bars">
                {[
                  ["Jun", 66, 39],
                  ["Jul", 73, 46],
                  ["Aug", 62, 41],
                  ["Sep", 84, 48],
                  ["Oct", 78, 43],
                  ["Nov", 92, 48],
                ].map(([m, a, b]) => (
                  <div className="bar-group" key={m as string}>
                    <div>
                      <i style={{ height: `${a}%` }} />
                      <i style={{ height: `${b}%` }} />
                    </div>
                    <span>{m}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className="panel health-panel">
            <div className="panel-heading">
              <div>
                <h2>Financial health</h2>
                <p>Updated just now</p>
              </div>
              <button>View details</button>
            </div>
            <div className="score">
              <div className="score-ring">
                <strong>86</strong>
                <span>Excellent</span>
              </div>
              <div>
                <h3>Your business is in great shape</h3>
                <p>
                  Cash reserves and profitability are trending above your
                  6-month average.
                </p>
              </div>
            </div>
            <div className="health-items">
              <span>
                Cash runway <strong>14.2 months</strong>
              </span>
              <span>
                Profit margin <strong>49.4%</strong>
              </span>
              <span>
                Burn rate <strong>$41.7k/mo</strong>
              </span>
            </div>
          </section>
          <section className="panel transactions-panel">
            <div className="panel-heading">
              <div>
                <h2>Recent transactions</h2>
                <p>Latest activity across your accounts</p>
              </div>
              <button>
                View all <Icon name="arrow" size={14} />
              </button>
            </div>
            {[
              ["ST", "Stripe", "Nov 6 · Revenue", "+$4,280.00", "positive"],
              ["AW", "AWS", "Nov 5 · Software", "−$418.20", ""],
              ["FG", "Figma", "Nov 5 · Software", "−$75.00", ""],
              ["SL", "Slack", "Nov 4 · Software", "−$128.00", ""],
            ].map((t) => (
              <div className="transaction" key={t[1]}>
                <span className="transaction-icon">{t[0]}</span>
                <div>
                  <strong>{t[1]}</strong>
                  <small>{t[2]}</small>
                </div>
                <strong className={t[4]}>{t[3]}</strong>
              </div>
            ))}
          </section>
          <section className="panel insight-panel">
            <div className="insight-icon">
              <Icon name="sparkle" />
            </div>
            <span className="kicker">KEYSTONE INSIGHT</span>
            <h2>You could save $620 this month</h2>
            <p>
              We found 3 software subscriptions with overlapping features and
              one that hasn’t been used in 60 days.
            </p>
            <Button onClick={() => navigate("chat")}>
              Review recommendations <Icon name="arrow" size={15} />
            </Button>
          </section>
        </div>
      </main>
    </AppShell>
  )
}

function Metric({
  title,
  amount,
  change,
  detail,
  down = false,
}: {
  title: string
  amount: string
  change: string
  detail: string
  down?: boolean
}) {
  return (
    <article className="metric">
      <div>
        <span>{title}</span>
        <Icon name="chart" size={16} />
      </div>
      <strong>{amount}</strong>
      <p>
        <em className={down ? "neutral" : ""}>{change}</em> {detail}
      </p>
    </article>
  )
}

const transactionData = [
  {
    initials: "ST",
    name: "Stripe payout",
    detail: "Revenue · Online sales",
    account: "Mercury Checking",
    date: "Nov 6, 2024",
    amount: "+$4,280.00",
    type: "Income",
  },
  {
    initials: "AW",
    name: "Amazon Web Services",
    detail: "Software · Cloud hosting",
    account: "Mercury Checking",
    date: "Nov 5, 2024",
    amount: "−$418.20",
    type: "Expense",
  },
  {
    initials: "FG",
    name: "Figma",
    detail: "Software · Design tools",
    account: "Amex Business",
    date: "Nov 5, 2024",
    amount: "−$75.00",
    type: "Expense",
  },
  {
    initials: "SL",
    name: "Slack",
    detail: "Software · Team communication",
    account: "Amex Business",
    date: "Nov 4, 2024",
    amount: "−$128.00",
    type: "Expense",
  },
  {
    initials: "OC",
    name: "Olivia Chen Consulting",
    detail: "Revenue · Client payment",
    account: "Mercury Checking",
    date: "Nov 3, 2024",
    amount: "+$12,500.00",
    type: "Income",
  },
  {
    initials: "AD",
    name: "Adobe",
    detail: "Software · Creative Cloud",
    account: "Amex Business",
    date: "Nov 2, 2024",
    amount: "−$62.99",
    type: "Expense",
  },
]

function ProductTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <span className="kicker">{eyebrow}</span>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  )
}

function Ledger({ navigate }: { navigate: (page: Page) => void }) {
  const [entry, setEntry] = useState("")
  const [showExpense, setShowExpense] = useState(false)
  const [notice, setNotice] = useState("")
  const [items, setItems] = useState(transactionData.slice(0, 4))
  const addEntry = () => {
    if (!entry.trim()) return
    setItems((current) => [
      {
        initials: "NE",
        name: entry,
        detail: "Uncategorized · Added from quick entry",
        account: "Mercury Checking",
        date: "Just now",
        amount: "Pending",
        type: "Expense",
      },
      ...current,
    ])
    setEntry("")
    setNotice("Entry added and ready to review.")
  }
  return (
    <AppShell page="ledger" navigate={navigate}>
      <main className="page-content ledger-page">
        <ProductTitle
          eyebrow="TODAY · NOVEMBER 6"
          title="Daily ledger"
          description="Capture transactions quickly and keep your books current."
          action={
            <Button onClick={() => setShowExpense(true)}>＋ Log expense</Button>
          }
        />
        {notice && (
          <div className="toast-note">
            <Icon name="check" />
            {notice}
          </div>
        )}
        <div className="ledger-metrics">
          <Metric
            title="Income"
            amount="$16,780.00"
            change="+18.4%"
            detail="5 entries today"
          />
          <Metric
            title="Expenses"
            amount="$684.19"
            change="-3.2%"
            detail="8 entries today"
            down
          />
          <Metric
            title="Net cash flow"
            amount="$16,095.81"
            change="+22.1%"
            detail="today"
          />
        </div>
        <section className="panel ledger-list">
          <div className="panel-heading">
            <div>
              <h2>Today’s activity</h2>
              <p>{items.length} transactions · Last synced just now</p>
            </div>
            <span className="sync-pill">
              <span className="status-dot" />
              Live
            </span>
          </div>
          {items.map((item, index) => (
            <div className="ledger-row" key={`${item.name}-${index}`}>
              <span
                className={`direction ${item.type === "Income" ? "in" : ""}`}
              >
                {item.type === "Income" ? "↙" : "↗"}
              </span>
              <div>
                <strong>{item.name}</strong>
                <small>
                  {item.account} · {item.date}
                </small>
                <p>{item.detail}</p>
              </div>
              <strong className={item.type === "Income" ? "positive" : ""}>
                {item.amount}
              </strong>
              <div className="row-actions">
                <button>Details</button>
                <button>Edit</button>
              </div>
            </div>
          ))}
        </section>
        <div className="quick-entry">
          <div className="quick-tags">
            {["Payroll", "Software", "Office", "Travel", "Marketing"].map(
              (tag) => (
                <button key={tag} onClick={() => setEntry(`${tag} expense`)}>
                  ＋ {tag}
                </button>
              ),
            )}
          </div>
          <div className="quick-input">
            <input
              value={entry}
              onChange={(event) => setEntry(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && addEntry()}
              placeholder="Describe an amount and item, e.g. $240 office chairs"
            />
            <button onClick={addEntry} aria-label="Add ledger entry">
              <Icon name="send" />
            </button>
          </div>
          <small>
            Press Enter to add · You can categorize and select an account next
          </small>
        </div>
        {showExpense && (
          <ExpenseModal
            close={() => setShowExpense(false)}
            save={() => {
              setShowExpense(false)
              setNotice("Expense saved to Mercury Checking.")
            }}
          />
        )}
      </main>
    </AppShell>
  )
}

function ExpenseModal({ close, save }: { close: () => void; save: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div
        className="expense-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <h2>Log business expense</h2>
            <p>Record an expense and its payment source.</p>
          </div>
          <button onClick={close}>×</button>
        </div>
        <div className="form-grid">
          <label>
            Expense category
            <select>
              <option>Software</option>
              <option>Office & supplies</option>
              <option>Travel</option>
            </select>
          </label>
          <label>
            Paid from
            <select>
              <option>Mercury Checking</option>
              <option>Amex Business</option>
            </select>
          </label>
          <label>
            Amount
            <input type="number" placeholder="0.00" />
          </label>
          <label>
            Expense date
            <input type="date" defaultValue="2024-11-06" />
          </label>
          <label className="full">
            Description
            <input placeholder="What was this expense for?" />
          </label>
        </div>
        <div className="modal-info">
          <Icon name="sparkle" size={16} />
          Keystone will automatically match this entry with your next account
          sync.
        </div>
        <div className="modal-actions">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={save}>
            <Icon name="check" size={16} />
            Save expense
          </Button>
        </div>
      </div>
    </div>
  )
}

function Transactions({ navigate }: { navigate: (page: Page) => void }) {
  const [query, setQuery] = useState("")
  const [type, setType] = useState("All")
  const filtered = transactionData.filter(
    (item) =>
      (item.name + item.detail).toLowerCase().includes(query.toLowerCase()) &&
      (type === "All" || item.type === type),
  )
  return (
    <AppShell page="transactions" navigate={navigate}>
      <main className="page-content">
        <ProductTitle
          title="Transactions"
          description="Search, review, and categorize activity across every account."
          action={
            <Button>
              <Icon name="upload" size={16} />
              Export CSV
            </Button>
          }
        />
        <section className="panel filter-panel">
          <div className="search-field">
            <span>⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search merchant, category, or amount"
            />
          </div>
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option>All</option>
            <option>Income</option>
            <option>Expense</option>
          </select>
          <select>
            <option>All accounts</option>
            <option>Mercury Checking</option>
            <option>Amex Business</option>
          </select>
          <select>
            <option>Last 30 days</option>
            <option>This year</option>
          </select>
        </section>
        <section className="panel transaction-table">
          <div className="table-head">
            <span>Transaction</span>
            <span>Account</span>
            <span>Date</span>
            <span>Amount</span>
            <span>Status</span>
          </div>
          {filtered.map((item) => (
            <div className="table-row" key={item.name}>
              <div>
                <span className="transaction-icon">{item.initials}</span>
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.detail}</small>
                </div>
              </div>
              <span>{item.account}</span>
              <span>{item.date}</span>
              <strong className={item.type === "Income" ? "positive" : ""}>
                {item.amount}
              </strong>
              <span className="status-badge">Categorized</span>
            </div>
          ))}
          {!filtered.length && (
            <div className="empty-state">
              <Icon name="receipt" />
              <strong>No transactions found</strong>
              <p>Try changing your search or filters.</p>
            </div>
          )}
          <div className="table-footer">
            <span>
              Showing {filtered.length} of {transactionData.length} transactions
            </span>
            <div>
              <button>←</button>
              <strong>1</strong>
              <button>→</button>
            </div>
          </div>
        </section>
      </main>
    </AppShell>
  )
}

function Reports({ navigate }: { navigate: (page: Page) => void }) {
  const [period, setPeriod] = useState("2024")
  const months = [
    ["Jun", 58, 32],
    ["Jul", 64, 38],
    ["Aug", 71, 42],
    ["Sep", 69, 35],
    ["Oct", 83, 44],
    ["Nov", 92, 47],
  ]
  return (
    <AppShell page="reports" navigate={navigate}>
      <main className="page-content">
        <ProductTitle
          title="Reports"
          description="Understand performance, profitability, and cash flow over time."
          action={
            <div className="title-actions">
              <select
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
              >
                <option>2024</option>
                <option>2023</option>
              </select>
              <Button>
                <Icon name="upload" size={16} />
                Download
              </Button>
            </div>
          }
        />
        <div className="report-cards">
          <article>
            <span>REVENUE · {period}</span>
            <strong>$482,640</strong>
            <p>
              <em>↑ 16.8%</em> year over year
            </p>
          </article>
          <article>
            <span>EXPENSES · {period}</span>
            <strong>$248,380</strong>
            <p>
              <em className="warm">↓ 4.2%</em> year over year
            </p>
          </article>
          <article>
            <span>NET PROFIT · {period}</span>
            <strong>$234,260</strong>
            <p>
              <em>↑ 24.6%</em> year over year
            </p>
          </article>
        </div>
        <section className="panel report-chart">
          <div className="panel-heading">
            <div>
              <h2>Revenue vs. expenses</h2>
              <p>Monthly performance for {period}</p>
            </div>
            <div className="chart-legend">
              <span>
                <i className="green" />
                Revenue
              </span>
              <span>
                <i />
                Expenses
              </span>
            </div>
          </div>
          <div className="line-report">
            <div className="report-y">
              <span>$100k</span>
              <span>$75k</span>
              <span>$50k</span>
              <span>$25k</span>
              <span>$0</span>
            </div>
            <div className="report-bars">
              {months.map(([month, income, expense]) => (
                <div key={month as string}>
                  <div>
                    <i style={{ height: `${income}%` }} />
                    <i style={{ height: `${expense}%` }} />
                  </div>
                  <span>{month}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="panel breakdown-table">
          <div className="panel-heading">
            <div>
              <h2>Monthly breakdown</h2>
              <p>Income, expenses, and resulting margin</p>
            </div>
          </div>
          <div className="breakdown-head">
            <span>Month</span>
            <span>Revenue</span>
            <span>Expenses</span>
            <span>Net profit</span>
            <span>Margin</span>
          </div>
          {[
            ["November", "$82,450", "$41,731", "$40,719", "49.4%"],
            ["October", "$78,120", "$39,640", "$38,480", "49.3%"],
            ["September", "$69,840", "$35,920", "$33,920", "48.6%"],
            ["August", "$71,240", "$42,180", "$29,060", "40.8%"],
          ].map((row) => (
            <div className="breakdown-row" key={row[0]}>
              {row.map((cell, index) => (
                <span className={index === 3 ? "positive" : ""} key={cell}>
                  {cell}
                </span>
              ))}
            </div>
          ))}
        </section>
      </main>
    </AppShell>
  )
}

function Accounts({ navigate }: { navigate: (page: Page) => void }) {
  const [accounts, setAccounts] = useState([
    { name: "Mercury Checking", type: "BANK", balance: 184520.24, mark: "MC" },
    {
      name: "Amex Business",
      type: "CREDIT CARD",
      balance: -4270.82,
      mark: "AX",
    },
    {
      name: "Stripe Balance",
      type: "PAYMENT PROCESSOR",
      balance: 58440.0,
      mark: "ST",
    },
    { name: "Cash Reserve", type: "SAVINGS", balance: 10000.82, mark: "CR" },
  ])
  const [name, setName] = useState("")
  const [transfer, setTransfer] = useState("")
  const addAccount = () => {
    if (!name.trim()) return
    setAccounts((current) => [
      ...current,
      { name, type: "BANK", balance: 0, mark: name.slice(0, 2).toUpperCase() },
    ])
    setName("")
  }
  return (
    <AppShell page="accounts" navigate={navigate}>
      <main className="page-content">
        <ProductTitle
          title="Accounts"
          description="Manage connected accounts and monitor balances in one place."
          action={
            <div className="balance-total">
              <small>TOTAL BALANCE</small>
              <strong>$248,690.24</strong>
            </div>
          }
        />
        <div className="account-grid">
          {accounts.map((account) => (
            <article className="account-card" key={account.name}>
              <div className="account-top">
                <span>{account.mark}</span>
                <button>•••</button>
              </div>
              <small>{account.type}</small>
              <h2>{account.name}</h2>
              <strong>
                {account.balance < 0 ? "−" : ""}$
                {Math.abs(account.balance).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                })}
              </strong>
              <p>
                <span className="status-dot" />
                Connected · Synced just now
              </p>
            </article>
          ))}
        </div>
        <div className="account-tools">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Add an account</h2>
                <p>Create a manual balance account</p>
              </div>
            </div>
            <div className="stack-form">
              <label>
                Account name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Payroll account"
                />
              </label>
              <label>
                Account type
                <select>
                  <option>Bank account</option>
                  <option>Credit card</option>
                  <option>Cash wallet</option>
                </select>
              </label>
              <Button onClick={addAccount}>＋ Add account</Button>
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Transfer funds</h2>
                <p>Move money between your accounts</p>
              </div>
            </div>
            <div className="stack-form two-col">
              <label>
                From
                <select>
                  <option>Mercury Checking</option>
                  <option>Cash Reserve</option>
                </select>
              </label>
              <label>
                To
                <select>
                  <option>Cash Reserve</option>
                  <option>Mercury Checking</option>
                </select>
              </label>
              <label className="full">
                Amount
                <input
                  value={transfer}
                  onChange={(event) => setTransfer(event.target.value)}
                  type="number"
                  placeholder="0.00"
                />
              </label>
              <Button className="full" onClick={() => setTransfer("")}>
                <Icon name="arrow" size={16} />
                Transfer funds
              </Button>
            </div>
          </section>
        </div>
      </main>
    </AppShell>
  )
}

function Settings({ navigate }: { navigate: (page: Page) => void }) {
  const { theme, setTheme } = useTheme()
  const [saved, setSaved] = useState("")
  const [categories, setCategories] = useState([
    "Software",
    "Office & supplies",
    "Travel",
    "Marketing",
  ])
  const [newCategory, setNewCategory] = useState("")
  return (
    <AppShell page="settings" navigate={navigate}>
      <main className="page-content settings-page">
        <ProductTitle
          title="Settings"
          description="Manage your workspace, security, and bookkeeping preferences."
        />
        {saved && (
          <div className="toast-note">
            <Icon name="check" />
            {saved}
          </div>
        )}
        <div className="settings-tabs">
          <button className="active">General</button>
          <button>Security</button>
          <button>Categories</button>
          <button>Data & privacy</button>
        </div>
        <section className="settings-card">
          <div className="setting-intro">
            <div className="setting-icon">◐</div>
            <div>
              <h2>Appearance</h2>
              <p>Choose how Keystone looks on this device.</p>
            </div>
          </div>
          <div className="theme-options">
            <button
              className={theme === "light" ? "active" : ""}
              onClick={() => setTheme("light")}
            >
              ☀ Light {theme === "light" && <Icon name="check" size={16} />}
            </button>
            <button
              className={theme === "dark" ? "active" : ""}
              onClick={() => setTheme("dark")}
            >
              ◐ Dark {theme === "dark" && <Icon name="check" size={16} />}
            </button>
          </div>
        </section>
        <section className="settings-card">
          <div className="setting-intro">
            <div className="setting-icon">◇</div>
            <div>
              <h2>Security</h2>
              <p>Update the password for olivia@acme.com.</p>
            </div>
          </div>
          <div className="security-form">
            <label>
              Current password
              <input type="password" placeholder="Enter current password" />
            </label>
            <label>
              New password
              <input type="password" placeholder="At least 8 characters" />
            </label>
            <label>
              Confirm new password
              <input type="password" placeholder="Re-enter new password" />
            </label>
            <Button onClick={() => setSaved("Your password has been updated.")}>
              Update password
            </Button>
          </div>
        </section>
        <section className="settings-card">
          <div className="category-heading">
            <div className="setting-intro">
              <div className="setting-icon">≡</div>
              <div>
                <h2>Categories</h2>
                <p>Organize transactions for cleaner reporting.</p>
              </div>
            </div>
            <div className="category-add">
              <input
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                placeholder="New category"
              />
              <Button
                onClick={() => {
                  if (newCategory.trim()) {
                    setCategories([...categories, newCategory])
                    setNewCategory("")
                  }
                }}
              >
                ＋ Add
              </Button>
            </div>
          </div>
          <div className="category-list">
            {categories.map((category) => (
              <div key={category}>
                <span>
                  <i />
                  {category}
                  <small>EXPENSE</small>
                </span>
                <button
                  onClick={() =>
                    setCategories(
                      categories.filter((item) => item !== category),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </section>
      </main>
    </AppShell>
  )
}

function Chat({ navigate }: { navigate: (page: Page) => void }) {
  const [question, setQuestion] = useState("")
  const [messages, setMessages] = useState<string[]>([])
  const ask = (text = question) => {
    if (text.trim()) {
      setMessages((m) => [...m, text])
      setQuestion("")
    }
  }
  return (
    <AppShell page="chat" navigate={navigate}>
      <main className="chat-page">
        <header className="chat-header">
          <div>
            <div className="ai-mark">
              <Icon name="sparkle" />
            </div>
            <div>
              <h1>Ask Keystone</h1>
              <p>Your financial copilot · Connected to 4 accounts</p>
            </div>
          </div>
          <button className="icon-button">•••</button>
        </header>
        <div className="conversation">
          <div className="chat-intro">
            <div className="intro-mark">
              <Icon name="sparkle" size={28} />
            </div>
            <h2>What would you like to know?</h2>
            <p>
              I can analyze your finances, explain trends, and help you make
              more confident decisions.
            </p>
            <div className="suggestions">
              {[
                "How did we perform last month?",
                "Where can we reduce spending?",
                "Can we afford to hire?",
                "Show me unusual transactions",
              ].map((s) => (
                <button key={s} onClick={() => ask(s)}>
                  <Icon name="sparkle" size={15} />
                  {s}
                  <Icon name="arrow" size={14} />
                </button>
              ))}
            </div>
          </div>
          {messages.map((m, i) => (
            <div className="message-group" key={`${m}-${i}`}>
              <div className="user-message">
                {m}
                <span className="avatar">OM</span>
              </div>
              <div className="ai-message">
                <div className="ai-mark">
                  <Icon name="sparkle" size={16} />
                </div>
                <div>
                  <p>
                    Based on your connected accounts, your business is
                    performing strongly this month. Revenue is up{" "}
                    <strong>18.4%</strong>, while expenses are down{" "}
                    <strong>3.2%</strong>.
                  </p>
                  <div className="answer-stats">
                    <span>
                      <small>NET CASH FLOW</small>
                      <strong>$40,719</strong>
                    </span>
                    <span>
                      <small>PROFIT MARGIN</small>
                      <strong>49.4%</strong>
                    </span>
                    <span>
                      <small>CASH RUNWAY</small>
                      <strong>14.2 mo</strong>
                    </span>
                  </div>
                  <p className="source-note">
                    Analysis based on data through November 6, 2024.
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="composer-wrap">
          <div className="composer">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  ask()
                }
              }}
              placeholder="Ask anything about your finances..."
            />
            <div>
              <button className="attach-button">＋</button>
              <span>Keystone uses your live financial data</span>
              <button
                className="send-button"
                onClick={() => ask()}
                aria-label="Send message"
              >
                <Icon name="send" size={17} />
              </button>
            </div>
          </div>
          <p>
            Keystone may make mistakes. Verify important financial decisions.
          </p>
        </div>
      </main>
    </AppShell>
  )
}

export default function App() {
  const [page, setPage] = useState<Page>("home")
  const screens: Record<Exclude<Page, "home">, ReactNode> = {
    ledger: <Ledger navigate={setPage} />,
    overview: <Overview navigate={setPage} />,
    chat: <Chat navigate={setPage} />,
    transactions: <Transactions navigate={setPage} />,
    reports: <Reports navigate={setPage} />,
    accounts: <Accounts navigate={setPage} />,
    settings: <Settings navigate={setPage} />,
  }
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)
  const setTheme = (next: Theme) => {
    setThemeState(next)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      /* ignore */
    }
  }
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {page === "home" ? <Landing navigate={setPage} /> : screens[page]}
    </ThemeContext.Provider>
  )
}
