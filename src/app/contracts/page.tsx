"use client";

import { useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/DataTable";
import { useLazyGetContractsQuery } from "@/services/api";
import { useShell } from "../app-shell";

function renderPagination(
  total: number,
  currentPage: number,
  perPage: number,
  onPageChange: (p: number) => void
) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;
  return (
    <div className="pagination">
      <button disabled={!canPrev} onClick={() => onPageChange(currentPage - 1)} aria-label="Pagina precedente">
        &lt;
      </button>
      <span>
        Pagina {currentPage} / {totalPages}
      </span>
      <button disabled={!canNext} onClick={() => onPageChange(currentPage + 1)} aria-label="Pagina successiva">
        &gt;
      </button>
    </div>
  );
}

export default function ContractsPage() {
  const { mock } = useShell();
  const [contractsPage, setContractsPage] = useState(1);
  const [contractsPerPage, setContractsPerPage] = useState(25);
  const [contractsStatus, setContractsStatus] = useState("");

  const [triggerContracts, contractsResult] = useLazyGetContractsQuery();
  const contractsData = contractsResult.data ?? [];

  const loadContracts = async () => {
    setContractsStatus("Caricamento contratti...");
    try {
      const data = await triggerContracts({ mock }, true).unwrap();
      setContractsPage(1);
      setContractsStatus(`Trovati ${data.length} contratti`);
    } catch (err) {
      setContractsStatus("Errore durante la lettura dei contratti");
    }
  };

  useEffect(() => {
    loadContracts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mock]);

  const paginatedContracts = useMemo(() => {
    const start = (contractsPage - 1) * contractsPerPage;
    return contractsData.slice(start, start + contractsPerPage);
  }, [contractsData, contractsPage, contractsPerPage]);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Anagrafica</p>
          <h2>Contratti / persone</h2>
        </div>
        <span className="hint">{contractsStatus || "Pronto"}</span>
      </div>
      <div className="controls">
        <label>
          Per pagina
          <select value={contractsPerPage} onChange={(e) => setContractsPerPage(Number(e.target.value))}>
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button onClick={loadContracts}>Ricarica</button>
      </div>
      {contractsData && contractsData.length > 0 ? (
        <div className="table-wrap">
          {renderPagination(contractsData.length, contractsPage, contractsPerPage, setContractsPage)}
          <DataTable
            tableKey="contracts"
            data={paginatedContracts}
            columns={
              [
                { id: "id", header: "ID", accessorKey: "id" },
                {
                  id: "name",
                  header: "Nome",
                  accessorFn: (row) => `${row.first_name || ""} ${row.last_name || ""}`.trim() || "--",
                  cell: (info) => String(info.getValue() ?? "--"),
                },
                { id: "email", header: "Email", accessorKey: "email" },
              ] as ColumnDef<Record<string, unknown>, unknown>[]
            }
          />
          {renderPagination(contractsData.length, contractsPage, contractsPerPage, setContractsPage)}
        </div>
      ) : (
        <p className="muted">Nessun contratto trovato</p>
      )}
    </section>
  );
}
