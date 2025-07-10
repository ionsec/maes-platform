import React from 'react';
import {
  Box,
  Typography,
  Link,
  Divider,
  Container
} from '@mui/material';
import {
  Phone,
  Email,
  Language,
  LinkedIn
} from '@mui/icons-material';

const Footer = () => {
  return (
    <Box
      component="footer"
      sx={{
        py: 3,
        px: 2,
        mt: 'auto',
        backgroundColor: (theme) =>
          theme.palette.mode === 'light'
            ? theme.palette.grey[100]
            : theme.palette.grey[900],
        borderTop: 1,
        borderColor: 'divider'
      }}
    >
      <Container maxWidth="lg">
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
              © 2024 MAES Platform
            </Typography>
            <Divider orientation="vertical" flexItem />
            <Typography variant="body2" color="text.secondary">
              Powered by
            </Typography>
            <Box sx={{ 
              padding: '2px 6px',
              backgroundColor: 'rgba(25, 118, 210, 0.1)',
              borderRadius: 1,
              border: '1px solid rgba(25, 118, 210, 0.3)'
            }}>
              <Typography variant="caption" sx={{ 
                color: 'primary.main',
                fontWeight: 'bold',
                letterSpacing: 0.5
              }}>
                IONSEC.IO
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Link
              href="tel:+972-543181773"
              color="inherit"
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 0.5,
                textDecoration: 'none',
                '&:hover': { textDecoration: 'underline' }
              }}
            >
              <Phone sx={{ fontSize: 16 }} />
              <Typography variant="caption">+972-543181773</Typography>
            </Link>
            
            <Link
              href="mailto:info@ionsec.io"
              color="inherit"
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 0.5,
                textDecoration: 'none',
                '&:hover': { textDecoration: 'underline' }
              }}
            >
              <Email sx={{ fontSize: 16 }} />
              <Typography variant="caption">info@ionsec.io</Typography>
            </Link>
            
            <Link
              href="https://ionsec.io"
              target="_blank"
              rel="noopener noreferrer"
              color="inherit"
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 0.5,
                textDecoration: 'none',
                '&:hover': { textDecoration: 'underline' }
              }}
            >
              <Language sx={{ fontSize: 16 }} />
              <Typography variant="caption">ionsec.io</Typography>
            </Link>
            
            <Link
              href="https://www.linkedin.com/company/ionsec"
              target="_blank"
              rel="noopener noreferrer"
              color="inherit"
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 0.5,
                textDecoration: 'none',
                '&:hover': { textDecoration: 'underline' }
              }}
            >
              <LinkedIn sx={{ fontSize: 16 }} />
              <Typography variant="caption">LinkedIn</Typography>
            </Link>
          </Box>
        </Box>
        
        <Box sx={{ mt: 1 }}>
          <Typography variant="caption" color="text.secondary" align="center" display="block">
            Professional cybersecurity incident response and digital forensics services
          </Typography>
        </Box>
      </Container>
    </Box>
  );
};

export default Footer; 