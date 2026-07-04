import React from 'react';
import { Box, TablePagination } from '@mui/material';

interface TablePaginationBarProps {
  count: number;
  page: number;
  rowsPerPage: number;
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (rowsPerPage: number) => void;
  rowsPerPageOptions?: number[];
}

export default function TablePaginationBar({
  count,
  page,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange,
  rowsPerPageOptions = [10, 25, 50, 100],
}: TablePaginationBarProps) {
  if (count <= rowsPerPageOptions[0]) return null; // Don't show pagination for small datasets

  return (
    <Box sx={{ borderTop: '1px solid #e0e0e0' }}>
      <TablePagination
        component="div"
        count={count}
        page={page}
        rowsPerPage={rowsPerPage}
        onPageChange={(_, newPage) => onPageChange(newPage)}
        onRowsPerPageChange={(e) => {
          onRowsPerPageChange(parseInt(e.target.value, 10));
          onPageChange(0);
        }}
        rowsPerPageOptions={rowsPerPageOptions}
        labelRowsPerPage="Rows:"
        sx={{ '.MuiTablePagination-toolbar': { minHeight: 44 } }}
      />
    </Box>
  );
}

// Helper hook for pagination state management
export function usePagination(initialRowsPerPage = 25) {
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(initialRowsPerPage);

  const paginate = <T,>(data: T[]): T[] => {
    return data.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  };

  const resetPage = () => setPage(0);

  return { page, setPage, rowsPerPage, setRowsPerPage, paginate, resetPage };
}
