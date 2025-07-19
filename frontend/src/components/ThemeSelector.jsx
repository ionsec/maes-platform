import React, { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Card,
  CardContent,
  Typography,
  CardActionArea,
  Chip,
  Divider,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Palette as PaletteIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  Brightness4 as DarkIcon,
  Brightness7 as LightIcon
} from '@mui/icons-material';
import { useTheme } from '../theme/ThemeProvider';
import { themes, themeCategories, getThemesByCategory } from '../theme/themes';

const ThemeSelector = ({ variant = 'button', size = 'medium', ...props }) => {
  const { currentThemeId, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState(currentThemeId);
  const categorizedThemes = getThemesByCategory();

  const handleOpen = () => {
    setSelectedTheme(currentThemeId);
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setSelectedTheme(currentThemeId);
  };

  const handleApply = () => {
    setTheme(selectedTheme);
    setOpen(false);
  };

  const handleThemeSelect = (themeId) => {
    setSelectedTheme(themeId);
  };

  const ThemeDialog = () => (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          minHeight: '500px',
          background: 'linear-gradient(145deg, rgba(26, 26, 26, 0.95), rgba(38, 38, 38, 0.95))',
          backdropFilter: 'blur(10px)',
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <PaletteIcon color="primary" />
        <Typography variant="h6">Choose Your Theme</Typography>
        <Box sx={{ flexGrow: 1 }} />
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      <DialogContent sx={{ pb: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Select a theme that matches your workflow and preference. Changes apply immediately.
        </Typography>

        {Object.entries(categorizedThemes).map(([categoryName, categoryThemes]) => (
          <Box key={categoryName} sx={{ mb: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Typography variant="h6" color="primary">
                {themeCategories[categoryName].icon} {themeCategories[categoryName].name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {themeCategories[categoryName].description}
              </Typography>
            </Box>
            
            <Grid container spacing={2}>
              {categoryThemes.map((theme) => (
                <Grid item xs={12} sm={6} md={4} key={theme.id}>
                  <Card
                    sx={{
                      position: 'relative',
                      cursor: 'pointer',
                      border: selectedTheme === theme.id ? '2px solid' : '1px solid',
                      borderColor: selectedTheme === theme.id ? 'primary.main' : 'divider',
                      transform: selectedTheme === theme.id ? 'scale(1.02)' : 'scale(1)',
                      transition: 'all 0.2s ease-in-out',
                      '&:hover': {
                        transform: 'scale(1.02)',
                        boxShadow: 4
                      }
                    }}
                  >
                    <CardActionArea onClick={() => handleThemeSelect(theme.id)}>
                      <Box
                        sx={{
                          height: 60,
                          background: `linear-gradient(135deg, ${theme.theme.palette.primary.main}, ${theme.theme.palette.secondary.main})`,
                          position: 'relative',
                          overflow: 'hidden'
                        }}
                      >
                        <Box
                          sx={{
                            position: 'absolute',
                            top: 8,
                            left: 8,
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            backgroundColor: theme.theme.palette.background.paper,
                            border: `2px solid ${theme.theme.palette.text.primary}`,
                            opacity: 0.8
                          }}
                        />
                        <Box
                          sx={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            width: 16,
                            height: 16,
                            backgroundColor: theme.theme.palette.success.main,
                            opacity: 0.8
                          }}
                        />
                        {selectedTheme === theme.id && (
                          <Box
                            sx={{
                              position: 'absolute',
                              top: '50%',
                              left: '50%',
                              transform: 'translate(-50%, -50%)',
                              backgroundColor: 'rgba(0, 0, 0, 0.7)',
                              borderRadius: '50%',
                              p: 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <CheckIcon sx={{ color: 'white', fontSize: 20 }} />
                          </Box>
                        )}
                      </Box>
                      
                      <CardContent sx={{ p: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <Typography variant="body2" component="span">
                            {theme.icon}
                          </Typography>
                          <Typography variant="subtitle2" fontWeight="bold">
                            {theme.name}
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
                          {theme.description}
                        </Typography>
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        ))}

        <Divider sx={{ my: 3 }} />
        
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Current Selection:
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ bgcolor: 'primary.main' }}>
              {themes[selectedTheme].icon}
            </Avatar>
            <Box>
              <Typography variant="body1" fontWeight="bold">
                {themes[selectedTheme].name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {themes[selectedTheme].description}
              </Typography>
            </Box>
            <Chip
              label={themes[selectedTheme].category}
              size="small"
              variant="outlined"
              color="primary"
            />
          </Box>
        </Box>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={handleClose} variant="outlined">
          Cancel
        </Button>
        <Button 
          onClick={handleApply} 
          variant="contained"
          disabled={selectedTheme === currentThemeId}
          startIcon={<CheckIcon />}
        >
          Apply Theme
        </Button>
      </DialogActions>
    </Dialog>
  );

  if (variant === 'icon') {
    return (
      <>
        <Tooltip title="Change Theme">
          <IconButton onClick={handleOpen} size={size} {...props}>
            <PaletteIcon />
          </IconButton>
        </Tooltip>
        <ThemeDialog />
      </>
    );
  }

  if (variant === 'compact') {
    return (
      <>
        <Button
          variant="outlined"
          startIcon={<PaletteIcon />}
          onClick={handleOpen}
          size={size}
          {...props}
        >
          {themes[currentThemeId].name}
        </Button>
        <ThemeDialog />
      </>
    );
  }

  // Default button variant
  return (
    <>
      <Button
        variant="contained"
        startIcon={<PaletteIcon />}
        onClick={handleOpen}
        size={size}
        {...props}
      >
        Choose Theme
      </Button>
      <ThemeDialog />
    </>
  );
};

export default ThemeSelector;