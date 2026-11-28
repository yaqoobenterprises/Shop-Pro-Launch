import React, { useState } from "react";
import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useApp } from "../../context/AppContext";
import { navigation } from "./navigation";
import { Wordmark } from "../common/Wordmark";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export function AppSidebar() {
  const { currentView, setCurrentView, startNewEntry } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const reduced = useReducedMotion();
  return <motion.aside initial={false} className="sp-sidebar" data-collapsed={collapsed} animate={{ width: collapsed ? 80 : 216 }} transition={{ duration: reduced ? 0 : .24 }} aria-label="Workspace sidebar">
    <div className="sp-sidebar-identity">
      {!collapsed && <button type="button" onClick={() => setCurrentView("dashboard")} aria-label="Shop Pro overview"><Wordmark /></button>}
      <button className="sp-sidebar-toggle icon-button" type="button" aria-label={collapsed ? "Expand navigation" : "Minimize navigation"} aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button>
    </div>
    <button className="sp-new-entry" type="button" onClick={startNewEntry} aria-label="New entry"><Plus size={19} />{!collapsed && <span>New entry</span>}</button>
    <nav className="sp-sidebar-nav" aria-label="Main navigation">
      {["Workspace", "Insights", "Manage"].map(group => <div key={group} className="sp-nav-group">
        {!collapsed && <span className="sp-nav-label">{group}</span>}
        {navigation.filter(item => item.group === group).map(({ id, label, icon: Icon }) => <Tooltip key={id}><TooltipTrigger asChild><button type="button" aria-label={label} aria-current={id === currentView ? "page" : undefined} onClick={() => setCurrentView(id)}><Icon size={20} aria-hidden="true" />{!collapsed && <span>{label}</span>}</button></TooltipTrigger>{collapsed && <TooltipContent side="right">{label}</TooltipContent>}</Tooltip>)}
      </div>)}
    </nav>
  </motion.aside>;
}
