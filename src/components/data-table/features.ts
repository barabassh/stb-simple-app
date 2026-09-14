import {
  rowExpandingFeature,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
} from "@tanstack/react-table";

// Sorting and paging are done by the database, so no client-side row models are registered.
// Expanding only opens a detail row under a row; there are no sub-rows to model.
// Column definitions for DataTable are built with createColumnHelper<DataTableFeatures, Row>().
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  rowExpandingFeature,
});

export type DataTableFeatures = typeof dataTableFeatures;
