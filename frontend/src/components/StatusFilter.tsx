import React from 'react';
import { FormControl, InputLabel, Select, MenuItem } from '@mui/material';

interface StatusFilterProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  label?: string;
  size?: 'small' | 'medium';
  allLabel?: string;
  minWidth?: number;
}

export default function StatusFilter({
  value,
  onChange,
  options,
  label = 'Status',
  size = 'small',
  allLabel = 'All Statuses',
  minWidth = 160,
}: StatusFilterProps) {
  return (
    <FormControl size={size} sx={{ minWidth }}>
      <InputLabel>{label}</InputLabel>
      <Select
        value={value}
        label={label}
        onChange={(e) => onChange(e.target.value)}
      >
        <MenuItem value="">{allLabel}</MenuItem>
        {options.map((opt) => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
