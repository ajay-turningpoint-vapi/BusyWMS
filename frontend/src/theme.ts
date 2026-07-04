import { createTheme } from '@mui/material/styles';

export const getTheme = (mode: 'light' | 'dark') => {
  return createTheme({
    palette: {
      mode,
      primary: {
        main: '#1a73e8', // Zoho style clean business blue
        light: '#e8f0fe',
        dark: '#1557b0',
        contrastText: '#ffffff',
      },
      secondary: {
        main: '#475569', // Professional slate grey
        light: '#f1f5f9',
        dark: '#334155',
      },
      background: {
        default: mode === 'light' ? '#f8fafc' : '#0f172a',
        paper: mode === 'light' ? '#ffffff' : '#1e293b',
      },
      text: {
        primary: mode === 'light' ? '#0f172a' : '#f1f5f9',
        secondary: mode === 'light' ? '#475569' : '#94a3b8',
      },
      divider: mode === 'light' ? '#e2e8f0' : '#334155',
    },
    typography: {
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
      fontSize: 13,
      button: {
        textTransform: 'none',
        fontWeight: 500,
      },
      h1: { fontSize: '2rem', fontWeight: 600 },
      h2: { fontSize: '1.5rem', fontWeight: 600 },
      h3: { fontSize: '1.25rem', fontWeight: 600 },
      h4: { fontSize: '1.1rem', fontWeight: 600 },
      h5: { fontSize: '0.95rem', fontWeight: 600 },
      h6: { fontSize: '0.85rem', fontWeight: 600 },
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            padding: '6px 16px',
            boxShadow: 'none',
            '&:hover': {
              boxShadow: 'none',
            },
          },
          outlined: {
            borderColor: mode === 'light' ? '#cbd5e1' : '#475569',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            border: mode === 'light' ? '1px solid #e2e8f0' : '1px solid #334155',
            boxShadow: 'none',
            backgroundImage: 'none',
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: mode === 'light' ? '#ffffff' : '#1e293b',
            color: mode === 'light' ? '#0f172a' : '#f1f5f9',
            boxShadow: 'none',
            borderBottom: mode === 'light' ? '1px solid #e2e8f0' : '1px solid #334155',
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            borderRight: mode === 'light' ? '1px solid #e2e8f0' : '1px solid #334155',
          },
        },
      },
    },
  });
};
