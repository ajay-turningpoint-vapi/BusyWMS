import React from 'react';
import { TextField, InputAdornment } from '@mui/material';
import { Search } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  fullWidth?: boolean;
  size?: 'small' | 'medium';
  sx?: Record<string, any>;
}

export default function SearchBar({ value, onChange, placeholder = 'Search...', fullWidth = false, size = 'small', sx }: SearchBarProps) {
  return (
    <TextField
      size={size}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      fullWidth={fullWidth}
      sx={{ minWidth: 220, ...sx }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <Search size={16} color="#888" />
          </InputAdornment>
        ),
      }}
    />
  );
}
