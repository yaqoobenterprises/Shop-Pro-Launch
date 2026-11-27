import React, { useState } from "react";
import { PanelLeftClose, PanelLeftOpen, PanelsTopLeft, Plus, Building2, Keyboard } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useApp } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { navigation } from "./navigation";
import { Button } from "../common/Button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export function AppSidebar() {
  const { currentView, setCurrentView, setIsShortcutsHelpOpen, startNewEntry } = useApp();
  const { organization, isDemoMode } = useAuth();
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem("shop-pro:sidebar") === "collapsed"; } catch { return false; } });
  const reduced = useReducedMotion();
  const toggle = () => { setCollapsed(!collapsed); try { localStorage.setItem("shop-pro:sidebar", collapsed ? "expanded" : "collapsed"); } catch { /* session only */ } };
  return <motion.aside className="sp-sidebar" data-collapsed={collapsed} animate={{ width: collapsed ? 76 : 240 }} transition={{ duration: reduced ? 0 : .18 }} aria-label="Workspace sidebar">
    <button className="sp-sidebar-brand" type="button" onClick={() => setCurrentView("dashboard")} aria-label="Shop Pro overview"><span><PanelsTopLeft size={22} /></span>{!collapsed && <strong>Shop Pro<span>Business workspace</span></strong>}</button>
    <div className="sp-sidebar-shop"><Building2 size={19} aria-hidden="true" />{!collapsed && <><span><strong>{organization.name}</strong><small>{isDemoMode ? "Demo workspace" : "Your workspace"}</small></span></>}</div>
    <Tooltip><TooltipTrigger asChild><Button className="sp-sidebar-new" onClick={startNewEntry} aria-label="New entry"><Plus size={17} />{!collapsed && "New entry"}</Button></TooltipTrigger>{collapsed && <TooltipContent side="right">New entry</TooltipContent>}</Tooltip>
    <nav className="sp-sidebar-nav" aria-label="Main navigation">
      {["Workspace", "Insights", "Manage"].map(group => <div key={group} className="sp-nav-group"><span className="sp-nav-label">{collapsed ? "·" : group}</span>{navigation.filter(n => n.group === group).map(({ id, label, icon: Icon }) => <Tooltip key={id}><TooltipTrigger asChild><button type="button" aria-label={label} aria-current={id === currentView ? "page" : undefined} onClick={() => setCurrentView(id)}><Icon size={19} aria-hidden="true" />{!collapsed && <span>{label}</span>}</button></TooltipTrigger>{collapsed && <TooltipContent side="right">{label}</TooltipContent>}</Tooltip>)}</div>)}
    </nav>
    <div className="sp-sidebar-footer">{!collapsed && <button type="button" onClick={() => setIsShortcutsHelpOpen(true)}><Keyboard size={17} />Keyboard shortcuts</button>}<button type="button" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}>{collapsed ? <PanelLeftOpen size={18} /> : <><PanelLeftClose size={18} /><span>Collapse sidebar</span></>}</button></div>
  </motion.aside>;
}
