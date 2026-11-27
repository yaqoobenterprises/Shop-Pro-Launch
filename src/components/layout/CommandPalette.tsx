import React, { useState } from "react";
import { Receipt, Keyboard, Plus } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useI18n } from "../../i18n";
import { useWorkspaceSearch } from "./useWorkspaceSearch";
import { TransactionDetailModal } from "../common/TransactionDetailModal";
import type { Transaction } from "../../types/ledger";
import { formatPaisa } from "../../lib/money";
import { navigation } from "./navigation";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "../ui/command";

export const CommandPalette: React.FC = () => {
  const { t } = useI18n();
  const { isCommandPaletteOpen, setIsCommandPaletteOpen, setCurrentView, setIsQuickExpenseOpen, setIsShortcutsHelpOpen, startNewEntry } = useApp();
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<Transaction | null>(null);
  const search = useWorkspaceSearch(query, isCommandPaletteOpen);
  const run = (action: () => void) => { setIsCommandPaletteOpen(false); action(); };
  return <><CommandDialog open={isCommandPaletteOpen} onOpenChange={open => { setIsCommandPaletteOpen(open); if (!open) setQuery(""); }}>
    <CommandInput value={query} onValueChange={setQuery} placeholder="Search screens, actions or entries…" aria-label="Search workspace" /><CommandList><CommandEmpty>No matching actions or screens.</CommandEmpty>
      <CommandGroup heading="Quick actions"><CommandItem onSelect={() => run(startNewEntry)}><Plus />New entry<CommandShortcut>Ctrl N</CommandShortcut></CommandItem><CommandItem onSelect={() => run(() => setIsQuickExpenseOpen(true))}><Receipt />{t("command.recordExpense")}<CommandShortcut>Ctrl ⇧ E</CommandShortcut></CommandItem><CommandItem onSelect={() => run(() => setIsShortcutsHelpOpen(true))}><Keyboard />{t("command.shortcuts")}</CommandItem></CommandGroup>
      <CommandSeparator /><CommandGroup heading="Go to">{navigation.map(({ id, label, icon: Icon }) => <CommandItem key={id} onSelect={() => run(() => setCurrentView(id))}><Icon />{label}</CommandItem>)}</CommandGroup>
      {query.trim().length >= 2 && <><CommandSeparator /><CommandGroup heading="Matching entries">
        {search.loading && <p className="px-3 py-3 text-xs text-muted-foreground" role="status">Searching entries…</p>}
        {search.error && <p className="px-3 py-3 text-xs text-destructive" role="status">{search.error}</p>}
        {!search.loading && !search.error && search.rows.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">No matching entries.</p>}
        {search.rows.map(tx => <CommandItem key={tx.id} value={`${query} ${tx.id}`} onSelect={() => run(() => setDetail(tx))}><Receipt /><span className="min-w-0 flex-1 truncate">{tx.raw_text}<small className="block text-xs text-muted-foreground">{tx.business_date} · {tx.category_name || tx.type}</small></span><span className="shrink-0 text-xs tabular-nums">{formatPaisa(tx.amount_paisa, { showPaisaIfFraction: true })}</span></CommandItem>)}
      </CommandGroup></>}
    </CommandList>
  </CommandDialog><TransactionDetailModal isOpen={Boolean(detail)} transaction={detail} onClose={() => setDetail(null)} /></>;
};
