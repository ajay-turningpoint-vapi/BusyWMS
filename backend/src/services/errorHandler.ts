import { Response } from 'express';

export function handleError(res: Response, err: any, customMessage: string = 'An unexpected error occurred.') {
  console.error('[SERVER ERROR]:', err);
  
  // Clean database errors to avoid exposing database schema and query details
  let responseMessage = customMessage;
  if (err.sqlState === '45000' && err.message) {
    return res.status(400).json({ message: err.message });
  } else if (err.sqlState || err.sql || err.code || err.errno) {
    responseMessage = 'A secure database operation error occurred. Please contact the system administrator.';
  } else if (err.message && !err.message.includes('SQL') && !err.message.includes('database')) {
    responseMessage = err.message;
  }
  
  return res.status(500).json({ message: responseMessage });
}
