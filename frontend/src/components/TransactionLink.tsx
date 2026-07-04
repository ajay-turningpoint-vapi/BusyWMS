import React from 'react';
import { Link } from '@mui/material';
import { useTransactionModalStore, TransactionType } from '../store/transactionModalStore';

interface TransactionLinkProps {
  type: TransactionType;
  id: string | number;
  label?: string;
}

export default function TransactionLink({ type, id, label }: TransactionLinkProps) {
  const { clickSetting, openTransaction } = useTransactionModalStore();
  const displayLabel = label || String(id);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (clickSetting === 'single') {
      openTransaction(type, id, 'view');
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (clickSetting === 'double') {
      openTransaction(type, id, 'view');
    }
  };

  return (
    <Link
      component="span"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      sx={{
        textAlign: 'left',
        fontWeight: 600,
        color: 'primary.main',
        cursor: 'pointer',
        textDecoration: 'none',
        '&:hover': {
          textDecoration: 'underline',
          color: 'primary.dark'
        }
      }}
    >
      {displayLabel}
    </Link>
  );
}
