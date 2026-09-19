import {
  columnResizingFeature,
  columnSizingFeature,
  rowExpandingFeature,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
} from "@tanstack/react-table";

// Sorting and paging are done by the database, so no client-side row models are registered.
// Expanding only opens a detail row under a row; there are no sub-rows to model. Sizing and
// resizing only take effect on a DataTable given `resizing`.
// Column definitions for DataTable are built with createColumnHelper<DataTableFeatures, Row>().
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  rowExpandingFeature,
  columnSizingFeature,
  columnResizingFeature,
});

export type DataTableFeatures = typeof dataTableFeatures;
