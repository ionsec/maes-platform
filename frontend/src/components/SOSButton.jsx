import React, { useState } from 'react';
import {
  Fab,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Card,
  CardContent,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider
} from '@mui/material';
import {
  Phone,
  Email,
  Language,
  LinkedIn,
  Warning,
  Security,
  Support,
  Close
} from '@mui/icons-material';

const SOSButton = () => {
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState(null);

  const actions = [
    {
      icon: <Phone />,
      name: 'Emergency Call',
      description: '24/7 Incident Response',
      action: () => handleAction('phone', '+972-543181773', 'Call IONSEC.IO Emergency Line')
    },
    {
      icon: <Email />,
      name: 'Email Support',
      description: 'info@ionsec.io',
      action: () => handleAction('email', 'mailto:info@ionsec.io', 'Contact IONSEC.IO Support')
    },
    {
      icon: <Language />,
      name: 'Website',
      description: 'ionsec.io',
      action: () => handleAction('website', 'https://ionsec.io', 'Visit IONSEC.IO Website')
    },
    {
      icon: <LinkedIn />,
      name: 'LinkedIn',
      description: 'Professional Network',
      action: () => handleAction('linkedin', 'https://www.linkedin.com/company/ionsec', 'Connect on LinkedIn')
    }
  ];

  const handleAction = (type, value, title) => {
    setSelectedAction({ type, value, title });
    setDialogOpen(true);
    setOpen(false);
  };

  const handleExecuteAction = () => {
    if (selectedAction) {
      if (selectedAction.type === 'phone') {
        window.open(`tel:${selectedAction.value}`, '_self');
      } else {
        window.open(selectedAction.value, '_blank');
      }
    }
    setDialogOpen(false);
    setSelectedAction(null);
  };

  return (
    <>
      <SpeedDial
        ariaLabel="SOS Contact"
        sx={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          zIndex: 1000,
          '& .MuiFab-primary': {
            width: 56,
            height: 56,
            backgroundColor: '#d32f2f',
            '&:hover': {
              backgroundColor: '#b71c1c',
            },
          },
        }}
        icon={<SpeedDialIcon icon={<Warning />} openIcon={<Close />} />}
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
      >
        {actions.map((action) => (
          <SpeedDialAction
            key={action.name}
            icon={action.icon}
            tooltipTitle={action.name}
            onClick={action.action}
            sx={{
              '& .MuiSpeedDialAction-fab': {
                backgroundColor: '#1976d2',
                '&:hover': {
                  backgroundColor: '#1565c0',
                },
              },
            }}
          />
        ))}
      </SpeedDial>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Security sx={{ color: 'primary.main' }} />
            <Typography variant="h6">
              {selectedAction?.title || 'Contact IONSEC.IO'}
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom color="primary.main">
                IONSEC.IO - Incident Response Services
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Professional cybersecurity incident response and digital forensics services.
                Available 24/7 for emergency situations.
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                <Chip label="Incident Response" color="primary" size="small" />
                <Chip label="Digital Forensics" color="primary" size="small" />
                <Chip label="Cybersecurity" color="primary" size="small" />
                <Chip label="24/7 Support" color="error" size="small" />
              </Box>

              <List dense>
                <ListItem>
                  <ListItemIcon>
                    <Phone color="primary" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Emergency Hotline" 
                    secondary="+972-543181773"
                  />
                </ListItem>
                <Divider />
                <ListItem>
                  <ListItemIcon>
                    <Email color="primary" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Email Support" 
                    secondary="info@ionsec.io"
                  />
                </ListItem>
                <Divider />
                <ListItem>
                  <ListItemIcon>
                    <Language color="primary" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Website" 
                    secondary="ionsec.io"
                  />
                </ListItem>
                <Divider />
                <ListItem>
                  <ListItemIcon>
                    <LinkedIn color="primary" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="LinkedIn" 
                    secondary="linkedin.com/company/ionsec"
                  />
                </ListItem>
              </List>
            </CardContent>
          </Card>

          <Typography variant="body2" color="text.secondary">
            Click "Proceed" to open the selected contact method.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleExecuteAction} 
            variant="contained" 
            color="primary"
            startIcon={<Support />}
          >
            Proceed
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default SOSButton; 