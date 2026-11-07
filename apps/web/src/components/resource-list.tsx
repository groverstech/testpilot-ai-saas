"use client";
import * as React from "react";
import { Card, CardContent, EmptyState, Skeleton, Table, TBody, TD, TH, THead, TR } from "@testpilot/ui";
import type { Paginated } from "@testpilot/shared";
import { useApi } from "@/lib/use-api";
import { PageHeader, PhaseNote } from "./page-header";

export interface Column<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
}

/**
 * Generic page for a tenant-scoped list endpoint. Renders real rows when the API returns any,
 * and an honest empty state otherwise — never sample data.
 */
export function ResourceListPage<T extends { id: string }>({
  title,
  description,
  endpoint,
  columns,
  empty,
  phase,
}: {
  title: string;
  description: string;
  endpoint: string;
  columns: Column<T>[];
  empty: { icon: React.ComponentType<{ className?: string }>; title: string; description: React.ReactNode };
  phase?: { label: string; note: string };
}) {
  const { data, error } = useApi<Paginated<T> | { data: T[] }>(endpoint);
  return (
    <>
      <PageHeader title={title} description={description} />
      {error ? (
        <EmptyState icon={empty.icon} title="Could not load data" description={error instanceof Error ? error.message : undefined} />
      ) : !data ? (
        <Skeleton className="h-48 w-full" />
      ) : data.data.length === 0 ? (
        <>
          <EmptyState icon={empty.icon} title={empty.title} description={empty.description} />
          {phase && <PhaseNote phase={phase.label}>{phase.note}</PhaseNote>}
        </>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  {columns.map((c) => (
                    <TH key={c.header} className={c.className}>
                      {c.header}
                    </TH>
                  ))}
                </TR>
              </THead>
              <TBody>
                {data.data.map((row) => (
                  <TR key={row.id}>
                    {columns.map((c) => (
                      <TD key={c.header} className={c.className}>
                        {c.cell(row)}
                      </TD>
                    ))}
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
