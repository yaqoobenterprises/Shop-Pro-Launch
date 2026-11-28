import React, { useState } from "react";
import { MoreHorizontal, PanelsTopLeft, LockKeyhole } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { navigation } from "./navigation";
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger } from "../ui/sheet";

export const MobileNav: React.FC = () => {
  const { currentView, setCurrentView } = useApp();
  const { lock, hasPinSetup } = useAuth();
  const [open, setOpen] = useState(false);
  const primary = navigation.filter(n => ["dashboard", "chat", "sales", "accounts"].includes(n.id));
  return <nav className="sp-mobile-nav" aria-label="Mobile navigation">
    {primary.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={id === currentView ? "page" : undefined} onClick={() => setCurrentView(id)}><Icon size={20} /><span>{label}</span></button>)}
    <Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><button type="button" aria-label="More navigation options"><MoreHorizontal size={20} /><span>More</span></button></SheetTrigger><SheetContent side="left" className="w-[min(320px,90vw)] overflow-y-auto">
      <SheetTitle className="flex items-center gap-2"><PanelsTopLeft size={22} />Shop Pro</SheetTitle><SheetDescription>Your business workspace</SheetDescription>
      <div className="sp-mobile-menu">{navigation.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-current={id === currentView ? "page" : undefined} onClick={() => { setCurrentView(id); setOpen(false); }}><Icon size={19} />{label}</button>)}{hasPinSetup && <button type="button" onClick={() => { setOpen(false); lock(); }}><LockKeyhole size={19} />Lock register</button>}</div>
    </SheetContent></Sheet>
  </nav>;
};
