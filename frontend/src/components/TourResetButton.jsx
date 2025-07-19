import React from 'react';
import {
  Button,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider
} from '@mui/material';
import {
  Refresh,
  Help,
  RestartAlt,
  MoreVert
} from '@mui/icons-material';
import { useTour } from '../contexts/TourContext';

const TourResetButton = ({ 
  tourId, 
  tourSteps, 
  variant = 'icon', 
  size = 'small',
  label = 'Tour Help',
  ...props 
}) => {
  const { resetTour, startTour, isTourCompleted } = useTour();
  const [anchorEl, setAnchorEl] = React.useState(null);
  const open = Boolean(anchorEl);

  const handleClick = (event) => {
    if (variant === 'menu') {
      setAnchorEl(event.currentTarget);
    } else {
      // Direct action for icon/button variants
      if (isTourCompleted(tourId)) {
        resetTour(tourId);
        setTimeout(() => startTour(tourSteps, tourId), 100);
      } else {
        startTour(tourSteps, tourId);
      }
    }
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleStartTour = () => {
    startTour(tourSteps, tourId);
    handleClose();
  };

  const handleResetTour = () => {
    resetTour(tourId);
    setTimeout(() => startTour(tourSteps, tourId), 100);
    handleClose();
  };

  const isCompleted = isTourCompleted(tourId);

  if (variant === 'menu') {
    return (
      <>
        <Tooltip title="Tour Options">
          <IconButton
            onClick={handleClick}
            size={size}
            {...props}
          >
            <MoreVert />
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={anchorEl}
          open={open}
          onClose={handleClose}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          <MenuItem onClick={handleStartTour}>
            <ListItemIcon>
              <Help fontSize="small" />
            </ListItemIcon>
            <ListItemText>
              {isCompleted ? 'Retake Tour' : 'Start Tour'}
            </ListItemText>
          </MenuItem>
          {isCompleted && (
            <>
              <Divider />
              <MenuItem onClick={handleResetTour}>
                <ListItemIcon>
                  <RestartAlt fontSize="small" />
                </ListItemIcon>
                <ListItemText>Reset Tour Progress</ListItemText>
              </MenuItem>
            </>
          )}
        </Menu>
      </>
    );
  }

  if (variant === 'button') {
    return (
      <Button
        variant="outlined"
        startIcon={isCompleted ? <Refresh /> : <Help />}
        onClick={handleClick}
        size={size}
        {...props}
      >
        {isCompleted ? 'Reset Tour' : label}
      </Button>
    );
  }

  // Default icon variant
  return (
    <Tooltip title={isCompleted ? 'Reset and restart tour' : 'Start guided tour'}>
      <IconButton
        onClick={handleClick}
        size={size}
        color={isCompleted ? 'secondary' : 'primary'}
        {...props}
      >
        {isCompleted ? <Refresh /> : <Help />}
      </IconButton>
    </Tooltip>
  );
};

export default TourResetButton;