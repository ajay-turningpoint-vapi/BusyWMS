import React from 'react';
import { Box, TextField } from '@mui/material';

interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  size?: 'small' | 'medium';
}

export default function DateRangeFilter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  size = 'small',
}: DateRangeFilterProps) {
  const today = new Date().toISOString().split('T')[0];

  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
      <TextField
        type="date"
        size={size}
        label="From"
        value={startDate}
        onChange={(e) => onStartDateChange(e.target.value)}
        InputLabelProps={{ shrink: true }}
        inputProps={{ max: today }}
        sx={{ minWidth: 145 }}
      />
      <TextField
        type="date"
        size={size}
        label="To"
        value={endDate}
        onChange={(e) => onEndDateChange(e.target.value)}
        InputLabelProps={{ shrink: true }}
        inputProps={{ max: today, min: startDate }}
        disabled={!startDate}
        sx={{ minWidth: 145 }}
      />
    </Box>
  );
}
