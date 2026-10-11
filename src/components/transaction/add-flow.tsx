"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import type { LedgerTx, TxType } from "@/lib/finance/types";
import type { TransactionInputRaw } from "@/lib/validation";

export interface AddRequest {
  /** which form to start on (default: expense) */
  type?: TxType;
  /** pre-filled values, e.g. "record this scheduled salary" */
  initial?: Partial<TransactionInputRaw> & Record<string, unknown>;
  /** edit an existing entry */
  edit?: LedgerTx;
}

interface AddFlowApi {
  openAdd: (request?: AddRequest) => void;
  openEdit: (tx: LedgerTx) => void;
}

const AddFlowContext = createContext<AddFlowApi | null>(null);

export function useAddFlow(): AddFlowApi {
  const ctx = useContext(AddFlowContext);
  if (!ctx) throw new Error("useAddFlow must be used inside <AddFlowProvider>");
  return ctx;
}

// the forms are only downloaded the first time someone wants to add something
const TransactionSheet = dynamic(() => import("./transaction-sheet").then((m) => m.TransactionSheet), { ssr: false });

export function AddFlowProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<AddRequest | null>(null);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // a fresh form every time it opens
  const [nonce, setNonce] = useState(0);

  // On an account's own page, "+" means "add to this account" unless the caller said otherwise.
  const pathname = usePathname();
  const { accounts } = useApp();
  const pageAccountId = useMemo(() => {
    const id = /^\/wallets\/([^/]+)/.exec(pathname)?.[1];
    return id && accounts.some((a) => a.id === id && !a.archived) ? id : null;
  }, [pathname, accounts]);

  // (exchanges, transfers and refunds pick their own pair of accounts)
  const openAdd = useCallback(
    (req?: AddRequest) => {
      const initial = req?.initial;
      const single = ["EXPENSE", "INCOME", "ADJUSTMENT", "OPENING"].includes(req?.type ?? "EXPENSE");
      setRequest(pageAccountId && single && !initial?.accountId ? { ...req, initial: { ...initial, accountId: pageAccountId } } : (req ?? {}));
      setNonce((n) => n + 1);
      setLoaded(true);
      setOpen(true);
    },
    [pageAccountId],
  );
  const openEdit = useCallback((tx: LedgerTx) => {
    setRequest({ edit: tx, type: tx.type });
    setNonce((n) => n + 1);
    setLoaded(true);
    setOpen(true);
  }, []);

  const api = useMemo(() => ({ openAdd, openEdit }), [openAdd, openEdit]);

  return (
    <AddFlowContext.Provider value={api}>
      {children}
      {loaded ? <TransactionSheet key={nonce} open={open} onOpenChange={setOpen} request={request ?? {}} /> : null}
    </AddFlowContext.Provider>
  );
}
