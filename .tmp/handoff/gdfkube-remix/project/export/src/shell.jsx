// App shell: utility band, sidebar, topbar
const { useState, useEffect, useRef, useMemo } = React;

function UtilityBand() {
  return (
    <div className="utility">
      <span><span className="dot"></span>Demo environment · operational</span>
      <span className="spacer"></span>
      <span style={{opacity: 0.7}}>v0.4.2-rc1</span>
    </div>
  );
}

function Sidebar({ route, navigate, role, collapsed }) {
  const items = [
    { section: "Workspace" },
    { id: "home",     label: "Home",            icon: "home" },
    { id: "catalog",  label: "Service Catalog", icon: "catalog" },
    { id: "requests", label: "My Requests",     icon: "list", badge: 3 },
    { section: "Operations", adminOnly: true },
    { id: "approvals",label: "Approvals",       icon: "doc",   adminOnly: true, badge: role === "admin" ? (window.GDF_DATA?.REQUESTS.filter(r => r.status === "approval").length || null) : null },
    { section: "Administration", adminOnly: true },
    { id: "admin-forms", label: "Forms", icon: "form",  adminOnly: true },
    { id: "admin-users", label: "Users", icon: "users", adminOnly: true },
  ];
  return (
    <aside className={"sidebar" + (collapsed ? " collapsed" : "")}>
      <div className="brand">
        <div className="brand-mark">g</div>
        {!collapsed && (
          <div>
            <div className="brand-name">gdfkube</div>
            <div className="brand-sub">IT Service Portal</div>
          </div>
        )}
      </div>
      <nav className="nav">
        {items.map((it, i) => {
          if (it.section) {
            if (it.adminOnly && role !== "admin") return null;
            return collapsed ? <div key={i} style={{height: 8}}></div> : <div key={i} className="nav-section">{it.section}</div>;
          }
          if (it.adminOnly && role !== "admin") return null;
          const Ic = Icons[it.icon];
          return (
            <div key={it.id}
                 className={"nav-item" + (route === it.id ? " active" : "")}
                 onClick={() => navigate(it.id)}
                 title={collapsed ? it.label : ""}>
              <Ic className="icon" />
              {!collapsed && <span>{it.label}</span>}
              {!collapsed && it.badge != null && <span className="badge">{it.badge}</span>}
            </div>
          );
        })}
      </nav>
      <div className="sidebar-foot">
        <Icons.info /> {!collapsed && <span>Compliant · ISO 27001</span>}
      </div>
    </aside>
  );
}

function Topbar({ crumbs, role, setRole, user, onNotify }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function h(e){ if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <header className="topbar">
      <nav className="crumbs">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="sep">/</span>}
            {i === crumbs.length - 1 ? <span className="current">{c}</span> : <a href="#">{c}</a>}
          </React.Fragment>
        ))}
      </nav>
      <div className="search">
        <span className="ico"><Icons.search /></span>
        <input placeholder="Search requests, clusters, policies, users…" />
        <kbd>⌘K</kbd>
      </div>
      <div className="topbar-spacer" />
      <button className="icon-btn" title="Refresh"><Icons.refresh /></button>
      <button className="icon-btn" title="Notifications" onClick={onNotify}>
        <Icons.bell />
        <span className="pip"></span>
      </button>
      <div ref={ref} style={{position: "relative"}}>
        <div className="role-switch" onClick={() => setOpen(!open)}>
          <div className="avatar">{user.initials}</div>
          <div className="who">
            <span className="name">{user.name}</span>
            <span className="role">{user.org} · {role === "admin" ? "Platform Admin" : "Operator"}</span>
          </div>
          <Icons.chevronDown />
        </div>
        {open && (
          <div className="menu" style={{right: 0, top: 44}}>
            <div style={{padding: "10px 10px 6px", fontSize: 11, color: "var(--ink-500)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600}}>Switch role</div>
            <div className={"menu-item" + (role === "operator" ? " active" : "")} onClick={() => { setRole("operator"); setOpen(false); }}>
              <Icons.user /> <div><div>Operator</div><div style={{fontSize: 11, color: "var(--ink-500)"}}>joao.silva @ saude</div></div>
              {role === "operator" && <Icons.check style={{marginLeft: "auto", color: "var(--green-700)"}} />}
            </div>
            <div className={"menu-item" + (role === "admin" ? " active" : "")} onClick={() => { setRole("admin"); setOpen(false); }}>
              <Icons.shield /> <div><div>Platform Admin</div><div style={{fontSize: 11, color: "var(--ink-500)"}}>m.costa @ setic</div></div>
              {role === "admin" && <Icons.check style={{marginLeft: "auto", color: "var(--green-700)"}} />}
            </div>
            <div className="menu-sep"></div>
            <div className="menu-item"><Icons.cog /> Preferences</div>
            <div className="menu-sep"></div>
            <div className="menu-item"><Icons.x /> Sign out</div>
          </div>
        )}
      </div>
    </header>
  );
}

window.UtilityBand = UtilityBand;
window.Sidebar = Sidebar;
window.Topbar = Topbar;
