import { rowPaginationFeature, rowSortingFeature, tableFeatures } from "@tanstack/react-table";

// Sorting and paging are done by the database, so no client-side row models are registered.
// Column definitions for DataTable are built with createColumnHelper<DataTableFeatures, Row>().
export const dataTableFeatures = tableFeatures({ rowSortingFeature, rowPaginationFeature });

export type DataTableFeatures = typeof dataTableFeatures;
